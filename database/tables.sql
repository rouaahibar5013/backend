-- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE WISHLISTS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Clé primaire
  CONSTRAINT wishlists_pkey PRIMARY KEY (id),
  
  -- Un utilisateur ne peut pas ajouter deux fois le même produit en favoris
  CONSTRAINT wishlists_unique_user_product UNIQUE (user_id, product_id),
  
  -- Clés étrangères avec suppression en cascade
  CONSTRAINT wishlists_product_fkey 
    FOREIGN KEY (product_id) 
    REFERENCES public.products (id) 
    ON DELETE CASCADE,
    
  CONSTRAINT wishlists_user_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.users (id) 
    ON DELETE CASCADE
);

-- 2. Index pour accélérer les recherches par utilisateur
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);


-- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE VARIANT_PROMOTIONS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.variant_promotions (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    variant_id UUID NOT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(10, 3) NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT variant_promotions_pkey PRIMARY KEY (id),

    -- Clé étrangère vers les variantes de produits
    CONSTRAINT variant_promotions_variant_fk 
        FOREIGN KEY (variant_id) 
        REFERENCES public.product_variants (id) 
        ON DELETE CASCADE,

    -- Vérification : La date de fin doit être après la date de début
    CONSTRAINT variant_promotions_dates_check 
        CHECK (expires_at > starts_at),

    -- Vérification : Type de remise (pourcentage ou montant fixe)
    CONSTRAINT variant_promotions_type_check 
        CHECK (discount_type IN ('percent', 'fixed')),

    -- Vérification : La valeur de la remise doit être positive
    CONSTRAINT variant_promotions_value_check 
        CHECK (discount_value > 0)
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Index sur la variante (utile pour les jointures)
CREATE INDEX IF NOT EXISTS idx_vp_variant_id 
    ON public.variant_promotions USING btree (variant_id);

-- Index sur le statut et les dates (crucial pour afficher les promos en cours sur le site)
CREATE INDEX IF NOT EXISTS idx_vp_active_dates 
    ON public.variant_promotions USING btree (is_active, starts_at, expires_at);

-- 3. Trigger pour mettre à jour automatiquement 'updated_at'
-- Note : Assure-toi d'avoir déjà une fonction 'update_updated_at_column' dans ta DB
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_variant_promotions_updated_at') THEN
        CREATE TRIGGER trg_variant_promotions_updated_at
        BEFORE UPDATE ON public.variant_promotions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE USERS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.users (
    -- Identifiants et Auth de base
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password TEXT NULL,
    google_id TEXT NULL,
    avatar TEXT NULL,
    
    -- Permissions et Statuts
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Informations de contact (Base)
    phone VARCHAR(30) NULL,
    address TEXT NULL,
    city VARCHAR(100) NULL,
    
    -- Gestion des Tokens (Email, Password, Registration)
    verification_token TEXT NULL,
    verification_token_expire TIMESTAMP WITH TIME ZONE NULL,
    reset_password_token TEXT NULL,
    reset_password_expire TIMESTAMP WITH TIME ZONE NULL,
    complete_account_token TEXT NULL,
    complete_account_expire TIMESTAMP WITH TIME ZONE NULL,
    
    -- Facturation (Billing)
    billing_full_name VARCHAR(150) NULL,
    billing_phone VARCHAR(30) NULL,
    billing_address TEXT NULL,
    billing_city VARCHAR(100) NULL,
    billing_governorate VARCHAR(100) NULL,
    billing_postal_code VARCHAR(10) NULL,
    billing_country VARCHAR(60) NULL DEFAULT 'CHF',
    
    -- Livraison (Shipping)
    shipping_full_name VARCHAR(150) NULL,
    shipping_phone VARCHAR(30) NULL,
    shipping_address TEXT NULL,
    shipping_city VARCHAR(100) NULL,
    shipping_governorate VARCHAR(100) NULL,
    shipping_postal_code VARCHAR(10) NULL,
    shipping_country VARCHAR(60) NULL DEFAULT 'CHF',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- ══════════════════════════════════════════════════════
    -- CONSTRAINTS
    -- ══════════════════════════════════════════════════════
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_google_id_key UNIQUE (google_id),
    
    -- Vérification du rôle (uniquement user ou admin)
    CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))
) TABLESPACE pg_default;

-- 2. Index pour optimiser la recherche par email (connexion)
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 3. Trigger pour mettre à jour automatiquement 'updated_at'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON public.users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE SUPPLIERS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description_fr TEXT NULL,
    region VARCHAR(100) NULL,
    address TEXT NULL,
    contact VARCHAR(100) NULL,
    email VARCHAR(150) NULL,
    website VARCHAR(255) NULL,
    logo_url TEXT NULL,
    is_certified_bio BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT suppliers_pkey PRIMARY KEY (id),
    -- Le slug doit être unique pour les URLs (ex: monsite.com/suppliers/nom-du-fournisseur)
    CONSTRAINT suppliers_slug_key UNIQUE (slug)
) TABLESPACE pg_default;

