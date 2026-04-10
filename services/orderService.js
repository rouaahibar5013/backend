import Stripe from "stripe";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import sendEmail from "../utils/sendEmail.js";
import { createGuestAccountService } from "./authService.js";
import { exportOrderToOdoo } from "./odooService.js";
import PDFDocument from "pdfkit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ═══════════════════════════════════════════════════════════
// HELPER — Email confirmation commande
// ═══════════════════════════════════════════════════════════// ═══════════════════════════════════════════════════════════
// HELPER — Email confirmation commande + PDF facture joint
// ═══════════════════════════════════════════════════════════
const sendOrderConfirmationEmail = async (toEmail, order, customerName, pdfBuffer = null) => {
  const attachments = pdfBuffer
    ? [{
        filename: `facture-goffa-${order.order_number}.pdf`,
        content:  pdfBuffer,
        contentType: "application/pdf", // ✅ type MIME explicite,
      }]
    : [];

  await sendEmail({
    to:          toEmail,
    subject:     `✅ Commande #${order.order_number} confirmée — GOFFA 🧺`,
    attachments,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #166534; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🧺 GOFFA</h1>
          <p style="color: #86efac; margin: 5px 0 0;">artisanat tunisien</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #166534;">✅ Commande confirmée !</h2>
          <p>Bonjour ${customerName},</p>
          <p>Merci pour votre commande. Voici le récapitulatif :</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
            <p><strong>N° de commande :</strong> #${order.order_number}</p>
            <p><strong>Livraison à :</strong> ${order.shipping_full_name}, ${order.shipping_address}, ${order.shipping_city}</p>
            <p><strong>Mode de paiement :</strong> ${
              order.payment_method === "cod"    ? "💵 Paiement à la livraison" :
              order.payment_method === "stripe" ? "💳 Carte bancaire / Twint"  : order.payment_method
            }</p>
            ${order.discount_amount > 0 ? `<p><strong>Réduction :</strong> -${order.discount_amount} DT</p>` : ""}
            <p style="font-size: 20px; color: #166534;"><strong>Total : ${order.total_price} DT</strong></p>
          </div>
          ${pdfBuffer ? `<p style="color:#4b5563; font-size:13px;">📎 Votre <strong>facture PDF</strong> est jointe à cet email.</p>` : ""}
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
// HELPER — Générer la facture PDF en mémoire
// ═══════════════════════════════════════════════════════════
const generateInvoicePDF = (order, orderItems, customerName) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // marges gauche + droite

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
      .text("Artisanat tunisien", 50, 80)
      .text("Email : contact@goffa.tn", 50, 95)
      .text("Site : www.goffa.tn", 50, 110);

    // Bloc FACTURE à droite
    doc
      .fillColor("#166534")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("FACTURE", 350, 50, { align: "right", width: 200 });

    doc
      .fontSize(10)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`N° commande : #${order.order_number}`, 350, 80, { align: "right", width: 200 })
      .text(`Date : ${new Date(order.created_at).toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric"
      })}`, 350, 95, { align: "right", width: 200 })
      .text(`Statut paiement : ${
        order.payment_status === "paid"    ? "Payé" :
        order.payment_status === "pending" ? "En attente" : order.payment_status
      }`, 350, 110, { align: "right", width: 200 });

    // Ligne séparatrice
    doc
      .moveTo(50, 135)
      .lineTo(545, 135)
      .strokeColor("#166534")
      .lineWidth(2)
      .stroke();

    // ── Infos client + livraison ──────────────────────────
    doc
      .fillColor("#166534")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Informations client", 50, 155);

    doc
      .fontSize(10)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Nom : ${customerName}`, 50, 173)
      .text(`Adresse : ${order.shipping_address}`, 50, 188)
      .text(`Ville : ${order.shipping_city}`, 50, 203)
      .text(`Gouvernorat : ${order.shipping_governorate || "—"}`, 50, 218)
      .text(`Code postal : ${order.shipping_postal_code || "—"}`, 50, 233)
      .text(`Pays : ${order.shipping_country || "TN"}`, 50, 248)
      .text(`Téléphone : ${order.shipping_phone || "—"}`, 50, 263);

    doc
      .fillColor("#166534")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Mode de paiement", 300, 155);

    doc
      .fontSize(10)
      .fillColor("#374151")
      .font("Helvetica")
      .text(
        order.payment_method === "cod"
          ? "Paiement à la livraison (COD)"
          : "Carte bancaire / Twint (Stripe)",
        300, 173
      );

    // ── Tableau des articles ──────────────────────────────
    const tableTop = 295;

    // En-tête tableau
    doc
      .fillColor("#166534")
      .rect(50, tableTop, pageWidth, 24)
      .fill();

    doc
      .fillColor("#ffffff")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Produit",       60,  tableTop + 7)
      .text("Détails",      230,  tableTop + 7)
      .text("Qté",          370,  tableTop + 7, { width: 40, align: "center" })
      .text("Prix unit.",   415,  tableTop + 7, { width: 70, align: "right" })
      .text("Total",        490,  tableTop + 7, { width: 55, align: "right" });

    // Lignes articles
    let y = tableTop + 30;
    let rowIndex = 0;

    for (const item of orderItems) {
      const rowHeight = 28;
      const lineTotal = (parseFloat(item.price_at_order) * item.quantity).toFixed(2);

      // Fond alterné
      if (rowIndex % 2 === 0) {
        doc.fillColor("#f0fdf4").rect(50, y - 4, pageWidth, rowHeight).fill();
      }

      // Attributs (couleur, taille…)
      let details = "—";
      if (item.variant_details) {
        try {
          const attrs = typeof item.variant_details === "string"
            ? JSON.parse(item.variant_details)
            : item.variant_details;
          if (Array.isArray(attrs) && attrs.length > 0) {
            details = attrs.map((a) => `${a.attribute_type}: ${a.attribute_value}`).join(", ");
          }
        } catch {}
      }

      doc
        .fillColor("#111827")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(item.product_name_fr || "—", 60, y, { width: 165, ellipsis: true });

      doc
        .font("Helvetica")
        .fillColor("#4b5563")
        .text(details, 230, y, { width: 135, ellipsis: true })
        .fillColor("#111827")
        .text(String(item.quantity), 370, y, { width: 40, align: "center" })
        .text(`${parseFloat(item.price_at_order).toFixed(2)} DT`, 415, y, { width: 70, align: "right" })
        .font("Helvetica-Bold")
        .text(`${lineTotal} DT`, 490, y, { width: 55, align: "right" });

      y += rowHeight;
      rowIndex++;
    }

    // Ligne de fin tableau
    doc
      .moveTo(50, y + 2)
      .lineTo(545, y + 2)
      .strokeColor("#166534")
      .lineWidth(0.5)
      .stroke();

    // ── Totaux ───────────────────────────────────────────
    y += 16;

    const totalsX = 350;
    const totalsWidth = 195;

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#374151")
      .text("Sous-total :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(`${parseFloat(order.subtotal).toFixed(2)} DT`, totalsX, y, { width: totalsWidth, align: "right" });

    y += 18;

    if (parseFloat(order.discount_amount) > 0) {
      doc
        .fillColor("#dc2626")
        .text(`Réduction :`, totalsX, y, { width: totalsWidth, align: "left" })
        .text(`-${parseFloat(order.discount_amount).toFixed(2)} DT`, totalsX, y, { width: totalsWidth, align: "right" });
      y += 18;
    }

    doc
      .fillColor("#374151")
      .text("Frais de livraison :", totalsX, y, { width: totalsWidth, align: "left" })
      .text("Gratuit", totalsX, y, { width: totalsWidth, align: "right" });

    y += 14;

    // Ligne séparatrice totaux
    doc
      .moveTo(totalsX, y)
      .lineTo(545, y)
      .strokeColor("#166534")
      .lineWidth(1)
      .stroke();

    y += 10;

    // Total final
    doc
      .fillColor("#166534")
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("TOTAL :", totalsX, y, { width: totalsWidth, align: "left" })
      .text(`${parseFloat(order.total_price).toFixed(2)} DT`, totalsX, y, { width: totalsWidth, align: "right" });

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
        "GOFFA — Artisanat tunisien authentique",
        50, 775, { align: "center", width: pageWidth }
      );

    doc.end();
  });
};


// ═══════════════════════════════════════════════════════════
// HELPER — Alerte stock faible/rupture pour admin
// ═══════════════════════════════════════════════════════════
const sendStockAlertEmail = async (productName, sku, stock) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const isOutOfStock = stock === 0;

  await sendEmail({
    to:      adminEmail,
    subject: `${isOutOfStock ? '🔴 RUPTURE' : '🟡 Stock faible'} — ${productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${isOutOfStock ? '#dc2626' : '#f59e0b'}; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">
            ${isOutOfStock ? '🔴 Rupture de stock' : '🟡 Stock faible'}
          </h2>
        </div>
        <div style="padding: 20px; background: #fef2f2; border-radius: 0 0 8px 8px;">
          <p><strong>Produit :</strong> ${productName}</p>
          <p><strong>SKU :</strong> ${sku || 'N/A'}</p>
          <p><strong>Stock restant :</strong>
            <span style="color: ${isOutOfStock ? '#dc2626' : '#f59e0b'}; font-weight: bold; font-size: 18px;">
              ${isOutOfStock ? 'RUPTURE DE STOCK' : `${stock} unités`}
            </span>
          </p>
          <p>Veuillez réapprovisionner ce produit dès que possible.</p>
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
// HELPER — Calcul des articles de la commande
// ═══════════════════════════════════════════════════════════
const calculateOrderItems = async (items) => {
  let subtotal   = 0;
  const orderItems = [];

  for (const item of items) {
    const { variant_id, quantity } = item;

    if (!variant_id || !quantity || quantity < 1)
      throw new ErrorHandler("Chaque article doit avoir un variant_id et une quantité valide.", 400);

    const variantResult = await database.query(
      `SELECT
         pv.*,
         p.name_fr AS product_name_fr,
         p.name_ar AS product_name_ar,
         COALESCE(
           json_agg(
             json_build_object(
               'attribute_type',  at.name_fr,
               'attribute_value', av.value_fr
             )
           ) FILTER (WHERE at.id IS NOT NULL), '[]'
         ) AS attributes
       FROM product_variants pv
       LEFT JOIN products p ON p.id = pv.product_id
       LEFT JOIN product_variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN attribute_values   av ON av.id  = va.attribute_value_id
       LEFT JOIN attribute_types    at ON at.id  = av.attribute_type_id
       WHERE pv.id = $1
       GROUP BY pv.id, p.name_fr, p.name_ar`,
      [variant_id]
    );

    if (variantResult.rows.length === 0)
      throw new ErrorHandler(`Variante ${variant_id} introuvable.`, 404);

    const variant = variantResult.rows[0];

    subtotal += parseFloat(variant.price) * quantity;

    orderItems.push({
      variant_id,
      quantity,
      price_at_order:  variant.price,
      product_name_fr: variant.product_name_fr,
      product_name_ar: variant.product_name_ar,
      variant_details: variant.attributes,
      sku:             variant.sku || null,
      // Pour l'alerte stock
      _low_stock_threshold: variant.low_stock_threshold || 5,
    });
  }

  return { subtotal, orderItems };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Appliquer code promo
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
      `Montant minimum requis : ${p.min_order_amount} DT pour ce code promo.`, 400
    );

  let discountAmount = 0;
  if (p.discount_type === 'percentage') {
    discountAmount = (subtotal * parseFloat(p.discount_value)) / 100;
  } else {
    // fixed
    discountAmount = Math.min(parseFloat(p.discount_value), subtotal);
  }

  return { discountAmount, promoId: p.id };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Insérer les articles + gérer le stock
// ✅ Commande passe même en rupture de stock
// ✅ Alerte email admin si stock faible/rupture
// ═══════════════════════════════════════════════════════════
const insertOrderItems = async (orderId, orderItems) => {
  // Vérifier si stock géré par Odoo ou backend
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || 'backend';

  for (const item of orderItems) {
    // Insérer l'article
    await database.query(
      `INSERT INTO order_items
        (order_id, variant_id, product_name_fr, product_name_ar,
         variant_details, sku, quantity, price_at_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        orderId,
        item.variant_id,
        item.product_name_fr,
        item.product_name_ar  || null,
        JSON.stringify(item.variant_details),
        item.sku              || null,
        item.quantity,
        item.price_at_order,
      ]
    );

    // ✅ Réduire stock si géré par backend (jamais négatif)
    if (stockManagedBy === 'backend') {
      await database.query(
        "UPDATE product_variants SET stock = GREATEST(stock - $1, 0) WHERE id=$2",
        [item.quantity, item.variant_id]
      );

      // ✅ Vérifier le stock après réduction
      const updatedVariant = await database.query(
        "SELECT stock, low_stock_threshold, sku FROM product_variants WHERE id=$1",
        [item.variant_id]
      );

      const v = updatedVariant.rows[0];
      if (v && v.stock <= (v.low_stock_threshold || 5)) {
        // ✅ Envoyer alerte email admin
        await sendStockAlertEmail(item.product_name_fr, v.sku, v.stock);
      }
    }
  }
};


// ═══════════════════════════════════════════════════════════
// HELPER — Créer paiement Stripe
// ✅ CHF pour Twint + cartes bancaires
// ═══════════════════════════════════════════════════════════
const createStripePayment = async (totalPrice, orderId, customerEmail) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount:               Math.round(totalPrice * 100), // centimes
    currency:             "chf",                        // ✅ Franc Suisse = Twint
    metadata:             { order_id: orderId },
    receipt_email:        customerEmail,
    payment_method_types: ["card", "twint"],             // ✅ Twint inclus
  });

  return paymentIntent;
};


// ═══════════════════════════════════════════════════════════
// HELPER — Construire et insérer la commande en DB
// ═══════════════════════════════════════════════════════════
const buildAndInsertOrder = async ({
  userId, payment_method,
  subtotal, discountAmount, promoCode, promoId,
  shipping_full_name, shipping_phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, notes,
}) => {
  const shippingCost = 0; // Livraison gratuite pour l'instant
  const totalPrice   = subtotal - discountAmount + shippingCost;

  const orderResult = await database.query(
    `INSERT INTO orders (
       user_id, status, payment_method, payment_status,
       subtotal, shipping_cost, discount_amount, total_price,
       promo_code, promo_id,
       shipping_full_name, shipping_phone,
       shipping_address, shipping_city,
       shipping_governorate, shipping_postal_code,
       shipping_country, notes
     ) VALUES ($1,'pending',$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      userId, payment_method,
      subtotal, shippingCost, discountAmount, totalPrice,
      promoCode || null, promoId || null,
      shipping_full_name, shipping_phone || null,
      shipping_address, shipping_city,
      shipping_governorate || null, shipping_postal_code || null,
      shipping_country || 'TN', notes || null,
    ]
  );

  return { order: orderResult.rows[0], totalPrice };
};


// ═══════════════════════════════════════════════════════════
// HELPER — Finaliser la commande après insertion
// ═══════════════════════════════════════════════════════════
const finalizeOrder = async ({ order, orderItems, promoId, customerEmail, customerName }) => {
  // Insérer les articles
  await insertOrderItems(order.id, orderItems);

  // Créer la livraison
  await database.query(
    "INSERT INTO deliveries (order_id, status) VALUES ($1, 'preparing')",
    [order.id]
  );

  // Incrémenter used_count du promo
  if (promoId) {
    await database.query(
      "UPDATE promotions SET used_count = used_count + 1 WHERE id=$1",
      [promoId]
    );
  }

if (order.payment_method === 'cod') {// On génère le PDF ici pour le paiement à la livraison
    const pdfBuffer = await generateInvoicePDF(order, orderItems, customerName);
    // BIEN PASSER pdfBuffer en 4ème argument ici :
    await sendOrderConfirmationEmail(customerEmail, order, customerName, pdfBuffer);
  }
  // Export vers Odoo si activé
  await exportOrderToOdoo(order.id).catch(err =>
    console.error("Odoo export error:", err.message)
  );
};


// ═══════════════════════════════════════════════════════════
// CREATE ORDER (user connecté)
// ═══════════════════════════════════════════════════════════
export const createOrderService = async ({
  userId, userEmail, userName,
  items, payment_method,
  shipping_full_name, shipping_phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, promo_code, notes,
}) => {
  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const { order, totalPrice } = await buildAndInsertOrder({
    userId, payment_method,
    subtotal, discountAmount, promoCode: promo_code, promoId,
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, notes,
  });

  await finalizeOrder({
    order, orderItems, promoId,
    customerEmail: userEmail,
    customerName:  userName,
  });

  // Paiement Stripe
  if (payment_method === 'stripe') {
    const paymentIntent = await createStripePayment(totalPrice, order.id, userEmail);
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );
    // 2. On met à jour l'objet JS (La mémoire vive pour la réponse JSON)
    order.payment_id = paymentIntent.id;
    return {
      order,
      payment: {
        method:        'stripe',
        client_secret: paymentIntent.client_secret,
      },
    };
  }

  return { order, payment: { method: 'cod' } };
};


// ═══════════════════════════════════════════════════════════
// CREATE GUEST ORDER (user non connecté)
// ✅ Crée compte automatiquement
// ✅ Envoie email pour compléter le compte
// ═══════════════════════════════════════════════════════════
export const createGuestOrderService = async ({
  items, payment_method,
  name, email, phone,
  shipping_address, shipping_city,
  shipping_governorate, shipping_postal_code,
  shipping_country, promo_code, notes,
}) => {
  // ✅ Créer ou récupérer le compte guest
  const user = await createGuestAccountService({
    name, email, phone,
    shipping_address, shipping_city,
  });

  const { subtotal, orderItems } = await calculateOrderItems(items);

  let discountAmount = 0;
  let promoId        = null;

  if (promo_code) {
    const result = await applyPromoCode(promo_code, subtotal);
    discountAmount = result.discountAmount;
    promoId        = result.promoId;
  }

  const { order, totalPrice } = await buildAndInsertOrder({
    userId: user.id, payment_method,
    subtotal, discountAmount, promoCode: promo_code, promoId,
    shipping_full_name: name, shipping_phone: phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code,
    shipping_country, notes,
  });

  await finalizeOrder({
    order, orderItems, promoId,
    customerEmail: email,
    customerName:  name,
  });

  // Paiement Stripe
  if (payment_method === 'stripe') {
    const paymentIntent = await createStripePayment(totalPrice, order.id, email);
    await database.query(
      "UPDATE orders SET payment_id=$1 WHERE id=$2",
      [paymentIntent.id, order.id]
    );
    order.is_guest = true;
    return {
      order,
      payment: {
        method:        'stripe',
        client_secret: paymentIntent.client_secret,
      },
    };
  }
  order.is_guest = true;
  return { order, payment: { method: 'cod' } };
};


// ═══════════════════════════════════════════════════════════
// CONFIRM STRIPE PAYMENT (via webhook)
// ═══════════════════════════════════════════════════════════
export const confirmStripePaymentService = async ({ orderId, userId, role }) => {
  const condition = role === 'admin' ? "id=$1" : "id=$1 AND user_id=$2";
  const values    = role === 'admin' ? [orderId] : [orderId, userId];

  const orderResult = await database.query(
    `SELECT * FROM orders WHERE ${condition}`, values
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];

  const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_id);
  if (paymentIntent.status !== 'succeeded')
    throw new ErrorHandler("Paiement non complété.", 400);

  await database.query(
    "UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=$1",
    [orderId]
  );

  return { message: "Paiement confirmé. Commande en cours de traitement." };
};


// ═══════════════════════════════════════════════════════════
// STRIPE WEBHOOK HANDLER
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
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
 // 1. Mettre à jour le statut en base de données
      const updateResult = await database.query(
        `UPDATE orders 
         SET payment_status='paid', status='confirmed' 
         WHERE payment_id=$1 
         RETURNING *`,
        [paymentIntent.id]
      );

      const order = updateResult.rows[0];

      if (order) {
        // 2. RÉCUPÉRER L'EMAIL DU CLIENT (via la table users car les orders n'ont pas toujours l'email direct)
        const userResult = await database.query("SELECT email, name FROM users WHERE id=$1", [order.user_id]);
        const user = userResult.rows[0];

        // 3. ENVOYER L'EMAIL SEULEMENT MAINTENANT
        if (user) {
         // ✅ Récupérer les articles pour le PDF
      const itemsResult = await database.query(
        "SELECT * FROM order_items WHERE order_id=$1",
        [order.id]
      );

      // ✅ Générer le PDF et envoyer l'email avec la facture
      const pdfBuffer = await generateInvoicePDF(order, itemsResult.rows, user.name);
      await sendOrderConfirmationEmail(user.email, order, user.name, pdfBuffer);

      console.log(`✅ Email + facture PDF envoyés pour commande ${order.order_number}`);
    }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      await database.query(
        "UPDATE orders SET payment_status='failed' WHERE payment_id=$1",
        [paymentIntent.id]
      );
      console.log(`❌ Stripe payment failed: ${paymentIntent.id}`);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      await database.query(
        "UPDATE orders SET payment_status='refunded' WHERE payment_id=$1",
        [charge.payment_intent]
      );
      break;
    }

    default:
      console.log(`Webhook event non géré : ${event.type}`);
  }

  return { received: true };
};


