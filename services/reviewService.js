import database    from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { invalidateOffresCache } from "../utils/cacheInvalideation.js"; // ✅ ajout

// ═══════════════════════════════════════════════════════════
// HELPER — Vérifier que l'user a acheté ce produit
// (au moins une commande livrée contenant ce produit)
// ═══════════════════════════════════════════════════════════
const verifyPurchase = async ({ userId, productId }) => {
  const result = await database.query(
    `SELECT 1
     FROM orders o
     JOIN order_items      oi ON oi.order_id  = o.id
     JOIN product_variants pv ON pv.id        = oi.variant_id
     WHERE o.user_id     = $1
       AND pv.product_id = $2
       AND o.status      = 'livree'
     LIMIT 1`,
    [userId, productId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler(
      "Vous pouvez uniquement noter un produit que vous avez acheté et reçu.", 403
    );
};

// ═══════════════════════════════════════════════════════════
// CREATE REVIEW (publiée directement)
// ═══════════════════════════════════════════════════════════
export const createReviewService = async ({ productId, userId, rating, comment }) => {
  // Ajouter AVANT la vérification du produit
if (!rating || rating < 1 || rating > 5)
  throw new ErrorHandler("La note doit être comprise entre 1 et 5.", 400);
  
  
  // ── Vérifier produit existe ──────────────────────────────
  const product = await database.query(
    "SELECT id FROM products WHERE id = $1 AND is_active = true",
    [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Produit introuvable.", 404);

  // ── Vérifier que l'user a bien acheté et reçu ce produit ─
  await verifyPurchase({ userId, productId });

  // ── Vérifier pas de review existante (1 review / produit / user) ──
  const existing = await database.query(
    "SELECT id FROM review WHERE product_id = $1 AND user_id = $2",
    [productId, userId]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Vous avez déjà laissé un avis pour ce produit.", 409);

  // ── INSERT ───────────────────────────────────────────────
  const result = await database.query(
    `INSERT INTO review (product_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [productId, userId, rating, comment.trim()]
  );
 await invalidateOffresCache();
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// GET REVIEWS D'UN PRODUIT (public)
// ═══════════════════════════════════════════════════════════
export const getProductReviewsService = async (productId) => {
  const [reviewsResult, statsResult] = await Promise.all([
    database.query(
      `SELECT
         r.id,
         r.user_id,
         r.rating,
         r.comment,
         r.created_at,
        COALESCE(u.name,   'Anonyme') AS user_name,
        COALESCE(u.avatar, null)      AS user_avatar
       FROM review r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [productId]
    ),
    database.query(
      `SELECT
         ROUND(AVG(rating)::numeric, 1)     AS average_rating,
         COUNT(*)                            AS total_reviews,
         COUNT(*) FILTER (WHERE rating = 5) AS five_stars,
         COUNT(*) FILTER (WHERE rating = 4) AS four_stars,
         COUNT(*) FILTER (WHERE rating = 3) AS three_stars,
         COUNT(*) FILTER (WHERE rating = 2) AS two_stars,
         COUNT(*) FILTER (WHERE rating = 1) AS one_star
       FROM review
       WHERE product_id = $1`,
      [productId]
    ),
  ]);

  return {
    stats: {
      average_rating: parseFloat(statsResult.rows[0].average_rating) || 0,
      total_reviews:  parseInt(statsResult.rows[0].total_reviews),
      distribution: {
        5: parseInt(statsResult.rows[0].five_stars),
        4: parseInt(statsResult.rows[0].four_stars),
        3: parseInt(statsResult.rows[0].three_stars),
        2: parseInt(statsResult.rows[0].two_stars),
        1: parseInt(statsResult.rows[0].one_star),
      },
    },
    reviews: reviewsResult.rows,
  };
};

// ═══════════════════════════════════════════════════════════
// UPDATE REVIEW (user — seulement la sienne)
// ═══════════════════════════════════════════════════════════
export const updateReviewService = async ({ reviewId, userId, rating, comment }) => {
  
  // Ajouter EN DÉBUT de fonction
if (rating !== undefined && (rating < 1 || rating > 5))
  throw new ErrorHandler("La note doit être comprise entre 1 et 5.", 400);
  const review = await database.query(
    "SELECT * FROM review WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  const current = review.rows[0];

  const result = await database.query(
    `UPDATE review
     SET rating  = $1,
         comment = $2
     WHERE id = $3
     RETURNING *`,
    [
      rating  ?? current.rating,
      comment ? comment.trim() : current.comment,
      reviewId,
    ]
  );
 await invalidateOffresCache();
  return result.rows[0];
};

// ═══════════════════════════════════════════════════════════
// DELETE REVIEW
// User → seulement la sienne | Admin → n'importe laquelle
// ═══════════════════════════════════════════════════════════
export const deleteReviewService = async ({ reviewId, userId, role }) => {
  if (role === "admin") {
    const result = await database.query(
      "DELETE FROM review WHERE id = $1 RETURNING id",
      [reviewId]
    );
    if (result.rows.length === 0)
      throw new ErrorHandler("Avis introuvable.", 404);
     await invalidateOffresCache();
    return;
  }

  const review = await database.query(
    "SELECT id FROM review WHERE id = $1 AND user_id = $2",
    [reviewId, userId]
  );
  if (review.rows.length === 0)
    throw new ErrorHandler("Avis introuvable.", 404);

  await database.query("DELETE FROM review WHERE id = $1", [reviewId]);
   await invalidateOffresCache();
};

// ═══════════════════════════════════════════════════════════
// GET ALL REVIEWS (admin)
// Filtres : rating, date_from, date_to, page
// ═══════════════════════════════════════════════════════════
export const getAllReviewsService = async ({ rating, date_from, date_to, page = 1 }) => {
  const LIMIT  = 20;
  const offset = (page - 1) * LIMIT;

  const conditions = [];
  const values     = [];
  let   i          = 1;

  // Filtre par note (ex: ?rating=1 pour voir les mauvais avis)
  if (rating !== undefined) {
    conditions.push(`r.rating = $${i}`);
    values.push(parseInt(rating));
    i++;
  }

  // Filtre par date de début (ex: ?date_from=2024-01-01)
  if (date_from) {
    conditions.push(`r.created_at >= $${i}`);
    values.push(new Date(date_from));
    i++;
  }

  // Filtre par date de fin (ex: ?date_to=2024-12-31)
  if (date_to) {
    conditions.push(`r.created_at <= $${i}`);
    values.push(new Date(date_to));
    i++;
  }

  const WHERE       = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(LIMIT, offset);

  const [totalResult, result] = await Promise.all([
    database.query(`SELECT COUNT(*) FROM review r ${WHERE}`, countValues),
    database.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.created_at,
         COALESCE(u.name,  'Anonyme') AS user_name,
COALESCE(u.email, 'Inconnu') AS user_email,
         p.name_fr AS product_name,
         p.id      AS product_id
       FROM review r
       LEFT JOIN users    u ON u.id = r.user_id
       LEFT JOIN products p ON p.id = r.product_id
       ${WHERE}
       ORDER BY r.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      values
    ),
  ]);

  return {
    total:      parseInt(totalResult.rows[0].count),
    totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / LIMIT),
    page,
    reviews:    result.rows,
  };
};