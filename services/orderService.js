import Stripe from "stripe";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";
import { createGuestAccountService } from "./authService.js";
import { exportOrderToOdoo } from "./odooService.js";
import PDFDocument from "pdfkit";
import { invalidateDashboardCache } from "../utils/cacheInvalideation.js";
import { notifyUser } from "../utils/websocket.js";

// ─── Models ───────────────────────────────────────────────
import {
  Order,
  OrderItem,
  Delivery,
  ProductVariant,
  VariantPromotion,
  Promotion,
  User,
} from "../models/index.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ═══════════════════════════════════════════════════════════
// CONSTANTES — Livraison
// ═══════════════════════════════════════════════════════════
const SHIPPING_FREE_THRESHOLD = parseFloat(process.env.SHIPPING_FREE_THRESHOLD || "100");
const SHIPPING_COST           = parseFloat(process.env.SHIPPING_COST           || "9.90");

// ═══════════════════════════════════════════════════════════
// HELPER — Calcul frais de livraison
// ═══════════════════════════════════════════════════════════
const calculateShippingCost = (subtotalAfterDiscount) => {
  return subtotalAfterDiscount >= SHIPPING_FREE_THRESHOLD ? 0 : SHIPPING_COST;
};

// ═══════════════════════════════════════════════════════════
// HELPER — Email confirmation commande + PDF facture
// ═══════════════════════════════════════════════════════════
const sendOrderConfirmationEmail = async (toEmail, order, customerName, pdfBuffer = null) => {
  const attachments = pdfBuffer
    ? [{
        filename:    `facture-goffa-${order.order_number}.pdf`,
        content:     pdfBuffer,
        contentType: "application/pdf",
      }]
    : [];

  const paymentLabel =
    order.payment_method === "card"  ? "💳 Carte bancaire" :
    order.payment_method === "twint" ? "📱 Twint"          : order.payment_method;

  await sendEmail({
    to:          toEmail,
    subject:     `✅ Commande #${order.order_number} confirmée — GOFFA 🧺`,
    attachments,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">✅ Commande confirmée !</h2>
          <p>Bonjour ${customerName},</p>
          <p>Merci pour votre commande. Voici le récapitulatif :</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
            <p><strong>N° de commande :</strong> #${order.order_number}</p>
            <p><strong>Livraison à :</strong> ${order.shipping_full_name}, ${order.shipping_address}, ${order.shipping_city}</p>
            <p><strong>Mode de paiement :</strong> ${paymentLabel}</p>
            ${parseFloat(order.discount_amount) > 0
              ? `<p><strong>Réduction code promo :</strong> -${parseFloat(order.discount_amount).toFixed(2)} CHF</p>`
              : ""}
            <p><strong>Frais de livraison :</strong> ${
              parseFloat(order.shipping_cost) === 0
                ? "Gratuit"
                : `${parseFloat(order.shipping_cost).toFixed(2)} CHF`
            }</p>
            <p style="font-size: 20px; color: #166534;"><strong>Total : ${parseFloat(order.total_price).toFixed(2)} CHF</strong></p>
          </div>
          ${pdfBuffer
            ? `<p style="color:#4b5563; font-size:13px;">📎 Votre <strong>facture PDF</strong> est jointe à cet email.</p>`
            : ""}
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.FRONTEND_URL}/commandes/${order.id}"
               style="background: #166534; color: white; padding: 12px 28px; border-radius: 6px;
                      text-decoration: none; font-weight: bold; display: inline-block;">
              Suivre ma commande →
            </a>
          </div>
        </div>
      </div>
    `,
  });
};

// ═══════════════════════════════════════════════════════════
// HELPER — Email notification changement de statut commande
// ═══════════════════════════════════════════════════════════
const sendOrderStatusEmail = async (order, userName, userEmail) => {
  const statusConfig = {
    confirmee: {
      color:   "#166534",
      icon:    "✅",
      title:   "Commande confirmée",
      message: "Votre commande a été confirmée et est en cours de préparation.",
    },
    en_preparation: {
      color:   "#f59e0b",
      icon:    "📦",
      title:   "Commande en préparation",
      message: "Votre commande est en cours de préparation par notre équipe.",
    },
    expediee: {
      color:   "#3b82f6",
      icon:    "🚚",
      title:   "Commande expédiée",
      message: "Votre commande a été expédiée et est en route vers vous.",
    },
    livree: {
      color:   "#166534",
      icon:    "🎉",
      title:   "Commande livrée",
      message: "Votre commande a bien été livrée. Merci pour votre confiance !",
    },
    remboursee: {
      color:   "#8b5cf6",
      icon:    "💜",
      title:   "Commande remboursée",
      message: "Votre remboursement a été effectué. Il apparaîtra sur votre compte sous 3 à 5 jours ouvrés.",
    },
  };

  const config = statusConfig[order.status];
  if (!config) return;

  const trackingBlock  = order.tracking_number ? `<p><strong>Numéro de suivi :</strong> ${order.tracking_number}</p>` : "";
  const carrierBlock   = order.carrier         ? `<p><strong>Transporteur :</strong> ${order.carrier}</p>`            : "";
  const estimatedBlock = order.estimated_date
    ? `<p><strong>Date de livraison estimée :</strong> ${new Date(order.estimated_date).toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      })}</p>`
    : "";

  await sendEmail({
    to:      userEmail,
    subject: `${config.icon} Commande #${order.order_number} — ${config.title} — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${config.color}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: ${config.color};">${config.icon} ${config.title}</h2>
          <p>Bonjour ${userName},</p>
          <p>${config.message}</p>
          <div style="background: white; padding: 20px; border-radius: 8px;
                      margin: 20px 0; border-left: 4px solid ${config.color};">
            <p><strong>N° de commande :</strong> #${order.order_number}</p>
            <p><strong>Total :</strong> ${parseFloat(order.total_price).toFixed(2)} CHF</p>
            ${trackingBlock}${carrierBlock}${estimatedBlock}
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.FRONTEND_URL}/commandes/${order.id}"
               style="background: ${config.color}; color: white; padding: 12px 28px;
                      border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Suivre ma commande →
            </a>
          </div>
        </div>
      </div>
    `,
  }).catch(err => console.error(`Status email error (${order.status}):`, err.message));
};

// ═══════════════════════════════════════════════════════════
// HELPER — Email paiement échoué
// ═══════════════════════════════════════════════════════════
const sendPaymentFailedEmail = async (toEmail, customerName, order) => {
  await sendEmail({
    to:      toEmail,
    subject: `❌ Paiement échoué — Commande #${order.order_number} — GOFFA 🧺`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #fecaca; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #dc2626;">❌ Paiement échoué</h2>
          <p>Bonjour ${customerName},</p>
          <p>Votre paiement pour la commande <strong>#${order.order_number}</strong>
             d'un montant de <strong>${parseFloat(order.total_price).toFixed(2)} CHF</strong>
             n'a pas pu être traité.</p>
          <div style="background: white; padding: 20px; border-radius: 8px;
                      margin: 20px 0; border-left: 4px solid #dc2626;">
            <p style="margin: 0; color: #374151;">
              Raisons possibles : carte refusée, fonds insuffisants, délai expiré, ou 3D Secure non complété.
            </p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">
            Votre commande a été annulée et le stock a été libéré.
            Vous pouvez repasser une commande à tout moment.
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.FRONTEND_URL}/panier"
               style="background: #166534; color: white; padding: 12px 28px;
                      border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Réessayer ma commande →
            </a>
          </div>
        </div>
      </div>
    `,
  }).catch(err => console.error("Payment failed email error:", err.message));
};

// ═══════════════════════════════════════════════════════════
// HELPER — Générer facture PDF
// ═══════════════════════════════════════════════════════════
const generateInvoicePDF = (order, orderItems, customerName) => {
  return new Promise((resolve, reject) => {
    const doc      = new PDFDocument({ margin: 50, size: "A4" });
    const buffers  = [];
    const pageWidth = doc.page.width - 100;

    doc.on("data",  chunk => buffers.push(chunk));
    doc.on("end",   ()    => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc.fillColor("#166534").fontSize(26).font("Helvetica-Bold").text("GOFFA", 50, 50);
    doc.fontSize(10).fillColor("#4b5563").font("Helvetica")
      .text("Artisanat ", 50, 80)
      .text("Email : contact@goffa.ch", 50, 95)
      .text("Site : www.goffa.ch", 50, 110);

    doc.fillColor("#166534").fontSize(20).font("Helvetica-Bold")
      .text("FACTURE", 350, 50, { align: "right", width: 200 });

    const paymentLabel =
      order.payment_method === "card"  ? "Carte bancaire" :
      order.payment_method === "twint" ? "Twint"          : order.payment_method;

    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(`N° commande : #${order.order_number}`, 350, 80, { align: "right", width: 200 })
      .text(`Date : ${new Date(order.created_at).toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      })}`, 350, 95, { align: "right", width: 200 })
      .text(`Statut paiement : ${order.payment_status === "paid" ? "Payé" : "En attente"}`,
        350, 110, { align: "right", width: 200 });

    doc.moveTo(50, 135).lineTo(545, 135).strokeColor("#166534").lineWidth(2).stroke();

    doc.fillColor("#166534").fontSize(12).font("Helvetica-Bold").text("Adresse de livraison", 50, 155);
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(`Nom : ${order.shipping_full_name}`,                  50, 173)
      .text(`Adresse : ${order.shipping_address}`,                50, 188)
      .text(`Ville : ${order.shipping_city}`,                     50, 203)
      .text(`Gouvernorat : ${order.shipping_governorate || "—"}`, 50, 218)
      .text(`Code postal : ${order.shipping_postal_code || "—"}`, 50, 233)
      .text(`Pays : ${order.shipping_country || "CH"}`,           50, 248)
      .text(`Téléphone : ${order.shipping_phone || "—"}`,         50, 263);

    doc.fillColor("#166534").fontSize(12).font("Helvetica-Bold").text("Adresse de facturation", 300, 155);
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(`Nom : ${order.billing_full_name || order.shipping_full_name}`, 300, 173)
      .text(`Adresse : ${order.billing_address || order.shipping_address}`, 300, 188)
      .text(`Ville : ${order.billing_city || order.shipping_city}`,         300, 203)
      .text(`Mode paiement : ${paymentLabel}`,                              300, 218)
      .text(`Devise : CHF`,                                                  300, 233);

    const tableTop = 295;
    doc.fillColor("#166534").rect(50, tableTop, pageWidth, 24).fill();
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
      .text("Produit",    60,  tableTop + 7)
      .text("Détails",   230,  tableTop + 7)
      .text("Qté",       370,  tableTop + 7, { width: 40,  align: "center" })
      .text("Prix unit.", 415, tableTop + 7, { width: 70,  align: "right"  })
      .text("Total",      490, tableTop + 7, { width: 55,  align: "right"  });

    let y        = tableTop + 30;
    let rowIndex = 0;

    for (const item of orderItems) {
      const rowHeight = 28;
      const lineTotal = (parseFloat(item.price_at_order) * item.quantity).toFixed(2);

      if (rowIndex % 2 === 0) {
        doc.fillColor("#f0fdf4").rect(50, y - 4, pageWidth, rowHeight).fill();
      }

      let details = "—";
      if (item.variant_details && Array.isArray(item.variant_details) && item.variant_details.length > 0) {
        details = item.variant_details.map(a => `${a.attribute_type}: ${a.attribute_value}`).join(", ");
      }

      doc.fillColor("#111827").fontSize(9).font("Helvetica-Bold")
        .text(item.product_name_fr || "—", 60, y, { width: 165, ellipsis: true });
      doc.font("Helvetica").fillColor("#4b5563")
        .text(details, 230, y, { width: 135, ellipsis: true })
        .fillColor("#111827")
        .text(String(item.quantity), 370, y, { width: 40, align: "center" })
        .text(`${parseFloat(item.price_at_order).toFixed(2)} CHF`, 415, y, { width: 70, align: "right" })
        .font("Helvetica-Bold")
        .text(`${lineTotal} CHF`, 490, y, { width: 55, align: "right" });

      y += rowHeight;
      rowIndex++;
    }

    doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor("#166534").lineWidth(0.5).stroke();
    y += 16;
    const totalsX     = 350;
    const totalsWidth = 195;

    doc.fontSize(10).font("Helvetica").fillColor("#374151")
      .text("Sous-total :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(`${parseFloat(order.subtotal).toFixed(2)} CHF`, totalsX, y, { width: totalsWidth, align: "right" });
    y += 18;

    if (parseFloat(order.discount_amount) > 0) {
      doc.fillColor("#dc2626")
        .text("Réduction :", totalsX, y, { width: totalsWidth, align: "left" })
        .text(`-${parseFloat(order.discount_amount).toFixed(2)} CHF`, totalsX, y, { width: totalsWidth, align: "right" });
      y += 18;
    }

    doc.fillColor("#374151")
      .text("Frais de livraison :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(
        parseFloat(order.shipping_cost) === 0 ? "Gratuit" : `${parseFloat(order.shipping_cost).toFixed(2)} CHF`,
        totalsX, y, { width: totalsWidth, align: "right" }
      );
    y += 14;

    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#166534").lineWidth(1).stroke();
    y += 10;

    doc.fillColor("#166534").fontSize(13).font("Helvetica-Bold")
      .text("TOTAL :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(`${parseFloat(order.total_price).toFixed(2)} CHF`, totalsX, y, { width: totalsWidth, align: "right" });

    doc.moveTo(50, 750).lineTo(545, 750).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.fontSize(9).fillColor("#9ca3af").font("Helvetica")
      .text("Merci pour votre commande ! Pour toute question : contact@goffa.tn", 50, 760, { align: "center", width: pageWidth })
      .text("GOFFA — Artisanat authentique", 50, 775, { align: "center", width: pageWidth });

    doc.end();
  });
};