// ═══════════════════════════════════════════════════════════
// GET MY ORDERS
// ═══════════════════════════════════════════════════════════
export const getMyOrdersService = async (userId) => {
  const result = await database.query(
    `SELECT
       o.id, o.order_number, o.status, o.payment_method,
       o.payment_status, o.subtotal, o.discount_amount,
       o.total_price, o.shipping_city, o.created_at,
       d.status          AS delivery_status,
       d.tracking_number,
       d.carrier,
       d.estimated_date,
       COUNT(oi.id)      AS item_count
     FROM orders o
     LEFT JOIN deliveries  d  ON d.order_id  = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id, d.status, d.tracking_number, d.carrier, d.estimated_date
     ORDER BY o.created_at DESC`,
    [userId]
  );

  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════
export const getSingleOrderService = async ({ orderId, userId, role }) => {
  const condition = role === 'admin' ? "o.id=$1" : "o.id=$1 AND o.user_id=$2";
  const values    = role === 'admin' ? [orderId] : [orderId, userId];

  const [orderResult, itemsResult] = await Promise.all([
    database.query(
      `SELECT
         o.*,
         d.status          AS delivery_status,
         d.tracking_number,
         d.carrier,
         d.estimated_date,
         d.delivered_at,
         d.notes           AS delivery_notes
       FROM orders o
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE ${condition}`,
      values
    ),
    database.query(
      "SELECT * FROM order_items WHERE order_id=$1", [orderId]
    ),
  ]);

  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];
  order.items = itemsResult.rows;

  return order;
};


