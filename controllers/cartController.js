import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// HELPER — get cart identifier
// Returns { user_id, session_id } based on auth status
// If user is logged in → use user_id
// If user is anonymous → use session_id from header
// ═══════════════════════════════════════════════════════════
const getCartIdentifier = (req) => {
  if (req.user) {
    return { user_id: req.user.id, session_id: null };
  }
  // Frontend sends session_id in header x-session-id
  const session_id = req.headers["x-session-id"];
  if (!session_id)
    throw new Error("Please provide x-session-id header for anonymous cart.");
  return { user_id: null, session_id };
};


// ═══════════════════════════════════════════════════════════
// GET CART
// GET /api/cart
// Works for both logged-in and anonymous users
// ═══════════════════════════════════════════════════════════
export const getCart = catchAsyncErrors(async (req, res, next) => {
  let identifier;
  try {
    identifier = getCartIdentifier(req);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  const { user_id, session_id } = identifier;

  const condition = user_id
    ? "ci.user_id = $1"
    : "ci.session_id = $1";
  const value = user_id || session_id;

  const result = await database.query(
    `SELECT
       ci.id,
       ci.quantity,
       ci.created_at,
       pv.id           AS variant_id,
       pv.price,
       pv.stock,
       pv.images,
       p.id            AS product_id,
       p.name          AS product_name,
       p.ethical_info,
       -- Variant attributes (Color, Size etc)
       COALESCE(
         json_agg(
           json_build_object(
             'attribute_type',  at.name,
             'attribute_value', av.value
           )
         ) FILTER (WHERE at.id IS NOT NULL), '[]'
       ) AS attributes
     FROM cart_items ci
     LEFT JOIN product_variants  pv ON pv.id = ci.variant_id
     LEFT JOIN products          p  ON p.id  = pv.product_id
     LEFT JOIN variant_attributes va ON va.variant_id = pv.id
     LEFT JOIN attribute_values   av ON av.id = va.attribute_value_id
     LEFT JOIN attribute_types    at ON at.id = av.attribute_type_id
     WHERE ${condition}
     GROUP BY ci.id, pv.id, p.id
     ORDER BY ci.created_at ASC`,
    [value]
  );

  // Calculate cart total
  const total = result.rows.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );

  res.status(200).json({
    success:    true,
    totalItems: result.rows.length,
    total:      total.toFixed(2),
    items:      result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// ADD TO CART
// POST /api/cart
// Body: { variant_id, quantity }
// Works for both logged-in and anonymous users
// ═══════════════════════════════════════════════════════════
export const addToCart = catchAsyncErrors(async (req, res, next) => {
  const { variant_id, quantity } = req.body;

  if (!variant_id)
    return next(new ErrorHandler("Please provide a variant_id.", 400));

  const qty = parseInt(quantity) || 1;

  let identifier;
  try {
    identifier = getCartIdentifier(req);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  const { user_id, session_id } = identifier;

  // ── Check variant exists and has enough stock ─────────
  const variant = await database.query(
    "SELECT * FROM product_variants WHERE id = $1", [variant_id]
  );
  if (variant.rows.length === 0)
    return next(new ErrorHandler("Product variant not found.", 404));

  if (variant.rows[0].stock < qty)
    return next(
      new ErrorHandler(
        `Not enough stock. Available: ${variant.rows[0].stock}`, 400
      )
    );

  // ── Check if variant already in cart ──────────────────
  const condition = user_id
    ? "user_id = $1 AND variant_id = $2"
    : "session_id = $1 AND variant_id = $2";
  const condValue = user_id || session_id;

  const existing = await database.query(
    `SELECT * FROM cart_items WHERE ${condition}`,
    [condValue, variant_id]
  );

  if (existing.rows.length > 0) {
    // ── Already in cart → update quantity ─────────────
    const newQty = existing.rows[0].quantity + qty;

    if (variant.rows[0].stock < newQty)
      return next(
        new ErrorHandler(
          `Not enough stock. Available: ${variant.rows[0].stock}`, 400
        )
      );

    const updated = await database.query(
      `UPDATE cart_items
       SET quantity=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [newQty, existing.rows[0].id]
    );

    return res.status(200).json({
      success: true,
      message: "Cart item quantity updated.",
      item:    updated.rows[0],
    });
  }

  // ── Not in cart → insert new item ────────────────────
  const insertQuery = user_id
    ? `INSERT INTO cart_items (user_id, variant_id, quantity)
       VALUES ($1, $2, $3) RETURNING *`
    : `INSERT INTO cart_items (session_id, variant_id, quantity)
       VALUES ($1, $2, $3) RETURNING *`;

  const result = await database.query(insertQuery, [
    user_id || session_id,
    variant_id,
    qty,
  ]);

  res.status(201).json({
    success: true,
    message: "Product added to cart.",
    item:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE CART ITEM QUANTITY
// PUT /api/cart/:itemId
// Body: { quantity }
// ═══════════════════════════════════════════════════════════
export const updateCartItem = catchAsyncErrors(async (req, res, next) => {
  const { itemId }  = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1)
    return next(new ErrorHandler("Please provide a valid quantity.", 400));

  let identifier;
  try {
    identifier = getCartIdentifier(req);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  const { user_id, session_id } = identifier;

  // Find cart item belonging to this user/session
  const condition = user_id
    ? "id=$1 AND user_id=$2"
    : "id=$1 AND session_id=$2";

  const item = await database.query(
    `SELECT * FROM cart_items WHERE ${condition}`,
    [itemId, user_id || session_id]
  );

  if (item.rows.length === 0)
    return next(new ErrorHandler("Cart item not found.", 404));

  // Check stock
  const variant = await database.query(
    "SELECT stock FROM product_variants WHERE id=$1",
    [item.rows[0].variant_id]
  );

  if (variant.rows[0].stock < quantity)
    return next(
      new ErrorHandler(
        `Not enough stock. Available: ${variant.rows[0].stock}`, 400
      )
    );

  const result = await database.query(
    `UPDATE cart_items
     SET quantity=$1, updated_at=NOW()
     WHERE id=$2 RETURNING *`,
    [quantity, itemId]
  );

  res.status(200).json({
    success: true,
    message: "Cart item updated.",
    item:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// REMOVE FROM CART
// DELETE /api/cart/:itemId
// ═══════════════════════════════════════════════════════════
export const removeFromCart = catchAsyncErrors(async (req, res, next) => {
  const { itemId } = req.params;

  let identifier;
  try {
    identifier = getCartIdentifier(req);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  const { user_id, session_id } = identifier;

  const condition = user_id
    ? "id=$1 AND user_id=$2"
    : "id=$1 AND session_id=$2";

  const result = await database.query(
    `DELETE FROM cart_items WHERE ${condition} RETURNING *`,
    [itemId, user_id || session_id]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("Cart item not found.", 404));

  res.status(200).json({
    success: true,
    message: "Item removed from cart.",
  });
});


// ═══════════════════════════════════════════════════════════
// CLEAR CART
// DELETE /api/cart
// Removes all items from cart
// ═══════════════════════════════════════════════════════════
export const clearCart = catchAsyncErrors(async (req, res, next) => {
  let identifier;
  try {
    identifier = getCartIdentifier(req);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  const { user_id, session_id } = identifier;

  const condition = user_id ? "user_id=$1" : "session_id=$1";

  await database.query(
    `DELETE FROM cart_items WHERE ${condition}`,
    [user_id || session_id]
  );

  res.status(200).json({
    success: true,
    message: "Cart cleared.",
  });
});


// ═══════════════════════════════════════════════════════════
// MERGE CART
// POST /api/cart/merge
// Requires: isAuthenticated
// Called when user logs in → merges anonymous cart
// with their existing cart in DB
// Body: { session_id }
// ═══════════════════════════════════════════════════════════
export const mergeCart = catchAsyncErrors(async (req, res, next) => {
  const { session_id } = req.body;

  if (!session_id)
    return next(new ErrorHandler("Please provide session_id.", 400));

  // Get all anonymous cart items
  const anonymousItems = await database.query(
    "SELECT * FROM cart_items WHERE session_id=$1", [session_id]
  );

  if (anonymousItems.rows.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No anonymous cart to merge.",
    });
  }

  // Merge each anonymous item into user's cart
  for (const item of anonymousItems.rows) {
    // Check if user already has this variant in cart
    const existing = await database.query(
      "SELECT * FROM cart_items WHERE user_id=$1 AND variant_id=$2",
      [req.user.id, item.variant_id]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await database.query(
        `UPDATE cart_items
         SET quantity = quantity + $1, updated_at = NOW()
         WHERE user_id=$2 AND variant_id=$3`,
        [item.quantity, req.user.id, item.variant_id]
      );
    } else {
      // Insert as user's item
      await database.query(
        `INSERT INTO cart_items (user_id, variant_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, variant_id) DO UPDATE
         SET quantity = cart_items.quantity + $3`,
        [req.user.id, item.variant_id, item.quantity]
      );
    }
  }

  // Delete anonymous cart after merge
  await database.query(
    "DELETE FROM cart_items WHERE session_id=$1", [session_id]
  );

  res.status(200).json({
    success: true,
    message: "Cart merged successfully.",
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL CARTS (admin only)
// GET /api/cart/all
// Returns all carts with user info for admin analytics
// ═══════════════════════════════════════════════════════════
export const getAllCarts = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `SELECT
       ci.user_id,
       ci.session_id,
       u.name          AS customer_name,
       u.email         AS customer_email,
       COUNT(ci.id)    AS item_count,
       SUM(pv.price * ci.quantity) AS cart_total,
       MAX(ci.updated_at)          AS last_updated
     FROM cart_items ci
     LEFT JOIN users             u  ON u.id  = ci.user_id
     LEFT JOIN product_variants  pv ON pv.id = ci.variant_id
     GROUP BY ci.user_id, ci.session_id, u.name, u.email
     ORDER BY last_updated DESC`
  );

  res.status(200).json({
    success:    true,
    totalCarts: result.rows.length,
    carts:      result.rows,
  });
});