// ═══════════════════════════════════════════════════════════
// HELPER — Alerte stock faible/rupture (admin)
// ═══════════════════════════════════════════════════════════
const sendStockAlertEmail = async (productName, sku, stock) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const isOutOfStock = stock === 0;

  await sendEmail({
    to:      adminEmail,
    subject: `${isOutOfStock ? "🔴 RUPTURE" : "🟡 Stock faible"} — ${productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${isOutOfStock ? "#dc2626" : "#f59e0b"}; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">${isOutOfStock ? "🔴 Rupture de stock" : "🟡 Stock faible"}</h2>
        </div>
        <div style="padding: 20px; background: #fef2f2; border-radius: 0 0 8px 8px;">
          <p><strong>Produit :</strong> ${productName}</p>
          <p><strong>SKU :</strong> ${sku || "N/A"}</p>
          <p><strong>Stock restant :</strong>
            <span style="color: ${isOutOfStock ? "#dc2626" : "#f59e0b"}; font-weight: bold; font-size: 18px;">
              ${isOutOfStock ? "RUPTURE DE STOCK" : `${stock} unités`}
            </span>
          </p>
          <a href="${process.env.FRONTEND_URL}/admin/produits"
             style="background: #dc2626; color: white; padding: 10px 20px; border-radius: 6px;
                    text-decoration: none; display: inline-block; margin-top: 10px; font-weight: bold;">
            Gérer les stocks →
          </a>
        </div>
      </div>
    `,
  }).catch(err => console.error("Stock alert email error:", err.message));
};