// ═══════════════════════════════════════════════════════════
// CANCEL ORDER
// ═══════════════════════════════════════════════════════════
export const cancelOrderService = async ({ orderId, userId, reason }) => {
  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, userId]
  );
  if (orderResult.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  const order = orderResult.rows[0];

  if (!['pending', 'confirmed'].includes(order.status))
    throw new ErrorHandler(
      `Impossible d'annuler une commande avec le statut '${order.status}'.`, 400
    );

  // Vérifier si stock géré par backend
  const settings = await database.query(
    "SELECT stock_managed_by FROM odoo_settings LIMIT 1"
  );
  const stockManagedBy = settings.rows[0]?.stock_managed_by || 'backend';

  // Restaurer le stock
  if (stockManagedBy === 'backend') {
    const items = await database.query(
      "SELECT * FROM order_items WHERE order_id=$1", [orderId]
    );
    await Promise.all(
      items.rows
        .filter(item => item.variant_id)
        .map(item =>
          database.query(
            "UPDATE product_variants SET stock = stock + $1 WHERE id=$2",
            [item.quantity, item.variant_id]
          )
        )
    );
  }

  // Rembourser Stripe si payé
  if (order.payment_status === 'paid' && order.payment_method === 'stripe' && order.payment_id) {
    await stripe.refunds.create({ payment_intent: order.payment_id });
  }

  // Mettre à jour statuts
  await Promise.all([
    database.query(
      "UPDATE orders SET status='cancelled', cancelled_reason=$1 WHERE id=$2",
      [reason || null, orderId]
    ),
    database.query(
      "UPDATE deliveries SET status='returned' WHERE order_id=$1", [orderId]
    ),
  ]);
};


