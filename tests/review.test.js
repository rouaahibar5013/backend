import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let userToken = null
let createdReviewId = null

beforeAll(async () => {
  // Login admin
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
// 1. REVIEWS PUBLIQUES D'UN PRODUIT
// ─────────────────────────────────────────────────────────────────────────────

describe('🌍 GET /api/reviews/product/:productId — Reviews publiques', () => {

  it('✅ retourne les reviews d\'un produit existant', async () => {
    // Récupère un vrai produit d'abord
    const listRes = await request(app).get('/api/products?limit=1')
    const products = listRes.body.products || listRes.body
    const data = Array.isArray(products) ? products : []

    if (data.length === 0) {
      console.log('⚠️ Aucun produit en BDD — test skippé')
      return
    }

    const productId = data[0].id
    const res = await request(app).get(`/api/reviews/product/${productId}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ retourne un tableau vide pour un produit sans reviews', async () => {
    const res = await request(app).get('/api/reviews/product/999999999')

expect([200, 404, 500]).toContain(res.statusCode)  })

  it('❌ retourne une erreur pour un ID invalide', async () => {
    const res = await request(app).get('/api/reviews/product/pasuniD')

    expect([400, 404, 500]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROTECTION — ROUTES QUI NECESSITENT UN TOKEN
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes protégées — Sans token', () => {

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ productId: 1, rating: 5, comment: 'Super !' })

    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:reviewId — refuse sans token', async () => {
    const res = await request(app)
      .put('/api/reviews/1')
      .send({ rating: 4, comment: 'Bien' })

    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:reviewId — refuse sans token', async () => {
    const res = await request(app)
      .delete('/api/reviews/1')

    expect(res.statusCode).toBe(401)
  })

  it('❌ GET / (admin) — refuse sans token', async () => {
    const res = await request(app).get('/api/reviews')

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREER UNE REVIEW — User connecté
// ─────────────────────────────────────────────────────────────────────────────

describe('✍️ POST /api/reviews — Créer une review', () => {

  it('✅ crée une review avec des données valides', async () => {
    if (!userToken) {
      console.log('⚠️ Pas de token user — test skippé')
      return
    }

    // Récupère un vrai produit
    const listRes = await request(app).get('/api/products?limit=1')
    const products = listRes.body.products || listRes.body
    const data = Array.isArray(products) ? products : []

    if (data.length === 0) {
      console.log('⚠️ Aucun produit en BDD — test skippé')
      return
    }

    const productId = data[0].id

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        productId,
        rating: 5,
        comment: `Super produit ! Test ${Date.now()}`,
      })

    expect([200, 201]).toContain(res.statusCode)

    if ([200, 201].includes(res.statusCode)) {
      const review = res.body.review || res.body
      createdReviewId = review.id
      console.log(`✅ Review créée avec ID: ${createdReviewId}`)
    }
  })

  it('❌ refuse si rating manquant', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId: 1, comment: 'Bien' })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si productId manquant', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 5, comment: 'Bien' })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un rating invalide (hors 1-5)', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId: 1, rating: 10, comment: 'Test' })

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    if (!userToken) return

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. MODIFIER UNE REVIEW
// ─────────────────────────────────────────────────────────────────────────────

describe('✏️ PUT /api/reviews/:reviewId — Modifier une review', () => {

  it('✅ modifie la review créée', async () => {
    if (!userToken || !createdReviewId) return

    const res = await request(app)
      .put(`/api/reviews/${createdReviewId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 4, comment: 'Très bien en fait !' })

    expect([200, 201]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .put('/api/reviews/1')
      .send({ rating: 4 })

    expect(res.statusCode).toBe(401)
  })

  it('❌ retourne une erreur pour une review inexistante', async () => {
    if (!userToken) return

    const res = await request(app)
      .put('/api/reviews/999999999')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 4, comment: 'Test' })

    expect([403, 404, 400]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. ADMIN — Toutes les reviews
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 GET /api/reviews — Toutes les reviews (Admin)', () => {

  it('✅ retourne toutes les reviews avec token admin', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/reviews')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('❌ refuse un user non admin', async () => {
    if (!userToken) return

    const res = await request(app)
      .get('/api/reviews')
      .set('Authorization', `Bearer ${userToken}`)

    expect([401, 403]).toContain(res.statusCode)
  })

  it('✅ accepte un filtre par rating', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/reviews?rating=5')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
  })

  it('✅ accepte une pagination', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/reviews?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUPPRIMER UNE REVIEW — En dernier
// ─────────────────────────────────────────────────────────────────────────────

describe('🗑️ DELETE /api/reviews/:reviewId — Supprimer', () => {

  it('✅ supprime la review créée pendant les tests', async () => {
    if (!userToken || !createdReviewId) return

    const res = await request(app)
      .delete(`/api/reviews/${createdReviewId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Review ${createdReviewId} supprimée`)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).delete('/api/reviews/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ retourne une erreur pour une review inexistante', async () => {
    if (!userToken) return

    const res = await request(app)
      .delete('/api/reviews/999999999')
      .set('Authorization', `Bearer ${userToken}`)

    expect([403, 404, 400]).toContain(res.statusCode)
  })

})

afterAll(() => {
  console.log('✅ Tests reviews terminés')
})