import database from "../database/db.js";
import { getCache, setCache } from "../config/redis.js"; // ✅ helpers centralisés
import { getDashboardTTL } from "../utils/cacheInvalideation.js";

// ═══════════════════════════════════════════════════════════
// HELPER — calcul pourcentage de changement
// ═══════════════════════════════════════════════════════════
const calcGrowth = (current, previous) => {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
};

// ═══════════════════════════════════════════════════════════
// HELPER — construire filtre date selon période
// ═══════════════════════════════════════════════════════════
const buildDateFilter = (period, month, year) => {
  const now = new Date();

  if (month && year) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end   = new Date(year, month, 0).toISOString().split('T')[0];
    return { start, end, label: `${month}/${year}` };
  }

  switch (period) {
    case 'today':
      return {
        start: now.toISOString().split('T')[0],
        end:   now.toISOString().split('T')[0],
        label: "Aujourd'hui",
      };
    case '7days':
      return {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end:   now.toISOString().split('T')[0],
        label: '7 derniers jours',
      };
    case '30days':
      return {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end:   now.toISOString().split('T')[0],
        label: '30 derniers jours',
      };
    case 'year':
      return {
        start: `${now.getFullYear()}-01-01`,
        end:   `${now.getFullYear()}-12-31`,
        label: `Année ${now.getFullYear()}`,
      };
    default:
      return {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end:   now.toISOString().split('T')[0],
        label: '30 derniers jours',
      };
  }
};