// ═══════════════════════════════════════════════════════════
// GET ALL ORDERS (admin)
// ═══════════════════════════════════════════════════════════
export const getAllOrdersService = async ({ status, payment_status, page = 1 }) => {
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (status)         { conditions.push(`o.status=$${index}`);         values.push(status);         index++; }
  if (payment_status) { conditions.push(`o.payment_status=$${index}`); values.push(payment_status); index++; }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);

  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM orders o ${whereClause}`, countValues),
    database.query(
      `SELECT
         o.id, o.order_number, o.status, o.payment_method,
         o.payment_status, o.total_price, o.created_at,
         u.name  AS customer_name,
         u.email AS customer_email,
         d.status          AS delivery_status,
         d.tracking_number,
         COUNT(oi.id)      AS item_count
       FROM orders o
       LEFT JOIN users       u  ON u.id  = o.user_id
       LEFT JOIN deliveries  d  ON d.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${whereClause}
       GROUP BY o.id, u.name, u.email, d.status, d.tracking_number
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
// UPDATE ORDER STATUS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOrderStatusService = async ({ orderId, status }) => {
  const validStatuses = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
  if (!validStatuses.includes(status))
    throw new ErrorHandler(`Statut invalide. Doit être : ${validStatuses.join(', ')}`, 400);

  const order = await database.query("SELECT * FROM orders WHERE id=$1", [orderId]);
  if (order.rows.length === 0)
    throw new ErrorHandler("Commande introuvable.", 404);

  await database.query("UPDATE orders SET status=$1 WHERE id=$2", [status, orderId]);

  // Sync livraison automatiquement
  const deliveryStatusMap = {
    shipped:   "UPDATE deliveries SET status='shipped' WHERE order_id=$1",
    delivered: "UPDATE deliveries SET status='delivered', delivered_at=NOW() WHERE order_id=$1",
    cancelled: "UPDATE deliveries SET status='returned' WHERE order_id=$1",
  };

  if (deliveryStatusMap[status]) {
    await database.query(deliveryStatusMap[status], [orderId]);
  }

  return { message: `Statut mis à jour : ${status}` };
};


