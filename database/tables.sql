-- ─────────────────────────────────────────
-- USERS
-- Must be created FIRST because products
-- and reviews reference users.id
-- ─────────────────────────────────────────
-- ============================================================
--  sql/tables.sql — Table users BIOVITA (Option B)
--
--  Exécution depuis zéro :
--    psql -U postgres -c "CREATE DATABASE biovita;"
--    psql -U postgres -d biovita -f tables.sql
--
--  Si la table existe déjà :
--    psql -U postgres -d biovita -f tables.sql
--    (ALTER TABLE IF NOT EXISTS ne cassera rien)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
--  TABLE : users  (ta table originale)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   TEXT         NOT NULL,
  avatar     TEXT,
  role       VARCHAR(20)  DEFAULT 'user'
             CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  Option B — Colonnes supplémentaires
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_email_verified          BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token   TEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS password_reset_token       TEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS password_reset_expires     TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS login_attempts             INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_until                 TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active                  BOOLEAN   DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login                 TIMESTAMP DEFAULT NULL;

-- ============================================================
--  TABLE : refresh_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT      NOT NULL UNIQUE,
  user_agent VARCHAR(500) DEFAULT '',
  ip_address VARCHAR(50)  DEFAULT '',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP    NOT NULL
);

-- ============================================================
--  TABLE : password_reset_requests  (audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id         UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(50) DEFAULT '',
  used       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email            ON users (email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);

-- ============================================================
--  VUE : users_public  (sans colonnes sensibles)
-- ============================================================
CREATE OR REPLACE VIEW users_public AS
SELECT
  id,
  name,
  email,
  avatar,
  role,
  is_email_verified,
  is_active,
  last_login,
  created_at
FROM users;


-- ─────────────────────────────────────────
-- SUPPLIERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  address     TEXT,
  contact     VARCHAR(150),
  website     VARCHAR(255),
  images      JSONB   DEFAULT '[]'::JSONB,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  images      JSONB   DEFAULT '[]'::JSONB,
  parent_id   UUID    REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  description   TEXT    NOT NULL,
  ethical_info  TEXT,
  supplier_name VARCHAR(100),
  category_id   UUID    REFERENCES categories(id) ON DELETE SET NULL,
  ratings       NUMERIC(3,2) DEFAULT 0,
  status        VARCHAR(20)  DEFAULT 'approved'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by    UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- ATTRIBUTE TYPES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribute_types (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- ATTRIBUTE VALUES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribute_values (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute_type_id UUID NOT NULL REFERENCES attribute_types(id) ON DELETE CASCADE,
  value             VARCHAR(100) NOT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attribute_type_id, value)
);

-- ─────────────────────────────────────────
-- PRODUCT VARIANTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  images     JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- VARIANT ATTRIBUTES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_attributes (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id         UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_value_id UUID NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
  UNIQUE (variant_id, attribute_value_id)
);

-- ─────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, user_id)
);

-- ─────────────────────────────────────────
-- PROMOTIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code             VARCHAR(50)  NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  start_date       TIMESTAMP    NOT NULL,
  end_date         TIMESTAMP    NOT NULL,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
