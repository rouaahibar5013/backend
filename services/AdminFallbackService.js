// services/aiFallbackService.js
// Réponses BI locales quand Gemini est indisponible (réseau, quota, timeout…)
// Aucun appel réseau — tout est calculé à partir des données déjà fetchées.

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function pct(num, den) {
    if (!den || den === 0) return '0%';
    return `${Math.round((Number(num) / Number(den)) * 100)}%`;
}

function chf(val) {
    return `${Number(val).toFixed(2)} CHF`;
}

function color(condition, onTrue = 'red', onFalse = 'emerald') {
    return condition ? onTrue : onFalse;
}

// ─────────────────────────────────────────────────────────────
// 1. ORDERS FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackOrders(biContext) {
    const { kpis, breakdowns, top, alerts } = biContext;

    const lines = [
        `**📦 Vue d'ensemble des commandes**`,
        `• Total commandes : **${kpis.total_orders}** | Revenu global : **${kpis.total_revenue}**`,
        `• Panier moyen : **${kpis.avg_basket}** | Commandes 7j : **${kpis.orders_7d}** | 30j : **${kpis.orders_30d}**`,
        `• Revenus 7j : **${kpis.revenue_7d}** | Revenus 30j : **${kpis.revenue_30d}**`,
    ];

    if (breakdowns.by_status?.length) {
        lines.push(`\n**📊 Répartition par statut :**`);
        breakdowns.by_status.forEach(s => lines.push(`• ${s.status} : ${s.count}`));
    }

    if (top.products?.length) {
        lines.push(`\n**🏆 Top produits vendus :**`);
        top.products.slice(0, 3).forEach((p, i) =>
            lines.push(`• #${i + 1} ${p.name} — ${p.qty} unités — ${p.revenue}`)
        );
    }

    const alertLines = [];
    if (alerts.high_cancellation_rate) alertLines.push("⚠️ Taux d'annulation élevé");
    if (alerts.many_pending_orders)    alertLines.push('⏳ Nombreuses commandes en attente');
    if (alerts.low_delivery_rate)      alertLines.push('🚨 Taux de livraison faible');
    if (alerts.revenue_drop_this_week) alertLines.push('📉 Baisse de revenu cette semaine');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'Commandes totales',  value: String(kpis.total_orders),  trend: null, color: 'blue' },
        { label: 'Revenu total',       value: kpis.total_revenue,         trend: null, color: 'emerald' },
        { label: 'Revenu 7 jours',     value: kpis.revenue_7d,            trend: null, color: alerts.revenue_drop_this_week ? 'red' : 'blue' },
        { label: 'Panier moyen',       value: kpis.avg_basket,            trend: null, color: 'violet' },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 2. PRODUCTS FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackProducts(biContext) {
    const { kpis, breakdowns, top, alerts } = biContext;

    const lines = [
        `**🛍️ Vue d'ensemble des produits**`,
        `• Produits en stock faible : **${kpis.low_stock_count}** dont **${kpis.critical_stock_count}** en rupture totale`,
        `• Produits sans vente ce mois : **${kpis.low_sales_count}**`,
    ];

    if (top.low_stock_critical?.length) {
        lines.push(`\n**🚨 Ruptures de stock :**`);
        top.low_stock_critical.forEach(p =>
            lines.push(`• ${p.name_fr} — stock min variant : ${p.min_variant_stock} | total : ${p.total_stock}`)
        );
    }

    if (top.low_sales?.length) {
        lines.push(`\n**📉 Produits sans vente :**`);
        top.low_sales.slice(0, 3).forEach(p =>
            lines.push(`• ${p.name_fr} — ${p.qty_sold} vendu(s) ce mois`)
        );
    }

    if (top.most_viewed?.length) {
        lines.push(`\n**👁️ Les plus consultés :**`);
        top.most_viewed.slice(0, 3).forEach(p =>
            lines.push(`• ${p.name_fr} — ${p.views} vues — note : ${p.rating}`)
        );
    }

    if (breakdowns.by_category?.length) {
        lines.push(`\n**📂 Par catégorie :**`);
        breakdowns.by_category.forEach(c =>
            lines.push(`• ${c.category} : ${c.product_count} produits — ${c.total_sold} vendus`)
        );
    }

    const alertLines = [];
    if (alerts.out_of_stock)         alertLines.push('🚨 Ruptures de stock détectées');
    if (alerts.many_low_stock)       alertLines.push('⚠️ Nombreux produits en stock faible');
    if (alerts.many_unsold_products) alertLines.push('📦 Plusieurs produits sans vente ce mois');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'En rupture',      value: String(kpis.critical_stock_count), trend: null, color: color(kpis.critical_stock_count > 0) },
        { label: 'Stock faible',    value: String(kpis.low_stock_count),       trend: null, color: color(alerts.many_low_stock, 'amber', 'blue') },
        { label: 'Sans vente',      value: String(kpis.low_sales_count),       trend: null, color: color(alerts.many_unsold_products, 'orange', 'emerald') },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 3. USERS FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackUsers(biContext) {
    const { kpis, top, alerts } = biContext;

    const lines = [
        `**👥 Vue d'ensemble des utilisateurs**`,
        `• Total : **${kpis.total_users}** | Actifs : **${kpis.active_users}** (${kpis.activation_rate})`,
        `• Vérifiés : **${kpis.verified_users}** (${kpis.verification_rate})`,
        `• Nouveaux 7j : **${kpis.new_this_week}** | 30j : **${kpis.new_this_month}**`,
    ];

    if (top.clients_by_spend?.length) {
        lines.push(`\n**💎 Top clients :**`);
        top.clients_by_spend.slice(0, 3).forEach((c, i) =>
            lines.push(`• #${i + 1} ${c.name} (${c.city}) — ${c.order_count} commandes — ${c.total_spent}`)
        );
    }

    if (top.inactive_clients?.length) {
        lines.push(`\n**💤 Clients inactifs (60j+) :**`);
        top.inactive_clients.slice(0, 3).forEach(u =>
            lines.push(`• ${u.name} — dernière commande : ${u.last_order_at ? new Date(u.last_order_at).toLocaleDateString('fr-FR') : 'N/A'}`)
        );
    }

    const alertLines = [];
    if (alerts.high_inactivity)       alertLines.push('💤 Forte inactivité client détectée');
    if (alerts.low_verification_rate) alertLines.push('📧 Taux de vérification faible');
    if (alerts.low_new_users_week)    alertLines.push('📉 Peu de nouvelles inscriptions cette semaine');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'Utilisateurs totaux',  value: String(kpis.total_users),    trend: null, color: 'blue' },
        { label: 'Taux d\'activation',   value: kpis.activation_rate,        trend: null, color: 'emerald' },
        { label: 'Taux de vérification', value: kpis.verification_rate,      trend: null, color: color(alerts.low_verification_rate) },
        { label: 'Nouveaux 7j',          value: String(kpis.new_this_week),  trend: null, color: color(alerts.low_new_users_week, 'amber', 'blue') },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 4. COMPLAINTS FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackComplaints(biContext) {
    const { kpis, breakdowns, top, alerts } = biContext;

    const lines = [
        `**⚠️ Vue d'ensemble des réclamations**`,
        `• Total : **${kpis.total}** | En attente : **${kpis.pending}** | Urgentes : **${kpis.urgent}**`,
        `• En retard : **${kpis.overdue}** | Résolues : **${kpis.resolved}** | Taux résolution : **${kpis.resolution_rate}**`,
        `• Cette semaine : **${kpis.this_week}** | Avec demande remboursement : **${kpis.with_refund}**`,
    ];

    if (breakdowns.by_type?.length) {
        lines.push(`\n**📂 Par type :**`);
        breakdowns.by_type.forEach(r => lines.push(`• ${r.type} : ${r.count}`));
    }

    if (top.overdue_complaints?.length) {
        lines.push(`\n**🚨 Réclamations en retard :**`);
        top.overdue_complaints.slice(0, 3).forEach(c =>
            lines.push(`• [${c.type}] ${c.user} — deadline : ${c.deadline_at ? new Date(c.deadline_at).toLocaleDateString('fr-FR') : 'N/A'}`)
        );
    }

    const alertLines = [];
    if (alerts.has_overdue)         alertLines.push('🚨 Réclamations en retard — action requise');
    if (alerts.has_urgent)          alertLines.push('🔴 Réclamations urgentes non traitées');
    if (alerts.low_resolution_rate) alertLines.push('📉 Taux de résolution insuffisant');
    if (alerts.refund_pressure)     alertLines.push('💸 Forte pression sur les remboursements');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'Réclamations totales', value: String(kpis.total),             trend: null, color: 'blue' },
        { label: 'Urgentes',             value: String(kpis.urgent),            trend: null, color: color(kpis.urgent > 0) },
        { label: 'En retard',            value: String(kpis.overdue),           trend: null, color: color(kpis.overdue > 0) },
        { label: 'Taux résolution',      value: kpis.resolution_rate,           trend: null, color: color(alerts.low_resolution_rate) },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 5. REVIEWS FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackReviews(biContext) {
    const { kpis, top, alerts } = biContext;

    const lines = [
        `**⭐ Vue d'ensemble des avis**`,
        `• Total avis : **${kpis.total_reviews}** | Note moyenne : **${kpis.avg_rating}/5**`,
        `• Positifs : **${kpis.positive_count}** (${kpis.positive_rate}) | Négatifs : **${kpis.negative_count}** (${kpis.negative_rate})`,
        `• Cette semaine : **${kpis.this_week}**`,
    ];

    if (top.worst_products?.length) {
        lines.push(`\n**📉 Produits les moins bien notés :**`);
        top.worst_products.slice(0, 3).forEach(p =>
            lines.push(`• ${p.name_fr} — ${p.avg_rating}/5 (${p.review_count} avis)`)
        );
    }

    if (top.negative_reviews?.length) {
        lines.push(`\n**💬 Derniers avis négatifs :**`);
        top.negative_reviews.slice(0, 3).forEach(r =>
            lines.push(`• [${r.rating}⭐] ${r.product} — "${r.comment}"`)
        );
    }

    const alertLines = [];
    if (alerts.high_negative_rate)   alertLines.push("🚨 Taux d'avis négatifs élevé");
    if (alerts.avg_rating_low)       alertLines.push('📉 Note moyenne globale insuffisante');
    if (alerts.products_need_action) alertLines.push('⚠️ Des produits nécessitent une attention');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'Note moyenne',     value: `${kpis.avg_rating}/5`,        trend: null, color: color(alerts.avg_rating_low) },
        { label: 'Avis positifs',    value: kpis.positive_rate,            trend: null, color: 'emerald' },
        { label: 'Avis négatifs',    value: kpis.negative_rate,            trend: null, color: color(alerts.high_negative_rate) },
        { label: 'Total avis',       value: String(kpis.total_reviews),    trend: null, color: 'blue' },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 6. GENERAL FALLBACK
