import Stripe from "stripe";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";
import { createGuestAccountService } from "./authService.js";
import { exportOrderToOdoo } from "./odooService.js";
import PDFDocument from "pdfkit";
import { invalidateDashboardCache } from "../utils/cacheInvalideation.js";


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ═══════════════════════════════════════════════════════════
// CONSTANTES — Livraison
// SHIPPING_FREE_THRESHOLD : au-dessus → livraison gratuite
// SHIPPING_COST           : en-dessous → montant à payer
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
// ✅ Appelé dans updateOrderStatusService après chaque UPDATE
// ═══════════════════════════════════════════════════════════
const sendOrderStatusEmail = async (order, userName, userEmail) => {
 
  // Configuration par statut : couleur, icône, titre, message
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
  if (!config) return; // Pas d'email pour les statuts non listés
 
  // Bloc tracking number si disponible
  const trackingBlock = order.tracking_number
    ? `<p><strong>Numéro de suivi :</strong> ${order.tracking_number}</p>`
    : "";
 
  // Bloc transporteur si disponible
  const carrierBlock = order.carrier
    ? `<p><strong>Transporteur :</strong> ${order.carrier}</p>`
    : "";
 
  // Bloc date estimée si disponible
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
            ${trackingBlock}
            ${carrierBlock}
            ${estimatedBlock}
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.FRONTEND_URL}/commandes/${order.id}"
               style="background: ${config.color}; color: white; padding: 12px 28px;
                      border-radius: 6px; text-decoration: none;
                      font-weight: bold; display: inline-block;">
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
// ✅ Utilise les données enrichies par JOIN (pas de snapshots)
// ═══════════════════════════════════════════════════════════
const generateInvoicePDF = (order, orderItems, customerName) => {
  return new Promise((resolve, reject) => {
    const doc      = new PDFDocument({ margin: 50, size: "A4" });
    const buffers  = [];
    const pageWidth = doc.page.width - 100;

    doc.on("data",  chunk => buffers.push(chunk));
    doc.on("end",   ()    => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // ── En-tête ──────────────────────────────────────────
    doc
      .fillColor("#166534")
      .fontSize(26)
      .font("Helvetica-Bold")
      .text("GOFFA", 50, 50);

    doc
      .fontSize(10)
      .fillColor("#4b5563")
      .font("Helvetica")
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

    // ── Infos livraison ───────────────────────────────────
    doc.fillColor("#166534").fontSize(12).font("Helvetica-Bold").text("Adresse de livraison", 50, 155);
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(`Nom : ${order.shipping_full_name}`,               50, 173)
      .text(`Adresse : ${order.shipping_address}`,             50, 188)
      .text(`Ville : ${order.shipping_city}`,                  50, 203)
      .text(`Gouvernorat : ${order.shipping_governorate || "—"}`, 50, 218)
      .text(`Code postal : ${order.shipping_postal_code || "—"}`, 50, 233)
      .text(`Pays : ${order.shipping_country || "CH"}`,        50, 248)
      .text(`Téléphone : ${order.shipping_phone || "—"}`,      50, 263);

    // ── Infos facturation ─────────────────────────────────
    doc.fillColor("#166534").fontSize(12).font("Helvetica-Bold").text("Adresse de facturation", 300, 155);
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(`Nom : ${order.billing_full_name || order.shipping_full_name}`, 300, 173)
      .text(`Adresse : ${order.billing_address || order.shipping_address}`, 300, 188)
      .text(`Ville : ${order.billing_city || order.shipping_city}`,         300, 203)
      .text(`Mode paiement : ${paymentLabel}`,                              300, 218)
      .text(`Devise : CHF`,                                                  300, 233);

    // ── Tableau articles ─────────────────────────────────
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

      // Attributs dynamiques (depuis JOIN)
      let details = "—";
      if (item.variant_details && Array.isArray(item.variant_details) && item.variant_details.length > 0) {
        details = item.variant_details
          .map(a => `${a.attribute_type}: ${a.attribute_value}`)
          .join(", ");
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

    // ── Totaux ───────────────────────────────────────────
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
        parseFloat(order.shipping_cost) === 0
          ? "Gratuit"
          : `${parseFloat(order.shipping_cost).toFixed(2)} CHF`,
        totalsX, y, { width: totalsWidth, align: "right" }
      );
    y += 14;

    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#166534").lineWidth(1).stroke();
    y += 10;

    doc.fillColor("#166534").fontSize(13).font("Helvetica-Bold")
      .text("TOTAL :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(`${parseFloat(order.total_price).toFixed(2)} CHF`, totalsX, y, { width: totalsWidth, align: "right" });

    // ── Pied de page ─────────────────────────────────────
    doc
      .moveTo(50, 750)
      .lineTo(545, 750)
      .strokeColor("#e5e7eb")
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(9)
      .fillColor("#9ca3af")
      .font("Helvetica")
      .text(
        "Merci pour votre commande ! Pour toute question : contact@goffa.tn",
        50, 760, { align: "center", width: pageWidth }
      )
      .text(
        "GOFFA — Artisanat  authentique",
        50, 775, { align: "center", width: pageWidth }
      );

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
          <h2 style="color: white; margin: 0;">
            ${isOutOfStock ? "🔴 Rupture de stock" : "🟡 Stock faible"}
          </h2>
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
// HELPER — Récupérer articles d'une commande avec JOIN complet
// Utilisé pour PDF, getSingleOrder, getMyOrders
// ═══════════════════════════════════════════════════════════
const fetchOrderItemsWithDetails = async (orderId) => {
  const result = await database.query(
    `SELECT
       oi.id,
       oi.order_id,
       oi.variant_id,
       oi.quantity,
       oi.price_at_order,
       oi.created_at,
       p.name_fr           AS product_name_fr,
       p.images->0->>'url' AS product_image,
       pv.sku,
       -- ✅ Nouveau JOIN — pva.value_fr directement, plus d'attribute_values
       COALESCE(
         json_agg(
           json_build_object(
             'attribute_type',  at.name_fr,
             'attribute_value', pva.value_fr
           )
           ORDER BY at.name_fr
         ) FILTER (WHERE at.id IS NOT NULL),
         '[]'
       ) AS variant_details
     FROM order_items oi
     LEFT JOIN product_variants          pv  ON pv.id = oi.variant_id
     LEFT JOIN products                   p  ON p.id  = pv.product_id
     -- ✅ JOIN direct sur pva — attribute_type_id disponible directement
     LEFT JOIN product_variant_attributes pva ON pva.variant_id = pv.id
     LEFT JOIN attribute_types            at  ON at.id = pva.attribute_type_id
     WHERE oi.order_id = $1
     GROUP BY oi.id, p.name_fr, p.images, pv.sku`,
    [orderId]
  );
  return result.rows;
};
 

// ═══════════════════════════════════════════════════════════
// HELPER — Calculer articles de la commande
// ✅ Applique automatiquement les variant_promotions actives
// ✅ Le prix promotionnel devient price_at_order
// ═══════════════════════════════════════════════════════════
const calculateOrderItems = async (items) => {
  let subtotal   = 0;
  const orderItems = [];

  for (const item of items) {
    const { variant_id, quantity } = item;

    if (!variant_id || !quantity || quantity < 1)
      throw new ErrorHandler("Chaque article doit avoir un variant_id et une quantité valide.", 400);

    // ✅ Récupérer le variant + infos produit
    const variantResult = await database.query(
      `SELECT
         pv.id, pv.price, pv.stock, pv.low_stock_threshold, pv.sku, pv.is_active,
         p.name_fr AS product_name_fr
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1 AND pv.is_active = true AND p.is_active = true`,
      [variant_id]
    );

    if (variantResult.rows.length === 0)
      throw new ErrorHandler(`Variante ${variant_id} introuvable ou inactive.`, 404);

    const variant = variantResult.rows[0];

    // ✅ Vérifier si une promotion active existe pour ce variant
    const promoResult = await database.query(
      `SELECT discount_type, discount_value
       FROM variant_promotions
       WHERE variant_id = $1
         AND is_active  = true
         AND starts_at <= NOW()
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [variant_id]
    );

    // ✅ Calculer le prix final (avec ou sans promo variant)
    let finalPrice = parseFloat(variant.price);

    if (promoResult.rows.length > 0) {
      const vp = promoResult.rows[0];
      if (vp.discount_type === "percent") {
        finalPrice = finalPrice * (1 - parseFloat(vp.discount_value) / 100);
      } else {
        // fixed
        finalPrice = Math.max(0, finalPrice - parseFloat(vp.discount_value));
      }
      finalPrice = parseFloat(finalPrice.toFixed(3));
    }

    subtotal += finalPrice * quantity;

    orderItems.push({
      variant_id,
      quantity,
      price_at_order:       finalPrice,
      // ✅ Utilisés uniquement pour alertes stock — non stockés en DB
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
  const promo = await database.query(
    `SELECT * FROM promotions
     WHERE UPPER(code) = UPPER($1)
       AND is_active   = true
       AND starts_at  <= NOW()
       AND expires_at >= NOW()
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (promo.rows.length === 0)
    throw new ErrorHandler("Code promo invalide ou expiré.", 400);

  const p = promo.rows[0];

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
const insertOrderItems = async (orderId, orderItems) => {
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || "backend";

  for (const item of orderItems) {
    // ✅ INSERT simplifié — plus de snapshots
    await database.query(
      `INSERT INTO order_items (order_id, variant_id, quantity, price_at_order)
       VALUES ($1, $2, $3, $4)`,
      [orderId, item.variant_id, item.quantity, item.price_at_order]
    );

    if (stockManagedBy === "backend") {
      await database.query(
        "UPDATE product_variants SET stock = GREATEST(stock - $1, 0) WHERE id = $2",
        [item.quantity, item.variant_id]
      );

      const updatedVariant = await database.query(
        "SELECT stock, low_stock_threshold, sku FROM product_variants WHERE id = $1",
        [item.variant_id]
      );

      const v = updatedVariant.rows[0];
      if (v && v.stock <= (v.low_stock_threshold || 5)) {
        await sendStockAlertEmail(item._product_name_fr, v.sku, v.stock);
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════
// HELPER — Restaurer le stock (annulation / paiement échoué)
// ═══════════════════════════════════════════════════════════
const restoreStock = async (orderId) => {
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || "backend";

  if (stockManagedBy !== "backend") return;

  const items = await database.query(
    "SELECT variant_id, quantity FROM order_items WHERE order_id = $1",
    [orderId]
  );

  for (const item of items.rows) {
    if (item.variant_id) {
      await database.query(
        "UPDATE product_variants SET stock = stock + $1 WHERE id = $2",
        [item.quantity, item.variant_id]
      );
    }
  }
};

// ═══════════════════════════════════════════════════════════
// HELPER — Construire et insérer la commande en DB
// ✅ Avec billing_*, shipping_*, sans promo_code
// ✅ Calcul frais de livraison selon seuil
// ═══════════════════════════════════════════════════════════
const buildAndInsertOrder = async ({
  userId, payment_method,
  subtotal, discountAmount, promoId,
  billing_full_name, billing_phone,
  billing_address, billing_city,
  billing_governorate, billing_postal_code, billing_country,
  shipping_full_name, shipping_phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code, shipping_country,
  notes,
}) => {
  // ✅ Calcul frais de livraison selon seuil
  const subtotalAfterDiscount = subtotal - discountAmount;
  const shippingCost          = calculateShippingCost(subtotalAfterDiscount);
  const totalPrice            = parseFloat((subtotalAfterDiscount + shippingCost).toFixed(3));

  const orderResult = await database.query(
    `INSERT INTO orders (
       user_id, status, payment_method, payment_status,
       subtotal, shipping_cost, discount_amount, total_price,
       promo_id,
       billing_full_name,   billing_phone,
       billing_address,     billing_city,
       billing_governorate, billing_postal_code, billing_country,
       shipping_full_name,   shipping_phone,
       shipping_address,     shipping_city,
       shipping_governorate, shipping_postal_code, shipping_country,
       notes
     ) VALUES (
       $1, 'en_attente', $2, 'en_attente',
       $3, $4, $5, $6,
       $7,
       $8,  $9,
       $10, $11,
       $12, $13, $14,
       $15, $16,
       $17, $18,
       $19, $20, $21,
       $22
     ) RETURNING *`,
    [
      userId,         payment_method,
      subtotal,       shippingCost,   discountAmount, totalPrice,
      promoId || null,
      billing_full_name    || null, billing_phone       || null,
      billing_address      || null, billing_city        || null,
      billing_governorate  || null, billing_postal_code || null,
      billing_country      || "CH",
      shipping_full_name,            shipping_phone       || null,
      shipping_address,              shipping_city,
      shipping_governorate || null,  shipping_postal_code || null,
      shipping_country     || "CH",
      notes || null,
    ]
  );

  return { order: orderResult.rows[0], totalPrice };
};

// ═══════════════════════════════════════════════════════════
// HELPER — Mettre à jour le profil user après commande
// ✅ Billing + Shipping sauvegardés dans users
// ✅ phone/address/city (auth) intouchables
// ✅ S'applique aussi aux guests
// ═══════════════════════════════════════════════════════════
const updateUserAfterOrder = async (userId, {
  billing_full_name,    billing_phone,
  billing_address,      billing_city,
  billing_governorate,  billing_postal_code,  billing_country,
  shipping_full_name,   shipping_phone,
  shipping_address,     shipping_city,
  shipping_governorate, shipping_postal_code, shipping_country,
}) => {
  if (!userId) return;

  await database.query(
    `UPDATE users SET
       billing_full_name    = COALESCE($1,  billing_full_name),
       billing_phone        = COALESCE($2,  billing_phone),
       billing_address      = COALESCE($3,  billing_address),
       billing_city         = COALESCE($4,  billing_city),
       billing_governorate  = COALESCE($5,  billing_governorate),
       billing_postal_code  = COALESCE($6,  billing_postal_code),
       billing_country      = COALESCE($7,  billing_country),
       shipping_full_name   = COALESCE($8,  shipping_full_name),
       shipping_phone       = COALESCE($9,  shipping_phone),
       shipping_address     = COALESCE($10, shipping_address),
       shipping_city        = COALESCE($11, shipping_city),
       shipping_governorate = COALESCE($12, shipping_governorate),
       shipping_postal_code = COALESCE($13, shipping_postal_code),
       shipping_country     = COALESCE($14, shipping_country),
       updated_at = NOW()
     WHERE id = $15`,
    [
      billing_full_name    || null, billing_phone       || null,
      billing_address      || null, billing_city        || null,
      billing_governorate  || null, billing_postal_code || null,
      billing_country      || null,
      shipping_full_name   || null, shipping_phone      || null,
      shipping_address     || null, shipping_city       || null,
      shipping_governorate || null, shipping_postal_code || null,
      shipping_country     || null,
      userId,
    ]
  );
};

// ═══════════════════════════════════════════════════════════
// HELPER — Finaliser la commande (articles + livraison + promo)
// ═══════════════════════════════════════════════════════════
const finalizeOrder = async ({ order, orderItems, promoId }) => {
  // Insérer les articles
  await insertOrderItems(order.id, orderItems);

  // Créer l'entrée livraison
  await database.query(
    "INSERT INTO deliveries (order_id, status) VALUES ($1, 'en_preparation')",
    [order.id]
  );

  // Incrémenter used_count de la promo
  if (promoId) {
    await database.query(
      "UPDATE promotions SET used_count = used_count + 1 WHERE id = $1",
      [promoId]
    );
  }

  // Export vers Odoo si activé
  await exportOrderToOdoo(order.id).catch(err =>
    console.error("Odoo export error:", err.message)
  );
};

// ═══════════════════════════════════════════════════════════
// HELPER — Créer paiement Stripe
// ✅ CHF — Card + Twint
// ═══════════════════════════════════════════════════════════
const createStripePayment = async (totalPrice, orderId, customerEmail, payment_method) => {
  // ✅ Stripe exige des centimes entiers en CHF
  const amountInCents = Math.round(totalPrice * 100);

  // ✅ Twint exige minimum 0.50 CHF
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

  const addressData = {
    billing_full_name,    billing_phone,
    billing_address,      billing_city,
    billing_governorate,  billing_postal_code,  billing_country,
    shipping_full_name,   shipping_phone,
    shipping_address,     shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
  };

  const { order, totalPrice } = await buildAndInsertOrder({
    userId, payment_method,
    subtotal, discountAmount, promoId,
    ...addressData, notes,
  });

  await finalizeOrder({ order, orderItems, promoId });

  // ✅ Mettre à jour profil user avec dernières infos billing/shipping
  await updateUserAfterOrder(userId, addressData);

  // ✅ Créer paiement Stripe
  const paymentIntent = await createStripePayment(totalPrice, order.id, userEmail, payment_method);

  await database.query(
    "UPDATE orders SET payment_id = $1 WHERE id = $2",
    [paymentIntent.id, order.id]
  );
  order.payment_id = paymentIntent.id;

  return {
    order,
    payment: {
      method:        payment_method,
      client_secret: paymentIntent.client_secret,
    },
    shipping_info: {
      shipping_cost:          parseFloat(order.shipping_cost),
      free_shipping_threshold: SHIPPING_FREE_THRESHOLD,
      is_free:                parseFloat(order.shipping_cost) === 0,
    },
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — CREATE GUEST ORDER (user non connecté)
// ✅ Crée compte automatiquement
// ✅ Envoie email pour compléter le compte
// ✅ Met à jour billing/shipping du compte créé
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
  // ✅ Créer ou récupérer le compte guest
  // createGuestAccountService ne stocke que name, email, phone (colonnes auth)
  const user = await createGuestAccountService({ name, email, phone });

  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result   = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const addressData = {
    billing_full_name,    billing_phone,
    billing_address,      billing_city,
    billing_governorate,  billing_postal_code,  billing_country,
    shipping_full_name,   shipping_phone,
    shipping_address,     shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
  };

  const { order, totalPrice } = await buildAndInsertOrder({
    userId: user.id, payment_method,
    subtotal, discountAmount, promoId,
    ...addressData, notes,
  });

  await finalizeOrder({ order, orderItems, promoId });

  // ✅ Mettre à jour profil guest avec billing/shipping
  await updateUserAfterOrder(user.id, addressData);

  // ✅ Créer paiement Stripe
  const paymentIntent = await createStripePayment(totalPrice, order.id, email, payment_method);

  await database.query(
    "UPDATE orders SET payment_id = $1 WHERE id = $2",
    [paymentIntent.id, order.id]
  );
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
// ✅ Sécurisé avec signature Stripe
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

      const updateResult = await database.query(
        `UPDATE orders
         SET payment_status = 'paye', status = 'confirmee'
         WHERE payment_id = $1
         RETURNING *`,
        [pi.id]
      );

      const order = updateResult.rows[0];
      if (!order) break;

      const userResult = await database.query(
        "SELECT email, name FROM users WHERE id = $1",
        [order.user_id]
      );
      const user = userResult.rows[0];

      if (user) {
        // ✅ Récupérer articles avec JOIN complet (plus de snapshots)
        const items     = await fetchOrderItemsWithDetails(order.id);
        const pdfBuffer = await generateInvoicePDF(order, items, user.name);
        await sendOrderConfirmationEmail(user.email, order, user.name, pdfBuffer);
        console.log(`✅ Email + PDF envoyés — commande ${order.order_number}`);
      }
       await invalidateDashboardCache();
      break;
    }

    // ── Paiement échoué ───────────────────────────────────
    case "payment_intent.payment_failed": {
      const pi = event.data.object;

      const updateResult = await database.query(
        `UPDATE orders
         SET payment_status = 'echoue', status = 'annulee',
             cancelled_reason = 'Paiement échoué'
         WHERE payment_id = $1
         RETURNING *`,
        [pi.id]
      );

      const order = updateResult.rows[0];
      if (!order) break;

      // Annuler la livraison
      await database.query(
        "UPDATE deliveries SET status = 'retourne' WHERE order_id = $1",
        [order.id]
      );

      // Restaurer le stock
      await restoreStock(order.id);

      // Email client
      const userResult = await database.query(
        "SELECT email, name FROM users WHERE id = $1",
        [order.user_id]
      );
      const user = userResult.rows[0];
      if (user) {
        await sendPaymentFailedEmail(user.email, user.name, order);
        console.log(`❌ Paiement échoué — commande ${order.order_number}`);
      }
       await invalidateDashboardCache();
      break;
    }

    // ── Remboursement ─────────────────────────────────────
    case "charge.refunded": {
      const charge = event.data.object;
      await database.query(
        "UPDATE orders SET payment_status = 'rembourse' WHERE payment_id = $1",
        [charge.payment_intent]
      );
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
  const result = await database.query(
    `SELECT
       o.id, o.order_number, o.status, o.payment_method,
       o.payment_status, o.subtotal, o.discount_amount,
       o.shipping_cost, o.total_price,
       o.shipping_address, o.shipping_city, o.created_at,
       pr.code AS promo_code,
       d.status          AS delivery_status,
       d.tracking_number,
       d.carrier,
       d.estimated_date,
       COUNT(oi.id)      AS item_count,
       COALESCE(
         json_agg(
           json_build_object(
             'id',             oi.id,
             'variant_id',     oi.variant_id,
             'product_name',   p.name_fr,
             'variant_details', (
               SELECT COALESCE(
                 json_agg(
                   json_build_object(
                     'attribute_type',  at2.name_fr,
                     'attribute_value', pva2.value_fr
                   )
                 ),
                 '[]'
               )
               FROM product_variant_attributes pva2
               JOIN attribute_types at2 ON at2.id = pva2.attribute_type_id
               WHERE pva2.variant_id = oi.variant_id
             ),
             'quantity',       oi.quantity,
             'unit_price',     oi.price_at_order,
             'product_image',  p.images->0->>'url'
           )
         ) FILTER (WHERE oi.id IS NOT NULL), '[]'
       ) AS items
     FROM orders o
     LEFT JOIN deliveries        d   ON d.order_id  = o.id
     LEFT JOIN order_items       oi  ON oi.order_id = o.id
     LEFT JOIN product_variants  pv  ON pv.id       = oi.variant_id
     LEFT JOIN products          p   ON p.id        = pv.product_id
     LEFT JOIN promotions        pr  ON pr.id       = o.promo_id
     WHERE o.user_id = $1
     GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date, pr.code
     ORDER BY o.created_at DESC`,
    [userId]
  );
 
  return result.rows;
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrderService = async ({ orderId, userId, role }) => {
  const condition = role === "admin" ? "o.id = $1" : "o.id = $1 AND o.user_id = $2";
  const values    = role === "admin" ? [orderId]   : [orderId, userId];

  const [orderResult, itemsResult] = await Promise.all([
    database.query(
      `SELECT
         o.*,
         -- Promo via JOIN
         pr.code            AS promo_code,
         pr.discount_type   AS promo_discount_type,
         pr.discount_value  AS promo_discount_value,
         d.status           AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         d.delivered_at,
         d.notes            AS delivery_notes
       FROM orders o
       LEFT JOIN deliveries d  ON d.order_id = o.id
       LEFT JOIN promotions pr ON pr.id = o.promo_id
       WHERE ${condition}`,
      values
    ),
    fetchOrderItemsWithDetails(orderId),
  ]);

  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order  = orderResult.rows[0];
  order.items  = itemsResult;
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
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status)         { conditions.push(`o.status = $${index}`);         values.push(status);         index++; }
  if (payment_status) { conditions.push(`o.payment_status = $${index}`); values.push(payment_status); index++; }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM orders o ${whereClause}`, countValues),
    database.query(
      `SELECT
         o.id, o.order_number, o.status, o.payment_method,
         o.payment_status, o.total_price, o.shipping_cost, o.created_at,
         u.name            AS customer_name,
         u.email           AS customer_email,
         pr.code           AS promo_code,
         d.status          AS delivery_status,
         d.tracking_number,
         COUNT(oi.id)      AS item_count
       FROM orders o
       LEFT JOIN users       u   ON u.id  = o.user_id
       LEFT JOIN deliveries  d   ON d.order_id = o.id
       LEFT JOIN order_items oi  ON oi.order_id = o.id
       LEFT JOIN promotions  pr  ON pr.id = o.promo_id
       ${whereClause}
       GROUP BY o.id, u.name, u.email, d.status, d.tracking_number, pr.code
       ORDER BY o.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      values
    ),
  ]);

  return {
    totalOrders: parseInt(totalResult.rows[0].count),
    totalPages:  Math.ceil(parseInt(totalResult.rows[0].count) / limit),
    page,
    orders:      result.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — UPDATE ORDER STATUS (admin)
// ✅ Email automatique au client à chaque changement
// ═══════════════════════════════════════════════════════════
export const updateOrderStatusService = async ({ orderId, status }) => {
  const validStatuses = [
    "en_attente", "confirmee", "en_preparation",
    "expediee", "livree", "annulee", "remboursee",
  ];
 
  if (!validStatuses.includes(status))
    throw new ErrorHandler(
      `Statut invalide. Valeurs acceptées : ${validStatuses.join(", ")}`, 400
    );
 
  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id = $1", [orderId]
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);
 
  const order = orderResult.rows[0];
 
  if (status === "annulee") {
    throw new ErrorHandler(
      "Pour annuler, utilisez la route PATCH /cancel qui requiert une raison d'annulation.",
      400
    );
  }
 
  // Mettre à jour le statut
  await database.query(
    "UPDATE orders SET status = $1 WHERE id = $2",
    [status, orderId]
  );
  await invalidateDashboardCache();
  order.status = status;
 
  // Sync automatique livraison
  const deliveryMap = {
    expediee: "UPDATE deliveries SET status = 'expedie', shipped_at = NOW() WHERE order_id = $1",
    livree:   "UPDATE deliveries SET status = 'livre',   delivered_at = NOW() WHERE order_id = $1",
  };
 
  if (deliveryMap[status]) {
    await database.query(deliveryMap[status], [orderId]);
  }
 
  // ✅ Récupérer tracking + carrier pour l'email si expédiée
  if (status === "expediee") {
    const deliveryResult = await database.query(
      "SELECT tracking_number, carrier, estimated_date FROM deliveries WHERE order_id = $1",
      [orderId]
    );
    if (deliveryResult.rows.length > 0) {
      order.tracking_number = deliveryResult.rows[0].tracking_number;
      order.carrier         = deliveryResult.rows[0].carrier;
      order.estimated_date  = deliveryResult.rows[0].estimated_date;
    }
  }
 
  // ✅ Envoyer l'email au client
  const userResult = await database.query(
    "SELECT name, email FROM users WHERE id = $1",
    [order.user_id]
  );
  const user = userResult.rows[0];
 
  if (user) {
    await sendOrderStatusEmail(order, user.name, user.email);
  }
 
  return { message: `Statut mis à jour : ${status}` };
};
// ═══════════════════════════════════════════════════════════
// SERVICE — CANCEL ORDER (admin uniquement)
// ✅ Restaure le stock
// ✅ Rembourse via Stripe si paiement effectué
// ═══════════════════════════════════════════════════════════
export const cancelOrderService = async ({ orderId, reason }) => {
  if (!reason || reason.trim() === "")
    throw new ErrorHandler("Une raison d'annulation est obligatoire.", 400);

  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id = $1", [orderId]
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];

  if (order.status === "annulee")
    throw new ErrorHandler("Cette commande est déjà annulée.", 400);

  if (order.status === "livree")
    throw new ErrorHandler("Impossible d'annuler une commande déjà livrée.", 400);

  // ✅ Restaurer le stock
  await restoreStock(orderId);

  // ✅ Rembourser via Stripe si déjà payé
  if (order.payment_status === "paye" && order.payment_id) {
    await stripe.refunds.create({ payment_intent: order.payment_id });
  }

  await Promise.all([
    database.query(
      "UPDATE orders SET status = 'annulee', cancelled_reason = $1 WHERE id = $2",
      [reason.trim(), orderId]
    ),
    database.query(
      "UPDATE deliveries SET status = 'retourne' WHERE order_id = $1",
      [orderId]
    ),
  ]);

  // Email client
  const userResult = await database.query(
    "SELECT email, name FROM users WHERE id = $1", [order.user_id]
  );
  const user = userResult.rows[0];

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
  }
await invalidateDashboardCache(); // ✅ ajout ici

  return { message: "Commande annulée avec succès." };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — UPDATE DELIVERY (admin)
// ✅ Carrier, tracking, estimated_date, status, notes
// ═══════════════════════════════════════════════════════════
export const updateDeliveryService = async ({
  orderId, carrier, tracking_number, estimated_date, status, notes,
}) => {
  const delivery = await database.query(
    "SELECT * FROM deliveries WHERE order_id = $1", [orderId]
  );
  if (delivery.rows.length === 0)
    throw new ErrorHandler("Livraison introuvable.", 404);

  const current = delivery.rows[0];

  const result = await database.query(
    `UPDATE deliveries
     SET carrier         = $1,
         tracking_number = $2,
         estimated_date  = $3,
         status          = $4,
         notes           = $5
     WHERE order_id = $6
     RETURNING *`,
    [
      carrier         ?? current.carrier,
      tracking_number ?? current.tracking_number,
      estimated_date  ?? current.estimated_date,
      status          ?? current.status,
      notes           ?? current.notes,
      orderId,
    ]
  );

  // ✅ Sync order status + email si livraison confirmée
  if (status === "livre") {
    const orderResult = await database.query(
      "UPDATE orders SET status = 'livree' WHERE id = $1 RETURNING *",
      [orderId]
    );
    const order = orderResult.rows[0];
     await invalidateDashboardCache();

    // ✅ Email notification au client
    if (order) {
      const userResult = await database.query(
        "SELECT name, email FROM users WHERE id = $1",
        [order.user_id]
      );
      const user = userResult.rows[0];
      if (user) {
        await sendOrderStatusEmail(order, user.name, user.email);
      }
    }
  }

  return result.rows[0];
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
  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id = $1", [orderId]
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const current = orderResult.rows[0];

  const result = await database.query(
    `UPDATE orders
     SET shipping_full_name   = $1,
         shipping_phone       = $2,
         shipping_address     = $3,
         shipping_city        = $4,
         shipping_governorate = $5,
         shipping_postal_code = $6,
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      shipping_full_name   ?? current.shipping_full_name,
      shipping_phone       ?? current.shipping_phone,
      shipping_address     ?? current.shipping_address,
      shipping_city        ?? current.shipping_city,
      shipping_governorate ?? current.shipping_governorate,
      shipping_postal_code ?? current.shipping_postal_code,
      orderId,
    ]
  );

  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// SERVICE — VALIDATE PROMO CODE (sans créer de commande)
// ✅ Retourne le montant de réduction et les infos frais de livraison
// ═══════════════════════════════════════════════════════════
export const validatePromoService = async ({ code, subtotal }) => {
  if (!code || !subtotal)
    throw new ErrorHandler("Code et sous-total requis.", 400);

  const promo = await database.query(
    `SELECT * FROM promotions
     WHERE UPPER(code) = UPPER($1)
       AND is_active   = true
       AND starts_at  <= NOW()
       AND expires_at >= NOW()
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );

  if (promo.rows.length === 0)
    throw new ErrorHandler("Code promo invalide ou expiré.", 400);

  const p = promo.rows[0];

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
    valid:                   true,
    promoCode:               p.code.toUpperCase(),
    discountType:            p.discount_type,
    discountValue:           parseFloat(p.discount_value),
    discountAmount,
    originalAmount:          parseFloat(subtotal.toFixed(2)),
    subtotalAfterDiscount,
    shippingCost,
    totalAmount:             parseFloat((subtotalAfterDiscount + shippingCost).toFixed(2)),
    freeShippingThreshold:   SHIPPING_FREE_THRESHOLD,
    label: p.discount_type === "percent"
      ? `-${p.discount_value}%`
      : `-${p.discount_value} CHF`,
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET SHIPPING COST INFO (utilisé par le frontend)
// ✅ Permet d'afficher les frais de livraison en temps réel
// ═══════════════════════════════════════════════════════════
export const getShippingCostService = (subtotal) => {
  const shippingCost         = calculateShippingCost(subtotal);
  const remainingForFree     = Math.max(0, SHIPPING_FREE_THRESHOLD - subtotal);

  return {
    shipping_cost:             shippingCost,
    free_shipping_threshold:   SHIPPING_FREE_THRESHOLD,
    is_free:                   shippingCost === 0,
    remaining_for_free:        parseFloat(remainingForFree.toFixed(2)),
  };
};

// ═══════════════════════════════════════════════════════════
// SERVICE — GET LOW STOCK PRODUCTS (admin dashboard)
// ═══════════════════════════════════════════════════════════
export const getLowStockProductsService = async () => {
  const result = await database.query(
    `SELECT
       p.id, p.name_fr, p.slug,
       pv.id    AS variant_id,
       pv.sku,
       pv.stock,
       pv.low_stock_threshold
     FROM product_variants pv
     LEFT JOIN products p ON p.id = pv.product_id
     WHERE pv.stock  <= pv.low_stock_threshold
       AND p.is_active  = true
       AND pv.is_active = true
     ORDER BY pv.stock ASC
     LIMIT 20`
  );

  return result.rows;
};