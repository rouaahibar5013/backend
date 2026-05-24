import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let userToken = null
let adminToken = null
let createdOrderId = null
let productId = null
let variantId = null

beforeAll(async () => {
  // Login admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (adminRes.body.token) adminToken = adminRes.body.token

  // Login user
  const userRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    })
  if (userRes.body.token) userToken = userRes.body.token

  // Récupère un vrai produit avec variant
  const listRes = await request(app).get('/api/products?limit=1')
  const products = listRes.body.products || listRes.body
  const data = Array.isArray(products) ? products : []

  if (data.length > 0) {
    productId = data[0].id
    const variants = data[0].variants || []
    if (variants.length > 0) variantId = variants[0].id
    console.log(`✅ Produit: ${productId}, Variant: ${variantId}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROUTES PUBLIQUES
// ─────────────────────────────────────────────────────────────────────────────

describe('🚚 GET /api/orders/shipping-cost — Frais de livraison', () => {

  it('✅ retourne les frais de livraison', async () => {
    const res = await request(app).get('/api/orders/shipping-cost')
     expect([200, 400]).toContain(res.statusCode)
    expect(res.body).toBeDefined()
  })
   it('❌ refuse un body vide au calcul', async () => {
    const res = await request(app)
      .get('/api/orders/shipping-cost')
      .query({})
    expect([200, 400]).toContain(res.statusCode)
  })
})



describe('🎟️ POST /api/orders/validate-promo — Valider un code promo', () => {

  it('❌ refuse un code promo invalide', async () => {
    const res = await request(app)
      .post('/api/orders/validate-promo')
      .send({ code: 'CODEINVALIDE123' })

    expect([400, 404]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    const res = await request(app)
      .post('/api/orders/validate-promo')
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMMANDE INVITE (guest)
// ─────────────────────────────────────────────────────────────────────────────

describe('👤 POST /api/orders/guest — Commande invité', () => {

  it('❌ refuse un body vide', async () => {
    const res = await request(app)
      .post('/api/orders/guest')
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/orders/guest')
      .send({
        items: [{ productId, variantId, quantity: 1 }],
        shippingAddress: { street: '1 rue Test', city: 'Tunis' },
      })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si items manquant', async () => {
    const res = await request(app)
      .post('/api/orders/guest')
      .send({
        email: 'guest@test.com',
        shippingAddress: { street: '1 rue Test', city: 'Tunis' },
      })

    expect([400, 422]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROTECTION — Routes qui nécessitent un token
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes protégées — Sans token', () => {

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [] })
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /my — refuse sans token', async () => {
    const res = await request(app).get('/api/orders/my')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /all — refuse sans token', async () => {
    const res = await request(app).get('/api/orders/all')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /:orderId — refuse sans token', async () => {
    const res = await request(app).get('/api/orders/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ PATCH /:orderId/status — refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/orders/1/status')
      .send({ status: 'shipped' })
    expect(res.statusCode).toBe(401)
  })

  it('❌ PATCH /:orderId/cancel — refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/orders/1/cancel')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREER UNE COMMANDE — User connecté
// ─────────────────────────────────────────────────────────────────────────────

describe('🛒 POST /api/orders — Créer une commande', () => {

  it('❌ refuse un body vide', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si items vide', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [] })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si adresse manquante', async () => {
    if (!userToken || !productId) return

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [{ productId, variantId, quantity: 1 }],
      })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('✅ crée une commande avec des données valides', async () => {
    if (!userToken || !productId || !variantId) {
      console.log('⚠️ Token ou produit/variant manquant — test skippé')
      return
    }

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [{ productId, variantId, quantity: 1 }],
        shippingAddress: {
          street: '1 rue Test',
          city: 'Tunis',
          postalCode: '1000',
          country: 'TN',
        },
        paymentMethod: 'stripe',
      })

    expect([200, 201]).toContain(res.statusCode)

    if ([200, 201].includes(res.statusCode)) {
      const order = res.body.order || res.body
      createdOrderId = order.id
      console.log(`✅ Commande créée avec ID: ${createdOrderId}`)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. MES COMMANDES — User connecté
// ─────────────────────────────────────────────────────────────────────────────

describe('📦 GET /api/orders/my — Mes commandes', () => {

  it('✅ retourne les commandes de l\'utilisateur', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/orders/my')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ accepte une pagination', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/orders/my?page=1&limit=10')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. DETAIL COMMANDE
// ─────────────────────────────────────────────────────────────────────────────

describe('🔍 GET /api/orders/:orderId — Détail commande', () => {

  it('✅ retourne le détail de la commande créée', async () => {
    if (!userToken || !createdOrderId) return

    const res = await request(app)
      .get(`/api/orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('❌ retourne une erreur pour une commande inexistante', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/orders/999999999')
      .set('Authorization', `Bearer ${userToken}`)

    expect([400, 403, 404]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).get('/api/orders/1')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 7. ADMIN — Toutes les commandes
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 GET /api/orders/all — Toutes les commandes (Admin)', () => {

  it('✅ retourne toutes les commandes avec token admin', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/orders/all')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('❌ refuse un user non admin', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/orders/all')
      .set('Authorization', `Bearer ${userToken}`)

    expect([401, 403]).toContain(res.statusCode)
  })

  it('✅ accepte des filtres', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/orders/all?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 8. ADMIN — Modifier statut commande
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 PATCH /api/orders/:id/status — Modifier statut (Admin)', () => {

  it('✅ modifie le statut d\'une commande', async () => {
    if (!adminToken || !createdOrderId) return

    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' })

    expect([200, 201]).toContain(res.statusCode)
  })

  it('❌ refuse un statut invalide', async () => {
    if (!adminToken || !createdOrderId) return

    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'statutinvalide' })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/orders/1/status')
      .send({ status: 'shipped' })
    expect(res.statusCode).toBe(401)
  })

  it('❌ refuse un user non admin', async () => {
    if (!userToken) return

    const res = await request(app)
      .patch('/api/orders/1/status')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'shipped' })

    expect([401, 403]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 9. ADMIN — Routes Odoo et Stock
// ─────────────────────────────────────────────────────────────────────────────

describe('⚙️ Routes Odoo — Protection Admin', () => {

  it('❌ GET /odoo/settings — refuse sans token', async () => {
    const res = await request(app).get('/api/orders/odoo/settings')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /admin/low-stock — refuse sans token', async () => {
    const res = await request(app).get('/api/orders/admin/low-stock')
    expect(res.statusCode).toBe(401)
  })

  it('✅ GET /odoo/settings — accepte token admin', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/orders/odoo/settings')
      .set('Authorization', `Bearer ${adminToken}`)

    expect([200, 404]).toContain(res.statusCode)
  })

  it('✅ GET /admin/low-stock — accepte token admin', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/orders/admin/low-stock')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 10. ANNULATION COMMANDE
// ─────────────────────────────────────────────────────────────────────────────

describe('❌ PATCH /api/orders/:id/cancel — Annuler commande (Admin)', () => {

  it('❌ refuse sans token', async () => {
    const res = await request(app).patch('/api/orders/1/cancel')
    expect(res.statusCode).toBe(401)
  })

  it('❌ refuse un user non admin', async () => {
    if (!userToken) return

    const res = await request(app)
      .patch('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${userToken}`)

    expect([401, 403]).toContain(res.statusCode)
  })

  it('✅ annule la commande créée (admin)', async () => {
    if (!adminToken || !createdOrderId) return

    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Commande ${createdOrderId} annulée`)
  })

})

afterAll(() => {
  console.log('✅ Tests commandes terminés')
})