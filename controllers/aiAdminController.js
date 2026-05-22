// controllers/aiAdminController.js
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors.js';
import db from '../database/db.js';
import {
    analyzeOrders,
    analyzeProducts,
    analyzeUsers,
    analyzeComplaints,
    analyzeReviews,
    generateEmailCampaign,
    generateFAQ,
    analyzeGeneral,
} from '../services/aiAdminService.js';

// ─────────────────────────────────────────────────────────────
// INTENT DETECTION
// ─────────────────────────────────────────────────────────────
function detectIntent(message) {
    const msg = message.toLowerCase();

    if (msg.match(/commande|order|vente|chiffre|revenue|ca |panier|livraison|expédi|paiement|factur/))
        return 'orders';
    if (msg.match(/produit|product|stock|rupture|catégorie|category|performan|vend|vue|visit|populaire/))
        return 'products';
    if (msg.match(/client|utilisateur|user|inscrit|nouveau|inactif|fidèle|acheteur/))
        return 'users';
    if (msg.match(/réclamation|reclamation|plainte|complaint|problème|signalement|défectueux|remboursement/))
        return 'complaints';
    if (msg.match(/avis|review|note|rating|négatif|positif|commentaire|satisfaction|étoile/))
        return 'reviews';
    if (msg.match(/email|campagne|newsletter|mail|rédige|génère.*mail|eid|ramadan|promo.*mail|été|solde.*mail/))
        return 'email';
    if (msg.match(/faq|question fréquente|aide|support|générer.*faq/))
        return 'faq';

    return 'general';
}

// ─────────────────────────────────────────────────────────────
// DB FETCHERS — one per intent
// ─────────────────────────────────────────────────────────────
async function fetchOrders() {
    const [summary, byStatus, byPayment, recentOrders, topProducts] = await Promise.all([

        // Global KPIs
        db.query(`
            SELECT
                COUNT(*)                                                            AS total_orders,
                COALESCE(SUM(total_price), 0)                                      AS total_revenue,
                COALESCE(AVG(total_price), 0)                                      AS avg_basket,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')    AS orders_this_week,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')   AS orders_this_month,
                COALESCE(SUM(total_price) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS revenue_this_month,
                COALESCE(SUM(total_price) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)  AS revenue_this_week
            FROM "order"
        `),

        // By order status
        db.query(`
            SELECT status, COUNT(*) AS count
            FROM "order"
            GROUP BY status
            ORDER BY count DESC
        `),

        // By payment status
        db.query(`
            SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS total
            FROM "order"
            GROUP BY payment_status
        `),

        // 10 most recent orders
        db.query(`
            SELECT o.order_number, o.status, o.payment_status,
                   o.total_price, o.shipping_city, o.created_at,
                   u.name AS client_name, u.email AS client_email
            FROM "order" o
            LEFT JOIN "user" u ON u.id = o.user_id
            ORDER BY o.created_at DESC
            LIMIT 10
        `),

        // Top 5 ordered products
        db.query(`
            SELECT p.name_fr AS product_name,
                   SUM(oi.quantity)                     AS total_qty,
                   SUM(oi.quantity * oi.price_at_order) AS total_revenue
            FROM order_item oi
            JOIN product_variant pv ON pv.id = oi.variant_id
            JOIN product p ON p.id = pv.product_id
            GROUP BY p.id, p.name_fr
            ORDER BY total_qty DESC
            LIMIT 5
        `),
    ]);

    return {
        summary: summary.rows[0],
        by_status: byStatus.rows,
        by_payment_status: byPayment.rows,
        recent_orders: recentOrders.rows,
        top_products: topProducts.rows,
    };
}

async function fetchProducts() {
    const [lowStock, lowSales, topViewed, byCategory, topRated] = await Promise.all([

        // Low stock (< 5 units per variant)
        db.query(`
            SELECT p.name_fr, SUM(pv.stock) AS total_stock, COUNT(pv.id) AS variant_count
            FROM product p
            JOIN product_variant pv ON pv.product_id = p.id AND pv.is_active = true
            WHERE p.is_active = true
            GROUP BY p.id, p.name_fr
            HAVING SUM(pv.stock) < 5
            ORDER BY total_stock ASC
            LIMIT 10
        `),

        // Low sales this month
        db.query(`
            SELECT p.name_fr,
                   COALESCE(SUM(oi.quantity), 0) AS qty_sold_this_month
            FROM product p
            LEFT JOIN product_variant pv ON pv.product_id = p.id
            LEFT JOIN order_item oi ON oi.variant_id = pv.id
            LEFT JOIN "order" o ON o.id = oi.order_id
                AND o.created_at >= NOW() - INTERVAL '30 days'
                AND o.status != 'annulee'
            WHERE p.is_active = true
            GROUP BY p.id, p.name_fr
            ORDER BY qty_sold_this_month ASC
            LIMIT 10
        `),

        // Most viewed products
        db.query(`
            SELECT name_fr, views_count, rating_avg, rating_count
            FROM product
            WHERE is_active = true
            ORDER BY views_count DESC
            LIMIT 10
        `),

        // Sales by category
        db.query(`
            SELECT c.name_fr AS category,
                   COUNT(DISTINCT p.id)          AS product_count,
                   COALESCE(SUM(oi.quantity), 0) AS total_sold
            FROM category c
            LEFT JOIN product p ON p.category_id = c.id AND p.is_active = true
            LEFT JOIN product_variant pv ON pv.product_id = p.id
            LEFT JOIN order_item oi ON oi.variant_id = pv.id
            GROUP BY c.id, c.name_fr
            ORDER BY total_sold DESC
        `),

        // Best rated (min 2 reviews)
        db.query(`
            SELECT name_fr, rating_avg, rating_count
            FROM product
            WHERE is_active = true AND rating_count >= 2
            ORDER BY rating_avg DESC
            LIMIT 5
        `),
    ]);

    return {
        low_stock_products: lowStock.rows,
        low_sales_this_month: lowSales.rows,
        most_viewed: topViewed.rows,
        by_category: byCategory.rows,
        top_rated: topRated.rows,
    };
}

