import database from "../database/db.js";

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
    // Filtre par mois/année spécifique
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
    default: // 30days par défaut
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
  const { start, end, label } = buildDateFilter(period, month, year);

  // Période précédente pour comparaison
  const startDate  = new Date(start);
  const endDate    = new Date(end);
  const diff       = endDate - startDate;
  const prevEnd    = new Date(startDate - 1);
  const prevStart  = new Date(prevEnd - diff);

  const prevStartStr = prevStart.toISOString().split('T')[0];
  const prevEndStr   = prevEnd.toISOString().split('T')[0];

  const [
    // KPIs période actuelle
    revenueResult,
    ordersResult,
    usersResult,
    newUsersResult,

    // KPIs période précédente (pour comparaison)
    prevRevenueResult,
    prevOrdersResult,
    prevUsersResult,

    // Stats globales
    totalProductsResult,
    totalUsersResult,

    // Alertes
    lowStockResult,
    pendingOrdersResult,
    cancelledTodayResult,
    newUsersTodayResult,

    // Graphiques
    revenueByDayResult,
    revenueByMonthResult,
    ordersByStatusResult,
    salesByCategoryResult,
    topProductsResult,
    recentOrdersResult,
    topCustomersResult,

    // Trafic vs Ventes
    trafficVsSalesResult,
  ] = await Promise.all([

    // ── CA période actuelle ───────────────────────────────
    database.query(
      `SELECT COALESCE(SUM(total_price), 0)::float AS revenue,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status != 'cancelled'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // ── Commandes période actuelle ────────────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // ── Nouveaux users période actuelle ───────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // ── Nouveaux users période actuelle ───────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    ),

    // ── CA période précédente ─────────────────────────────
    database.query(
      `SELECT COALESCE(SUM(total_price), 0)::float AS revenue
       FROM orders
       WHERE status != 'cancelled'
       AND DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // ── Commandes période précédente ──────────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // ── Users période précédente ──────────────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [prevStartStr, prevEndStr]
    ),

    // ── Total produits actifs ─────────────────────────────
    database.query(
        `SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`
),

    // ── Total users ───────────────────────────────────────
    database.query(
        `SELECT COUNT(*)::int AS count FROM users`
),


    // ── Produits en rupture/stock faible ──────────────────
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

    // ── Commandes en attente depuis +48h ──────────────────
    database.query(
      `SELECT o.id, o.order_number, o.total_price, o.created_at,
              u.name AS customer_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.status = 'pending'
       AND o.created_at < NOW() - INTERVAL '48 hours'
       ORDER BY o.created_at ASC
       LIMIT 10`
    ),

    // ── Commandes annulées aujourd'hui ────────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE status = 'cancelled'
       AND DATE(updated_at) = CURRENT_DATE`
    ),

    // ── Nouveaux users aujourd'hui ────────────────────────
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE DATE(created_at) = CURRENT_DATE`
    ),

    // ── CA journalier (courbe évolution) ──────────────────
    database.query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(total_price), 0)::float AS revenue,
         COUNT(*)::int AS orders
       FROM orders
       WHERE status != 'cancelled'
       AND DATE(created_at) BETWEEN $1 AND $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [start, end]
    ),

    // ── CA mensuel (6 derniers mois) ──────────────────────
    database.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
         TO_CHAR(DATE_TRUNC('month', created_at), 'MM/YYYY')  AS month_key,
         COALESCE(SUM(total_price), 0)::float AS revenue,
         COUNT(*)::int AS orders
       FROM orders
       WHERE status != 'cancelled'
       AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY DATE_TRUNC('month', created_at) ASC`
    ),

    // ── Commandes par statut ──────────────────────────────
    database.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       GROUP BY status
       ORDER BY count DESC`
    ),

    // ── Ventes par catégorie (Donut Chart) ────────────────
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
       WHERE o.status != 'cancelled'
       AND DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY c.name_fr
       ORDER BY revenue DESC
       LIMIT 8`,
      [start, end]
    ),

    // ── Top 5 produits vendus ─────────────────────────────
    database.query(
      `SELECT
         p.name_fr,
         p.slug,
         SUM(oi.quantity)::int AS total_qty,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(oi.quantity * oi.price_at_order), 0)::float AS revenue
       FROM order_items oi
       LEFT JOIN orders           o  ON o.id  = oi.order_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products         p  ON p.id  = pv.product_id
       WHERE o.status != 'cancelled'
       AND DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY p.id, p.name_fr, p.slug
       ORDER BY total_qty DESC
       LIMIT 5`,
      [start, end]
    ),

    // ── 5 dernières commandes ─────────────────────────────
    database.query(
      `SELECT
         o.id, o.order_number, o.status,
         o.payment_method, o.payment_status,
         o.total_price, o.created_at,
         u.name  AS customer_name,
         u.email AS customer_email,
         COUNT(oi.id)::int AS item_count
       FROM orders o
       LEFT JOIN users       u  ON u.id  = o.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id, u.name, u.email
       ORDER BY o.created_at DESC
       LIMIT 5`
    ),

    // ── Top 5 clients ─────────────────────────────────────
    database.query(
      `SELECT
         u.id, u.name, u.email,
         COUNT(DISTINCT o.id)::int AS total_orders,
         COALESCE(SUM(o.total_price), 0)::float AS total_spent
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.status != 'cancelled'
       GROUP BY u.id, u.name, u.email
       ORDER BY total_spent DESC
       LIMIT 5`
    ),

    // ── Trafic (views) vs Ventes par mois ─────────────────
    database.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', o.created_at), 'Mon') AS month,
         COUNT(DISTINCT o.id)::int AS orders,
         COALESCE(SUM(p.views_count), 0)::int AS total_views
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', o.created_at)
       ORDER BY DATE_TRUNC('month', o.created_at) ASC`
    ),
  ]);

  // ── Calcul des KPIs avec croissance ──────────────────────
  const currentRevenue = revenueResult.rows[0].revenue;
  const prevRevenue    = prevRevenueResult.rows[0].revenue;
  const currentOrders  = ordersResult.rows[0].count;
  const prevOrders     = prevOrdersResult.rows[0].count;
  const currentUsers   = usersResult.rows[0].count;
  const prevUsers      = prevUsersResult.rows[0].count;

  // ── Taux de conversion ────────────────────────────────────
  const totalViews = await database.query(`SELECT COALESCE(SUM(views_count), 0)::int AS total FROM products`);
  const conversionRate  = totalViews.rows[0].total > 0
    ? parseFloat(((currentOrders / totalViews.rows[0].total) * 100).toFixed(2))
    : 0;

  return {
    period: { label, start, end },

    // ── KPIs principaux ───────────────────────────────────
    kpis: {
      revenue: {
        current:  currentRevenue,
        previous: prevRevenue,
        growth:   calcGrowth(currentRevenue, prevRevenue),
      },
      orders: {
        current:  currentOrders,
        previous: prevOrders,
        growth:   calcGrowth(currentOrders, prevOrders),
      },
      newUsers: {
        current:  currentUsers,
        previous: prevUsers,
        growth:   calcGrowth(currentUsers, prevUsers),
      },
      conversionRate,
    },

    // ── Stats globales ────────────────────────────────────
    globals: {
      totalProducts: totalProductsResult.rows[0].count,
      totalUsers:    totalUsersResult.rows[0].count,
    },

    // ── Alertes ───────────────────────────────────────────
    alerts: {
      lowStockProducts:     lowStockResult.rows,
      pendingOrders48h:     pendingOrdersResult.rows,
      cancelledToday:       cancelledTodayResult.rows[0].count,
      newUsersToday:        newUsersTodayResult.rows[0].count,
    },

    // ── Graphiques ────────────────────────────────────────
    charts: {
      revenueByDay:      revenueByDayResult.rows,
      revenueByMonth:    revenueByMonthResult.rows,
      ordersByStatus:    ordersByStatusResult.rows,
      salesByCategory:   salesByCategoryResult.rows,
      topProducts:       topProductsResult.rows,
      trafficVsSales:    trafficVsSalesResult.rows,
    },

    // ── Tableaux ──────────────────────────────────────────
    tables: {
      recentOrders:  recentOrdersResult.rows,
      topCustomers:  topCustomersResult.rows,
    },
  };
};

// ═══════════════════════════════════════════════════════════
// EXPORT STATS (CSV)
// ═══════════════════════════════════════════════════════════
export const exportStatsService = async ({ period, month, year, type }) => {
  const { start, end, label } = buildDateFilter(period, month, year);

  let rows = [];
  let filename = '';
  let headers = [];

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
         WHERE o.status != 'cancelled'
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
         LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'cancelled'
         GROUP BY u.id, u.name, u.email, u.created_at
         ORDER BY total_spent DESC`
      );
      headers  = ['Nom','Email','Inscrit le','Commandes','Total dépensé'];
      rows     = result.rows.map(r => [r.name, r.email, r.created_at, r.total_orders, r.total_spent]);
      filename = `clients_${start}_${end}.csv`;
      break;
    }

    default:
      throw new Error('Type d\'export invalide. Valeurs acceptées : orders, products, customers');
  }

  // Construire le CSV
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