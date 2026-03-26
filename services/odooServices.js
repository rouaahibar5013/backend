import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// HELPER — Récupérer la config Odoo
// ═══════════════════════════════════════════════════════════
const getOdooSettings = async () => {
  const result = await database.query(
    "SELECT * FROM odoo_settings LIMIT 1"
  );
  return result.rows[0] || null;
};


// ═══════════════════════════════════════════════════════════
// HELPER — Appel API Odoo (JSON-RPC)
// ═══════════════════════════════════════════════════════════
const callOdooAPI = async (settings, model, method, args = [], kwargs = {}) => {
  const response = await fetch(`${settings.odoo_url}/web/dataset/call_kw`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'call',
      params: {
        model,
        method,
        args,
        kwargs: {
          context: { lang: 'fr_FR' },
          ...kwargs,
        },
      },
    }),
  });

  if (!response.ok)
    throw new Error(`Odoo API error: ${response.statusText}`);

  const data = await response.json();

  if (data.error)
    throw new Error(`Odoo error: ${data.error.message}`);

  return data.result;
};


// ═══════════════════════════════════════════════════════════
// LOG SYNC
// ═══════════════════════════════════════════════════════════
const logSync = async ({ type, direction, referenceId, status, payload, response, error }) => {
  await database.query(
    `INSERT INTO odoo_sync_logs
      (type, direction, reference_id, status, payload, response, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      type, direction, referenceId || null,
      status,
      payload  ? JSON.stringify(payload)  : null,
      response ? JSON.stringify(response) : null,
      error    || null,
    ]
  ).catch(err => console.error("Log sync error:", err.message));
};


// ═══════════════════════════════════════════════════════════
// EXPORT ORDER TO ODOO
// Appelé automatiquement après création d'une commande
// ═══════════════════════════════════════════════════════════
export const exportOrderToOdoo = async (orderId) => {
  const settings = await getOdooSettings();

  // Si Odoo non configuré ou inactif → skip
  if (!settings || !settings.is_active || !settings.auto_export_orders) {
    return { skipped: true, reason: "Odoo non activé" };
  }

  try {
    // Récupérer la commande avec ses articles
    const [orderResult, itemsResult] = await Promise.all([
      database.query(
        `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE o.id=$1`,
        [orderId]
      ),
      database.query(
        "SELECT * FROM order_items WHERE order_id=$1", [orderId]
      ),
    ]);

    if (orderResult.rows.length === 0) return;

    const order = orderResult.rows[0];
    const items = itemsResult.rows;

    // Préparer le payload pour Odoo (sale.order)
    const payload = {
      name:            order.order_number,
      partner_name:    order.customer_name,
      partner_email:   order.customer_email,
      partner_phone:   order.customer_phone,
      note:            order.notes,
      amount_total:    parseFloat(order.total_price),
      order_lines: items.map(item => ({
        product_name: item.product_name_fr,
        qty:          item.quantity,
        price_unit:   parseFloat(item.price_at_order),
        sku:          item.sku,
      })),
      shipping: {
        name:    order.shipping_full_name,
        phone:   order.shipping_phone,
        address: order.shipping_address,
        city:    order.shipping_city,
        country: order.shipping_country,
      },
    };

    // Appel API Odoo — créer sale.order
    const odooResponse = await callOdooAPI(
      settings, 'sale.order', 'create',
      [payload]
    );

    // Log succès
    await logSync({
      type:        'order_export',
      direction:   'outbound',
      referenceId: orderId,
      status:      'success',
      payload,
      response:    { odoo_id: odooResponse },
    });

    // Sauvegarder l'ID Odoo dans la commande
    await database.query(
      "UPDATE orders SET notes = COALESCE(notes, '') || ' [Odoo ID: ' || $1 || ']' WHERE id=$2",
      [odooResponse, orderId]
    );

    return { success: true, odoo_id: odooResponse };

  } catch (error) {
    // Log erreur
    await logSync({
      type:        'order_export',
      direction:   'outbound',
      referenceId: orderId,
      status:      'failed',
      error:       error.message,
    });

    console.error(`Odoo export failed for order ${orderId}:`, error.message);
    return { success: false, error: error.message };
  }
};


// ═══════════════════════════════════════════════════════════
// WEBHOOK — Mise à jour stock depuis Odoo
// POST /api/webhooks/odoo/stock-update
// Odoo envoie les nouveaux stocks
// ═══════════════════════════════════════════════════════════
export const handleStockUpdateWebhook = async (payload) => {
  const settings = await getOdooSettings();

  if (!settings || settings.stock_managed_by !== 'odoo') {
    return { skipped: true, reason: "Stock géré par backend" };
  }

  const { updates } = payload;
  // updates = [{ sku: "SKU001", stock: 50 }, ...]

  if (!updates || !Array.isArray(updates))
    throw new Error("Payload invalide — 'updates' requis");

  const results = [];

  for (const update of updates) {
    try {
      const result = await database.query(
        "UPDATE product_variants SET stock=$1 WHERE sku=$2 RETURNING id, sku, stock",
        [update.stock, update.sku]
      );

      if (result.rows.length > 0) {
        results.push({ sku: update.sku, updated: true, stock: update.stock });
      } else {
        results.push({ sku: update.sku, updated: false, reason: "SKU introuvable" });
      }
    } catch (err) {
      results.push({ sku: update.sku, updated: false, error: err.message });
    }
  }

  await logSync({
    type:      'stock_update',
    direction: 'inbound',
    status:    'success',
    payload,
    response:  { results },
  });

  return { results };
};


// ═══════════════════════════════════════════════════════════
// WEBHOOK — Mise à jour prix depuis Odoo
// POST /api/webhooks/odoo/price-update
// ═══════════════════════════════════════════════════════════
export const handlePriceUpdateWebhook = async (payload) => {
  const settings = await getOdooSettings();

  if (!settings || !settings.sync_prices) {
    return { skipped: true, reason: "Sync prix désactivé" };
  }

  const { updates } = payload;

  if (!updates || !Array.isArray(updates))
    throw new Error("Payload invalide — 'updates' requis");

  const results = [];

  for (const update of updates) {
    try {
      const result = await database.query(
        "UPDATE product_variants SET price=$1 WHERE sku=$2 RETURNING id, sku, price",
        [update.price, update.sku]
      );

      results.push({
        sku:     update.sku,
        updated: result.rows.length > 0,
        price:   update.price,
      });
    } catch (err) {
      results.push({ sku: update.sku, updated: false, error: err.message });
    }
  }

  await logSync({
    type:      'price_update',
    direction: 'inbound',
    status:    'success',
    payload,
    response:  { results },
  });

  return { results };
};


// ═══════════════════════════════════════════════════════════
// GET ODOO SETTINGS (admin)
// ═══════════════════════════════════════════════════════════
export const getOdooSettingsService = async () => {
  const result = await database.query(
    "SELECT * FROM odoo_settings LIMIT 1"
  );
  // ✅ Ne pas retourner l'API key en clair
  const settings = result.rows[0];
  if (settings) {
    settings.odoo_api_key = settings.odoo_api_key ? '***masked***' : null;
  }
  return settings;
};


// ═══════════════════════════════════════════════════════════
// UPDATE ODOO SETTINGS (admin)
// ═══════════════════════════════════════════════════════════
export const updateOdooSettingsService = async (data) => {
  const current = await database.query(
    "SELECT * FROM odoo_settings LIMIT 1"
  );

  if (current.rows.length === 0) {
    // Créer si n'existe pas
    const result = await database.query(
      `INSERT INTO odoo_settings
        (odoo_url, odoo_db, odoo_username, odoo_api_key, is_active,
         sync_stock, sync_prices, sync_products, stock_managed_by, auto_export_orders)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.odoo_url, data.odoo_db, data.odoo_username, data.odoo_api_key,
        data.is_active ?? false, data.sync_stock ?? true, data.sync_prices ?? true,
        data.sync_products ?? true, data.stock_managed_by || 'backend',
        data.auto_export_orders ?? true,
      ]
    );
    return result.rows[0];
  }

  const c = current.rows[0];
  const result = await database.query(
    `UPDATE odoo_settings
     SET odoo_url=$1, odoo_db=$2, odoo_username=$3,
         odoo_api_key=$4, is_active=$5, sync_stock=$6,
         sync_prices=$7, sync_products=$8, stock_managed_by=$9,
         auto_export_orders=$10
     WHERE id=$11 RETURNING *`,
    [
      data.odoo_url           || c.odoo_url,
      data.odoo_db            || c.odoo_db,
      data.odoo_username      || c.odoo_username,
      data.odoo_api_key       || c.odoo_api_key,
      data.is_active          ?? c.is_active,
      data.sync_stock         ?? c.sync_stock,
      data.sync_prices        ?? c.sync_prices,
      data.sync_products      ?? c.sync_products,
      data.stock_managed_by   || c.stock_managed_by,
      data.auto_export_orders ?? c.auto_export_orders,
      c.id,
    ]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// GET SYNC LOGS (admin)
// ═══════════════════════════════════════════════════════════
export const getSyncLogsService = async ({ type, status, page = 1 }) => {
  const limit  = 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (type)   { conditions.push(`type=$${index}`);   values.push(type);   index++; }
  if (status) { conditions.push(`status=$${index}`); values.push(status); index++; }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  values.push(limit, offset);

  const result = await database.query(
    `SELECT id, type, direction, reference_id, status, error, created_at
     FROM odoo_sync_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    values
  );

  return result.rows;
};