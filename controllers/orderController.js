import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as orderService from "../services/orderService.js";
import * as odooService  from "../services/odooService.js";

// ═══════════════════════════════════════════════════════════
// HELPERS DE VALIDATION
// ═══════════════════════════════════════════════════════════

const isUUID = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const isText = (v) => typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 100;

const isSwissPhone = (v) => {
  const cleaned = String(v).replace(/\s/g, "");
  return /^\+41[0-9]{9}$/.test(cleaned) || /^0[0-9]{9}$/.test(cleaned);
};

const isSwissPostal = (v) => /^[0-9]{4}$/.test(String(v).trim());

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const isAlphanumeric = (v) => /^[a-zA-Z0-9_-]+$/.test(v);

const isPosInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// ── Valide les champs d'une adresse complète (tous obligatoires) ────────────
const validateAddressFields = (prefix, body, next) => {
  const f = (k) => body[`${prefix}_${k}`];

  if (!f("full_name") || !isText(f("full_name")))
    return next(new ErrorHandler(`${prefix}_full_name est obligatoire (2-100 caractères).`, 400));

  if (!f("phone") || !isSwissPhone(f("phone")))
    return next(new ErrorHandler(
      `${prefix}_phone est obligatoire. Format : +41791234567 ou 0791234567.`, 400
    ));

  if (!f("address") || String(f("address")).trim().length < 5 || String(f("address")).trim().length > 200)
    return next(new ErrorHandler(`${prefix}_address est obligatoire (5-200 caractères).`, 400));

  if (!f("city") || !isText(f("city")))
    return next(new ErrorHandler(`${prefix}_city est obligatoire (2-100 caractères).`, 400));

  if (!f("governorate") || !isText(f("governorate")))
    return next(new ErrorHandler(`${prefix}_governorate est obligatoire.`, 400));

  if (!f("postal_code") || !isSwissPostal(f("postal_code")))
    return next(new ErrorHandler(
      `${prefix}_postal_code est obligatoire (4 chiffres, ex: 1200).`, 400
    ));

  if (!f("country") || !isText(f("country")))
    return next(new ErrorHandler(`${prefix}_country est obligatoire (2-100 caractères).`, 400));

  return null;
};

