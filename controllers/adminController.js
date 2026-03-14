import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// GET /api/admin/dashboard
// Returns global platform statistics
// ═══════════════════════════════════════════════════════════
export const getDashboardStats = catchAsyncErrors(async (req, res, next) => {

  // ── Users stats ───────────────────────────────────────
  const usersStats = await database.query(
    `SELECT
       COUNT(*)                                        AS total_users,
       COUNT(*) FILTER (WHERE role = 'admin')          AS total_admins,
       COUNT(*) FILTER (WHERE is_verified = true)      AS verified_users,
       COUNT(*) FILTER (WHERE is_active = false)       AS suspended_users,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users_this_month
     FROM users`
  );

  // ── Products stats ────────────────────────────────────
  const productsStats = await database.query(
    `SELECT
       COUNT(*)                                              AS total_products,
       COUNT(*) FILTER (WHERE status = 'approved')          AS approved_products,
       COUNT(*) FILTER (WHERE status = 'pending')           AS pending_products,
       COUNT(*) FILTER (WHERE status = 'rejected')          AS rejected_products
     FROM products`
  );

  // ── Orders stats ──────────────────────────────────────
  const ordersStats = await database.query(
    `SELECT
       COUNT(*)                                                AS total_orders,
       COUNT(*) FILTER (WHERE status = 'pending')             AS pending_orders,
       COUNT(*) FILTER (WHERE status = 'confirmed')           AS confirmed_orders,
       COUNT(*) FILTER (WHERE status = 'shipped')             AS shipped_orders,
       COUNT(*) FILTER (WHERE status = 'delivered')           AS delivered_orders,
       COUNT(*) FILTER (WHERE status = 'cancelled')           AS cancelled_orders,
       COALESCE(SUM(total_price) FILTER (WHERE payment_status = 'paid'), 0) AS total_revenue,
       COALESCE(SUM(total_price) FILTER (
         WHERE payment_status = 'paid'
         AND created_at >= NOW() - INTERVAL '30 days'
       ), 0) AS revenue_this_month
     FROM orders`
  );

  // ── Reviews stats ─────────────────────────────────────
  const reviewsStats = await database.query(
    `SELECT
       COUNT(*)                          AS total_reviews,
       ROUND(AVG(rating)::numeric, 2)    AS average_rating
     FROM reviews`
  );

  // ── Complaints stats ──────────────────────────────────
  const complaintsStats = await database.query(
    `SELECT
       COUNT(*)                                              AS total_complaints,
       COUNT(*) FILTER (WHERE status = 'pending')           AS pending_complaints,
       COUNT(*) FILTER (WHERE status = 'in_progress')       AS in_progress_complaints,
       COUNT(*) FILTER (WHERE status = 'resolved')          AS resolved_complaints
     FROM complaints`
  );

  // ── Top selling products ──────────────────────────────
  const topProducts = await database.query(
    `SELECT
       p.id,
       p.name,
       SUM(oi.quantity)        AS total_sold,
       SUM(oi.price_at_order * oi.quantity) AS revenue
     FROM order_items oi
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     LEFT JOIN products         p  ON p.id  = pv.product_id
     GROUP BY p.id, p.name
     ORDER BY total_sold DESC
     LIMIT 5`
  );

  // ── Recent orders ─────────────────────────────────────
  const recentOrders = await database.query(
    `SELECT
       o.id, o.status, o.payment_method,
       o.payment_status, o.total_price, o.created_at,
       u.name AS customer_name, u.email AS customer_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT 5`
  );

  // ── Monthly revenue (last 6 months) ──────────────────
  const monthlyRevenue = await database.query(
    `SELECT
       TO_CHAR(created_at, 'YYYY-MM') AS month,
       COALESCE(SUM(total_price), 0)  AS revenue,
       COUNT(*)                       AS orders_count
     FROM orders
     WHERE payment_status = 'paid'
     AND created_at >= NOW() - INTERVAL '6 months'
     GROUP BY TO_CHAR(created_at, 'YYYY-MM')
     ORDER BY month ASC`
  );

  res.status(200).json({
    success: true,
    stats: {
      users:      usersStats.rows[0],
      products:   productsStats.rows[0],
      orders:     ordersStats.rows[0],
      reviews:    reviewsStats.rows[0],
      complaints: complaintsStats.rows[0],
    },
    topProducts:    topProducts.rows,
    recentOrders:   recentOrders.rows,
    monthlyRevenue: monthlyRevenue.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// GET ALL USERS (admin only)
// GET /api/admin/users
// Supports: ?role= ?is_active= ?search= ?page=
// ═══════════════════════════════════════════════════════════
export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const { role, is_active, search } = req.query;
  const page   = parseInt(req.query.page) || 1;
  const limit  = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values     = [];
  let   index      = 1;

  if (role) {
    conditions.push(`role = $${index}`);
    values.push(role);
    index++;
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${index}`);
    values.push(is_active === "true");
    index++;
  }

  if (search) {
    conditions.push(`(name ILIKE $${index} OR email ILIKE $${index})`);
    values.push(`%${search}%`);
    index++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const totalResult = await database.query(
    `SELECT COUNT(*) FROM users ${whereClause}`, values
  );
  const totalUsers = parseInt(totalResult.rows[0].count);

  values.push(limit, offset);

  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified,
            is_active, created_at
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    values
  );

  res.status(200).json({
    success:    true,
    totalUsers,
    page,
    totalPages: Math.ceil(totalUsers / limit),
    users:      result.rows,
  });
});


// ═══════════════════════════════════════════════════════════
// GET SINGLE USER (admin only)
// GET /api/admin/users/:userId
// ═══════════════════════════════════════════════════════════
export const getSingleUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const result = await database.query(
    `SELECT id, name, email, avatar, role, is_verified,
            is_active, phone, address, city, created_at
     FROM users WHERE id=$1`,
    [userId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  // Get user orders count
  const ordersCount = await database.query(
    "SELECT COUNT(*) FROM orders WHERE user_id=$1", [userId]
  );

  // Get user reviews count
  const reviewsCount = await database.query(
    "SELECT COUNT(*) FROM reviews WHERE user_id=$1", [userId]
  );

  res.status(200).json({
    success: true,
    user: {
      ...result.rows[0],
      orders_count:  parseInt(ordersCount.rows[0].count),
      reviews_count: parseInt(reviewsCount.rows[0].count),
    },
  });
});


// ═══════════════════════════════════════════════════════════
// SUSPEND USER (admin only)
// PATCH /api/admin/users/:userId/suspend
// Sets is_active = false → user cannot login
// ═══════════════════════════════════════════════════════════
export const suspendUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  // Cannot suspend yourself
  if (userId === req.user.id)
    return next(new ErrorHandler("You cannot suspend your own account.", 400));

  const result = await database.query(
    `UPDATE users SET is_active=false WHERE id=$1
     RETURNING id, name, email, role, is_active`,
    [userId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  res.status(200).json({
    success: true,
    message: `User ${result.rows[0].name} has been suspended.`,
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// ACTIVATE USER (admin only)
// PATCH /api/admin/users/:userId/activate
// Sets is_active = true → user can login again
// ═══════════════════════════════════════════════════════════
export const activateUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const result = await database.query(
    `UPDATE users SET is_active=true WHERE id=$1
     RETURNING id, name, email, role, is_active`,
    [userId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  res.status(200).json({
    success: true,
    message: `User ${result.rows[0].name} has been activated.`,
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// CHANGE USER ROLE (admin only)
// PATCH /api/admin/users/:userId/role
// Body: { role: "admin" | "user" }
// ═══════════════════════════════════════════════════════════
export const changeUserRole = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const { role }   = req.body;

  if (!["admin", "user"].includes(role))
    return next(new ErrorHandler("Role must be 'admin' or 'user'.", 400));

  // Cannot change your own role
  if (userId === req.user.id)
    return next(new ErrorHandler("You cannot change your own role.", 400));

  const result = await database.query(
    `UPDATE users SET role=$1 WHERE id=$2
     RETURNING id, name, email, role`,
    [role, userId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  res.status(200).json({
    success: true,
    message: `User ${result.rows[0].name} role changed to '${role}'.`,
    user:    result.rows[0],
  });
});


// ═══════════════════════════════════════════════════════════
// DELETE USER (admin only)
// DELETE /api/admin/users/:userId
// ═══════════════════════════════════════════════════════════
export const deleteUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  // Cannot delete yourself
  if (userId === req.user.id)
    return next(new ErrorHandler("You cannot delete your own account.", 400));

  const result = await database.query(
    "DELETE FROM users WHERE id=$1 RETURNING id, name, email",
    [userId]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler("User not found.", 404));

  res.status(200).json({
    success: true,
    message: `User ${result.rows[0].name} deleted successfully.`,
  });
});


// ═══════════════════════════════════════════════════════════
// GET SETTINGS (admin only)
// GET /api/admin/settings
// ═══════════════════════════════════════════════════════════
export const getSettings = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    "SELECT * FROM settings ORDER BY key ASC"
  );

  // Convert to key-value object for easy use
  const settings = {};
  result.rows.forEach(row => {
    settings[row.key] = {
      value:       row.value,
      description: row.description,
      updated_at:  row.updated_at,
    };
  });

  res.status(200).json({
    success:  true,
    settings,
  });
});


// ═══════════════════════════════════════════════════════════
// UPDATE SETTING (admin only)
// PUT /api/admin/settings/:key
// Body: { value }
// ═══════════════════════════════════════════════════════════
export const updateSetting = catchAsyncErrors(async (req, res, next) => {
  const { key }   = req.params;
  const { value } = req.body;

  if (!value)
    return next(new ErrorHandler("Please provide a value.", 400));

  const result = await database.query(
    `UPDATE settings SET value=$1, updated_at=NOW()
     WHERE key=$2 RETURNING *`,
    [value, key]
  );

  if (result.rows.length === 0)
    return next(new ErrorHandler(`Setting '${key}' not found.`, 404));

  res.status(200).json({
    success: true,
    message: `Setting '${key}' updated successfully.`,
    setting: result.rows[0],
  });
});