// ═══════════════════════════════════════════════════════════
// HELPER — Calculer articles de la commande
// ✅ Applique automatiquement les variant_promotions actives
// ═══════════════════════════════════════════════════════════
const calculateOrderItems = async (items) => {

  for (const item of items) {
    if (!item.variant_id || !item.quantity || item.quantity < 1)
      throw new ErrorHandler("Chaque article doit avoir un variant_id et une quantité valide.", 400);
  }

  const variantIds = items.map(i => i.variant_id);

  // ✅ 2 requêtes parallèles au lieu de 2×N séquentielles
  const [variants, promos] = await Promise.all([
    ProductVariant.findActiveByIds(variantIds),
    VariantPromotion.findActiveByVariantIds(variantIds),
  ]);

  const variantMap = Object.fromEntries(variants.map(v => [v.id, v]));
  const promoMap   = Object.fromEntries(promos.map(p => [p.variant_id, p]));

  let subtotal     = 0;
  const orderItems = [];

  for (const item of items) {
    const variant = variantMap[item.variant_id];
    if (!variant)
      throw new ErrorHandler(`Variante ${item.variant_id} introuvable ou inactive.`, 404);

    let finalPrice = parseFloat(variant.price);
    const promo    = promoMap[item.variant_id];

    if (promo) {
      finalPrice = promo.discount_type === "percent"
        ? finalPrice * (1 - parseFloat(promo.discount_value) / 100)
        : Math.max(0, finalPrice - parseFloat(promo.discount_value));
      finalPrice = parseFloat(finalPrice.toFixed(3));
    }

    subtotal += finalPrice * item.quantity;
    orderItems.push({
      variant_id:           item.variant_id,
      quantity:             item.quantity,
      price_at_order:       finalPrice,
      _product_name_fr:     variant.product_name_fr,
      _low_stock_threshold: variant.low_stock_threshold || 5,
      _sku:                 variant.sku,
    });
  }

  return { subtotal: parseFloat(subtotal.toFixed(3)), orderItems };
};
// ═══════════════════════════════════════════════════════════
// HELPER — Appliquer code promo sur le subtotal
// ═══════════════════════════════════════════════════════════
const applyPromoCode = async (code, subtotal) => {
  // ✅ Model : chercher le code promo actif
const p = await Promotion.findValidByCode(code);

  if (!p)
    throw new ErrorHandler("Code promo invalide ou expiré.", 400);

  if (p.min_order_amount && subtotal < parseFloat(p.min_order_amount))
    throw new ErrorHandler(
      `Montant minimum requis : ${parseFloat(p.min_order_amount).toFixed(2)} CHF pour ce code.`,
      400
    );

  let discountAmount = 0;
  if (p.discount_type === "percent") {
    discountAmount = (subtotal * parseFloat(p.discount_value)) / 100;
  } else {
    discountAmount = Math.min(parseFloat(p.discount_value), subtotal);
  }

  return {
    discountAmount: parseFloat(discountAmount.toFixed(3)),
    promoId:        p.id,
  };
};