-- 2. Index pour accélérer les recherches par slug
CREATE INDEX IF NOT EXISTS idx_suppliers_slug ON public.suppliers(slug);

-- 3. Gestion du Trigger pour updated_at
-- On supprime le trigger s'il existe déjà pour éviter les doublons lors d'une ré-exécution
DROP TRIGGER IF EXISTS trg_updated_at_suppliers ON public.suppliers;

CREATE TRIGGER trg_updated_at_suppliers
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE REVIEWS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    product_id UUID NOT NULL,
    user_id UUID NULL,     -- NULL autorisé (si on veut garder l'avis d'un user supprimé)
    order_id UUID NULL,    -- Pour lier l'avis à une commande spécifique
    rating SMALLINT NOT NULL,
    title VARCHAR(255) NULL,
    comment TEXT NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    helpful_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT reviews_pkey PRIMARY KEY (id),

    -- Un utilisateur ne peut laisser qu'un seul avis par produit
    CONSTRAINT reviews_product_id_user_id_key UNIQUE (product_id, user_id),

    -- Clés étrangères
    CONSTRAINT fk_reviews_order 
        FOREIGN KEY (order_id) REFERENCES public.orders (id) ON DELETE SET NULL,
    
    CONSTRAINT reviews_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES public.products (id) ON DELETE CASCADE,
    
    CONSTRAINT reviews_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL,

    -- Vérification de la note (entre 1 et 5)
    CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
) TABLESPACE pg_default;

-- 2. Index partiel pour la performance
-- Optimise l'affichage des avis validés sur les fiches produits
CREATE INDEX IF NOT EXISTS idx_reviews_product 
    ON public.reviews (product_id) 
    WHERE (is_approved = TRUE);

-- 3. Trigger pour mettre à jour la moyenne de note du produit
-- Se déclenche après chaque changement pour recalculer la note globale
DROP TRIGGER IF EXISTS trg_rating_refresh ON public.reviews;
CREATE TRIGGER trg_rating_refresh
    AFTER INSERT OR DELETE OR UPDATE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION refresh_product_rating();

-- 4. Trigger pour mettre à jour automatiquement 'updated_at'
DROP TRIGGER IF EXISTS trg_updated_at_reviews ON public.reviews;
CREATE TRIGGER trg_updated_at_reviews
    BEFORE UPDATE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE RECLAMATIONS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.reclamations (
    id SERIAL NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(150) NOT NULL,
    user_phone VARCHAR(30) NULL,
    order_number VARCHAR(50) NULL, -- Référence à la commande (ex: ORD-12345)
    complaint_type VARCHAR(80) NOT NULL, -- Ex: 'Produit défectueux', 'Livraison retardée'
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'en_attente',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT reclamations_pkey PRIMARY KEY (id),

    -- Contrainte sur le statut (optionnel mais recommandé pour la sécurité)
    CONSTRAINT reclamations_status_check 
        CHECK (status IN ('en_attente', 'en_cours', 'resolue', 'rejetee'))
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances (Dashboard Admin)
CREATE INDEX IF NOT EXISTS idx_reclamations_status 
    ON public.reclamations USING btree (status);

CREATE INDEX IF NOT EXISTS idx_reclamations_email 
    ON public.reclamations USING btree (user_email);

CREATE INDEX IF NOT EXISTS idx_reclamations_order 
    ON public.reclamations USING btree (order_number);

CREATE INDEX IF NOT EXISTS idx_reclamations_type 
    ON public.reclamations USING btree (complaint_type);

-- Index pour trier par date (plus récent en premier pour le SAV)
CREATE INDEX IF NOT EXISTS idx_reclamations_created 
    ON public.reclamations USING btree (created_at DESC);

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_reclamations_updated_at ON public.reclamations;

CREATE TRIGGER trg_reclamations_updated_at
    BEFORE UPDATE ON public.reclamations
    FOR EACH ROW
    EXECUTE FUNCTION update_reclamations_updated_at();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE RECIPES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    title_fr VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description_fr TEXT NULL,
    cover_image TEXT NULL,
    prep_time INTEGER NULL,      -- En minutes
    cook_time INTEGER NULL,      -- En minutes
    servings INTEGER NULL DEFAULT 4,
    difficulty VARCHAR(20) NULL DEFAULT 'facile',
    category VARCHAR(50) NULL,
    is_published BOOLEAN NULL DEFAULT FALSE,
    is_featured BOOLEAN NULL DEFAULT FALSE,
    views_count INTEGER NULL DEFAULT 0,
    created_by UUID NULL,        -- L'admin ou l'utilisateur qui a créé la recette
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT recipes_pkey PRIMARY KEY (id),
    
    -- Le slug doit être unique pour les URLs (ex: /recettes/mousse-au-chocolat-bio)
    CONSTRAINT recipes_slug_key UNIQUE (slug),
    
    -- Clé étrangère vers les utilisateurs (on garde la recette même si le créateur est supprimé)
    CONSTRAINT recipes_created_by_fkey 
        FOREIGN KEY (created_by) 
        REFERENCES public.users (id) 
        ON DELETE SET NULL,

    -- Optionnel : Sécurité sur la difficulté
    CONSTRAINT recipes_difficulty_check 
        CHECK (difficulty IN ('facile', 'moyen', 'difficile'))
) TABLESPACE pg_default;

