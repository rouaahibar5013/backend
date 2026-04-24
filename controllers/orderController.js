import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import * as orderService from "../services/orderService.js";
import * as odooService  from "../services/odooService.js";

// ═══════════════════════════════════════════════════════════
// CREATE ORDER (user connecté)
// POST /api/orders
// ═══════════════════════════════════════════════════════════
export const createOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items, payment_method,
    // Billing
    billing_full_name, billing_phone,
    billing_address,   billing_city,
    billing_governorate, billing_postal_code, billing_country,
    // Shipping
    shipping_full_name, shipping_phone,
    shipping_address,   shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
    promo_code, notes,
  } = req.body;

  // ── Validations ──────────────────────────────────────────
  if (!items || items.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un article.", 400));

  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide. Valeurs acceptées : card, twint.", 400));

  if (!shipping_full_name || !shipping_address || !shipping_city)
    return next(new ErrorHandler("Nom, adresse et ville de livraison sont obligatoires.", 400));

  const data = await orderService.createOrderService({
    userId:    req.user.id,
    userEmail: req.user.email,
    userName:  req.user.name,
    items, payment_method,
    billing_full_name,   billing_phone,
    billing_address,     billing_city,
    billing_governorate, billing_postal_code, billing_country,
    shipping_full_name,  shipping_phone,
    shipping_address,    shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
    promo_code, notes,
  });

  res.status(201).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// CREATE GUEST ORDER
// POST /api/orders/guest
// ═══════════════════════════════════════════════════════════
export const createGuestOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    items, payment_method,
    // Identité guest
    name, email, phone,
    // Billing
    billing_full_name, billing_phone,
    billing_address,   billing_city,
    billing_governorate, billing_postal_code, billing_country,
    // Shipping
    shipping_full_name, shipping_phone,
    shipping_address,   shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
    promo_code, notes,
  } = req.body;

  // ── Validations ──────────────────────────────────────────
  if (!items || items.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un article.", 400));

  if (!["card", "twint"].includes(payment_method))
    return next(new ErrorHandler("Mode de paiement invalide. Valeurs acceptées : card, twint.", 400));

  if (!name || !email)
    return next(new ErrorHandler("Nom et email sont obligatoires.", 400));

  if (!shipping_full_name || !shipping_address || !shipping_city)
    return next(new ErrorHandler("Nom, adresse et ville de livraison sont obligatoires.", 400));

  const data = await orderService.createGuestOrderService({
    items, payment_method,
    name, email, phone,
    billing_full_name,   billing_phone,
    billing_address,     billing_city,
    billing_governorate, billing_postal_code, billing_country,
    shipping_full_name,  shipping_phone,
    shipping_address,    shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
    promo_code, notes,
  });

  res.status(201).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// STRIPE WEBHOOK
// POST /api/orders/webhook
// ✅ raw body requis — configuré dans les routes
// ═══════════════════════════════════════════════════════════
export const stripeWebhook = catchAsyncErrors(async (req, res, next) => {
  const signature = req.headers["stripe-signature"];

  if (!signature)
    return next(new ErrorHandler("Signature Stripe manquante.", 400));

  const result = await orderService.handleStripeWebhookService(req.body, signature);
  res.status(200).json(result);
});

// ═══════════════════════════════════════════════════════════
// GET SHIPPING COST (public — utilisé au checkout en temps réel)
// GET /api/orders/shipping-cost?subtotal=XX
// ═══════════════════════════════════════════════════════════
export const getShippingCost = catchAsyncErrors(async (req, res, next) => {
  const subtotal = parseFloat(req.query.subtotal);

  if (isNaN(subtotal) || subtotal < 0)
    return next(new ErrorHandler("Sous-total invalide.", 400));

  const info = orderService.getShippingCostService(subtotal);
  res.status(200).json({ success: true, ...info });
});

// ═══════════════════════════════════════════════════════════
// VALIDATE PROMO CODE (public — checkout)
// POST /api/orders/validate-promo
// ═══════════════════════════════════════════════════════════
export const validatePromo = catchAsyncErrors(async (req, res, next) => {
  const { code, subtotal } = req.body;

  if (!code || !subtotal)
    return next(new ErrorHandler("Code et sous-total requis.", 400));

  const result = await orderService.validatePromoService({
    code,
    subtotal: parseFloat(subtotal),
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// GET MY ORDERS (user connecté)
// GET /api/orders/my
// ═══════════════════════════════════════════════════════════
export const getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await orderService.getMyOrdersService(req.user.id);
  res.status(200).json({ success: true, totalOrders: orders.length, orders });
});

// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// GET /api/orders/:orderId
// ═══════════════════════════════════════════════════════════
export const getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const order = await orderService.getSingleOrderService({
    orderId: req.params.orderId,
    userId:  req.user.id,
    role:    req.user.role,
  });
  res.status(200).json({ success: true, order });
});

// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin)
// GET /api/orders
// ═══════════════════════════════════════════════════════════
export const getAllOrders = catchAsyncErrors(async (req, res, next) => {
  const { status, payment_status } = req.query;
  const page = parseInt(req.query.page) || 1;

  const data = await orderService.getAllOrdersService({ status, payment_status, page });
  res.status(200).json({ success: true, ...data });
});

// ═══════════════════════════════════════════════════════════
// UPDATE ORDER STATUS (admin)
// PATCH /api/orders/:orderId/status
// ═══════════════════════════════════════════════════════════
export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.body;

  if (!status)
    return next(new ErrorHandler("Le statut est obligatoire.", 400));

  const result = await orderService.updateOrderStatusService({
    orderId: req.params.orderId,
    status,
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// CANCEL ORDER (admin uniquement)
// PATCH /api/orders/:orderId/cancel
// ═══════════════════════════════════════════════════════════
export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim() === "")
    return next(new ErrorHandler("Une raison d'annulation est obligatoire.", 400));

  const result = await orderService.cancelOrderService({
    orderId: req.params.orderId,
    reason:  reason.trim(),
  });

  res.status(200).json({ success: true, ...result });
});

// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin)
// PATCH /api/orders/:orderId/delivery
// ═══════════════════════════════════════════════════════════
export const updateDelivery = catchAsyncErrors(async (req, res, next) => {
  const { carrier, tracking_number, estimated_date, status, notes } = req.body;

  const delivery = await orderService.updateDeliveryService({
    orderId: req.params.orderId,
    carrier, tracking_number, estimated_date, status, notes,
  });

  res.status(200).json({
    success:  true,
    message:  "Livraison mise à jour.",
    delivery,
  });
});

// ═══════════════════════════════════════════════════════════
// UPDATE ORDER SHIPPING INFO (admin)
// PUT /api/orders/:orderId/shipping
// ═══════════════════════════════════════════════════════════
export const adminUpdateOrderShipping = catchAsyncErrors(async (req, res, next) => {
  const {
    shipping_full_name, shipping_phone,
    shipping_address,   shipping_city,
    shipping_governorate, shipping_postal_code,
  } = req.body;

  const updatedOrder = await orderService.adminUpdateOrderShippingService({
    orderId: req.params.orderId,
    shipping_full_name, shipping_phone,
    shipping_address,   shipping_city,
    shipping_governorate, shipping_postal_code,
  });

  res.status(200).json({
    success: true,
    message: "Informations de livraison mises à jour.",
    order:   updatedOrder,
  });
});

// ═══════════════════════════════════════════════════════════
// GET LOW STOCK PRODUCTS (admin dashboard)
// GET /api/orders/low-stock
// ═══════════════════════════════════════════════════════════
export const getLowStockProducts = catchAsyncErrors(async (req, res, next) => {
  const products = await orderService.getLowStockProductsService();
  res.status(200).json({ success: true, totalProducts: products.length, products });
});

// ═══════════════════════════════════════════════════════════
// ODOO WEBHOOKS
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