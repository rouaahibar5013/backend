import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as orderService from "../services/orderService.js";
import * as odooService from "../services/odooService.js";

// ─────────────────────────────────────────────────────────────
// MAPPING STATUTS (Affichage Frontend → Valeur BDD)
// ─────────────────────────────────────────────────────────────
const statusMap = {
  "en attente":     "en_attente",
  "en_attente":     "en_attente",
  "confirmée":      "confirmee",
  "confirmee":      "confirmee",
  "confirme":       "confirmee",
  "confirmé":       "confirmee",
  "en cours":       "en_preparation",
  "en_preparation": "en_preparation",
  "encours":        "en_preparation",
  "en_cours":       "en_preparation",
  "expédiée":       "expediee",
  "expediee":       "expediee",
  "expedie":        "expediee",
  "livrée":         "livree",
  "livree":         "livree",
  "annulée":        "annulee",
  "annulee":        "annulee",
  "annuler":        "annulee",
  "remboursée":     "remboursee",
  "remboursee":     "remboursee",
  "rembourse":      "remboursee"
};

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

// ── Validation des adresses (livraison & facturation) ────────────
const validateAddressFields = (prefix, body, next) => {
  const f = (k) => body[`${prefix}_${k}`];
  const label = prefix === "shipping" ? "de livraison" : "de facturation";

  if (!f("full_name") || !isText(f("full_name")))
    return next(new ErrorHandler(`Nom complet ${label} obligatoire.`, 400));

  if (!f("phone") || !isSwissPhone(f("phone")))
    return next(new ErrorHandler(`Téléphone ${label} invalide. Format suisse requis.`, 400));

  if (!f("address") || String(f("address")).trim().length < 5 || String(f("address")).trim().length > 200)
    return next(new ErrorHandler(`Adresse ${label} obligatoire (5 à 200 caractères).`, 400));

  if (!f("city") || !isText(f("city")))
    return next(new ErrorHandler(`Ville ${label} obligatoire.`, 400));

  if (!f("governorate") || !isText(f("governorate")))
    return next(new ErrorHandler(`Région ${label} obligatoire.`, 400));

  if (!f("postal_code") || !isSwissPostal(f("postal_code")))
    return next(new ErrorHandler(`Code postal ${label} invalide (4 chiffres).`, 400));

  if (!f("country") || !isText(f("country")))
    return next(new ErrorHandler(`Pays ${label} obligatoire.`, 400));

  return null;
};

// ── Validation des articles du panier ─────────────────────────────────
const validateItems = (items, next) => {
  if (!Array.isArray(items) || items.length === 0)
    return next(new ErrorHandler("Veuillez ajouter au moins un article.", 400));

  if (items.length > 50)
    return next(new ErrorHandler("Maximum 50 articles par commande.", 400));

  for (const [i, item] of items.entries()) {
    if (!item.variant_id || !isUUID(item.variant_id))
      return next(new ErrorHandler(`Article ${i + 1} : identifiant invalide.`, 400));

    if (!isPosInt(item.quantity))
      return next(new ErrorHandler(`Article ${i + 1} : quantité invalide.`, 400));

    if (Number(item.quantity) > 999)
      return next(new ErrorHandler(`Article ${i + 1} : quantité maximale 999.`, 400));
  }

  return null;
};

// ── Résoudre billing selon checkbox ───────────────────────────
const resolveBillingFields = (body) => {
  const sameAsShipping = body.billing_same_as_shipping === true || body.billing_same_as_shipping === "true";

  if (sameAsShipping) {
    return {
      billing_full_name: body.shipping_full_name,
      billing_phone: body.shipping_phone,
      billing_address: body.shipping_address,
      billing_city: body.shipping_city,
      billing_governorate: body.shipping_governorate,
      billing_postal_code: body.shipping_postal_code,
      billing_country: body.shipping_country,
    };
  }

  return {
    billing_full_name: body.billing_full_name,
    billing_phone: body.billing_phone,
    billing_address: body.billing_address,
    billing_city: body.billing_city,
    billing_governorate: body.billing_governorate,
    billing_postal_code: body.billing_postal_code,
    billing_country: body.billing_country,
  };
};

// ═══════════════════════════════════════════════════════════
// ROUTES PRINCIPALES
// ═══════════════════════════════════════════════════════════