-- 2. Création des Index pour la performance
-- Accélère l'affichage d'une recette via son URL
CREATE INDEX IF NOT EXISTS idx_recipes_slug 
    ON public.recipes USING btree (slug);

-- Accélère le filtrage des recettes visibles sur le site
CREATE INDEX IF NOT EXISTS idx_recipes_published 
    ON public.recipes USING btree (is_published)
    WHERE (is_published = TRUE);

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_recipes_updated_at ON public.recipes;

CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE RECIPE_STEPS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.recipe_steps (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL,
    step_number INTEGER NOT NULL, -- L'ordre de l'étape (1, 2, 3...)
    instruction_fr TEXT NOT NULL,
    image TEXT NULL,               -- Photo illustrative de l'étape
    duration INTEGER NULL,         -- Durée estimée pour cette étape précise

    -- Clé primaire
    CONSTRAINT recipe_steps_pkey PRIMARY KEY (id),

    -- Clé étrangère vers la recette
    -- ON DELETE CASCADE : si la recette est supprimée, ses étapes le sont aussi.
    CONSTRAINT recipe_steps_recipe_id_fkey 
        FOREIGN KEY (recipe_id) 
        REFERENCES public.recipes (id) 
        ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Crucial pour récupérer instantanément toutes les étapes d'une recette
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id 
    ON public.recipe_steps USING btree (recipe_id);

-- 3. (Optionnel) Index pour garantir que l'ordre des étapes est unique par recette
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_steps_order 
    ON public.recipe_steps (recipe_id, step_number);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE RECIPE_INGREDIENTS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL,
    product_id UUID NULL,         -- Optionnel : lie l'ingrédient à un produit de ta boutique
    name_fr VARCHAR(200) NOT NULL, -- Nom de l'ingrédient (ex: "Miel de Thym")
    quantity VARCHAR(100) NULL,    -- Quantité (ex: "2 cuillères à soupe")
    is_bio BOOLEAN NULL DEFAULT TRUE,
    sort_order INTEGER NULL DEFAULT 0,

    -- Clé primaire
    CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id),

    -- Clés étrangères
    -- Si tu supprimes la recette, les ingrédients associés disparaissent
    CONSTRAINT recipe_ingredients_recipe_id_fkey 
        FOREIGN KEY (recipe_id) 
        REFERENCES public.recipes (id) 
        ON DELETE CASCADE,

    -- Si tu supprimes un produit, l'ingrédient reste dans la recette (product_id devient NULL)
    CONSTRAINT recipe_ingredients_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products (id) 
        ON DELETE SET NULL
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Pour charger rapidement la liste des ingrédients quand on consulte une recette
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id 
    ON public.recipe_ingredients USING btree (recipe_id);

-- Index pour retrouver quelles recettes utilisent un produit spécifique
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id 
    ON public.recipe_ingredients (product_id) 
    WHERE (product_id IS NOT NULL);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE PROMOTIONS TABLE (Voucher Codes)
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    code VARCHAR(50) NOT NULL, -- Le code que l'utilisateur saisit (ex: 'BIENVENUE20')
    description_fr TEXT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(10, 3) NOT NULL,
    min_order_amount NUMERIC(10, 3) NULL DEFAULT 0, -- Panier minimum requis
    max_uses INTEGER NULL,                          -- Limite totale d'utilisations
    used_count INTEGER NOT NULL DEFAULT 0,          -- Nombre de fois déjà utilisé
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMP WITH TIME ZONE NULL,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT promotions_pkey PRIMARY KEY (id),

    -- Un code promo doit être unique (pas deux codes 'SOLDE2026')
    CONSTRAINT promotions_code_key UNIQUE (code),

    -- Vérification du type (Pourcentage ou Montant fixe)
    CONSTRAINT promotions_type_check 
        CHECK (discount_type IN ('percent', 'fixed')),

    -- La valeur de réduction doit être positive
    CONSTRAINT promotions_value_check 
        CHECK (discount_value > 0)
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Essentiel pour vérifier ultra-rapidement la validité d'un code lors du checkout
CREATE INDEX IF NOT EXISTS idx_promotions_code_active 
    ON public.promotions (code) 
    WHERE (is_active = TRUE);

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_promotions_updated_at ON public.promotions;