async function fetchUsers() {
    const [summary, topClients, newUsers, inactive] = await Promise.all([

        // Summary
        db.query(`
            SELECT
                COUNT(*)                                                             AS total_users,
                COUNT(*) FILTER (WHERE is_active = true)                            AS active_users,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')     AS new_this_week,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')    AS new_this_month,
                COUNT(*) FILTER (WHERE is_verified = true)                          AS verified_users
            FROM "user"
            WHERE role = 'user'
        `),

        // Top clients by spending
        db.query(`
            SELECT u.name, u.email, u.city,
                   COUNT(o.id)           AS order_count,
                   SUM(o.total_price)    AS total_spent,
                   MAX(o.created_at)     AS last_order_at
            FROM "user" u
            JOIN "order" o ON o.user_id = u.id AND o.status != 'annulee'
            WHERE u.role = 'user'
            GROUP BY u.id, u.name, u.email, u.city
            ORDER BY total_spent DESC
            LIMIT 5
        `),

        // New users (last 7 days)
        db.query(`
            SELECT name, email, city, is_verified, created_at
            FROM "user"
            WHERE role = 'user' AND created_at >= NOW() - INTERVAL '7 days'
            ORDER BY created_at DESC
            LIMIT 10
        `),

        // Inactive clients (no order in 60 days but have ordered before)
        db.query(`
            SELECT u.name, u.email,
                   MAX(o.created_at) AS last_order_at,
                   COUNT(o.id)       AS total_orders
            FROM "user" u
            JOIN "order" o ON o.user_id = u.id
            WHERE u.role = 'user'
            GROUP BY u.id, u.name, u.email
            HAVING MAX(o.created_at) < NOW() - INTERVAL '60 days'
            ORDER BY last_order_at ASC
            LIMIT 10
        `),
    ]);

    return {
        summary: summary.rows[0],
        top_clients: topClients.rows,
        new_users: newUsers.rows,
        inactive_clients: inactive.rows,
    };
}

async function fetchComplaints() {
    const [summary, byType, byStatus, recent, overdue] = await Promise.all([

        // Summary
        db.query(`
            SELECT
                COUNT(*)                                                              AS total,
                COUNT(*) FILTER (WHERE status = 'en_attente')                        AS pending,
                COUNT(*) FILTER (WHERE status = 'urgente')                           AS urgent,
                COUNT(*) FILTER (WHERE status = 'en_retard')                         AS overdue,
                COUNT(*) FILTER (WHERE status = 'resolue')                           AS resolved,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')      AS this_week,
                COUNT(*) FILTER (WHERE refundable = true) AS with_refund_request
            FROM complaint
        `),

        // By type
        db.query(`
            SELECT complaint_type, COUNT(*) AS count
            FROM complaint
            GROUP BY complaint_type
            ORDER BY count DESC
        `),

        // By status
        db.query(`
            SELECT status, COUNT(*) AS count
            FROM complaint
            GROUP BY status
            ORDER BY count DESC
        `),

        // 15 most recent complaints
        db.query(`
            SELECT c.complaint_type, c.message, c.status,
                   c.refundable, c.created_at, c.deadline_at,
                   u.name AS user_name, u.email AS user_email,
                   o.order_number
            FROM complaint c
            LEFT JOIN "user" u ON u.id = c.user_id
            LEFT JOIN "order" o ON o.id = c.order_id
            ORDER BY c.created_at DESC
            LIMIT 15
        `),

        // Overdue complaints (past deadline, not resolved)
        db.query(`
            SELECT c.complaint_type, c.status, c.deadline_at,
                   c.created_at, u.name AS user_name
            FROM complaint c
            LEFT JOIN "user" u ON u.id = c.user_id
            WHERE c.deadline_at < NOW()
              AND c.status NOT IN ('resolue', 'rejetee')
            ORDER BY c.deadline_at ASC
            LIMIT 5
        `),
    ]);

    return {
        summary: summary.rows[0],
        by_type: byType.rows,
        by_status: byStatus.rows,
        recent_complaints: recent.rows,
        overdue_complaints: overdue.rows,
    };
}