// ═══════════════════════════════════════════════════════════
// GET DASHBOARD STATS
// ═══════════════════════════════════════════════════════════
export const getDashboardStatsService = async ({ period, month, year }) => {

  const cacheKey  = `dashboard:${period || "30days"}:${month || ""}:${year || ""}`;
  const CACHE_TTL = getDashboardTTL(period);

  // ── 1. Cache Redis ────────────────────────────────────
  const cached = await getCache(cacheKey); // ✅ helper — parse JSON + fallback si Redis down
  if (cached) {
    console.log(`[Redis] Cache HIT — ${cacheKey}`);
    return cached;
  }
  console.log(`[Redis] Cache MISS — ${cacheKey}`);

  // ── 2. Pas de cache → 26 requêtes SQL en parallèle ───
  const { start, end, label } = buildDateFilter(period, month, year);

  const startDate = new Date(start);
  const endDate   = new Date(end);
  const diff      = endDate - startDate;
  const prevEnd   = new Date(startDate - 1);
  const prevStart = new Date(prevEnd - diff);

  const prevStartStr = prevStart.toISOString().split('T')[0];
  const prevEndStr   = prevEnd.toISOString().split('T')[0];

  const [
    revenueResult,
    ordersResult,
    usersResult,
    prevRevenueResult,
    prevOrdersResult,
    prevUsersResult,
    totalProductsResult,
    totalUsersResult,
    lowStockResult,
    pendingOrdersResult,
    cancelledTodayResult,
    newUsersTodayResult,
    revenueByDayResult,
    revenueByMonthResult,
    ordersByStatusResult,
    reclamationsTotalResult,
    reclamationsPendingResult,
    reclamationsResolvedResult,
    reclamationsByTypeResult,
    recentReclamationsResult,
    prevReclamationsTotalResult,
    prevReclamationsPendingResult,
    salesByCategoryResult,
    topProductsResult,
    recentOrdersResult,
    topCustomersResult,
  ] = await Promise.all([

    // 0 — CA période actuelle
    database.query(
      `SELECT COALESCE(SUM(total_price), 0)::float AS revenue,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status != 'annulee'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 1 — Commandes période actuelle
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 2 — Nouveaux users période actuelle
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 3 — CA période précédente
    database.query(
      `SELECT COALESCE(SUM(total_price), 0)::float AS revenue
       FROM orders
       WHERE status != 'annulee'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // 4 — Commandes période précédente
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // 5 — Users période précédente
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // 6 — Total produits actifs
    database.query(
      `SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`
    ),

    // 7 — Total users
    database.query(
      `SELECT COUNT(*)::int AS count FROM users`
    ),

    // 8 — Produits en rupture/stock faible
    database.query(
      `SELECT
         p.id, p.name_fr, p.slug,
         pv.sku, pv.stock, pv.low_stock_threshold,
         c.name_fr AS category_name
       FROM product_variants pv
       LEFT JOIN products   p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE pv.stock <= pv.low_stock_threshold
       AND   p.is_active  = true
       AND   pv.is_active = true
       ORDER BY pv.stock ASC
       LIMIT 10`
    ),

    // 9 — Commandes en attente depuis +48h
    database.query(
      `SELECT o.id, o.order_number, o.total_price, o.created_at,
              u.name AS customer_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.status = 'en_attente'
       AND o.created_at < NOW() - INTERVAL '48 hours'
       ORDER BY o.created_at ASC
       LIMIT 10`
    ),

    // 10 — Commandes annulées aujourd'hui
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE status = 'annulee'
       AND DATE(updated_at) = CURRENT_DATE`
    ),

    // 11 — Nouveaux users aujourd'hui
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) = CURRENT_DATE`
    ),

    // 12 — CA journalier
    database.query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(total_price), 0)::float AS revenue,
         COUNT(*)::int AS orders
       FROM orders
       WHERE status != 'annulee'
       AND DATE(created_at) BETWEEN $1 AND $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [start, end]
    ),

    // 13 — CA mensuel
    database.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
         TO_CHAR(DATE_TRUNC('month', created_at), 'MM/YYYY')  AS month_key,
         COALESCE(SUM(total_price), 0)::float AS revenue,
         COUNT(*)::int AS orders
       FROM orders
       WHERE status != 'annulee'
       AND DATE(created_at) BETWEEN $1 AND $2
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY DATE_TRUNC('month', created_at) ASC`,
      [start, end]
    ),

    // 14 — Commandes par statut
    database.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       WHERE DATE(created_at) BETWEEN $1 AND $2
       GROUP BY status
       ORDER BY count DESC`,
      [start, end]
    ),

    // 15 — Réclamations total période actuelle
    database.query(
      `SELECT COUNT(*)::int AS total
       FROM reclamations
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 16 — Réclamations en attente
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM reclamations
       WHERE status = 'en_attente'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 17 — Réclamations résolues
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM reclamations
       WHERE status = 'resolue'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // 18 — Réclamations par type
    database.query(
      `SELECT reclamation_type, COUNT(*)::int AS count
       FROM reclamations
       WHERE DATE(created_at) BETWEEN $1 AND $2
       GROUP BY reclamation_type
       ORDER BY count DESC`,
      [start, end]
    ),

    // 19 — Réclamations récentes en attente
    database.query(
      `SELECT
         r.id, r.reclamation_type, r.message, r.status, r.created_at,
         u.name  AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         o.order_number
       FROM reclamations r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.status = 'en_attente'
       ORDER BY r.created_at DESC
       LIMIT 10`
    ),

    // 20 — Réclamations total période précédente
    database.query(
      `SELECT COUNT(*)::int AS total
       FROM reclamations
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // 21 — Réclamations en attente période précédente
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM reclamations
       WHERE status = 'en_attente'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // 22 — Ventes par catégorie
    database.query(
      `SELECT
         c.name_fr AS category,
         COUNT(DISTINCT o.id)::int AS orders_count,
         COALESCE(SUM(oi.quantity * oi.price_at_order), 0)::float AS revenue
       FROM order_items oi
       LEFT JOIN orders           o  ON o.id  = oi.order_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products         p  ON p.id  = pv.product_id
       LEFT JOIN categories       c  ON c.id  = p.category_id
       WHERE o.status != 'annulee'
       AND DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY c.name_fr
       ORDER BY revenue DESC
       LIMIT 8`,
      [start, end]
    ),

    // 23 — Top 5 produits
    database.query(
      `SELECT
         p.name_fr, p.slug,
         SUM(oi.quantity)::int AS total_qty,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(oi.quantity * oi.price_at_order), 0)::float AS revenue
       FROM order_items oi
       LEFT JOIN orders           o  ON o.id  = oi.order_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products         p  ON p.id  = pv.product_id
       WHERE o.status != 'annulee'
       AND DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY p.id, p.name_fr, p.slug
       ORDER BY total_qty DESC
       LIMIT 5`,
      [start, end]
    ),

    // 24 — 5 dernières commandes
    database.query(
      `SELECT
         o.id, o.order_number, o.status,
         o.payment_method, o.payment_status,
         o.total_price, o.created_at,
         u.name  AS customer_name,
         u.email AS customer_email,
         COUNT(oi.id)::int AS item_count
       FROM orders o
       LEFT JOIN users       u  ON u.id = o.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY o.id, u.name, u.email
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [start, end]
    ),

    // 25 — Top 5 clients
    database.query(
      `SELECT
         u.id, u.name, u.email,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(o.total_price), 0)::float AS total_spent
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.status != 'annulee'
       AND DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY u.id, u.name, u.email
       ORDER BY total_spent DESC
       LIMIT 5`,
      [start, end]
    ),
  ]);

  // ── 3. Construire le résultat ─────────────────────────
  const result = {
    period: { label, start, end },

    kpis: {
      revenue: {
        current:  revenueResult.rows[0].revenue,
        previous: prevRevenueResult.rows[0].revenue,
        growth:   calcGrowth(revenueResult.rows[0].revenue, prevRevenueResult.rows[0].revenue),
      },
      orders: {
        current:  ordersResult.rows[0].count,
        previous: prevOrdersResult.rows[0].count,
        growth:   calcGrowth(ordersResult.rows[0].count, prevOrdersResult.rows[0].count),
      },
      newUsers: {
        current:  usersResult.rows[0].count,
        previous: prevUsersResult.rows[0].count,
        growth:   calcGrowth(usersResult.rows[0].count, prevUsersResult.rows[0].count),
      },
    },

    globals: {
      totalProducts: totalProductsResult.rows[0].count,
      totalUsers:    totalUsersResult.rows[0].count,
    },

    alerts: {
      lowStockProducts: lowStockResult.rows,
      pendingOrders48h: pendingOrdersResult.rows,
      cancelledToday:   cancelledTodayResult.rows[0].count,
      newUsersToday:    newUsersTodayResult.rows[0].count,
    },

    charts: {
      revenueByDay:    revenueByDayResult.rows,
      revenueByMonth:  revenueByMonthResult.rows,
      ordersByStatus:  ordersByStatusResult.rows,
      salesByCategory: salesByCategoryResult.rows,
      topProducts:     topProductsResult.rows,
    },

    tables: {
      recentOrders: recentOrdersResult.rows,
      topCustomers: topCustomersResult.rows,
    },

    reclamations: {
      total: {
        current:  reclamationsTotalResult.rows[0].total,
        previous: prevReclamationsTotalResult.rows[0].total,
        growth:   calcGrowth(reclamationsTotalResult.rows[0].total, prevReclamationsTotalResult.rows[0].total),
      },
      pending: {
        current:  reclamationsPendingResult.rows[0].count,
        previous: prevReclamationsPendingResult.rows[0].count,
        growth:   calcGrowth(reclamationsPendingResult.rows[0].count, prevReclamationsPendingResult.rows[0].count),
      },
      resolved: reclamationsResolvedResult.rows[0].count,
      byType:   reclamationsByTypeResult.rows,
      recent:   recentReclamationsResult.rows,
    },
  };

  // ── 4. Sauvegarder en cache ───────────────────────────
  await setCache(cacheKey, result, CACHE_TTL); // ✅ helper — stringify + TTL intelligent
  console.log(`[Redis] Cache SET — ${cacheKey} (TTL: ${CACHE_TTL}s)`);

  return result;
};

// ═══════════════════════════════════════════════════════════
// EXPORT STATS (CSV)
// ═══════════════════════════════════════════════════════════
export const exportStatsService = async ({ period, month, year, type }) => {
  const { start, end } = buildDateFilter(period, month, year);

  let rows     = [];
  let filename = '';
  let headers  = [];

  switch (type) {

    case 'orders': {
      const result = await database.query(
        `SELECT o.order_number, o.status, o.payment_method, o.payment_status,
                o.total_price, o.created_at,
                u.name AS customer_name, u.email AS customer_email
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE DATE(o.created_at) BETWEEN $1 AND $2
         ORDER BY o.created_at DESC`,
        [start, end]
      );
      headers  = ['N° commande','Statut','Paiement','Statut paiement','Total','Date','Client','Email'];
      rows     = result.rows.map(r => [
        r.order_number, r.status, r.payment_method, r.payment_status,
        r.total_price, r.created_at, r.customer_name, r.customer_email,
      ]);
      filename = `commandes_${start}_${end}.csv`;
      break;
    }

    case 'products': {
      const result = await database.query(
        `SELECT p.name_fr, p.slug, c.name_fr AS category,
                SUM(oi.quantity)::int AS total_qty,
                COALESCE(SUM(oi.quantity * oi.price_at_order), 0)::float AS revenue
         FROM order_items oi
         LEFT JOIN orders           o  ON o.id  = oi.order_id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         LEFT JOIN products         p  ON p.id  = pv.product_id
         LEFT JOIN categories       c  ON c.id  = p.category_id
         WHERE o.status != 'annulee'
         AND DATE(o.created_at) BETWEEN $1 AND $2
         GROUP BY p.id, p.name_fr, p.slug, c.name_fr
         ORDER BY revenue DESC`,
        [start, end]
      );
      headers  = ['Produit','Slug','Catégorie','Qté vendue','Revenus'];
      rows     = result.rows.map(r => [r.name_fr, r.slug, r.category, r.total_qty, r.revenue]);
      filename = `produits_${start}_${end}.csv`;
      break;
    }

    case 'customers': {
      const result = await database.query(
        `SELECT u.name, u.email, u.created_at,
                COUNT(DISTINCT o.id)::int AS total_orders,
                COALESCE(SUM(o.total_price), 0)::float AS total_spent
         FROM users u
         LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'annulee'
         GROUP BY u.id, u.name, u.email, u.created_at
         ORDER BY total_spent DESC`
      );
      headers  = ['Nom','Email','Inscrit le','Commandes','Total dépensé'];
      rows     = result.rows.map(r => [r.name, r.email, r.created_at, r.total_orders, r.total_spent]);
      filename = `clients_${start}_${end}.csv`;
      break;
    }

    default:
      throw new Error("Type d'export invalide. Valeurs acceptées : orders, products, customers");
  }

  const escape = v => {
    if (v === null || v === undefined) return '';
    const str = String(v).replace(/"/g, '""');
    return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
  };

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n');

  return { csv, filename };
};