CREATE TRIGGER trg_promotions_updated_at
    BEFORE UPDATE ON public.promotions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE PRODUCTS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name_fr VARCHAR(255) NOT NULL,
    description_fr TEXT NOT NULL,
    ethical_info_fr TEXT NULL, -- Infos sur l'éthique (important pour le bio)
    origin VARCHAR(100) NULL,      -- Origine géographique
    certifications JSONB NULL,     -- Labels (Ecocert, AB, etc.)
    category_id UUID NULL,
    supplier_id UUID NULL,
    created_by UUID NULL,
    images JSONB NULL,             -- Tableau d'images avec URLs et metadata
    slug VARCHAR(255) NOT NULL,    -- URL friendly (ex: miel-de-nabeul-bio)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    rating_avg NUMERIC(3, 2) NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    usage_fr TEXT NULL,            -- Mode d'emploi
    ingredients_fr TEXT NULL,      -- Liste INCI ou ingrédients
    precautions_fr TEXT NULL,      -- Contre-indications
    views_count INTEGER NOT NULL DEFAULT 0,
    is_new BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire et unicité
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_slug_key UNIQUE (slug),

    -- Clés étrangères (SET NULL pour ne pas supprimer les produits si la catégorie/fournisseur disparaît)
    CONSTRAINT products_category_id_fkey 
        FOREIGN KEY (category_id) REFERENCES public.categories (id) ON DELETE SET NULL,
    CONSTRAINT products_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE SET NULL,
    CONSTRAINT products_supplier_id_fkey 
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE SET NULL,

    -- Sécurité sur la note moyenne
    CONSTRAINT products_rating_avg_check 
        CHECK (rating_avg >= 0 AND rating_avg <= 5)
) TABLESPACE pg_default;

-- 2. Index de performance (B-Tree)
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id) WHERE (is_active = TRUE);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id) WHERE (is_active = TRUE);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured) WHERE (is_active = TRUE AND is_featured = TRUE);
CREATE INDEX IF NOT EXISTS idx_products_views ON public.products(views_count DESC) WHERE (is_active = TRUE);
CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE (is_active = TRUE AND is_new = TRUE);

-- 3. INDEX DE RECHERCHE AVANCÉE (GIN)
-- Permet des recherches ultra-rapides sur le nom et la description en français
CREATE INDEX IF NOT EXISTS idx_products_search_fr ON public.products USING GIN (
    to_tsvector('french', name_fr || ' ' || COALESCE(description_fr, ''))
);

