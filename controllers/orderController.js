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
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, promo_code, notes,
  } = req.body;

  if (!items || items.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un article.", 400));
  if (!payment_method)
    return next(new ErrorHandler("Veuillez choisir un mode de paiement.", 400));
  if (!shipping_full_name || !shipping_address || !shipping_city)
    return next(new ErrorHandler("Veuillez fournir les informations de livraison.", 400));

  const data = await orderService.createOrderService({
    userId:    req.user.id,
    userEmail: req.user.email,
    userName:  req.user.name,
    items, payment_method,
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, promo_code, notes,
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
    name, email, phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, promo_code, notes,
  } = req.body;

  if (!items || items.length === 0)
    return next(new ErrorHandler("Veuillez fournir au moins un article.", 400));
  if (!payment_method)
    return next(new ErrorHandler("Veuillez choisir un mode de paiement.", 400));
  if (!name || !email)
    return next(new ErrorHandler("Veuillez fournir votre nom et email.", 400));
  if (!shipping_address || !shipping_city)
    return next(new ErrorHandler("Veuillez fournir les informations de livraison.", 400));

  const data = await orderService.createGuestOrderService({
    items, payment_method,
    name, email, phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, promo_code, notes,
  });

  res.status(201).json({ success: true, ...data });
});
// Stripe Webhook
export const stripeWebhook = catchAsyncErrors(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];
  const result = await orderService.handleStripeWebhookService(req.body, signature);
  res.status(200).json(result);
});

// Low stock products
export const getLowStockProducts = catchAsyncErrors(async (req, res, next) => {
  const products = await orderService.getLowStockProductsService();
  res.status(200).json({ success: true, totalProducts: products.length, products });
});

// ═══════════════════════════════════════════════════════════
// CONFIRM STRIPE PAYMENT
// POST /api/orders/:orderId/stripe/confirm
// ═══════════════════════════════════════════════════════════
export const confirmStripePayment = catchAsyncErrors(async (req, res, next) => {
  const result = await orderService.confirmStripePaymentService({
    orderId: req.params.orderId,
    userId:  req.user.id,
    role:    req.user.role,
  });
  res.status(200).json({ success: true, ...result });
});


// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
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
// CANCEL ORDER
// PATCH /api/orders/:orderId/cancel
// ═══════════════════════════════════════════════════════════
export const cancelOrder = catchAsyncErrors(async (req, res, next) => {
  await orderService.cancelOrderService({
    orderId: req.params.orderId,
    userId:  req.user.id,
    reason:  req.body.reason,
  });
  res.status(200).json({ success: true, message: "Commande annulée avec succès." });
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
  const result = await orderService.updateOrderStatusService({
    orderId: req.params.orderId,
    status:  req.body.status,
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
  res.status(200).json({ success: true, message: "Livraison mise à jour.", delivery });
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


// ═══════════════════════════════════════════════════════════
// ODOO SETTINGS (admin)
// ═══════════════════════════════════════════════════════════
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



// ═══════════════════════════════════════════════════════════
// ADMIN UPDATE ORDER SHIPPING (FULL)
// PUT /api/orders/:orderId/shipping
// ═══════════════════════════════════════════════════════════
export const adminUpdateOrderShipping = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  const {
    shipping_full_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_governorate,
    shipping_postal_code,
  } = req.body;

  const updatedOrder = await orderService.adminUpdateOrderShippingService({
    orderId,
    shipping_full_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_governorate,
    shipping_postal_code,
  });

  res.status(200).json({
    success: true,
    message: "Informations de livraison mises à jour avec succès.",
    order: updatedOrder,
  });
});