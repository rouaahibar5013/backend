import database from "../database/db.js";

class User {
  // ─── Trouver par ID ───────────────────────────────────
  static async findById(id) {
    const result = await database.query(
      "SELECT * FROM users WHERE id = $1", [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par ID (profil complet avec has_google) ──
  static async findProfile(id) {
    const result = await database.query(
      `SELECT id, name, email, avatar, role, is_verified, is_active,
              phone, address, city,
              billing_full_name, billing_phone, billing_address,
              billing_city, billing_governorate, billing_postal_code, billing_country,
              shipping_full_name, shipping_phone, shipping_address,
              shipping_city, shipping_governorate, shipping_postal_code, shipping_country,
              google_id IS NOT NULL AS has_google,
              created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par email ────────────────────────────────
  static async findByEmail(email) {
    const result = await database.query(
      "SELECT * FROM users WHERE email = $1", [email]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par email en excluant un ID ─────────────
  static async findByEmailExcludingId(email, excludeId) {
    const result = await database.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, excludeId]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par Google ID ────────────────────────────
  static async findByGoogleId(googleId) {
    const result = await database.query(
      "SELECT * FROM users WHERE google_id = $1", [googleId]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par token de vérification ───────────────
  static async findByVerificationToken(token) {
    const result = await database.query(
      "SELECT * FROM users WHERE verification_token = $1", [token]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par token de reset password ─────────────
  static async findByResetToken(token) {
    const result = await database.query(
      `SELECT * FROM users
       WHERE reset_password_token = $1
         AND reset_password_expire > NOW()`,
      [token]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par token complete account ──────────────
  static async findByCompleteAccountToken(token) {
    const result = await database.query(
      `SELECT * FROM users
       WHERE complete_account_token = $1
         AND complete_account_expire > NOW()`,
      [token]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver user avec MFA valide ────────────────────
  static async findWithValidMfa(id) {
    const result = await database.query(
      `SELECT * FROM users
       WHERE id = $1
         AND mfa_otp IS NOT NULL
         AND mfa_otp_expire > NOW()`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Créer un utilisateur (register) ─────────────────
  static async create({ name, email, password, role = "user", phone = null, google_id = null }) {
    const result = await database.query(
      `INSERT INTO users (name, email, password, role, phone, google_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, email, password, role, phone, google_id]
    );
    return result.rows[0];
  }

  // ─── Créer avec vérification email (register complet) ─
  static async createWithVerification({
    name, email, password, avatarUrl,
    verificationToken, verificationExpire,
    phone, address, city,
  }) {
    const result = await database.query(
      `INSERT INTO users
         (name, email, password, avatar, role, is_verified,
          verification_token, verification_token_expire,
          phone, address, city)
       VALUES ($1,$2,$3,$4,'user',false,$5,$6,$7,$8,$9)
       RETURNING id, name, email, avatar, role, is_verified, phone, address, city`,
      [
        name, email, password, avatarUrl,
        verificationToken, verificationExpire,
        phone || null, address || null, city || null,
      ]
    );
    return result.rows[0];
  }

  // ─── Créer un compte guest ────────────────────────────
  static async createGuest({
    name, email, phone, shipping_address, shipping_city,
    completeAccountToken, completeAccountExpire,
  }) {
    const result = await database.query(
      `INSERT INTO users
         (name, email, phone, shipping_address, shipping_city,
          role, is_verified, complete_account_token, complete_account_expire)
       VALUES ($1,$2,$3,$4,$5,'user',false,$6,$7)
       RETURNING *`,
      [
        name, email, phone || null,
        shipping_address, shipping_city,
        completeAccountToken, completeAccountExpire,
      ]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour les infos de base ──────────────────
  static async update(id, fields) {
    const result = await database.query(
      `UPDATE users
       SET name       = COALESCE($1, name),
           phone      = COALESCE($2, phone),
           avatar     = COALESCE($3, avatar),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [fields.name, fields.phone, fields.avatar, id]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour le profil (avec sync billing) ──────
  static async updateProfile(id, {
    name, avatarUrl,
    phone, address, city,
    billingPhone, billingAddress, billingCity,
  }) {
    const result = await database.query(
      `UPDATE users
       SET name            = $1,
           avatar          = $2,
           phone           = $3,
           address         = $4,
           city            = $5,
           billing_phone   = $6,
           billing_address = $7,
           billing_city    = $8,
           updated_at      = NOW()
       WHERE id = $9
       RETURNING
         id, name, email, avatar, role, is_verified, is_active,
         phone, address, city,
         billing_full_name, billing_phone, billing_address,
         billing_city, billing_governorate, billing_postal_code, billing_country,
         shipping_full_name, shipping_phone, shipping_address,
         shipping_city, shipping_governorate, shipping_postal_code, shipping_country,
         created_at, updated_at`,
      [name, avatarUrl, phone, address, city, billingPhone, billingAddress, billingCity, id]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour adresses billing + shipping ────────
  static async updateAddresses(id, {
    billing_full_name, billing_phone,
    billing_address, billing_city,
    billing_governorate, billing_postal_code, billing_country,
    shipping_full_name, shipping_phone,
    shipping_address, shipping_city,
    shipping_governorate, shipping_postal_code, shipping_country,
  }) {
    const result = await database.query(
      `UPDATE users SET
         billing_full_name    = COALESCE($1,  billing_full_name),
         billing_phone        = COALESCE($2,  billing_phone),
         billing_address      = COALESCE($3,  billing_address),
         billing_city         = COALESCE($4,  billing_city),
         billing_governorate  = COALESCE($5,  billing_governorate),
         billing_postal_code  = COALESCE($6,  billing_postal_code),
         billing_country      = COALESCE($7,  billing_country),
         shipping_full_name   = COALESCE($8,  shipping_full_name),
         shipping_phone       = COALESCE($9,  shipping_phone),
         shipping_address     = COALESCE($10, shipping_address),
         shipping_city        = COALESCE($11, shipping_city),
         shipping_governorate = COALESCE($12, shipping_governorate),
         shipping_postal_code = COALESCE($13, shipping_postal_code),
         shipping_country     = COALESCE($14, shipping_country),
         updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        billing_full_name    || null, billing_phone       || null,
        billing_address      || null, billing_city        || null,
        billing_governorate  || null, billing_postal_code || null,
        billing_country      || null,
        shipping_full_name   || null, shipping_phone      || null,
        shipping_address     || null, shipping_city       || null,
        shipping_governorate || null, shipping_postal_code || null,
        shipping_country     || null,
        id,
      ]
    );
    return result.rows[0];
  }

  // ─── Vérifier le compte (avec retour) ────────────────
  static async verify(id) {
    const result = await database.query(
      `UPDATE users
       SET is_verified = true,
           verification_token = NULL,
           verification_token_expire = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, avatar, role, is_verified, created_at`,
      [id]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour le token de vérification ──────────
  static async updateVerificationToken(id, token, expire) {
    await database.query(
      `UPDATE users
       SET verification_token = $1, verification_token_expire = $2
       WHERE id = $3`,
      [token, expire, id]
    );
  }

  // ─── Mettre à jour le mot de passe ───────────────────
  static async updatePassword(id, hashedPassword) {
    await database.query(
      `UPDATE users
       SET password = $1,
           reset_password_token = NULL,
           reset_password_expire = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, id]
    );
  }

  // ─── Changer le mot de passe (sans reset token) ──────
  static async setPassword(id, hashedPassword) {
    await database.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
      [hashedPassword, id]
    );
  }

  // ─── Définir le token de reset password ──────────────
  static async setResetToken(id, token, expire) {
    await database.query(
      `UPDATE users
       SET reset_password_token = $1, reset_password_expire = $2, updated_at = NOW()
       WHERE id = $3`,
      [token, expire, id]
    );
  }

  // ─── Définir / effacer le OTP MFA ────────────────────
  static async setMfaOtp(id, otp, expire) {
    await database.query(
      "UPDATE users SET mfa_otp = $1, mfa_otp_expire = $2, updated_at = NOW() WHERE id = $3",
      [otp, expire, id]
    );
  }

  static async clearMfaOtp(id) {
    await database.query(
      "UPDATE users SET mfa_otp = NULL, mfa_otp_expire = NULL, updated_at = NOW() WHERE id = $1",
      [id]
    );
  }

  // ─── Définir le token complete-account ───────────────
  static async setCompleteAccountToken(id, token, expire) {
    await database.query(
      `UPDATE users
       SET complete_account_token = $1, complete_account_expire = $2, updated_at = NOW()
       WHERE id = $3`,
      [token, expire, id]
    );
  }

  // ─── Compléter le compte guest ────────────────────────
  static async completeAccount(id, hashedPassword) {
    const result = await database.query(
      `UPDATE users
       SET password = $1,
           is_verified = true,
           complete_account_token = NULL,
           complete_account_expire = NULL,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, avatar, role, is_verified,
                 phone, address, city, created_at`,
      [hashedPassword, id]
    );
    return result.rows[0];
  }

  // ─── Activer / désactiver ─────────────────────────────
  static async setActive(id, isActive) {
    const result = await database.query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, role, is_active`,
      [isActive, id]
    );
    return result.rows[0] || null;
  }

  // ─── Mettre à jour le rôle ────────────────────────────
  static async updateRole(id, role) {
    const result = await database.query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, role, is_verified, is_active, created_at`,
      [role, id]
    );
    return result.rows[0] || null;
  }

  // ─── Supprimer ────────────────────────────────────────
  static async delete(id) {
    await database.query("DELETE FROM users WHERE id = $1", [id]);
  }

  // ─── Admin : mettre à jour toutes les infos ───────────
  static async adminUpdate(id, {
    name, email, phone, address, city,
    role, is_verified, is_active, hashedPassword,
  }) {
    const result = await database.query(
      `UPDATE users
       SET name        = $1, email       = $2, phone     = $3,
           address     = $4, city        = $5, role      = $6,
           is_verified = $7, is_active   = $8, password  = $9,
           updated_at  = NOW()
       WHERE id = $10
       RETURNING id, name, email, avatar, role, is_verified,
                 is_active, phone, address, city, created_at, updated_at`,
      [name, email, phone, address, city, role, is_verified, is_active, hashedPassword, id]
    );
    return result.rows[0];
  }

  // ─── Admin : tous les utilisateurs avec filtres ───────
  static async findAllAdmin({ page = 1, limit = 20, search = "", role = "", status = "" } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (status === "active")     conditions.push("is_active = true AND is_verified = true");
    if (status === "suspended")  conditions.push("is_active = false");
    if (status === "unverified") conditions.push("is_verified = false");

    const where       = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countParams = [...params];

    params.push(limit);  const limitIdx  = params.length;
    params.push(offset); const offsetIdx = params.length;

    const [usersResult, countResult] = await Promise.all([
      database.query(
        `SELECT id, name, email, avatar, role, is_verified, is_active,
                phone, city, google_id IS NOT NULL AS has_google,
                created_at, updated_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      database.query(`SELECT COUNT(*) FROM users ${where}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);
    return { users: usersResult.rows, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ─── Tous les utilisateurs (simple) ──────────────────
  static async findAll({ page = 1, limit = 20, role = null } = {}) {
    const offset = (page - 1) * limit;
    const values = [];
    let where    = "";

    if (role) {
      where = "WHERE role = $1";
      values.push(role);
    }

    values.push(limit, offset);
    const idx = values.length;

    const result = await database.query(
      `SELECT id, name, email, role, is_verified, is_active, phone, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${idx - 1} OFFSET $${idx}`,
      values
    );
    return result.rows;
  }
}

export default User;