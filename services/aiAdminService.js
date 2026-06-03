// services/aiAdminService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import Order       from '../models/Order.js';
import Product     from '../models/Product.js';
import User        from '../models/User.js';
import Reclamation from '../models/Reclamation.js';
import Review      from '../models/Review.js';

import {
    fallbackOrders, fallbackProducts, fallbackUsers,
    fallbackComplaints, fallbackReviews,
    fallbackGeneral, fallbackEmail, fallbackFAQ,
} from './AdminFallbackService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
});
const modelLong = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4000 },
});

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 1;

const THRESHOLDS = {
    cancellation_rate:    15,
    pending_orders:       20,
    low_delivery_rate:    0.3,
    revenue_drop_factor:  0.7,
    inactivity_days:      60,
    low_verification:     0.5,
    low_new_users_week:   2,
    low_stock_count:      5,
    unsold_products:      3,
    resolution_rate_min:  0.5,
    refund_pressure:      5,
    complaints_attention: 5,
    negative_review_rate: 0.2,
    min_avg_rating:       3.5,
};

function parseJSON(raw) {
    try {
        return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
        return { reply: "❌ Erreur d'analyse IA. Veuillez reformuler votre question.", highlights: [] };
    }
}

const SYSTEM_PROMPT = `You are a senior Business Intelligence analyst for GOFFA, a Tunisian artisanal e-commerce platform targeting Swiss customers.

RULES:
- Use ONLY the provided BI data
- NEVER invent numbers or trends
- If data is missing, say "données insuffisantes"
- Use ONLY pre-calculated values, do not compute new ones
- Be concise, factual, and actionable

OUTPUT MUST BE STRICT JSON:
{
  "reply": "French business analysis. Use **bold** for titles, • for bullets, emojis. Focus on insights not raw numbers.",
  "highlights": [
    { "label": "KPI name", "value": "formatted value", "trend": null, "color": "blue|emerald|red|amber|violet|orange" }
  ]
}
highlights MUST be derived strictly from kpis or alerts. Max 4 highlights. Return [] if not applicable.`;

function getAnalysisMode(question) {
    if (/pourquoi|cause|baisse|hausse|expliqu/i.test(question))    return 'explanatory';
    if (/combien|total|nombre|chiffre|montant/i.test(question))    return 'descriptive';
    if (/risque|problème|alerte|urgence|anomalie/i.test(question)) return 'diagnostic';
    return 'general';
}

function buildPrompt(question, biContext, extraContext = '') {
    const mode = getAnalysisMode(question);
    return `${SYSTEM_PROMPT}

ANALYSIS MODE: ${mode}

USER QUESTION:
${question}

${extraContext ? `CONTEXT:\n${extraContext}\n` : ''}
BI DATA:
${JSON.stringify(biContext)}`;
}