// ═══════════════════════════════════════════════════════════
// UPDATE DELIVERY (admin)
// ═══════════════════════════════════════════════════════════
export const updateDeliveryService = async ({
  orderId, carrier, tracking_number, estimated_date, status, notes
}) => {
  const delivery = await database.query(
    "SELECT * FROM deliveries WHERE order_id=$1", [orderId]
  );
  if (delivery.rows.length === 0)
    throw new ErrorHandler("Livraison introuvable.", 404);

  const current = delivery.rows[0];

  const result = await database.query(
    `UPDATE deliveries
     SET carrier=$1, tracking_number=$2, estimated_date=$3, status=$4, notes=$5
     WHERE order_id=$6 RETURNING *`,
    [
      carrier         || current.carrier,
      tracking_number || current.tracking_number,
      estimated_date  || current.estimated_date,
      status          || current.status,
      notes           || current.notes,
      orderId,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// GET LOW STOCK PRODUCTS (admin dashboard)
// ✅ Pour afficher dans le dashboard admin
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
     WHERE pv.stock <= pv.low_stock_threshold
     AND   p.is_active = true
     AND   pv.is_active = true
     ORDER BY pv.stock ASC
     LIMIT 20`
  );

  return result.rows;
};




// ═══════════════════════════════════════════════════════════
// ADMIN UPDATE ORDER SHIPPING INFO
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// ADMIN UPDATE ORDER SHIPPING (FULL)
// ═══════════════════════════════════════════════════════════
export const adminUpdateOrderShippingService = async ({
  orderId,
  shipping_full_name,
  shipping_phone,
  shipping_address,
  shipping_city,
  shipping_governorate,
  shipping_postal_code,
}) => {
  const orderResult = await database.query(
    "SELECT * FROM orders WHERE id=$1",
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new ErrorHandler("Commande introuvable.", 404);
  }

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
// VALIDATE PROMO CODE (sans créer de commande)
// Utilisé par le frontend pour afficher la réduction en temps réel
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
      `Montant minimum requis : ${p.min_order_amount} DT pour ce code.`, 400
    );

  let discountAmount = 0;
  if (p.discount_type === 'percent') {
    discountAmount = (subtotal * parseFloat(p.discount_value)) / 100;
  } else {
    discountAmount = Math.min(parseFloat(p.discount_value), subtotal);
  }

  discountAmount = parseFloat(discountAmount.toFixed(2));

  return {
    valid:          true,
    promoCode:      p.code.toUpperCase(),
    discountType:   p.discount_type,
    discountValue:  parseFloat(p.discount_value),
    discountAmount,
    originalAmount: parseFloat(subtotal.toFixed(2)),
    finalAmount:    parseFloat((subtotal - discountAmount).toFixed(2)),
    label: p.discount_type === 'percent'
      ? `-${p.discount_value}%`
      : `-${p.discount_value} DT`,
  };
};