// ═══════════════════════════════════════════════════════════
// HELPER — Insérer les articles + gérer le stock
// ═══════════════════════════════════════════════════════════


// Fonction 1 — enregistrer articles SANS toucher au stock
const insertOrderItemsOnly = async (orderId, orderItems) => {
  for (const item of orderItems) {
    await OrderItem.create({
      orderId,
      variantId:    item.variant_id,
      quantity:     item.quantity,
      priceAtOrder: item.price_at_order,
    });
  }
};

// Fonction 2 — décrémenter stock + alertes
// Appelée UNIQUEMENT après confirmation paiement Stripe
const decrementStockForOrder = async (orderId, orderItems) => {
  for (const item of orderItems) {
    await ProductVariant.decrementStock(item.variant_id, item.quantity);
    const updated = await ProductVariant.findById(item.variant_id);
    if (updated && updated.stock <= (updated.low_stock_threshold || 5)) {
      await sendStockAlertEmail(item._product_name_fr || updated.product_name_fr || "Produit", updated.sku, updated.stock);
    }
  }
};

// ═══════════════════════════════════════════════════════════
// HELPER — Restaurer le stock (annulation / paiement échoué)
// ═══════════════════════════════════════════════════════════
const restoreStock = async (orderId) => {
  // ✅ Model : récupérer les articles de la commande
  const items = await OrderItem.findByOrderIdSimple(orderId);

  for (const item of items) {
    if (item.variant_id) {
      // ✅ Model : restaurer le stock
      await ProductVariant.incrementStock(item.variant_id, item.quantity);
    }
  }
};

// ═══════════════════════════════════════════════════════════
// HELPER — Finaliser la commande (articles + livraison + promo)
// ═══════════════════════════════════════════════════════════
const finalizeOrder = async ({ order, orderItems, promoId }) => {
  await insertOrderItemsOnly(order.id, orderItems);

  // ✅ Model : créer la livraison
  await Delivery.create(order.id);

  // ✅ Model : incrémenter used_count de la promo
  if (promoId) {
    await Promotion.incrementUsed(promoId);
  }

  await exportOrderToOdoo(order.id).catch(err =>
    console.error("Odoo export error:", err.message)
  );
};

// ═══════════════════════════════════════════════════════════
// HELPER — Créer paiement Stripe
// ═══════════════════════════════════════════════════════════
const createStripePayment = async (totalPrice, orderId, customerEmail, payment_method) => {
  const amountInCents = Math.round(totalPrice * 100);

  if (amountInCents < 50)
    throw new ErrorHandler("Le montant minimum pour un paiement en ligne est 0.50 CHF.", 400);

  const paymentIntent = await stripe.paymentIntents.create({
    amount:               amountInCents,
    currency:             "chf",
    metadata:             { order_id: orderId },
    receipt_email:        customerEmail,
    payment_method_types: payment_method === "twint" ? ["twint"] : ["card"],
  });

  return paymentIntent;
};

