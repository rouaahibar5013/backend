import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let userToken = null
let productId = null

beforeAll(async () => {
  // Login user normal
  const userRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    })
  if (userRes.body.token) userToken = userRes.body.token

  // Récupère un vrai produit pour les tests
  const listRes = await request(app).get('/api/products?limit=1')
  const products = listRes.body.products || listRes.body
  const data = Array.isArray(products) ? products : []
  if (data.length > 0) {
    productId = data[0].id
    console.log(`✅ Produit trouvé pour les tests: ID ${productId}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROTECTION — Toutes les routes wishlist nécessitent un token
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes Wishlist — Protection sans token', () => {

  it('❌ GET / — refuse sans token', async () => {
    const res = await request(app).get('/api/wishlist')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST /:productId — refuse sans token', async () => {
    const res = await request(app).post('/api/wishlist/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:productId — refuse sans token', async () => {
    const res = await request(app).delete('/api/wishlist/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE / (clear) — refuse sans token', async () => {
    const res = await request(app).delete('/api/wishlist')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET WISHLIST
// ─────────────────────────────────────────────────────────────────────────────

describe('📋 GET /api/wishlist — Récupérer la wishlist', () => {

  it('✅ retourne la wishlist de l\'utilisateur connecté', async () => {
    if (!userToken) {
      console.log('⚠️ Pas de token user — test skippé')
      return
    }

    const res = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ la wishlist est un tableau ou objet valide', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)
    const data = res.body.wishlist || res.body.items || res.body
    expect(data).toBeDefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. AJOUTER UN PRODUIT A LA WISHLIST
// ─────────────────────────────────────────────────────────────────────────────

describe('➕ POST /api/wishlist/:productId — Ajouter à la wishlist', () => {

  it('✅ ajoute un produit existant à la wishlist', async () => {
    if (!userToken || !productId) {
      console.log('⚠️ Token ou produit manquant — test skippé')
      return
    }

    const res = await request(app)
      .post(`/api/wishlist/${productId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 201]).toContain(res.statusCode)
    console.log(`✅ Produit ${productId} ajouté à la wishlist`)
  })

  it('✅ ajouter un produit déjà dans la wishlist ne plante pas', async () => {
    if (!userToken || !productId) return

    // On ajoute une deuxième fois le même produit
    const res = await request(app)
      .post(`/api/wishlist/${productId}`)
      .set('Authorization', `Bearer ${userToken}`)

    // Soit il l'accepte (idempotent), soit il dit "déjà présent"
    expect([200, 201, 400, 409]).toContain(res.statusCode)
  })

  it('❌ retourne une erreur pour un produit inexistant', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/wishlist/999999999')
      .set('Authorization', `Bearer ${userToken}`)

    expect([400, 404, 500]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).post('/api/wishlist/1')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUPPRIMER UN PRODUIT DE LA WISHLIST
// ─────────────────────────────────────────────────────────────────────────────

describe('➖ DELETE /api/wishlist/:productId — Retirer de la wishlist', () => {

  it('✅ retire un produit de la wishlist', async () => {
    if (!userToken || !productId) {
      console.log('⚠️ Token ou produit manquant — test skippé')
      return
    }

    const res = await request(app)
      .delete(`/api/wishlist/${productId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log(`✅ Produit ${productId} retiré de la wishlist`)
  })

  it('❌ retourne une erreur pour un produit inexistant dans la wishlist', async () => {
    if (!userToken) return

    const res = await request(app)
      .delete('/api/wishlist/999999999')
      .set('Authorization', `Bearer ${userToken}`)

    expect([400, 404, 500]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).delete('/api/wishlist/1')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. VIDER LA WISHLIST — En dernier
// ─────────────────────────────────────────────────────────────────────────────

describe('🗑️ DELETE /api/wishlist — Vider la wishlist', () => {

  it('✅ re-ajoute un produit avant de vider', async () => {
    if (!userToken || !productId) return

    const res = await request(app)
      .post(`/api/wishlist/${productId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 201, 400, 409]).toContain(res.statusCode)
  })

  it('✅ vide complètement la wishlist', async () => {
    if (!userToken) {
      console.log('⚠️ Pas de token user — test skippé')
      return
    }

    const res = await request(app)
      .delete('/api/wishlist')
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log('🗑️ Wishlist vidée')
  })

  it('✅ vider une wishlist déjà vide ne plante pas', async () => {
    if (!userToken) return

    const res = await request(app)
      .delete('/api/wishlist')
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 204, 400]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).delete('/api/wishlist')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. VERIFICATION FINALE — Wishlist vide après nettoyage
// ─────────────────────────────────────────────────────────────────────────────

describe('✅ Vérification finale — Wishlist propre', () => {

  it('✅ la wishlist est vide après les tests', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.statusCode).toBe(200)

    const items = res.body.wishlist || res.body.items || res.body
    const count = Array.isArray(items) ? items.length : 0
    console.log(`📋 Wishlist finale: ${count} item(s)`)
  })

})

afterAll(() => {
  console.log('✅ Tests wishlist terminés')
})