// ─────────────────────────────────────────────────────────────
// 1. ORDERS
// ─────────────────────────────────────────────────────────────
function buildOrdersBIContext(summary, byStatus, byPayment, recentOrders, topProducts) {
    const totalOrders = Number(summary.total_orders);
    const revenue     = Number(summary.total_revenue);
    const revenue30d  = Number(summary.revenue_this_month);
    const revenue7d   = Number(summary.revenue_this_week);
    const orders7d    = Number(summary.orders_this_week);
    const orders30d   = Number(summary.orders_this_month);

    const statusMap = Object.fromEntries(byStatus.map(r => [r.status, Number(r.count)]));
    const cancelled = statusMap['annulee']    || 0;
    const pending   = statusMap['en_attente'] || 0;
    const delivered = statusMap['livree']     || 0;

    const cancellationRate = totalOrders > 0 ? Math.round((cancelled / totalOrders) * 100) : 0;

    return {
        kpis: {
            total_orders:  totalOrders,
            total_revenue: `${revenue.toFixed(2)} CHF`,
            avg_basket:    `${Number(summary.avg_basket).toFixed(2)} CHF`,
            orders_7d:     orders7d,
            orders_30d:    orders30d,
            revenue_7d:    `${revenue7d.toFixed(2)} CHF`,
            revenue_30d:   `${revenue30d.toFixed(2)} CHF`,
        },
        breakdowns: {
            by_status:  byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
            by_payment: byPayment.map(r => ({ status: r.payment_status, count: Number(r.count), total: `${Number(r.total).toFixed(2)} CHF` })),
        },
        top: {
            products:      topProducts.map(p => ({ name: p.product_name, qty: Number(p.total_qty), revenue: `${Number(p.total_revenue).toFixed(2)} CHF` })),
            recent_orders: recentOrders.slice(0, 5).map(o => ({ order_number: o.order_number, status: o.status, payment_status: o.payment_status, total: `${Number(o.total_price).toFixed(2)} CHF`, city: o.shipping_city })),
        },
        alerts: {
            high_cancellation_rate: cancellationRate > THRESHOLDS.cancellation_rate,
            many_pending_orders:    pending > THRESHOLDS.pending_orders,
            low_delivery_rate:      totalOrders > 0 && (delivered / totalOrders) < THRESHOLDS.low_delivery_rate,
            revenue_drop_this_week: revenue7d < (revenue30d / 4) * THRESHOLDS.revenue_drop_factor,
        },
    };
}

export const analyzeOrders = async (question) => {
    const cacheKey = `orders_${question.slice(0, 40)}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [summary, byStatus, byPayment, recentOrders, topProducts] = await Promise.all([
        Order.getOrderSummaryBI(),
        Order.getOrdersByStatus(),
        Order.getOrdersByPaymentStatus(),
        Order.getRecentOrdersWithClient(10),
        Order.getTopSellingProducts(5),
    ]);

    const biContext    = buildOrdersBIContext(summary, byStatus, byPayment, recentOrders, topProducts);
    const extraContext = `Order statuses: en_attente=pending, confirmee=confirmed, en_preparation=preparing, expediee=shipped, livree=delivered, annulee=cancelled, remboursee=refunded, en_reclamation=complaint, retournee=returned.
Payment statuses: en_attente=pending, paye=paid, echoue=failed, rembourse=refunded. Currency: CHF.`;

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext, extraContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text()); // ✅ pas de const — on assigne le let du dessus
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (orders):', err.message);
        parsed = fallbackOrders(biContext);
    }

    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 2. PRODUCTS
// ─────────────────────────────────────────────────────────────
function buildProductsBIContext(lowStock, lowSales, topViewed, byCategory, topRated) {
    const criticalStock = lowStock.filter(p => Number(p.min_variant_stock) === 0);
    const warningStock  = lowStock.filter(p => Number(p.min_variant_stock) > 0);

    return {
        kpis: {
            low_stock_count:      lowStock.length,
            critical_stock_count: criticalStock.length,
            low_sales_count:      lowSales.filter(p => Number(p.qty_sold_this_month) === 0).length,
        },
        breakdowns: {
            by_category: byCategory.map(c => ({ category: c.category, product_count: Number(c.product_count), total_sold: Number(c.total_sold) })),
        },
        top: {
            low_stock_critical: criticalStock.slice(0, 5).map(p => ({ name: p.name_fr, min_variant_stock: Number(p.min_variant_stock), total_stock: Number(p.total_stock) })),
            low_stock_warning:  warningStock.slice(0, 5).map(p => ({ name: p.name_fr, min_variant_stock: Number(p.min_variant_stock) })),
            low_sales:          lowSales.slice(0, 5).map(p => ({ name: p.name_fr, qty_sold: Number(p.qty_sold_this_month) })),
            most_viewed:        topViewed.slice(0, 5).map(p => ({ name: p.name_fr, views: Number(p.views_count), rating: p.rating_avg })),
            top_rated:          topRated.map(p => ({ name: p.name_fr, rating: p.rating_avg, review_count: Number(p.rating_count) })),
        },
        alerts: {
            out_of_stock:         criticalStock.length > 0,
            many_low_stock:       lowStock.length > THRESHOLDS.low_stock_count,
            many_unsold_products: lowSales.filter(p => Number(p.qty_sold_this_month) === 0).length > THRESHOLDS.unsold_products,
        },
    };
}

export const analyzeProducts = async (question) => {
    const cacheKey = `products_${question.slice(0, 40)}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [lowStock, lowSales, topViewed, byCategory, topRated] = await Promise.all([
        Product.getLowStockProducts(5),
        Product.getLowSalesProducts(30),
        Product.getMostViewedProducts(10),
        Product.getProductsByCategory(),
        Product.getTopRatedProducts(5, 2),
    ]);

    const biContext    = buildProductsBIContext(lowStock, lowSales, topViewed, byCategory, topRated);
    const extraContext = `Context: Artisanal Tunisian goods (pottery, textiles, spices, cosmetics, honey, olive oil).
Low stock = min variant stock < 5 units. Critical = 0 units. Low sales = less than 3 orders this month.`;

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext, extraContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (products):', err.message);
        parsed = fallbackProducts(biContext);
    }

    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 3. USERS