export const createOrder = catchAsyncErrors(async (req, res, next) => {
  const { items, payment_method, promo_code, notes } = req.body;

  if (validateItems(items, next)) return;

  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide (carte ou Twint).", 400));

  if (validateAddressFields("shipping", req.body, next)) return;

  const billingFields = resolveBillingFields(req.body);
  const sameAsShipping = req.body.billing_same_as_shipping === true || req.body.billing_same_as_shipping === "true";

  if (!sameAsShipping) {
    if (validateAddressFields("billing", req.body, next)) return;
  }

  if (promo_code && promo_code.trim() !== "") {
    if (!isAlphanumeric(promo_code.trim()) || promo_code.trim().length > 50)
      return next(new ErrorHandler("Code promo invalide.", 400));
  }

  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Notes trop longues (maximum 500 caractères).", 400));

  const data = await orderService.createOrderService({
    userId: req.user.id,
    userEmail: req.user.email,
    userName: req.user.name,
    items,
    payment_method,
    shipping_full_name: req.body.shipping_full_name,
    shipping_phone: req.body.shipping_phone,
    shipping_address: req.body.shipping_address,
    shipping_city: req.body.shipping_city,
    shipping_governorate: req.body.shipping_governorate,
    shipping_postal_code: req.body.shipping_postal_code,
    shipping_country: req.body.shipping_country,
    ...billingFields,
    promo_code: promo_code?.trim() || null,
    notes: notes?.trim() || null,
  });

  res.status(201).json({ success: true, ...data });
});

export const createGuestOrder = catchAsyncErrors(async (req, res, next) => {
  const { items, payment_method, name, email, phone, promo_code, notes } = req.body;

  if (validateItems(items, next)) return;

  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide (carte ou Twint).", 400));

  if (!name || !isText(name))
    return next(new ErrorHandler("Le nom est obligatoire.", 400));

  if (!email || !isEmail(email) || email.length > 254)
    return next(new ErrorHandler("Email invalide.", 400));

  if (!phone || !isSwissPhone(phone))
    return next(new ErrorHandler("Téléphone invalide. Format suisse requis.", 400));

  if (validateAddressFields("shipping", req.body, next)) return;

  const billingFields = resolveBillingFields(req.body);
  const sameAsShipping = req.body.billing_same_as_shipping === true || req.body.billing_same_as_shipping === "true";

  if (!sameAsShipping) {
    if (validateAddressFields("billing", req.body, next)) return;
  }

  if (promo_code && promo_code.trim() !== "") {
    if (!isAlphanumeric(promo_code.trim()) || promo_code.trim().length > 50)
      return next(new ErrorHandler("Code promo invalide.", 400));
  }

  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Notes trop longues (maximum 500 caractères).", 400));

  const data = await orderService.createGuestOrderService({
    items,
    payment_method,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    shipping_full_name: req.body.shipping_full_name,
    shipping_phone: req.body.shipping_phone,
    shipping_address: req.body.shipping_address,
    shipping_city: req.body.shipping_city,
    shipping_governorate: req.body.shipping_governorate,
    shipping_postal_code: req.body.shipping_postal_code,
    shipping_country: req.body.shipping_country,
    ...billingFields,
    promo_code: promo_code?.trim() || null,
    notes: notes?.trim() || null,
  });

  res.status(201).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// AUTRES ROUTES
// ═══════════════════════════════════════════════════════════

export const stripeWebhook = catchAsyncErrors(async (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) return next(new ErrorHandler("Signature Stripe manquante.", 400));

  const result = await orderService.handleStripeWebhookService(req.body, signature);
  res.status(200).json(result);
});

export const getShippingCost = catchAsyncErrors(async (req, res, next) => {
  const subtotal = parseFloat(req.query.subtotal);
  if (isNaN(subtotal) || subtotal < 0)
    return next(new ErrorHandler("Sous-total invalide.", 400));

  const info = orderService.getShippingCostService(subtotal);
  res.status(200).json({ success: true, ...info });
});

export const validatePromo = catchAsyncErrors(async (req, res, next) => {
  const { code, subtotal } = req.body;
  if (!code || !subtotal) return next(new ErrorHandler("Code et sous-total requis.", 400));

  if (!isAlphanumeric(String(code).trim()) || String(code).trim().length > 50)
    return next(new ErrorHandler("Code promo invalide.", 400));

  const parsedSubtotal = parseFloat(subtotal);
  if (isNaN(parsedSubtotal) || parsedSubtotal < 0)
    return next(new ErrorHandler("Sous-total invalide.", 400));

  const result = await orderService.validatePromoService({
    code: String(code).trim(),
    subtotal: parsedSubtotal,
  });

  res.status(200).json({ success: true, ...result });
});

export const getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await orderService.getMyOrdersService(req.user.id);
  res.status(200).json({ success: true, totalOrders: orders.length, orders });
});

export const getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const order = await orderService.getSingleOrderService({
    orderId: req.params.orderId,
    userId: req.user.id,
    role: req.user.role,
  });
  res.status(200).json({ success: true, order });
});