// ─────────────────────────────────────────────────────────────
export function fallbackGeneral(biContext) {
    const { kpis, alerts } = biContext;

    const lines = [
        `**📊 Tableau de bord GOFFA — Vue générale**`,
        `• Commandes : **${kpis.total_orders}** | Revenu total : **${kpis.total_revenue}**`,
        `• Commandes 30j : **${kpis.orders_30d}** | En attente : **${kpis.pending_orders}**`,
        `• Produits : **${kpis.total_products}** dont **${kpis.active_products}** actifs`,
        `• Utilisateurs : **${kpis.total_users}** | Nouveaux 7j : **${kpis.new_users_7d}**`,
        `• Réclamations : **${kpis.total_complaints}** dont **${kpis.complaints_need_attention}** nécessitent une action`,
    ];

    const alertLines = [];
    if (alerts.pending_orders_high)       alertLines.push('⏳ Commandes en attente en excès');
    if (alerts.complaints_need_attention) alertLines.push('⚠️ Réclamations nécessitant attention');
    if (alerts.low_active_products)       alertLines.push('📦 Moins de 50% des produits sont actifs');

    if (alertLines.length) {
        lines.push(`\n**🔔 Alertes :**`);
        alertLines.forEach(a => lines.push(`• ${a}`));
    }

    const highlights = [
        { label: 'Commandes totales',    value: String(kpis.total_orders),             trend: null, color: 'blue' },
        { label: 'Revenu total',         value: kpis.total_revenue,                    trend: null, color: 'emerald' },
        { label: 'Utilisateurs',         value: String(kpis.total_users),              trend: null, color: 'violet' },
        { label: 'Réclamations',         value: String(kpis.complaints_need_attention), trend: null, color: color(alerts.complaints_need_attention) },
    ];

    return { reply: lines.join('\n'), highlights };
}

// ─────────────────────────────────────────────────────────────
// 7. EMAIL / FAQ — pas de données BI dispo → message clair
// ─────────────────────────────────────────────────────────────
export function fallbackEmail() {
    return {
        reply: '⚠️ L\'assistant IA est temporairement indisponible. La génération d\'email nécessite le service IA — veuillez réessayer dans quelques instants.',
        highlights: [],
    };
}

export function fallbackFAQ() {
    return {
        reply: '⚠️ L\'assistant IA est temporairement indisponible. La génération de FAQ nécessite le service IA — veuillez réessayer dans quelques instants.',
        highlights: [],
    };
}