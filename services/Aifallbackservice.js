// services/aiFallbackService.js
// ═══════════════════════════════════════════════════════════════
// MODE SECOURS — Recommandation locale contextuelle sans IA externe
//
// Activé automatiquement si Gemini est indisponible.
// Contrairement à un simple tri par ai_score global, ce fallback
// recalcule un score contextuel par produit en combinant :
//
//   [A] ai_score DB          — pertinence full-text PostgreSQL (0–1)
//   [B] correspondance mots-clés — matching demande vs nom/description/ingrédients
//   [C] bonus catégorie      — produit dans la bonne catégorie détectée
//
// Score final = A*40 + B*40 + C*20  →  normalisé [100 → 60]
// ═══════════════════════════════════════════════════════════════

import Product from '../models/Product.js';

// ───────────────────────────────────────────────────────────────
// Scoring contextuel
// ───────────────────────────────────────────────────────────────

/**
 * Calcule un score contextuel pour un produit donné.
 *
 * @param {Object}   produit     - Produit du catalogueReduit ({ id, nom, description, ingredients, categorie, ai_score })
 * @param {string[]} motsCles    - Mots-clés extraits de la demande (déjà normalisés, sans accents)
 * @param {number[]} categoryIds - IDs catégorie détectés (null si intent=general)
 *
 * @returns {number} Score entre 0 et 100
 */
const scorerProduit = (produit, motsCles, categoryIds) => {

  // ── [A] ai_score DB (0–1) → contribution max 40 pts ────────
  const scoreDB = (parseFloat(produit.ai_score) || 0) * 40;

  // ── [B] Correspondance mots-clés → contribution max 40 pts ─
  let scoreKeywords = 0;

  if (motsCles && motsCles.length > 0) {
    // Texte searchable du produit (sans accents, lowercase)
    const texteProduit = [
      produit.nom          || '',
      produit.description  || '',
      produit.ingredients  || '',
      produit.categorie    || '',
    ]
      .join(' ')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const matchCount  = motsCles.filter(kw => texteProduit.includes(kw)).length;
    const matchRatio  = matchCount / motsCles.length;           // 0 → 1
    scoreKeywords     = matchRatio * 40;
  }

  // ── [C] Bonus catégorie → 20 pts si catégorie correcte ─────
  const bonusCategorie = (categoryIds && categoryIds.includes(produit.id))
    ? 20
    : 0;

  const total = scoreDB + scoreKeywords + bonusCategorie;

  // Plafonner à 100 (rare mais possible si tous les signaux sont max)
  return Math.min(Math.round(total), 100);
};

// ───────────────────────────────────────────────────────────────
// Normalisation scores [100 → 60] — identique à aiService.js
// ───────────────────────────────────────────────────────────────
const normaliserScoresFallback = (produits) => {
  const total = produits.length;
  return produits.map((p, index) => ({
    ...p,
    score: total === 1 ? 100 : Math.round(100 - (index * 40) / (total - 1)),
  }));
};

// ───────────────────────────────────────────────────────────────
// Messages
// ───────────────────────────────────────────────────────────────
const MESSAGE_SECOURS = (count) =>
  `Voici une sélection de ${count} produits qui pourrait correspondre à votre recherche. ` +
  `Notre assistante IA est temporairement indisponible, mais nous avons trouvé les produits les plus pertinents pour vous.`;

const SUGGESTION_SECOURS =
  "N'hésitez pas à relancer votre recherche dans quelques instants pour obtenir des recommandations entièrement personnalisées.";

const RAISON_GENERIQUE =
  'Sélectionné parmi nos produits les plus pertinents pour votre recherche.';

// ───────────────────────────────────────────────────────────────
// Export principal
// ───────────────────────────────────────────────────────────────

/**
 * Génère des recommandations locales contextuelles sans Gemini.
 *
 * @param {string} demande          - Demande originale de l'utilisateur
 * @param {Array}  catalogueReduit  - Catalogue filtré avec ai_score
 * @param {Object} [contexte]       - Contexte calculé dans aiService avant l'appel Gemini
 * @param {Error}       [contexte.erreur]      - Erreur Gemini d'origine (pour les logs)
 * @param {string[]}    [contexte.motsCles]    - Mots-clés extraits de la demande
 * @param {number[]|null} [contexte.categoryIds] - IDs catégorie détectés
 *
 * @returns {Promise<Object>} Structure identique à recommanderProduits() + fallback:true
 */