// ─────────────────────────────────────────────────────────────
function buildUsersBIContext(summary, topClients, newUsers, inactive) {
    const total    = Number(summary.total_users);
    const active   = Number(summary.active_users);
    const verified = Number(summary.verified_users);

    return {
        kpis: {
            total_users:       total,
            active_users:      active,
            verified_users:    verified,
            new_this_week:     Number(summary.new_this_week),
            new_this_month:    Number(summary.new_this_month),
            activation_rate:   total > 0 ? `${Math.round((active   / total) * 100)}%` : '0%',
            verification_rate: total > 0 ? `${Math.round((verified / total) * 100)}%` : '0%',
        },
        top: {
            clients_by_spend: topClients.map(c => ({ name: c.name, city: c.city, order_count: Number(c.order_count), total_spent: `${Number(c.total_spent).toFixed(2)} CHF` })),
            new_users:        newUsers.slice(0, 5).map(u => ({ name: u.name, city: u.city, is_verified: u.is_verified, joined_at: u.created_at })),
            inactive_clients: inactive.slice(0, 5).map(u => ({ name: u.name, last_order_at: u.last_order_at, total_orders: Number(u.total_orders) })),
        },
        alerts: {
            high_inactivity:       inactive.length >= 10,
            low_verification_rate: total > 0 && (verified / total) < THRESHOLDS.low_verification,
            low_new_users_week:    Number(summary.new_this_week) < THRESHOLDS.low_new_users_week,
        },
    };
}

export const analyzeUsers = async (question) => {
    const [summary, topClients, newUsers, inactive] = await Promise.all([
        User.getUserSummaryBI(),
        User.getTopClientsBySpend(5),
        User.getNewUsers(7, 10),
        User.getInactiveClients(60, 10),
    ]);

    const biContext    = buildUsersBIContext(summary, topClients, newUsers, inactive);
    const extraContext = `Context: Customers are mainly Swiss buyers. Inactive = no order in 60+ days. Currency: CHF.`;

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext, extraContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (users):', err.message);
        parsed = fallbackUsers(biContext);
    }

    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 4. COMPLAINTS
// ─────────────────────────────────────────────────────────────
function buildComplaintsBIContext(summary, byType, byStatus, recent, overdue) {
    const total    = Number(summary.total);
    const resolved = Number(summary.resolved);

    return {
        kpis: {
            total:           total,
            pending:         Number(summary.pending),
            urgent:          Number(summary.urgent),
            overdue:         Number(summary.overdue),
            resolved:        resolved,
            this_week:       Number(summary.this_week),
            with_refund:     Number(summary.with_refund_request),
            resolution_rate: total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%',
        },
        breakdowns: {
            by_type:   byType.map(r => ({ type: r.complaint_type, count: Number(r.count) })),
            by_status: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
        },
        top: {
            overdue_complaints: overdue.map(c => ({ type: c.complaint_type, status: c.status, deadline_at: c.deadline_at, user: c.user_name })),
            recent_complaints:  recent.slice(0, 5).map(c => ({ type: c.complaint_type, status: c.status, refundable: c.refundable, order_number: c.order_number })),
        },
        alerts: {
            has_overdue:         overdue.length > 0,
            has_urgent:          Number(summary.urgent) > 0,
            low_resolution_rate: total > 0 && (resolved / total) < THRESHOLDS.resolution_rate_min,
            refund_pressure:     Number(summary.with_refund_request) > THRESHOLDS.refund_pressure,
        },
    };
}