// ── Valide les items du panier ───────────────────────────────────────────────
const validateItems = (items, next) => {
  if (!Array.isArray(items) || items.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un article.", 400));

  if (items.length > 50)
    return next(new ErrorHandler("Trop d'articles dans la commande (max 50).", 400));

  for (const [i, item] of items.entries()) {
    if (!item.variant_id || !isUUID(item.variant_id))
      return next(new ErrorHandler(`Article ${i + 1} : variant_id invalide (UUID requis).`, 400));

    if (!isPosInt(item.quantity))
      return next(new ErrorHandler(`Article ${i + 1} : quantity doit être un entier positif.`, 400));

    if (Number(item.quantity) > 999)
      return next(new ErrorHandler(`Article ${i + 1} : quantity trop élevé (max 999).`, 400));
  }

  return null;
};

// ── Résoudre les champs billing selon le checkbox ───────────────────────────
// Si billing_same_as_shipping = true → on copie les champs shipping vers billing
const resolveBillingFields = (body) => {
  const sameAsShipping = body.billing_same_as_shipping === true
    || body.billing_same_as_shipping === "true";

  if (sameAsShipping) {
    return {
      billing_full_name:    body.shipping_full_name,
      billing_phone:        body.shipping_phone,
      billing_address:      body.shipping_address,
      billing_city:         body.shipping_city,
      billing_governorate:  body.shipping_governorate,
      billing_postal_code:  body.shipping_postal_code,
      billing_country:      body.shipping_country,
    };
  }

  return {
    billing_full_name:    body.billing_full_name,
    billing_phone:        body.billing_phone,
    billing_address:      body.billing_address,
    billing_city:         body.billing_city,
    billing_governorate:  body.billing_governorate,
    billing_postal_code:  body.billing_postal_code,
    billing_country:      body.billing_country,
  };
};

// ═══════════════════════════════════════════════════════════
// CREATE ORDER (user connecté)
// POST /api/orders
// ═══════════════════════════════════════════════════════════
export const createOrder = catchAsyncErrors(async (req, res, next) => {
  const { items, payment_method, promo_code, notes } = req.body;

  // ── Items ────────────────────────────────────────────────
  if (validateItems(items, next)) return;

  // ── Payment method ───────────────────────────────────────
  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide. Valeurs acceptées : card, twint.", 400));

  // ── Shipping (tous obligatoires) ─────────────────────────
  if (validateAddressFields("shipping", req.body, next)) return;

  // ── Billing (obligatoires OU copie depuis shipping) ──────
  const billingFields = resolveBillingFields(req.body);
  // Si billing_same_as_shipping = false → valider les champs billing
  const sameAsShipping = req.body.billing_same_as_shipping === true
    || req.body.billing_same_as_shipping === "true";

  if (!sameAsShipping) {
    if (validateAddressFields("billing", req.body, next)) return;
  }

  // ── Promo code (optionnel) ───────────────────────────────
  if (promo_code && promo_code.trim() !== "") {
    if (!isAlphanumeric(promo_code.trim()) || promo_code.trim().length > 50)
      return next(new ErrorHandler("Code promo invalide (alphanumérique, max 50 caractères).", 400));
  }

  // ── Notes (optionnel) ────────────────────────────────────
  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Les notes ne peuvent pas dépasser 500 caractères.", 400));

  const data = await orderService.createOrderService({
    userId:    req.user.id,
    userEmail: req.user.email,
    userName:  req.user.name,
    items,
    payment_method,
    // Shipping
    shipping_full_name:    req.body.shipping_full_name,
    shipping_phone:        req.body.shipping_phone,
    shipping_address:      req.body.shipping_address,
    shipping_city:         req.body.shipping_city,
    shipping_governorate:  req.body.shipping_governorate,
    shipping_postal_code:  req.body.shipping_postal_code,
    shipping_country:      req.body.shipping_country,
    // Billing (résolu selon checkbox)
    ...billingFields,
    promo_code: promo_code?.trim() || null,
    notes:      notes?.trim()      || null,
  });

  res.status(201).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// CREATE GUEST ORDER
// POST /api/orders/guest
// ═══════════════════════════════════════════════════════════
export const createGuestOrder = catchAsyncErrors(async (req, res, next) => {
  const { items, payment_method, name, email, phone, promo_code, notes } = req.body;

  // ── Items ────────────────────────────────────────────────
  if (validateItems(items, next)) return;

  // ── Payment method ───────────────────────────────────────
  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide. Valeurs acceptées : card, twint.", 400));

  // ── Identité guest (obligatoire) ─────────────────────────
  if (!name || !isText(name))
    return next(new ErrorHandler("Le nom est obligatoire (2-100 caractères).", 400));

  if (!email || !isEmail(email) || email.length > 254)
    return next(new ErrorHandler("Une adresse email valide est obligatoire.", 400));

  if (!phone || !isSwissPhone(phone))
    return next(new ErrorHandler("Le téléphone est obligatoire. Format : +41791234567 ou 0791234567.", 400));

  // ── Shipping (tous obligatoires) ─────────────────────────
  if (validateAddressFields("shipping", req.body, next)) return;

  // ── Billing (obligatoires OU copie depuis shipping) ──────
  const billingFields = resolveBillingFields(req.body);
  const sameAsShipping = req.body.billing_same_as_shipping === true
    || req.body.billing_same_as_shipping === "true";

  if (!sameAsShipping) {
    if (validateAddressFields("billing", req.body, next)) return;
  }

  // ── Promo code (optionnel) ───────────────────────────────
  if (promo_code && promo_code.trim() !== "") {
    if (!isAlphanumeric(promo_code.trim()) || promo_code.trim().length > 50)
      return next(new ErrorHandler("Code promo invalide (alphanumérique, max 50 caractères).", 400));
  }

  // ── Notes (optionnel) ────────────────────────────────────
  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Les notes ne peuvent pas dépasser 500 caractères.", 400));

  const data = await orderService.createGuestOrderService({
    items,
    payment_method,
    name:  name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    // Shipping
    shipping_full_name:    req.body.shipping_full_name,
    shipping_phone:        req.body.shipping_phone,
    shipping_address:      req.body.shipping_address,
    shipping_city:         req.body.shipping_city,
    shipping_governorate:  req.body.shipping_governorate,
    shipping_postal_code:  req.body.shipping_postal_code,
    shipping_country:      req.body.shipping_country,
    // Billing (résolu selon checkbox)
    ...billingFields,
    promo_code: promo_code?.trim() || null,
    notes:      notes?.trim()      || null,
  });

  res.status(201).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// STRIPE WEBHOOK
// ═══════════════════════════════════════════════════════════
export const stripeWebhook = catchAsyncErrors(async (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  if (!signature)
    return next(new ErrorHandler("Signature Stripe manquante.", 400));

  const result = await orderService.handleStripeWebhookService(req.body, signature);
  res.status(200).json(result);
});

// ═══════════════════════════════════════════════════════════
// GET SHIPPING COST
// ═══════════════════════════════════════════════════════════
export const getShippingCost = catchAsyncErrors(async (req, res, next) => {
  const subtotal = parseFloat(req.query.subtotal);
  if (isNaN(subtotal) || subtotal < 0)
    return next(new ErrorHandler("Sous-total invalide.", 400));

  const info = orderService.getShippingCostService(subtotal);
  res.status(200).json({ success: true, ...info });
});

// ═══════════════════════════════════════════════════════════
// VALIDATE PROMO CODE
// ═══════════════════════════════════════════════════════════
export const validatePromo = catchAsyncErrors(async (req, res, next) => {
  const { code, subtotal } = req.body;

  if (!code || !subtotal)
    return next(new ErrorHandler("Code et sous-total requis.", 400));

  if (!isAlphanumeric(String(code).trim()) || String(code).trim().length > 50)
    return next(new ErrorHandler("Code promo invalide.", 400));

  const parsedSubtotal = parseFloat(subtotal);
  if (isNaN(parsedSubtotal) || parsedSubtotal < 0)
    return next(new ErrorHandler("Sous-total invalide.", 400));

  const result = await orderService.validatePromoService({
    code:     String(code).trim(),
    subtotal: parsedSubtotal,
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
// ═══════════════════════════════════════════════════════════
export const getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await orderService.getMyOrdersService(req.user.id);
  res.status(200).json({ success: true, totalOrders: orders.length, orders });
});

// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const order = await orderService.getSingleOrderService({
    orderId: req.params.orderId,
    userId:  req.user.id,
    role:    req.user.role,
  });
  res.status(200).json({ success: true, order });
});

// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllOrders = catchAsyncErrors(async (req, res, next) => {
  const { status, payment_status } = req.query;
  const page = parseInt(req.query.page) || 1;

  const validStatuses = ["pending","confirmed","processing","shipped","delivered","cancelled"];
  const validPayments = ["pending","paid","failed","refunded"];

  if (status && !validStatuses.includes(status))
    return next(new ErrorHandler("Statut de commande invalide.", 400));

  if (payment_status && !validPayments.includes(payment_status))
    return next(new ErrorHandler("Statut de paiement invalide.", 400));

  if (page < 1 || page > 10000)
    return next(new ErrorHandler("Numéro de page invalide.", 400));

  const data = await orderService.getAllOrdersService({ status, payment_status, page });
  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// UPDATE ORDER STATUS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.body;

  const validStatuses = ["pending","confirmed","processing","shipped","delivered","cancelled"];
  if (!status || !validStatuses.includes(status))
    return next(new ErrorHandler(`Statut invalide. Valeurs acceptées : ${validStatuses.join(", ")}.`, 400));

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const result = await orderService.updateOrderStatusService({
    orderId: req.params.orderId,
    status,
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// CANCEL ORDER (admin)
// ═══════════════════════════════════════════════════════════
export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim() === "")
    return next(new ErrorHandler("Une raison d'annulation est obligatoire.", 400));

  if (reason.trim().length > 500)
    return next(new ErrorHandler("La raison ne peut pas dépasser 500 caractères.", 400));

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const result = await orderService.cancelOrderService({
    orderId: req.params.orderId,
    reason:  reason.trim(),
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin)
// ═══════════════════════════════════════════════════════════
export const updateDelivery = catchAsyncErrors(async (req, res, next) => {
  const { carrier, tracking_number, estimated_date, status, notes } = req.body;

  if (carrier && (typeof carrier !== "string" || carrier.trim().length > 100))
    return next(new ErrorHandler("Transporteur invalide (max 100 caractères).", 400));

  if (tracking_number && !/^[a-zA-Z0-9_-]{3,100}$/.test(String(tracking_number).trim()))
    return next(new ErrorHandler("Numéro de suivi invalide (3-100 caractères alphanumériques).", 400));

  if (estimated_date && isNaN(Date.parse(estimated_date)))
    return next(new ErrorHandler("Date estimée invalide.", 400));

  const validDeliveryStatuses = ["pending","in_transit","delivered","failed"];
  if (status && !validDeliveryStatuses.includes(status))
    return next(new ErrorHandler(`Statut livraison invalide. Valeurs : ${validDeliveryStatuses.join(", ")}.`, 400));

  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Les notes ne peuvent pas dépasser 500 caractères.", 400));

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const delivery = await orderService.updateDeliveryService({
    orderId:         req.params.orderId,
    carrier:         carrier?.trim()         || null,
    tracking_number: tracking_number?.trim() || null,
    estimated_date:  estimated_date          || null,
    status:          status                  || null,
    notes:           notes?.trim()           || null,
  });

  res.status(200).json({ success: true, message: "Livraison mise à jour.", delivery });
});

// ═══════════════════════════════════════════════════════════
// UPDATE ORDER SHIPPING INFO (admin)
// ═══════════════════════════════════════════════════════════
export const adminUpdateOrderShipping = catchAsyncErrors(async (req, res, next) => {
  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  if (validateAddressFields("shipping", req.body, next)) return;

  const updatedOrder = await orderService.adminUpdateOrderShippingService({
    orderId:              req.params.orderId,
    shipping_full_name:   req.body.shipping_full_name,
    shipping_phone:       req.body.shipping_phone,
    shipping_address:     req.body.shipping_address,
    shipping_city:        req.body.shipping_city,
    shipping_governorate: req.body.shipping_governorate,
    shipping_postal_code: req.body.shipping_postal_code,
  });

  res.status(200).json({
    success: true,
    message: "Informations de livraison mises à jour.",
    order:   updatedOrder,
  });
});

// ═══════════════════════════════════════════════════════════
// GET LOW STOCK PRODUCTS (admin)
// ═══════════════════════════════════════════════════════════
export const getLowStockProducts = catchAsyncErrors(async (req, res, next) => {
  const products = await orderService.getLowStockProductsService();
  res.status(200).json({ success: true, totalProducts: products.length, products });
});

// ═══════════════════════════════════════════════════════════
// ODOO
// ═══════════════════════════════════════════════════════════
export const odooStockUpdate = catchAsyncErrors(async (req, res, next) => {
  const result = await odooService.handleStockUpdateWebhook(req.body);
  res.status(200).json({ success: true, ...result });
});

export const odooPriceUpdate = catchAsyncErrors(async (req, res, next) => {
  const result = await odooService.handlePriceUpdateWebhook(req.body);
  res.status(200).json({ success: true, ...result });
});

export const getOdooSettings = catchAsyncErrors(async (req, res, next) => {
  const settings = await odooService.getOdooSettingsService();
  res.status(200).json({ success: true, settings });
});

export const updateOdooSettings = catchAsyncErrors(async (req, res, next) => {
  const settings = await odooService.updateOdooSettingsService(req.body);
  res.status(200).json({ success: true, message: "Configuration Odoo mise à jour.", settings });
});

export const getSyncLogs = catchAsyncErrors(async (req, res, next) => {
  const { type, status } = req.query;
  const page = parseInt(req.query.page) || 1;
  const logs = await odooService.getSyncLogsService({ type, status, page });
  res.status(200).json({ success: true, logs });
});