-- 4. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_updated_at_products ON public.products;
CREATE TRIGGER trg_updated_at_products
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE PRODUCT_VIEWS TABLE (Analytics)
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.product_views (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    product_id UUID NULL,
    viewed_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT product_views_pkey PRIMARY KEY (id),

    -- Clé étrangère
    -- ON DELETE CASCADE : Si le produit est supprimé, ses données de vues le sont aussi.
    CONSTRAINT product_views_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products (id) 
        ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Pour calculer rapidement le nombre de vues par produit
CREATE INDEX IF NOT EXISTS idx_product_views_product_id 
    ON public.product_views USING btree (product_id);

-- Pour filtrer les vues par période (ex: vues de la semaine dernière)
CREATE INDEX IF NOT EXISTS idx_product_views_viewed_at 
    ON public.product_views USING btree (viewed_at);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE PRODUCT_VARIANTS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    product_id UUID NOT NULL,
    sku VARCHAR(100) NULL,           -- Stock Keeping Unit (identifiant unique logistique)
    price NUMERIC(10, 3) NOT NULL,
    cost_price NUMERIC(10, 3) NULL,  -- Prix d'achat (utile pour calculer tes marges)
    stock INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    weight_grams INTEGER NULL,       -- Poids en grammes (crucial pour calculer les frais de livraison)
    barcode VARCHAR(100) NULL,       -- Code-barres EAN/UPC
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT product_variants_pkey PRIMARY KEY (id),

    -- Un SKU doit être unique dans tout le système
    CONSTRAINT product_variants_sku_key UNIQUE (sku),

    -- Clé étrangère : Si le produit parent est supprimé, ses variantes le sont aussi
    CONSTRAINT product_variants_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products (id) 
        ON DELETE CASCADE,

    -- Sécurités financières et logistiques
    CONSTRAINT product_variants_price_check CHECK (price >= 0),
    CONSTRAINT product_variants_stock_check CHECK (stock >= 0)
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Pour lister rapidement les options d'un produit (ex: tailles, poids disponibles)
CREATE INDEX IF NOT EXISTS idx_variants_product 
    ON public.product_variants USING btree (product_id)
    WHERE (is_active = TRUE);

-- Pour retrouver un produit instantanément en scannant un code ou en cherchant le SKU
CREATE INDEX IF NOT EXISTS idx_variants_sku 
    ON public.product_variants USING btree (sku);

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_updated_at_product_variants ON public.product_variants;

CREATE TRIGGER trg_updated_at_product_variants
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE PRODUCT_VARIANT_ATTRIBUTES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table de liaison (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.product_variant_attributes (
    variant_id UUID NOT NULL,
    attribute_value_id UUID NOT NULL,

    -- Clé primaire composée : garantit qu'on ne peut pas lier deux fois 
    -- la même valeur à la même variante.
    CONSTRAINT product_variant_attributes_pkey PRIMARY KEY (variant_id, attribute_value_id),

    -- Clés étrangères avec CASCADE :
    -- Si la variante ou la valeur d'attribut est supprimée, l'association l'est aussi.
    CONSTRAINT product_variant_attributes_variant_id_fkey 
        FOREIGN KEY (variant_id) 
        REFERENCES public.product_variants (id) 
        ON DELETE CASCADE,

    CONSTRAINT product_variant_attributes_attribute_value_id_fkey 
        FOREIGN KEY (attribute_value_id) 
        REFERENCES public.attribute_values (id) 
        ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Accélère la récupération de toutes les caractéristiques d'une variante
CREATE INDEX IF NOT EXISTS idx_pva_variant_id 
    ON public.product_variant_attributes (variant_id);

-- Accélère la recherche de variantes par valeur d'attribut (utile pour les filtres)
CREATE INDEX IF NOT EXISTS idx_pva_attribute_value_id 
    ON public.product_variant_attributes (attribute_value_id);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE ORDERS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    order_number VARCHAR(30) NULL, -- Généré par trigger (ex: CMD-2026-001)
    user_id UUID NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    
    -- Finance et Paiement
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    payment_id TEXT NULL, -- Référence externe (Stripe, Flouci, etc.)
    subtotal NUMERIC(10, 3) NOT NULL,
    shipping_cost NUMERIC(10, 3) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10, 3) NOT NULL DEFAULT 0,
    total_price NUMERIC(10, 3) NOT NULL,
    
    -- Marketing
    promo_code VARCHAR(50) NULL,
    promo_id UUID NULL,
    
    -- Livraison (Shipping)
    shipping_full_name VARCHAR(150) NOT NULL,
    shipping_phone VARCHAR(30) NULL,
    shipping_address TEXT NOT NULL,
    shipping_city VARCHAR(100) NOT NULL,
    shipping_governorate VARCHAR(100) NULL,
    shipping_postal_code VARCHAR(10) NULL,
    shipping_country VARCHAR(60) NOT NULL DEFAULT 'TN', -- Défaut Tunisie
    
    -- Facturation (Billing)
    billing_full_name VARCHAR(150) NULL,
    billing_phone VARCHAR(30) NULL,
    billing_address TEXT NULL,
    billing_city VARCHAR(100) NULL,
    billing_governorate VARCHAR(100) NULL,
    billing_postal_code VARCHAR(10) NULL,
    billing_country VARCHAR(60) NULL DEFAULT 'CHF',
    
    -- Infos Complémentaires
    notes TEXT NULL,
    cancelled_reason TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- ══════════════════════════════════════════════════════
    -- CONSTRAINTS
    -- ══════════════════════════════════════════════════════
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT orders_order_number_key UNIQUE (order_number),
    
    -- Clés étrangères
    CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) 
        REFERENCES public.users (id) ON DELETE SET NULL,
    CONSTRAINT orders_promo_id_fkey FOREIGN KEY (promo_id) 
        REFERENCES public.promotions (id) ON DELETE SET NULL,
    
    -- Validation du statut de paiement
    CONSTRAINT orders_payment_status_check CHECK (
        payment_status IN ('pending', 'paid', 'failed', 'refunded')
    ),
    
    -- Validation du cycle de vie de la commande
    CONSTRAINT orders_status_check CHECK (
        status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    )
) TABLESPACE pg_default;

-- 2. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