export const getAllOrders = catchAsyncErrors(async (req, res, next) => {
  let { status, payment_status } = req.query;
  const page = parseInt(req.query.page) || 1;

  const validStatuses = ["en_attente", "confirmee", "en_preparation", "expediee", "livree", "annulee", "remboursee"];
  const validPayments = ["en_attente", "paye", "echoue", "rembourse"];

  // Conversion du statut d'affichage vers format BDD si nécessaire
  if (status) {
    const statusKey = status.toString().trim().toLowerCase();
    status = statusMap[statusKey] || status;
  }

  if (status && !validStatuses.includes(status))
    return next(new ErrorHandler("Statut de commande invalide.", 400));

  if (payment_status && !validPayments.includes(payment_status))
    return next(new ErrorHandler("Statut de paiement invalide.", 400));

  if (page < 1 || page > 10000)
    return next(new ErrorHandler("Numéro de page invalide.", 400));

  const data = await orderService.getAllOrdersService({ status, payment_status, page });
  res.status(200).json({ success: true, ...data });
});

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  console.log("=== DEBUG updateOrderStatus ===");
  console.log("Body reçu :", req.body);

  // Extraire le statut (il est envoyé comme clé d'objet)
  let status = null;
  const bodyKeys = Object.keys(req.body);

  if (bodyKeys.length > 0) {
    status = bodyKeys[0];        // ex: "expediee", "livree", "en cours", etc.
  }

  if (!status) 
    return next(new ErrorHandler("Le statut est obligatoire.", 400));

  console.log("Statut détecté (brut) :", status);

  // Nettoyage
  const statusKey = status.toString().trim().toLowerCase();
  const dbStatus = statusMap[statusKey];

  if (!dbStatus) {
    console.log("Statut non trouvé dans le mapping :", statusKey);
    return next(new ErrorHandler(
      `Statut invalide : ${status}. Valeurs acceptées : En attente, Confirmée, En cours, Expédiée, Livrée, Annulée, Remboursée`, 
      400
    ));
  }

  console.log("Statut converti pour BDD :", dbStatus);

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const result = await orderService.updateOrderStatusService({
    orderId: req.params.orderId,
    status: dbStatus
  });

  res.status(200).json({ 
    success: true, 
    message: "Statut de la commande mis à jour avec succès.",
    oldStatus: status,
    newStatus: dbStatus
  });
});

export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim() === "")
    return next(new ErrorHandler("Raison d'annulation obligatoire.", 400));

  if (reason.trim().length > 500)
    return next(new ErrorHandler("Raison trop longue (max 500 caractères).", 400));

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const result = await orderService.cancelOrderService({
    orderId: req.params.orderId,
    reason: reason.trim(),
  });

  res.status(200).json({ success: true, ...result });
});

export const updateDelivery = catchAsyncErrors(async (req, res, next) => {
  const { carrier, tracking_number, estimated_date, status, notes } = req.body;

  if (carrier && (typeof carrier !== "string" || carrier.trim().length > 100))
    return next(new ErrorHandler("Nom du transporteur invalide.", 400));

  if (tracking_number && !/^[a-zA-Z0-9_-]{3,100}$/.test(String(tracking_number).trim()))
    return next(new ErrorHandler("Numéro de suivi invalide.", 400));

  if (estimated_date && isNaN(Date.parse(estimated_date)))
    return next(new ErrorHandler("Date estimée invalide.", 400));

  const validDeliveryStatuses = [
    "en_preparation",
    "expediee",
    "en_transit",
    "en_cours",
    "livre",
    "echec",
    "retourne"
  ];

  if (status && !validDeliveryStatuses.includes(status))
    return next(new ErrorHandler("Statut de livraison invalide.", 400));

  if (notes && String(notes).trim().length > 500)
    return next(new ErrorHandler("Notes trop longues (max 500 caractères).", 400));

  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  const delivery = await orderService.updateDeliveryService({
    orderId: req.params.orderId,
    carrier: carrier?.trim() || null,
    tracking_number: tracking_number?.trim() || null,
    estimated_date: estimated_date || null,
    status: status || null,
    notes: notes?.trim() || null,
  });

  res.status(200).json({ 
    success: true, 
    message: "Livraison mise à jour avec succès.", 
    delivery 
  });
});

export const adminUpdateOrderShipping = catchAsyncErrors(async (req, res, next) => {
  if (!isUUID(req.params.orderId))
    return next(new ErrorHandler("ID de commande invalide.", 400));

  if (validateAddressFields("shipping", req.body, next)) return;

  const updatedOrder = await orderService.adminUpdateOrderShippingService({
    orderId: req.params.orderId,
    shipping_full_name: req.body.shipping_full_name,
    shipping_phone: req.body.shipping_phone,
    shipping_address: req.body.shipping_address,
    shipping_city: req.body.shipping_city,
    shipping_governorate: req.body.shipping_governorate,
    shipping_postal_code: req.body.shipping_postal_code,
  });

  res.status(200).json({
    success: true,
    message: "Informations de livraison mises à jour.",
    order: updatedOrder,
  });
});

export const getLowStockProducts = catchAsyncErrors(async (req, res, next) => {
  const products = await orderService.getLowStockProductsService();
  res.status(200).json({ success: true, totalProducts: products.length, products });
});

// Odoo Routes
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