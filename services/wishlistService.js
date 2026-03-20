import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";

// ═══════════════════════════════════════════════════════════
// GET MY WISHLIST
// ═══════════════════════════════════════════════════════════
export const getWishlistService = async (userId) => {
  const result = await database.query(
    `SELECT
       w.id,
       w.created_at,
       p.id            AS product_id,
       p.name_fr       AS product_name_fr,
       p.name_ar       AS product_name_ar,
       p.slug          AS product_slug,
       p.images,
       p.rating_avg,
       p.rating_count,
       p.is_active,
       c.name_fr       AS category_name_fr,
       c.slug          AS category_slug,
       s.name          AS supplier_name,
       s.slug          AS supplier_slug,
       (SELECT pv.price FROM product_variants pv
        WHERE pv.product_id = p.id
        ORDER BY pv.created_at ASC LIMIT 1) AS price,
       (SELECT SUM(pv.stock) FROM product_variants pv
        WHERE pv.product_id = p.id) AS total_stock
     FROM wishlists w
     LEFT JOIN products   p ON p.id = w.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );

  return result.rows;
};


// ═══════════════════════════════════════════════════════════
// ADD TO WISHLIST
// ═══════════════════════════════════════════════════════════
export const addToWishlistService = async ({ userId, productId }) => {
  // Vérifier que le produit existe
  const product = await database.query(
    "SELECT id FROM products WHERE id=$1", [productId]
  );
  if (product.rows.length === 0)
    throw new ErrorHandler("Produit introuvable.", 404);

  // Vérifier si déjà dans la wishlist
  const existing = await database.query(
    "SELECT id FROM wishlists WHERE user_id=$1 AND product_id=$2",
    [userId, productId]
  );
  if (existing.rows.length > 0)
    throw new ErrorHandler("Ce produit est déjà dans votre wishlist.", 400);

  const result = await database.query(
    `INSERT INTO wishlists (user_id, product_id)
     VALUES ($1, $2) RETURNING *`,
    [userId, productId]
  );

  return result.rows[0];
};


// ═══════════════════════════════════════════════════════════
// REMOVE FROM WISHLIST
// ═══════════════════════════════════════════════════════════
export const removeFromWishlistService = async ({ userId, productId }) => {
  const result = await database.query(
    "DELETE FROM wishlists WHERE user_id=$1 AND product_id=$2 RETURNING *",
    [userId, productId]
  );

  if (result.rows.length === 0)
    throw new ErrorHandler("Produit introuvable dans votre wishlist.", 404);
};


// ═══════════════════════════════════════════════════════════
// CLEAR WISHLIST
// ═══════════════════════════════════════════════════════════
export const clearWishlistService = async (userId) => {
  await database.query(
    "DELETE FROM wishlists WHERE user_id=$1", [userId]
  );
};