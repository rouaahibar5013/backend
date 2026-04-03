import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import database from "../database/db.js";

export const getStats = catchAsyncErrors(async (req, res, next) => {
    const [
        usersResult,
        productsResult,
        ordersResult,
        revenueResult,
        recentOrdersResult,
        topProductsResult,
        revenueByMonthResult,
        ordersByStatusResult,
    ] = await Promise.all([

        database.query(`SELECT COUNT(*) FROM users`),
        database.query(`SELECT COUNT(*) FROM products WHERE is_active = true`),
        database.query(`SELECT COUNT(*) FROM orders`),
        database.query(`SELECT COALESCE(SUM(total_price), 0) AS total FROM orders WHERE status != 'cancelled'`),

        database.query(
            `SELECT o.id, o.status, o.total_price, o.created_at,
                u.name AS customer_name, COUNT(oi.id) AS item_count
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             GROUP BY o.id, u.name
             ORDER BY o.created_at DESC
             LIMIT 5`
        ),

        database.query(
            `SELECT p.name_fr, COUNT(oi.id) AS total_orders, SUM(oi.quantity) AS total_qty
             FROM order_items oi
             LEFT JOIN product_variants pv ON pv.id = oi.variant_id
             LEFT JOIN products p ON p.id = pv.product_id
             GROUP BY p.name_fr
             ORDER BY total_qty DESC
             LIMIT 5`
        ),

        // 🆕 Revenus & commandes par mois (6 derniers mois)
        database.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month,
                EXTRACT(MONTH FROM created_at)                  AS month_num,
                COALESCE(SUM(total_price), 0)::float            AS revenue,
                COUNT(*)::int                                   AS orders
             FROM orders
             WHERE created_at >= NOW() - INTERVAL '6 months'
               AND status != 'cancelled'
             GROUP BY DATE_TRUNC('month', created_at), month_num
             ORDER BY DATE_TRUNC('month', created_at) ASC`
        ),

        // 🆕 Nombre de commandes par statut
        database.query(
            `SELECT status, COUNT(*)::int AS count
             FROM orders
             GROUP BY status`
        ),
    ]);

    res.status(200).json({
        success: true,
        stats: {
            totalUsers:    parseInt(usersResult.rows[0].count),
            totalProducts: parseInt(productsResult.rows[0].count),
            totalOrders:   parseInt(ordersResult.rows[0].count),
            totalRevenue:  parseFloat(revenueResult.rows[0].total),
        },
        recentOrders:    recentOrdersResult.rows,
        topProducts:     topProductsResult.rows,
        revenueByMonth:  revenueByMonthResult.rows,   // 🆕
        ordersByStatus:  ordersByStatusResult.rows,   // 🆕
    });
});