export const analyzeComplaints = async (question) => {
    const cacheKey = `complaints_${question.slice(0, 40)}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [summary, byType, byStatus, recent, overdue] = await Promise.all([
        Reclamation.getComplaintSummaryBI(),
        Reclamation.getComplaintsByType(),
        Reclamation.getComplaintsByStatus(),
        Reclamation.getRecentComplaints(15),
        Reclamation.getOverdueComplaints(5),
    ]);

    const biContext    = buildComplaintsBIContext(summary, byType, byStatus, recent, overdue);
    const extraContext = `Complaint types: produit_defectueux=defective, commande_non_recue=not received, produit_incorrect=wrong product, retard_livraison=late delivery, remboursement=refund, autre=other.
Statuses: en_attente=pending, en_cours=in progress, urgente=urgent, en_retard=overdue, resolue=resolved, rejetee=rejected.`;

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext, extraContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (complaints):', err.message);
        parsed = fallbackComplaints(biContext);
    }

    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 5. REVIEWS
// ─────────────────────────────────────────────────────────────
function buildReviewsBIContext(summary, negative, positive, worstProducts) {
    const total    = Number(summary.total_reviews);
    const negCount = Number(summary.negative_count);
    const posCount = Number(summary.positive_count);

    return {
        kpis: {
            total_reviews:  total,
            avg_rating:     summary.avg_rating,
            negative_count: negCount,
            neutral_count:  Number(summary.neutral_count),
            positive_count: posCount,
            this_week:      Number(summary.this_week),
            negative_rate:  total > 0 ? `${Math.round((negCount / total) * 100)}%` : '0%',
            positive_rate:  total > 0 ? `${Math.round((posCount / total) * 100)}%` : '0%',
        },
        top: {
            worst_products:   worstProducts.map(p => ({ name: p.name_fr, avg_rating: p.avg_rating, review_count: Number(p.review_count) })),
            negative_reviews: negative.slice(0, 5).map(r => ({ product: r.product_name, rating: r.rating, comment: r.comment?.slice(0, 120) })),
            positive_reviews: positive.slice(0, 3).map(r => ({ product: r.product_name, rating: r.rating, comment: r.comment?.slice(0, 80) })),
        },
        alerts: {
            high_negative_rate:   total > 0 && (negCount / total) > THRESHOLDS.negative_review_rate,
            avg_rating_low:       Number(summary.avg_rating) < THRESHOLDS.min_avg_rating,
            products_need_action: worstProducts.length > 0,
        },
    };
}

export const analyzeReviews = async (question) => {
    const cacheKey = `reviews_${question.slice(0, 40)}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [summary, negative, positive, worstProducts] = await Promise.all([
        Review.getReviewSummaryBI(),
        Review.getNegativeReviews(10),
        Review.getPositiveReviews(5),
        Review.getWorstRatedProducts(5, 2),
    ]);

    const biContext    = buildReviewsBIContext(summary, negative, positive, worstProducts);
    const extraContext = `Ratings: 1-2=negative, 3=neutral, 4-5=positive. Max rating = 5.`;

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext, extraContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (reviews):', err.message);
        parsed = fallbackReviews(biContext);
    }

    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 6. EMAIL CAMPAIGN
