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
    ]);

    res.status(200).json({
        success: true,
        stats: {
            totalUsers:    parseInt(usersResult.rows[0].count),
            totalProducts: parseInt(productsResult.rows[0].count),
            totalOrders:   parseInt(ordersResult.rows[0].count),
            totalRevenue:  parseFloat(revenueResult.rows[0].total),
        },
        recentOrders: recentOrdersResult.rows,
        topProducts:  topProductsResult.rows,
    });
});