-- 3. Gestion des Triggers
-- A. Génération automatique du numéro de commande
DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- B. Mise à jour automatique de 'updated_at'
DROP TRIGGER IF EXISTS trg_updated_at_orders ON public.orders;
CREATE TRIGGER trg_updated_at_orders
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE ORDER_ITEMS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    order_id UUID NOT NULL,
    variant_id UUID NULL,         -- Peut devenir NULL si la variante est supprimée plus tard
    product_name_fr VARCHAR(255) NULL, -- Sauvegarde du nom pour l'historique
    variant_details JSONB NULL,   -- Sauvegarde des attributs (ex: "Poids: 500g")
    sku VARCHAR(100) NULL,        -- Sauvegarde du SKU au moment de l'achat
    quantity INTEGER NOT NULL,
    price_at_order NUMERIC(10, 3) NOT NULL, -- Prix payé par le client (ne doit jamais changer)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT order_items_pkey PRIMARY KEY (id),

    -- Clés étrangères
    -- Si la commande est supprimée, on supprime ses articles (CASCADE)
    CONSTRAINT order_items_order_id_fkey 
        FOREIGN KEY (order_id) 
        REFERENCES public.orders (id) 
        ON DELETE CASCADE,

    -- Si la variante est supprimée du catalogue, on garde l'article dans la commande (SET NULL)
    CONSTRAINT order_items_variant_id_fkey 
        FOREIGN KEY (variant_id) 
        REFERENCES public.product_variants (id) 
        ON DELETE SET NULL,

    -- Sécurité : On ne peut pas commander 0 ou une quantité négative
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0)
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Crucial pour afficher rapidement le contenu d'une commande
CREATE INDEX IF NOT EXISTS idx_order_items_order 
    ON public.order_items USING btree (order_id);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE FAQS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Activation de l'extension pour la recherche floue (Trigram)
-- Nécessaire pour les index gin_trgm_ops
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Création de la table
CREATE TABLE IF NOT EXISTS public.faqs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    question_fr TEXT NOT NULL,
    answer_fr TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    frequency INTEGER NOT NULL DEFAULT 0, -- Pour suivre les questions les plus consultées
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT faqs_pkey PRIMARY KEY (id),

    -- Validation des catégories autorisées
    CONSTRAINT faqs_category_check CHECK (
        category IN ('livraison', 'paiement', 'produits', 'retours', 'autre')
    )
) TABLESPACE pg_default;

-- 3. Index pour l'organisation et le filtrage
-- Accélère l'affichage par catégorie (ex: toutes les questions sur la livraison)
CREATE INDEX IF NOT EXISTS idx_faqs_category 
    ON public.faqs (category) WHERE (is_active = TRUE);

-- Accélère le tri personnalisé (l'ordre d'affichage choisi en admin)
CREATE INDEX IF NOT EXISTS idx_faqs_order 
    ON public.faqs (order_index);

-- 4. Index pour la recherche textuelle avancée
-- Index GIN pour la recherche plein texte (Full Text Search)
CREATE INDEX IF NOT EXISTS idx_faqs_search ON public.faqs USING GIN (
    to_tsvector('french', question_fr || ' ' || answer_fr)
);