async function fetchReviews() {
    const [summary, negative, positive, worstProducts] = await Promise.all([

        // Summary
        db.query(`
            SELECT
                COUNT(*)                                                             AS total_reviews,
                ROUND(AVG(rating)::numeric, 2)                                      AS avg_rating,
                COUNT(*) FILTER (WHERE rating <= 2)                                 AS negative_count,
                COUNT(*) FILTER (WHERE rating = 3)                                  AS neutral_count,
                COUNT(*) FILTER (WHERE rating >= 4)                                 AS positive_count,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')     AS this_week
            FROM review
        `),

        // Recent negative reviews
        db.query(`
            SELECT r.rating, r.comment, r.created_at,
                   p.name_fr AS product_name,
                   u.name    AS user_name
            FROM review r
            LEFT JOIN product p ON p.id = r.product_id
            LEFT JOIN "user" u ON u.id = r.user_id
            WHERE r.rating <= 2
            ORDER BY r.created_at DESC
            LIMIT 10
        `),

        // Recent positive reviews
        db.query(`
            SELECT r.rating, r.comment, r.created_at,
                   p.name_fr AS product_name
            FROM review r
            LEFT JOIN product p ON p.id = r.product_id
            WHERE r.rating >= 4
            ORDER BY r.created_at DESC
            LIMIT 5
        `),

        // Products with worst average rating (min 2 reviews)
        db.query(`
            SELECT p.name_fr,
                   ROUND(AVG(r.rating)::numeric, 1) AS avg_rating,
                   COUNT(r.id)                       AS review_count
            FROM product p
            JOIN review r ON r.product_id = p.id
            WHERE p.is_active = true
            GROUP BY p.id, p.name_fr
            HAVING COUNT(r.id) >= 2
            ORDER BY avg_rating ASC
            LIMIT 5
        `),
    ]);

    return {
        summary: summary.rows[0],
        negative_reviews: negative.rows,
        positive_reviews: positive.rows,
        worst_rated_products: worstProducts.rows,
    };
}

async function fetchEmailContext() {
    const { rows: products } = await db.query(`
        SELECT p.name_fr, MIN(pv.price)::numeric AS price
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id AND pv.is_active = true
        WHERE p.is_active = true AND p.is_featured = true
        GROUP BY p.id, p.name_fr
        ORDER BY RANDOM()
        LIMIT 8
    `);
    return { products };
}

async function fetchFAQContext() {
    const { rows: complaints } = await db.query(`
        SELECT complaint_type, COUNT(*) AS frequency,
               STRING_AGG(message, ' | ' ORDER BY created_at DESC) AS sample_messages
        FROM complaint
        WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY complaint_type
        ORDER BY frequency DESC
        LIMIT 6
    `);
    return { complaints };
}

async function fetchGeneralOverview() {
    const [orders, products, users, complaints] = await Promise.all([
        db.query(`
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(total_price), 0)                                    AS revenue,
                   COUNT(*) FILTER (WHERE status = 'en_attente')                    AS pending,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
            FROM "order"
        `),
        db.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE is_active = true)   AS active,
                   COUNT(*) FILTER (WHERE is_featured = true) AS featured
            FROM product
        `),
        db.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
            FROM "user" WHERE role = 'user'
        `),
        db.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status IN ('en_attente', 'urgente', 'en_retard')) AS need_attention
            FROM complaint
        `),
    ]);

    return {
        orders: orders.rows[0],
        products: products.rows[0],
        users: users.rows[0],
        complaints: complaints.rows[0],
    };
}

// ─────────────────────────────────────────────────────────────
// MAIN CONTROLLER
// ─────────────────────────────────────────────────────────────
export const adminAIChat = catchAsyncErrors(async (req, res) => {
    const { message } = req.body;

    if (!message || message.trim().length < 3) {
        return res.status(400).json({ message: 'Message trop court ou manquant.' });
    }

    const intent = detectIntent(message);
    console.log(`[AI Admin] Intent: ${intent} | Message: "${message}"`);

    // Fetch data + call AI service in parallel where possible
    let data, aiResponse;

    switch (intent) {
        case 'orders':
            data = await fetchOrders();
            aiResponse = await analyzeOrders(data, message);
            break;
        case 'products':
            data = await fetchProducts();
            aiResponse = await analyzeProducts(data, message);
            break;
        case 'users':
            data = await fetchUsers();
            aiResponse = await analyzeUsers(data, message);
            break;
        case 'complaints':
            data = await fetchComplaints();
            aiResponse = await analyzeComplaints(data, message);
            break;
        case 'reviews':
            data = await fetchReviews();
            aiResponse = await analyzeReviews(data, message);
            break;
        case 'email':
            data = await fetchEmailContext();
            aiResponse = await generateEmailCampaign(data, message);
            break;
        case 'faq':
            data = await fetchFAQContext();
            aiResponse = await generateFAQ(data, message);
            break;
        default:
            data = await fetchGeneralOverview();
            aiResponse = await analyzeGeneral(data, message);
    }

    return res.status(200).json({ ...aiResponse, intent });
});