export const fallbackLocalRecommandation = async (
  demande,
  catalogueReduit,
  contexte = {}
) => {
  const { erreur = null, motsCles = [], categoryIds = null } = contexte;

  // ── Logs ────────────────────────────────────────────────────
  console.warn('[AIFallback] ⚠️  Mode secours activé');
  if (erreur) console.warn(`[AIFallback] Cause : ${erreur.message}`);
  console.info(`[AIFallback] Catalogue : ${catalogueReduit?.length ?? 0} produit(s) | Mots-clés : [${motsCles.join(', ')}] | CatIDs : ${JSON.stringify(categoryIds)}`);

  // ── Catalogue vide ──────────────────────────────────────────
  if (!catalogueReduit || catalogueReduit.length === 0) {
    return {
      message:              "Je suis désolée, aucun produit n'est disponible pour le moment. Revenez bientôt !",
      produits_recommandes: [],
      suggestion:           SUGGESTION_SECOURS,
      total:                0,
      fallback:             true,
    };
  }

  // ── Scoring contextuel + tri décroissant ────────────────────
  const produitsScores = catalogueReduit
    .map(p => ({
      ...p,
      _scoreContextuel: scorerProduit(p, motsCles, categoryIds),
    }))
    .sort((a, b) => b._scoreContextuel - a._scoreContextuel);

  // ── Top 5 ───────────────────────────────────────────────────
  const top5 = produitsScores.slice(0, 5);

  // ── Log top 5 pour debug ────────────────────────────────────
  console.info('[AIFallback] Top 5 sélectionnés :');
  top5.forEach((p, i) =>
    console.info(`  ${i + 1}. "${p.nom}" — score contextuel: ${p._scoreContextuel} (ai_score DB: ${p.ai_score})`)
  );

  // ── Enrichissement complet (prix, images, stock, promos…) ───
  const ids = top5.map(p => p.id);
  let produitsComplets = [];

  try {
    produitsComplets = await Product.findCompleteByIds(ids);
  } catch (dbErr) {
    console.error('[AIFallback] Échec enrichissement DB :', dbErr.message);
    return {
      message:              "Un problème technique temporaire nous empêche d'afficher les recommandations. Veuillez réessayer.",
      produits_recommandes: [],
      suggestion:           SUGGESTION_SECOURS,
      total:                0,
      fallback:             true,
    };
  }

  // ── Assemblage avec scores normalisés [100 → 60] ────────────
  const avantNormalisation = top5
    .map(p => {
      const complet = produitsComplets.find(c => c.id === p.id);
      if (!complet) {
        console.warn(`[AIFallback] Produit "${p.id}" introuvable après enrichissement — ignoré`);
        return null;
      }
      return { ...complet, score: p._scoreContextuel };
    })
    .filter(Boolean);

  const produits_recommandes = normaliserScoresFallback(avantNormalisation)
    .map(complet => ({
      id:             complet.id,
      name_fr:        complet.name_fr,
      description_fr: complet.description_fr,
      slug:           complet.slug,
      images:         complet.images,
      rating_avg:     parseFloat(complet.rating_avg)  || 0,
      rating_count:   parseInt(complet.rating_count)  || 0,
      is_new:         complet.is_new,
      is_featured:    complet.is_featured,
      categorie_fr:   complet.categorie_fr,
      prix_min:       complet.prix_min   ? parseFloat(complet.prix_min)   : null,
      prix_promo:     complet.prix_promo ? parseFloat(complet.prix_promo) : null,
      stock_total:    parseInt(complet.stock_total) || 0,
      score:          complet.score,
      raison_ia:      RAISON_GENERIQUE,
    }));

  console.info(`[AIFallback] ${produits_recommandes.length} produit(s) retourné(s)`);

  return {
    message:             MESSAGE_SECOURS(produits_recommandes.length),
    suggestion:          SUGGESTION_SECOURS,
    produits_recommandes,
    total:               produits_recommandes.length,
    fallback:            true,
  };
};