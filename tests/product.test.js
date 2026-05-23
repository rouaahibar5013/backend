import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

// ─── Tokens ───────────────────────────────────────────────────────────────────
// On récupère un token admin avant tous les tests
let adminToken = null
let userToken = null
let createdProductId = null
let createdVariantId = null

beforeAll(async () => {
  // Login admin — remplace par tes vraies credentials admin dans ta BDD de test
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (adminRes.body.token) adminToken = adminRes.body.token

  // Login user normal
  const userRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    })
  if (userRes.body.token) userToken = userRes.body.token
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROUTES PUBLIQUES
// ─────────────────────────────────────────────────────────────────────────────

describe('🌍 GET /api/products — Liste publique', () => {

  it('✅ retourne la liste des produits', async () => {
    const res = await request(app).get('/api/products')

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ accepte un paramètre de recherche', async () => {
    const res = await request(app).get('/api/products?search=huile')

    expect(res.statusCode).toBe(200)
  })

  it('✅ accepte une pagination', async () => {
    const res = await request(app).get('/api/products?page=1&limit=10')

    expect(res.statusCode).toBe(200)
  })

  it('✅ accepte un filtre par catégorie', async () => {
    const res = await request(app).get('/api/products?category=1')

    expect(res.statusCode).toBe(200)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRODUITS FEATURED
// ─────────────────────────────────────────────────────────────────────────────

describe('⭐ GET /api/products/featured — Produits mis en avant', () => {

  it('✅ retourne les produits featured', async () => {
    const res = await request(app).get('/api/products/featured')

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. DETAIL PRODUIT PUBLIC
// ─────────────────────────────────────────────────────────────────────────────

describe('🔍 GET /api/products/:productId — Détail produit', () => {

  it('✅ retourne un produit existant', async () => {
    // D'abord récupère un vrai ID depuis la liste
    const listRes = await request(app).get('/api/products?limit=1')
    const products = listRes.body.products || listRes.body

    if (!products || products.length === 0) {
      console.log('⚠️ Aucun produit en BDD — test skippé')
      return
    }

    const productId = products[0].id

    const res = await request(app).get(`/api/products/${productId}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.product).toHaveProperty('id')
  })

  it('❌ retourne 404 pour un produit inexistant', async () => {
    const res = await request(app).get('/api/products/999999999')

    expect([404, 400]).toContain(res.statusCode)
  })

  it('❌ retourne une erreur pour un ID invalide', async () => {
    const res = await request(app).get('/api/products/pasuniD')

    expect([400, 404, 500]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROUTES ADMIN — Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes Admin — Protection sans token', () => {

  it('❌ GET /admin/all — refuse sans token', async () => {
    const res = await request(app).get('/api/products/admin/all')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ name: 'Produit Test' })
    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:id — refuse sans token', async () => {
    const res = await request(app)
      .put('/api/products/1')
      .send({ name: 'Modif' })
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:id — refuse sans token', async () => {
    const res = await request(app).delete('/api/products/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST /:id/variants — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/products/1/variants')
      .send({})
    expect(res.statusCode).toBe(401)
  })

})

describe('🔒 Routes Admin — Refus token user normal', () => {

  it('❌ POST / — refuse un user non admin', async () => {
    if (!userToken) return
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Produit Test' })
    expect([401, 403]).toContain(res.statusCode)
  })

  it('❌ DELETE /:id — refuse un user non admin', async () => {
    if (!userToken) return
    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${userToken}`)
    expect([401, 403]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. CRUD ADMIN — Avec token admin
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 POST /api/products — Créer un produit (Admin)', () => {

  it('✅ crée un produit avec des données valides', async () => {
    if (!adminToken) {
      console.log('⚠️ Pas de token admin — test skippé')
      return
    }

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Produit Test ${Date.now()}`,
        description: 'Description test',
        price: 29.99,
        categoryId: 1,
      })

    expect([200, 201]).toContain(res.statusCode)

    if (res.statusCode === 201 || res.statusCode === 200) {
      const product = res.body.product || res.body
      createdProductId = product.id
      console.log(`✅ Produit créé avec ID: ${createdProductId}`)
    }
  })

  it('❌ refuse si nom manquant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 29.99 })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si prix négatif', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', price: -10 })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

})

describe('👑 GET /api/products/admin/all — Liste admin', () => {

  it('✅ retourne tous les produits avec token admin', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/products/admin/all')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

})

describe('👑 PUT /api/products/:id — Modifier un produit (Admin)', () => {

  it('✅ modifie un produit existant', async () => {
    if (!adminToken || !createdProductId) return

    const res = await request(app)
      .put(`/api/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Produit Modifié' })

    expect([200, 201]).toContain(res.statusCode)
  })

  it('❌ retourne 404 pour un produit inexistant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .put('/api/products/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test' })

    expect([404, 400]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

describe('📦 Variants — CRUD Admin', () => {

  it('✅ ajoute un variant à un produit', async () => {
    if (!adminToken || !createdProductId) return

    const res = await request(app)
      .post(`/api/products/${createdProductId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: '500ml',
        price: 19.99,
        stock: 100,
      })

    expect([200, 201]).toContain(res.statusCode)

    if (res.statusCode === 201 || res.statusCode === 200) {
      const variant = res.body.variant || res.body
      createdVariantId = variant.id
      console.log(`✅ Variant créé avec ID: ${createdVariantId}`)
    }
  })

  it('❌ refuse un variant sans token', async () => {
    const res = await request(app)
      .post(`/api/products/1/variants`)
      .send({ size: '500ml', price: 19.99 })

    expect(res.statusCode).toBe(401)
  })

  it('✅ modifie un variant existant', async () => {
    if (!adminToken || !createdProductId || !createdVariantId) return

    const res = await request(app)
      .put(`/api/products/${createdProductId}/variants/${createdVariantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 24.99, stock: 50 })

    expect([200, 201]).toContain(res.statusCode)
  })

  it('❌ supprime un variant — refuse sans token', async () => {
    const res = await request(app)
      .delete(`/api/products/1/variants/1`)

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 7. PROMOTIONS VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

describe('🏷️ Promotions Variants — Protection', () => {

  it('❌ GET promotions — refuse sans token', async () => {
    const res = await request(app)
      .get('/api/products/1/variants/1/promotions')

    expect(res.statusCode).toBe(401)
  })

  it('❌ POST promotion — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/products/1/variants/1/promotions')
      .send({ discount: 10 })

    expect(res.statusCode).toBe(401)
  })

  it('✅ GET promotions — accepte token admin', async () => {
    if (!adminToken || !createdProductId || !createdVariantId) return

    const res = await request(app)
      .get(`/api/products/${createdProductId}/variants/${createdVariantId}/promotions`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect([200, 404]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 8. SUPPRESSION — En dernier pour garder les données pendant les autres tests
// ─────────────────────────────────────────────────────────────────────────────

describe('🗑️ DELETE /api/products/:id — Supprimer (Admin)', () => {

  it('✅ supprime le produit créé pendant les tests', async () => {
    if (!adminToken || !createdProductId) return

    const res = await request(app)
      .delete(`/api/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Produit ${createdProductId} supprimé`)
  })

  it('❌ retourne 404 pour un produit inexistant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .delete('/api/products/999999999')
      .set('Authorization', `Bearer ${adminToken}`)

    expect([404, 400]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).delete('/api/products/1')
    expect(res.statusCode).toBe(401)
  })

})

afterAll(() => {
  console.log('✅ Tests produits terminés')
})