// ═══════════════════════════════════════════════════════════
// SERVICE — CREATE ORDER (user connecté)
// ═══════════════════════════════════════════════════════════
export const createOrderService = async ({
  userId, userEmail, userName,
  items, payment_method,
  billing_full_name,    billing_phone,
  billing_address,      billing_city,
  billing_governorate,  billing_postal_code,  billing_country,
  shipping_full_name,   shipping_phone,
  shipping_address,     shipping_city,
  shipping_governorate, shipping_postal_code, shipping_country,
  promo_code, notes,
}) => {
  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result   = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const subtotalAfterDiscount = subtotal - discountAmount;
  const shippingCost          = calculateShippingCost(subtotalAfterDiscount);
  const totalPrice            = parseFloat((subtotalAfterDiscount + shippingCost).toFixed(3));

  const addressData = {
    billing_full_name,    billing_phone,
    billing_address,      billing_city,
    billing_governorate,  billing_postal_code,  billing_country,
    shipping_full_name,   shipping_phone,
    shipping_address,     shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
  };

  // ✅ Model : créer la commande
  const order = await Order.create({
    userId, payment_method,
    subtotal, shippingCost, discountAmount, totalPrice,
    promoId,
    ...addressData,
    notes,
  });

  await finalizeOrder({ order, orderItems, promoId });

  // ✅ Model : mettre à jour les adresses du profil user
  await User.updateAddresses(userId, addressData);

  // ✅ Stripe
  const paymentIntent = await createStripePayment(totalPrice, order.id, userEmail, payment_method);
  await Order.updatePaymentId(order.id, paymentIntent.id);
  order.payment_id = paymentIntent.id;

  return {
    order,
    payment: {
      method:        payment_method,
      client_secret: paymentIntent.client_secret,
    },
    shipping_info: {
      shipping_cost:           parseFloat(order.shipping_cost),
      free_shipping_threshold: SHIPPING_FREE_THRESHOLD,
      is_free:                 parseFloat(order.shipping_cost) === 0,
    },
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — CREATE GUEST ORDER (user non connecté)
// ═══════════════════════════════════════════════════════════
export const createGuestOrderService = async ({
  items, payment_method,
  name, email, phone,
  billing_full_name,    billing_phone,
  billing_address,      billing_city,
  billing_governorate,  billing_postal_code,  billing_country,
  shipping_full_name,   shipping_phone,
  shipping_address,     shipping_city,
  shipping_governorate, shipping_postal_code, shipping_country,
  promo_code, notes,
}) => {
  const user = await createGuestAccountService({ name, email, phone });

  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result   = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const subtotalAfterDiscount = subtotal - discountAmount;
  const shippingCost          = calculateShippingCost(subtotalAfterDiscount);
  const totalPrice            = parseFloat((subtotalAfterDiscount + shippingCost).toFixed(3));

  const addressData = {
    billing_full_name,    billing_phone,
    billing_address,      billing_city,
    billing_governorate,  billing_postal_code,  billing_country,
    shipping_full_name,   shipping_phone,
    shipping_address,     shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
  };

  // ✅ Model : créer la commande guest
  const order = await Order.create({
    userId: user.id, payment_method,
    subtotal, shippingCost, discountAmount, totalPrice,
    promoId,
    ...addressData,
    notes,
  });

  await finalizeOrder({ order, orderItems, promoId });

  // ✅ Model : mettre à jour les adresses du compte guest
  await User.updateAddresses(user.id, addressData);

  // ✅ Stripe
  const paymentIntent = await createStripePayment(totalPrice, order.id, email, payment_method);
  await Order.updatePaymentId(order.id, paymentIntent.id);
  order.payment_id = paymentIntent.id;
  order.is_guest   = true;

  return {
    order,
    payment: {
      method:        payment_method,
      client_secret: paymentIntent.client_secret,
    },
    shipping_info: {
      shipping_cost:           parseFloat(order.shipping_cost),
      free_shipping_threshold: SHIPPING_FREE_THRESHOLD,
      is_free:                 parseFloat(order.shipping_cost) === 0,
    },
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — STRIPE WEBHOOK
// ═══════════════════════════════════════════════════════════
export const handleStripeWebhookService = async (payload, signature) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new ErrorHandler(`Webhook invalide : ${err.message}`, 400);
  }

  switch (event.type) {

    // ── Paiement réussi ───────────────────────────────────
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      // ✅ Model : confirmer le paiement
      const order = await Order.confirmPayment(pi.id);
      if (!order) break;
  // ✅ NOUVEAU — décrémenter stock ici après paiement confirmé
  const orderItemsForStock = await OrderItem.findByOrderIdSimple(order.id);
  await decrementStockForOrder(order.id, orderItemsForStock);
      // ✅ Model : récupérer l'utilisateur
      const user = await User.findById(order.user_id);

      if (user) {
        // ✅ Model : récupérer les articles avec détails
        const items     = await OrderItem.findByOrderId(order.id);
        const pdfBuffer = await generateInvoicePDF(order, items, user.name);
        await sendOrderConfirmationEmail(user.email, order, user.name, pdfBuffer);
        console.log(`✅ Email + PDF envoyés — commande ${order.order_number}`);

        notifyUser(order.user_id, {
          type:         "ORDER_CONFIRMED",
          id:           order.id,
          order_number: order.order_number,
          message:      `✅ Commande #${order.order_number} confirmée !`,
        });
      }

      await invalidateDashboardCache();
      break;
    }

    // ── Paiement échoué ───────────────────────────────────
    case "payment_intent.payment_failed": {
      const pi = event.data.object;

      // ✅ Model : marquer paiement échoué
      const order = await Order.markPaymentFailed(pi.id);
      if (!order) break;

      // ✅ Model : annuler la livraison
      await Delivery.markReturned(order.id);

   

      // ✅ Model : récupérer l'utilisateur
      const user = await User.findById(order.user_id);
      if (user) {
        await sendPaymentFailedEmail(user.email, user.name, order);
        console.log(`❌ Paiement échoué — commande ${order.order_number}`);

        notifyUser(order.user_id, {
          type:         "ORDER_PAYMENT_FAILED",
          id:           order.id,
          order_number: order.order_number,
          message:      `❌ Paiement échoué — commande #${order.order_number}`,
        });
      }

      await invalidateDashboardCache();
      break;
    }

    // ── Remboursement ─────────────────────────────────────
    case "charge.refunded": {
      const charge = event.data.object;
      // ✅ Model : marquer remboursé
      await Order.markRefunded(charge.payment_intent);
      await invalidateDashboardCache();
      break;
    }

    default:
      console.log(`Webhook event non géré : ${event.type}`);
  }

  return { received: true };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET MY ORDERS (user connecté)
// ═══════════════════════════════════════════════════════════
export const getMyOrdersService = async (userId) => {
  // ✅ Model : commandes de l'utilisateur
  return await Order.findByUser(userId);
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrderService = async ({ orderId, userId, role }) => {
  // ✅ Model : chercher par ID (admin) ou ID + user (client)
  const order = role === "admin"
    ? await Order.findById(orderId)
    : await Order.findByIdAndUser(orderId, userId);

  if (!order)
    throw new ErrorHandler("Commande introuvable.", 404);

  // ✅ Model : articles avec détails complets
  order.items = await OrderItem.findByOrderId(orderId);

  order.shipping_info = {
    free_shipping_threshold: SHIPPING_FREE_THRESHOLD,
    shipping_cost_amount:    SHIPPING_COST,
    is_free:                 parseFloat(order.shipping_cost) === 0,
  };

  return order;
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET ALL ORDERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllOrdersService = async ({ status, payment_status, page = 1 }) => {
  // ✅ Model : toutes les commandes avec filtres
  return await Order.findAll({ status, payment_status, page });
};

// ═══════════════════════════════════════════════════════════
// SERVICE — UPDATE ORDER STATUS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOrderStatusService = async ({ orderId, status }) => {
  const validStatuses = [
    "en_attente", "confirmee", "en_preparation",
    "expediee", "livree", "annulee", "remboursee","en_reclamation", "retournee",
  ];

  if (!validStatuses.includes(status))
    throw new ErrorHandler(
      `Statut invalide. Valeurs acceptées : ${validStatuses.join(", ")}`, 400
    );

  // ✅ Model : récupérer la commande
  const order = await Order.findById(orderId);
  if (!order)
    throw new ErrorHandler("Commande introuvable.", 404);

  if (status === "annulee") {
    throw new ErrorHandler(
      "Pour annuler, utilisez la route PATCH /cancel qui requiert une raison d'annulation.",
      400
    );
  }

  // ✅ Model : mettre à jour le statut
  await Order.updateStatus(orderId, status);
  await invalidateDashboardCache();
  order.status = status;

  // ✅ Model : sync livraison selon statut

if (status === "en_preparation") await Delivery.markInPreparation(orderId);
if (status === "expediee")       await Delivery.markShipped(orderId);
if (status === "livree")         await Delivery.markDelivered(orderId);

  // ✅ Récupérer tracking pour l'email si expédiée
 // Dans updateOrderStatusService — temporairement
if (status === "expediee") {
  try {
    await Delivery.markShipped(orderId);
    console.log("✅ Delivery markShipped réussi");
  } catch (err) {
    console.error("❌ Delivery markShipped ERREUR:", err.message);
  }
}

  // ✅ Model : récupérer l'utilisateur pour l'email
  const user = await User.findById(order.user_id);
  if (user) {
    await sendOrderStatusEmail(order, user.name, user.email);
    notifyUser(order.user_id, {
      type:         "ORDER_STATUS_UPDATE",
      id:           orderId,
      order_number: order.order_number,
      status,
      message:      `Votre commande #${order.order_number} est maintenant : ${status}`,
    });
  }

  return { message: `Statut mis à jour : ${status}` };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — CANCEL ORDER (admin)
// ═══════════════════════════════════════════════════════════
export const cancelOrderService = async ({ orderId, reason }) => {
  if (!reason || reason.trim() === "")
    throw new ErrorHandler("Une raison d'annulation est obligatoire.", 400);

  // ✅ Model : récupérer la commande
  const order = await Order.findById(orderId);
  if (!order)
    throw new ErrorHandler("Commande introuvable.", 404);

  if (order.status === "annulee")
    throw new ErrorHandler("Cette commande est déjà annulée.", 400);

  if (order.status === "livree")
    throw new ErrorHandler("Impossible d'annuler une commande déjà livrée.", 400);

  // ✅ Stock décrémenté seulement si paiement confirmé → restaurer seulement dans ce cas
if (order.payment_status === "paye") {
  await restoreStock(orderId);
  if (order.payment_id) {
    await stripe.refunds.create({ payment_intent: order.payment_id });
  }
}

  // ✅ Model : annuler commande + livraison
  await Order.cancel(orderId, reason.trim());
  await Delivery.markReturned(orderId);

  // ✅ Model : email client
  const user = await User.findById(order.user_id);
  if (user) {
    await sendEmail({
      to:      user.email,
      subject: `🚫 Commande #${order.order_number} annulée — GOFFA 🧺`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
            <h2>Commande annulée</h2>
            <p>Bonjour ${user.name},</p>
            <p>Votre commande <strong>#${order.order_number}</strong> a été annulée.</p>
            <p><strong>Raison :</strong> ${reason}</p>
            ${order.payment_status === "paye"
              ? `<p style="color: #166534;">✅ Un remboursement de <strong>${parseFloat(order.total_price).toFixed(2)} CHF</strong> a été initié.</p>`
              : ""}
            <div style="text-align: center; margin-top: 24px;">
              <a href="${process.env.FRONTEND_URL}/boutique"
                 style="background: #166534; color: white; padding: 12px 28px;
                        border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                Continuer mes achats →
              </a>
            </div>
          </div>
        </div>
      `,
    }).catch(err => console.error("Cancel email error:", err.message));

    notifyUser(order.user_id, {
      type:         "ORDER_CANCELLED",
      id:           orderId,
      order_number: order.order_number,
      message:      `🚫 Commande #${order.order_number} annulée.`,
    });
  }

  await invalidateDashboardCache();
  return { message: "Commande annulée avec succès." };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — UPDATE DELIVERY (admin)
// ═══════════════════════════════════════════════════════════
export const updateDeliveryService = async ({
  orderId, carrier, tracking_number, estimated_date, status, notes,
}) => {
  const existing = await Delivery.findByOrderId(orderId);
  if (!existing)
    throw new ErrorHandler("Livraison introuvable.", 404);

  const delivery = await Delivery.update(orderId, {
    carrier, tracking_number, estimated_date, status, notes,
  });

  const order = await Order.findById(orderId);
  const user  = order ? await User.findById(order.user_id) : null;

  // ── livre → order passe à livree (déjà en place) ──────────────
  if (status === "livre") {
    await Order.updateStatus(orderId, "livree");
    await invalidateDashboardCache();
    if (order && user) {
      order.status = "livree";
      await sendOrderStatusEmail(order, user.name, user.email);
      notifyUser(order.user_id, {
        type:         "ORDER_STATUS_UPDATE",
        id:           orderId,
        order_number: order.order_number,
        status:       "livree",
        message:      `🎉 Commande #${order.order_number} livrée !`,
      });
    }
  }

  // ── en_transit / en_cours → notif client uniquement, order inchangée ──
  if (status === "en_transit" || status === "en_cours") {
    const label = status === "en_transit" ? "en transit" : "en cours de livraison";
    if (user) {
      await sendEmail({
        to:      user.email,
        subject: `🚚 Votre commande #${order.order_number} est ${label} — GOFFA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#3b82f6;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
              <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
            </div>
            <div style="padding:30px;background:#f9fafb;border-radius:0 0 10px 10px;">
              <h2 style="color:#3b82f6;">🚚 Votre colis est ${label}</h2>
              <p>Bonjour ${user.name},</p>
              <p>Votre commande <strong>#${order.order_number}</strong> est actuellement ${label}.</p>
              ${tracking_number ?? existing.tracking_number
                ? `<p><strong>Numéro de suivi :</strong> ${tracking_number ?? existing.tracking_number}</p>`
                : ""}
              ${carrier ?? existing.carrier
                ? `<p><strong>Transporteur :</strong> ${carrier ?? existing.carrier}</p>`
                : ""}
            </div>
          </div>
        `,
      }).catch(err => console.error("Transit email error:", err.message));

      notifyUser(order.user_id, {
        type:         "DELIVERY_UPDATE",
        id:           orderId,
        order_number: order.order_number,
        status,
        message: `🚚 Commande #${order.order_number} ${label}`,
      });
    }
  }

  // ── echec → order reste expediee, notif admin uniquement ──────
  if (status === "echec") {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail({
        to:      adminEmail,
        subject: `⚠️ Échec livraison — Commande #${order?.order_number}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#f59e0b;padding:20px;border-radius:8px 8px 0 0;">
              <h2 style="color:white;margin:0;">⚠️ Échec de livraison</h2>
            </div>
            <div style="padding:20px;background:#fffbeb;border-radius:0 0 8px 8px;">
              <p><strong>Commande :</strong> #${order?.order_number}</p>
              <p><strong>Client :</strong> ${user?.name} — ${user?.email}</p>
              <p><strong>Transporteur :</strong> ${carrier ?? existing.carrier ?? "N/A"}</p>
              <p><strong>Suivi :</strong> ${tracking_number ?? existing.tracking_number ?? "N/A"}</p>
              <p><strong>Notes :</strong> ${notes ?? existing.notes ?? "—"}</p>
              <p style="color:#92400e;">Le statut de la commande reste <strong>expédiée</strong>.
                 Vous pouvez relancer la livraison ou initier un retour.</p>
              <a href="${process.env.FRONTEND_URL}/admin/commandes/${orderId}"
                 style="background:#166534;color:white;padding:10px 20px;border-radius:6px;
                        text-decoration:none;display:inline-block;margin-top:10px;">
                Gérer la commande →
              </a>
            </div>
          </div>
        `,
      }).catch(err => console.error("Echec livraison email error:", err.message));
    }
    // order.status reste "expediee" — rien d'autre à faire
  }

  // ── retourne → order passe à retournee auto ───────────────────
  if (status === "retourne") {
    await Order.markReturned(orderId);
    await invalidateDashboardCache();
    if (user) {
      await sendEmail({
        to:      user.email,
        subject: `↩️ Commande #${order.order_number} retournée — GOFFA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#dc2626;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
              <h1 style="color:white;margin:0;">🧺 GOFFA</h1>
            </div>
            <div style="padding:30px;background:#f9fafb;border-radius:0 0 10px 10px;">
              <h2 style="color:#dc2626;">↩️ Colis retourné</h2>
              <p>Bonjour ${user.name},</p>
              <p>Votre colis pour la commande <strong>#${order.order_number}</strong>
                 nous a été retourné. Notre équipe va vous contacter rapidement.</p>
            </div>
          </div>
        `,
      }).catch(err => console.error("Retour email error:", err.message));

      notifyUser(order.user_id, {
        type:         "ORDER_STATUS_UPDATE",
        id:           orderId,
        order_number: order.order_number,
        status:       "retournee",
        message:      `↩️ Commande #${order.order_number} retournée.`,
      });
    }
  }

  return delivery;
};

// ═══════════════════════════════════════════════════════════
// SERVICE — ADMIN UPDATE ORDER SHIPPING INFO
// ═══════════════════════════════════════════════════════════
export const adminUpdateOrderShippingService = async ({
  orderId,
  shipping_full_name, shipping_phone,
  shipping_address,   shipping_city,
  shipping_governorate, shipping_postal_code,
}) => {
  const existing = await Order.findById(orderId);
  if (!existing)
    throw new ErrorHandler("Commande introuvable.", 404);

  // ✅ Model : mettre à jour les infos de livraison
  return await Order.updateShipping(orderId, {
    shipping_full_name, shipping_phone,
    shipping_address,   shipping_city,
    shipping_governorate, shipping_postal_code,
  });
};

// ═══════════════════════════════════════════════════════════
// SERVICE — VALIDATE PROMO CODE
// ═══════════════════════════════════════════════════════════
export const validatePromoService = async ({ code, subtotal }) => {
  if (!code || !subtotal)
    throw new ErrorHandler("Code et sous-total requis.", 400);

  // ✅ Model : chercher le code promo
const p = await Promotion.findValidByCode(code);

  if (!p)
    throw new ErrorHandler("Code promo invalide ou expiré.", 400);

  if (p.min_order_amount && subtotal < parseFloat(p.min_order_amount))
    throw new ErrorHandler(
      `Montant minimum requis : ${parseFloat(p.min_order_amount).toFixed(2)} CHF pour ce code.`,
      400
    );

  let discountAmount = 0;
  if (p.discount_type === "percent") {
    discountAmount = (subtotal * parseFloat(p.discount_value)) / 100;
  } else {
    discountAmount = Math.min(parseFloat(p.discount_value), subtotal);
  }

  discountAmount = parseFloat(discountAmount.toFixed(2));
  const subtotalAfterDiscount = parseFloat((subtotal - discountAmount).toFixed(2));
  const shippingCost          = calculateShippingCost(subtotalAfterDiscount);

  return {
    valid:                  true,
    promoCode:              p.code.toUpperCase(),
    discountType:           p.discount_type,
    discountValue:          parseFloat(p.discount_value),
    discountAmount,
    originalAmount:         parseFloat(subtotal.toFixed(2)),
    subtotalAfterDiscount,
    shippingCost,
    totalAmount:            parseFloat((subtotalAfterDiscount + shippingCost).toFixed(2)),
    freeShippingThreshold:  SHIPPING_FREE_THRESHOLD,
    label: p.discount_type === "percent"
      ? `-${p.discount_value}%`
      : `-${p.discount_value} CHF`,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET SHIPPING COST INFO
// ═══════════════════════════════════════════════════════════
export const getShippingCostService = (subtotal) => {
  const shippingCost     = calculateShippingCost(subtotal);
  const remainingForFree = Math.max(0, SHIPPING_FREE_THRESHOLD - subtotal);

  return {
    shipping_cost:           shippingCost,
    free_shipping_threshold: SHIPPING_FREE_THRESHOLD,
    is_free:                 shippingCost === 0,
    remaining_for_free:      parseFloat(remainingForFree.toFixed(2)),
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET LOW STOCK PRODUCTS (admin dashboard)
// ═══════════════════════════════════════════════════════════
export const getLowStockProductsService = async () => {
  // ✅ Model : produits en stock faible
  return await ProductVariant.findLowStock();
};