// ─────────────────────────────────────────────────────────────
export const generateEmailCampaign = async (question) => {
    try {
        const products = await Product.getFeaturedProductsForEmail(8);

        const prompt = `You are a professional marketing copywriter for GOFFA, a Tunisian artisanal e-commerce brand targeting Swiss customers.
The admin asked: "${question}"

Available featured products:
${JSON.stringify(products.map(p => ({ name: p.name_fr, price: `${Number(p.price).toFixed(2)} CHF` })), null, 2)}

Write a compelling marketing email in French. Keep it warm, authentic, and professional.

Respond ONLY with valid JSON:
{
  "reply": "Brief confirmation in French that the email was generated.",
  "highlights": [],
  "email": {
    "subject": "Subject line max 60 chars with 1 emoji",
    "preview_text": "Preview text max 90 chars",
    "body": "Full email body in French. Greeting, main offer, product highlights, CTA, sign-off. Use line breaks."
  }
}`;

        const result = await modelLong.generateContent(prompt);
        return parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (email):', err.message);
        return fallbackEmail();
    }
};

// ─────────────────────────────────────────────────────────────
// 7. FAQ
// ─────────────────────────────────────────────────────────────
export const generateFAQ = async (question) => {
    try {
        const complaints = await Reclamation.getFrequentComplaintTypes(90, 6);

        const cleanedComplaints = complaints.map(c => ({
            type:      c.complaint_type,
            frequency: Number(c.frequency),
            samples:   c.sample_messages?.split(' | ').slice(0, 2).map(m => m.slice(0, 100)),
        }));

        const prompt = `You are a customer support specialist for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Most frequent complaint types (last 90 days):
${JSON.stringify(cleanedComplaints, null, 2)}

Generate 5 FAQ entries in French based on these recurring issues.
Valid categories: livraison, paiement, produits, retours, autre

Respond ONLY with valid JSON:
{
  "reply": "Brief summary in French of what FAQs were generated and why.",
  "highlights": [],
  "faqs": [
    {
      "question_fr": "Question in French",
      "answer_fr": "Clear helpful answer in French (2-3 sentences)",
      "category": "livraison|paiement|produits|retours|autre"
    }
  ]
}`;

        const result = await modelLong.generateContent(prompt);
        return parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (faq):', err.message);
        return fallbackFAQ();
    }
};

// ─────────────────────────────────────────────────────────────
// 8. GENERAL OVERVIEW
// ─────────────────────────────────────────────────────────────
function buildGeneralBIContext(orders, products, users, complaints) {
    return {
        kpis: {
            total_orders:              Number(orders.total),
            total_revenue:             `${Number(orders.revenue).toFixed(2)} CHF`,
            orders_30d:                Number(orders.this_month),
            pending_orders:            Number(orders.pending),
            total_products:            Number(products.total),
            active_products:           Number(products.active),
            total_users:               Number(users.total),
            new_users_7d:              Number(users.new_this_week),
            total_complaints:          Number(complaints.total),
            complaints_need_attention: Number(complaints.need_attention),
        },
        alerts: {
            pending_orders_high:       Number(orders.pending) > THRESHOLDS.pending_orders,
            complaints_need_attention: Number(complaints.need_attention) > THRESHOLDS.complaints_attention,
            low_active_products:       Number(products.active) < Number(products.total) * 0.5,
        },
    };
}

export const analyzeGeneral = async (question) => {
    const [orders, products, users, complaints] = await Promise.all([
        Order.getGeneralOverviewBI(),
        Product.getProductOverviewBI(),
        User.getUserOverviewBI(),
        Reclamation.getComplaintOverviewBI(),
    ]);

    const biContext = buildGeneralBIContext(orders, products, users, complaints);

    let parsed;
    try {
        const prompt = buildPrompt(question, biContext);
        const result = await model.generateContent(prompt);
        parsed = parseJSON(result.response.text());
    } catch (err) {
        console.warn('[AI Fallback] Gemini indisponible (general):', err.message);
        parsed = fallbackGeneral(biContext);
    }

    return parsed;
};