-- Index Trigram pour la recherche floue (si l'utilisateur fait une faute de frappe)
CREATE INDEX IF NOT EXISTS idx_faqs_trgm_question 
    ON public.faqs USING GIN (question_fr gin_trgm_ops) WHERE (is_active = TRUE);

CREATE INDEX IF NOT EXISTS idx_faqs_trgm_answer 
    ON public.faqs USING GIN (answer_fr gin_trgm_ops) WHERE (is_active = TRUE);

-- 5. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_updated_at_faqs ON public.faqs;
CREATE TRIGGER trg_updated_at_faqs
    BEFORE UPDATE ON public.faqs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE FAQ_QUESTIONS TABLE (User Inquiries)
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.faq_questions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,               -- Optionnel (si l'utilisateur est connecté)
    user_name VARCHAR(150) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    matched_automatically BOOLEAN NOT NULL DEFAULT FALSE, -- Si un bot/IA a répondu
    faq_id UUID NULL,                -- Liaison vers une FAQ existante si pertinent
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMP WITH TIME ZONE NULL,

    -- Clé primaire
    CONSTRAINT faq_questions_pkey PRIMARY KEY (id),

    -- Clé étrangère vers l'utilisateur
    CONSTRAINT faq_questions_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL,

    -- Clé étrangère vers la table FAQ (si la question devient une FAQ officielle)
    CONSTRAINT faq_questions_faq_id_fkey 
        FOREIGN KEY (faq_id) REFERENCES public.faqs (id) ON DELETE SET NULL,

    -- Validation du statut
    CONSTRAINT faq_questions_status_check CHECK (
        status IN ('pending', 'answered', 'closed')
    )
) TABLESPACE pg_default;

-- 2. Création des Index pour le Dashboard Admin
CREATE INDEX IF NOT EXISTS idx_faq_questions_status ON public.faq_questions (status);
CREATE INDEX IF NOT EXISTS idx_faq_questions_user ON public.faq_questions (user_id);
CREATE INDEX IF NOT EXISTS idx_faq_questions_email ON public.faq_questions (user_email);
CREATE INDEX IF NOT EXISTS idx_faq_questions_matched ON public.faq_questions (matched_automatically);

-- Index pour voir les questions les plus récentes en haut (SAV)
CREATE INDEX IF NOT EXISTS idx_faq_questions_created 
    ON public.faq_questions (created_at DESC);

-- Index partiel pour les questions liées à une FAQ existante
CREATE INDEX IF NOT EXISTS idx_faq_questions_faq_id 
    ON public.faq_questions (faq_id) WHERE (faq_id IS NOT NULL);

-- 3. Gestion du Trigger pour answered_at
-- Ce trigger mettra automatiquement à jour la date quand 'answer' est rempli
DROP TRIGGER IF EXISTS trg_answered_at ON public.faq_questions;
CREATE TRIGGER trg_answered_at
    BEFORE UPDATE ON public.faq_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_answered_at();


    -- Ce qu'on a créé
CREATE VIEW faqs_public AS
  SELECT id, category, question_fr, answer_fr, order_index, frequency
  FROM faqs                        ← lit toujours depuis la vraie table
  WHERE is_active = true
  ORDER BY frequency DESC, order_index ASC;

  -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE EMAIL_SUBSCRIPTIONS TABLE (Newsletter)
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.email_subscriptions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,               -- Optionnel (si l'abonné a aussi un compte client)
    email VARCHAR(150) NOT NULL,
    name VARCHAR(100) NULL,          -- Pour personnaliser les emails (ex: "Bonjour Roua")
    is_active BOOLEAN NULL DEFAULT TRUE,
    subscribed_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMP WITHOUT TIME ZONE NULL,

    -- Clé primaire
    CONSTRAINT email_subscriptions_pkey PRIMARY KEY (id),

    -- Un email ne peut s'inscrire qu'une seule fois à la newsletter
    CONSTRAINT email_subscriptions_email_key UNIQUE (email),

    -- Clé étrangère vers l'utilisateur
    -- Si le compte utilisateur est supprimé, on peut supprimer l'abonnement (CASCADE)
    -- ou le garder (SET NULL) selon ton choix RGPD. Ici j'ai gardé ton CASCADE.
    CONSTRAINT email_subscriptions_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Essentiel pour envoyer tes campagnes d'emails uniquement aux abonnés actifs
CREATE INDEX IF NOT EXISTS idx_email_subs_active 
    ON public.email_subscriptions (email) WHERE (is_active = TRUE);

-- Pour lier rapidement un utilisateur à son abonnement
CREATE INDEX IF NOT EXISTS idx_email_subs_user 
    ON public.email_subscriptions (user_id) WHERE (user_id IS NOT NULL);

-- 3. Gestion du Trigger pour le désabonnement (Optionnel mais recommandé)
-- Ce trigger peut remplir automatiquement unsubscribed_at quand is_active passe à false
CREATE OR REPLACE FUNCTION handle_unsubscription()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = FALSE AND OLD.is_active = TRUE THEN
        NEW.unsubscribed_at = NOW();
    ELSIF NEW.is_active = TRUE THEN
        NEW.unsubscribed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_unsubscription
    BEFORE UPDATE ON public.email_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION handle_unsubscription();
    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE EMAIL_CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,      -- Nom interne (ex: "Promo Miel Printemps 2026")
    subject VARCHAR(200) NOT NULL,    -- Objet du mail que le client verra
    type VARCHAR(50) NOT NULL,       -- Ex: 'newsletter', 'promotion', 'alerte_stock'
    content_fr TEXT NULL,            -- Corps du mail (souvent en HTML)
    status VARCHAR(20) NULL DEFAULT 'draft',
    scheduled_at TIMESTAMP WITHOUT TIME ZONE NULL, -- Date de programmation
    sent_at TIMESTAMP WITHOUT TIME ZONE NULL,      -- Date réelle d'envoi
    sent_count INTEGER NULL DEFAULT 0,             -- Nombre d'emails envoyés
    created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT email_campaigns_pkey PRIMARY KEY (id),

    -- Sécurité sur les statuts
    CONSTRAINT email_campaigns_status_check CHECK (
        status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')
    )
) TABLESPACE pg_default;

-- 2. Création des Index pour la gestion des campagnes
-- Pour retrouver rapidement les campagnes programmées à venir
CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled 
    ON public.email_campaigns (status, scheduled_at) 
    WHERE (status = 'scheduled');

-- Pour trier les campagnes par date de création dans ton admin
CREATE INDEX IF NOT EXISTS idx_campaigns_created 
    ON public.email_campaigns (created_at DESC);

-- 3. Trigger pour mettre à jour automatiquement sent_at
-- Si le statut passe à 'sent', on enregistre l'heure exacte.
CREATE OR REPLACE FUNCTION handle_campaign_sent()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
        NEW.sent_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_campaign_sent
    BEFORE UPDATE ON public.email_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION handle_campaign_sent();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE DELIVERIES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    order_id UUID NOT NULL,
    carrier VARCHAR(100) NULL,          -- Nom du transporteur (ex: Aramex, Poste, Interne)
    tracking_number VARCHAR(150) NULL,  -- Numéro de suivi pour le client
    status VARCHAR(30) NOT NULL DEFAULT 'preparing',
    estimated_date DATE NULL,           -- Date de livraison estimée
    delivered_at TIMESTAMP WITH TIME ZONE NULL,
    notes TEXT NULL,                    -- Instructions pour le livreur
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT deliveries_pkey PRIMARY KEY (id),

    -- Clé étrangère : Si la commande est supprimée, la livraison associée l'est aussi
    CONSTRAINT deliveries_order_id_fkey 
        FOREIGN KEY (order_id) 
        REFERENCES public.orders (id) 
        ON DELETE CASCADE,

    -- Validation stricte du cycle de vie de livraison
    CONSTRAINT deliveries_status_check CHECK (
        status IN (
            'preparing', 
            'shipped', 
            'in_transit', 
            'out_for_delivery', 
            'delivered', 
            'failed', 
            'returned'
        )
    )
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Pour retrouver instantanément la livraison d'une commande spécifique
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id 
    ON public.deliveries (order_id);

-- Pour filtrer les livraisons en cours dans le dashboard livreur/admin
CREATE INDEX IF NOT EXISTS idx_deliveries_status 
    ON public.deliveries (status) 
    WHERE (status != 'delivered');

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_updated_at_deliveries ON public.deliveries;
CREATE TRIGGER trg_updated_at_deliveries
    BEFORE UPDATE ON public.deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE CATEGORIES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name_fr VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL, -- URL friendly (ex: /categories/miels-purs)
    description_fr TEXT NULL,
    images JSONB NULL,          -- Pour stocker l'icône ou la bannière de la catégorie
    parent_id UUID NULL,        -- Pour gérer les sous-catégories
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    
    -- Le slug doit être unique pour le SEO
    CONSTRAINT categories_slug_key UNIQUE (slug),
    
    -- Auto-référence : Une catégorie peut avoir une catégorie parente
    -- Si on supprime le parent, les enfants deviennent des catégories racines (SET NULL)
    CONSTRAINT categories_parent_id_fkey 
        FOREIGN KEY (parent_id) 
        REFERENCES public.categories (id) 
        ON DELETE SET NULL
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Pour charger une catégorie via son URL
CREATE INDEX IF NOT EXISTS idx_categories_slug 
    ON public.categories USING btree (slug);

-- Pour récupérer rapidement toutes les sous-catégories d'un parent
CREATE INDEX IF NOT EXISTS idx_categories_parent 
    ON public.categories USING btree (parent_id);

-- 3. Gestion du Trigger pour updated_at
DROP TRIGGER IF EXISTS trg_updated_at_categories ON public.categories;
CREATE TRIGGER trg_updated_at_categories
    BEFORE UPDATE ON public.categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE ATTRIBUTE_VALUES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.attribute_values (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    attribute_type_id UUID NOT NULL, -- Lien vers le type (ex: "Poids" ou "Parfum")
    value_fr VARCHAR(100) NOT NULL,  -- La valeur elle-même
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT attribute_values_pkey PRIMARY KEY (id),

    -- Clé étrangère vers les types d'attributs
    -- ON DELETE CASCADE : si on supprime le type "Poids", toutes ses valeurs (500g, 1kg) sont supprimées.
    CONSTRAINT attribute_values_attribute_type_id_fkey 
        FOREIGN KEY (attribute_type_id) 
        REFERENCES public.attribute_types (id) 
        ON DELETE CASCADE
) TABLESPACE pg_default;

-- 2. Création des Index pour les performances
-- Accélère la récupération des valeurs quand tu filtres par type d'attribut
CREATE INDEX IF NOT EXISTS idx_attribute_values_type 
    ON public.attribute_values USING btree (attribute_type_id);

-- Accélère le tri pour l'affichage dans les sélecteurs de ton app (dropdowns)
CREATE INDEX IF NOT EXISTS idx_attribute_values_order 
    ON public.attribute_values USING btree (sort_order);

    -- ═══════════════════════════════════════════════════════════
-- MIGRATION — CREATE ATTRIBUTE_TYPES TABLE
-- ═══════════════════════════════════════════════════════════

-- 1. Création de la table
CREATE TABLE IF NOT EXISTS public.attribute_types (
    id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
    name_fr VARCHAR(100) NOT NULL, -- Nom de l'attribut (ex: 'Poids', 'Volume')
    unit VARCHAR(20) NULL,        -- Unité de mesure (ex: 'g', 'ml', 'kg')
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Clé primaire
    CONSTRAINT attribute_types_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- 2. Index pour les performances
-- Pour lister rapidement les types d'attributs dans ton interface d'administration
CREATE INDEX IF NOT EXISTS idx_attribute_types_name 
    ON public.attribute_types (name_fr);