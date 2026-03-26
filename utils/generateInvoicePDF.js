import PDFDocument from "pdfkit";

// ═══════════════════════════════════════════════════════════
// GENERATE INVOICE PDF
// Retourne un Buffer du PDF prêt à être attaché à l'email
// ═══════════════════════════════════════════════════════════
export const generateInvoicePDF = (order, items) => {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      // Collecter les chunks du PDF
      doc.on('data',  chunk => chunks.push(chunk));
      doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
      doc.on('error', err   => reject(err));

      // ── Couleurs ──────────────────────────────────────────
      const GREEN  = '#166534';
      const GRAY   = '#6b7280';
      const DARK   = '#1a1a1a';
      const LIGHT  = '#f9fafb';
      const BORDER = '#e5e7eb';

      // ════════════════════════════════════════════════════
      // HEADER
      // ════════════════════════════════════════════════════
      doc
        .rect(0, 0, doc.page.width, 100)
        .fill(GREEN);

      doc
        .fillColor('white')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('GOFFA', 50, 30);

      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#86efac')
        .text('artisanat tunisien', 50, 62);

      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .fillColor('white')
        .text('FACTURE', 0, 35, { align: 'right' });

      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#86efac')
        .text(`#${order.order_number}`, 0, 65, { align: 'right' });

      // ════════════════════════════════════════════════════
      // INFOS COMMANDE + CLIENT
      // ════════════════════════════════════════════════════
      let y = 120;

      // Bloc gauche — Infos facture
      doc
        .fillColor(GRAY)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('INFORMATIONS FACTURE', 50, y);

      doc.moveDown(0.3);

      const invoiceInfo = [
        ['N° Commande',  `#${order.order_number}`],
        ['Date',         new Date(order.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'long', year: 'numeric'
        })],
        ['Statut',       order.status === 'delivered' ? 'Livrée' : 'En cours'],
        ['Paiement',     order.payment_method === 'cod'    ? 'À la livraison' :
                         order.payment_method === 'stripe' ? 'Carte / Twint'  : order.payment_method],
      ];

      invoiceInfo.forEach(([label, value]) => {
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(DARK)
          .text(label + ' : ', 50, doc.y, { continued: true })
          .font('Helvetica')
          .fillColor(GRAY)
          .text(value);
      });

      // Bloc droit — Adresse livraison
      doc
        .fillColor(GRAY)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('ADRESSE DE LIVRAISON', 320, y);

      const addressY = y + 16;
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(DARK)
        .text(order.shipping_full_name, 320, addressY);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(GRAY)
        .text(order.shipping_address, 320, addressY + 14)
        .text(`${order.shipping_city}${order.shipping_governorate ? ', ' + order.shipping_governorate : ''}`, 320)
        .text(order.shipping_country === 'TN' ? 'Tunisie' : order.shipping_country, 320);

      if (order.shipping_phone) {
        doc.text(`Tél : ${order.shipping_phone}`, 320);
      }

      // ════════════════════════════════════════════════════
      // TABLEAU DES ARTICLES
      // ════════════════════════════════════════════════════
      y = doc.y + 30;

      // Header tableau
      doc
        .rect(50, y, doc.page.width - 100, 28)
        .fill(GREEN);

      doc
        .fillColor('white')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('ARTICLE',    60,  y + 9)
        .text('QTÉ',        350, y + 9)
        .text('PRIX UNIT.', 400, y + 9)
        .text('TOTAL',      480, y + 9);

      y += 28;

      // Lignes articles
      items.forEach((item, index) => {
        const rowBg = index % 2 === 0 ? LIGHT : 'white';
        const lineTotal = (parseFloat(item.price_at_order) * item.quantity).toFixed(3);

        doc
          .rect(50, y, doc.page.width - 100, 26)
          .fill(rowBg);

        doc
          .fillColor(DARK)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(item.product_name_fr, 60, y + 8, { width: 280, ellipsis: true });

        if (item.variant_details && item.variant_details.length > 0) {
          const details = Array.isArray(item.variant_details)
            ? item.variant_details.map(v => `${v.attribute_type}: ${v.attribute_value}`).join(', ')
            : '';
          if (details) {
            doc
              .fontSize(7)
              .font('Helvetica')
              .fillColor(GRAY)
              .text(details, 60, y + 18, { width: 280, ellipsis: true });
          }
        }

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(DARK)
          .text(item.quantity.toString(),              350, y + 8)
          .text(`${parseFloat(item.price_at_order).toFixed(3)} DT`, 400, y + 8)
          .text(`${lineTotal} DT`,                     480, y + 8);

        y += 26;
      });

      // Ligne de séparation
      doc
        .moveTo(50, y)
        .lineTo(doc.page.width - 50, y)
        .strokeColor(BORDER)
        .stroke();

      y += 15;

      // ════════════════════════════════════════════════════
      // TOTAUX
      // ════════════════════════════════════════════════════
      const totalsX = 380;

      const totals = [
        ['Sous-total',  `${parseFloat(order.subtotal).toFixed(3)} DT`],
        ['Livraison',   parseFloat(order.shipping_cost) === 0 ? 'Gratuite' : `${parseFloat(order.shipping_cost).toFixed(3)} DT`],
      ];

      if (parseFloat(order.discount_amount) > 0) {
        totals.push(['Réduction', `-${parseFloat(order.discount_amount).toFixed(3)} DT`]);
      }

      totals.forEach(([label, value]) => {
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(GRAY)
          .text(label, totalsX, y, { width: 100 })
          .fillColor(DARK)
          .text(value, totalsX + 100, y, { align: 'right', width: 60 });
        y += 16;
      });

      // Total final
      doc
        .rect(totalsX - 10, y, 180, 32)
        .fill(GREEN);

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('white')
        .text('TOTAL', totalsX, y + 10, { width: 100 })
        .text(`${parseFloat(order.total_price).toFixed(3)} DT`, totalsX + 100, y + 10, {
          align: 'right', width: 60
        });

      y += 50;

      // ════════════════════════════════════════════════════
      // CODE PROMO si utilisé
      // ════════════════════════════════════════════════════
      if (order.promo_code) {
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(GRAY)
          .text(`Code promo utilisé : `, 50, y, { continued: true })
          .font('Helvetica-Bold')
          .fillColor(GREEN)
          .text(order.promo_code);
        y += 20;
      }

      // ════════════════════════════════════════════════════
      // FOOTER
      // ════════════════════════════════════════════════════
      const footerY = doc.page.height - 80;

      doc
        .moveTo(50, footerY - 10)
        .lineTo(doc.page.width - 50, footerY - 10)
        .strokeColor(BORDER)
        .stroke();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(GRAY)
        .text('GOFFA — artisanat tunisien', 50, footerY, { align: 'center' })
        .text('Merci pour votre commande ! Pour toute question : contact@goffa.tn', 50, footerY + 14, { align: 'center' })
        .text(`Facture générée le ${new Date().toLocaleDateString('fr-FR')}`, 50, footerY + 28, { align: 'center' });

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
};