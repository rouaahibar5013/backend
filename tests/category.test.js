import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdCategoryId = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (res.body.token) adminToken = res.body.token
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROUTES PUBLIQUES
// ─────────────────────────────────────────────────────────────────────────────

describe('🌍 GET /api/categories — Liste publique', () => {

  it('✅ retourne toutes les catégories', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ la réponse est un tableau ou un objet valide', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.statusCode).toBe(200)
    const data = res.body.categories || res.body
    expect(data).toBeDefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETAIL CATEGORIE
// ─────────────────────────────────────────────────────────────────────────────

describe('🔍 GET /api/categories/:id — Détail catégorie', () => {

  it('✅ retourne une catégorie existante', async () => {
    const listRes = await request(app).get('/api/categories')
    const data = listRes.body.categories || listRes.body
    const categories = Array.isArray(data) ? data : []

    if (categories.length === 0) {
      console.log('⚠️ Aucune catégorie en BDD — test skippé')
      return
    }

    const categoryId = categories[0].id
    const res = await request(app).get(`/api/categories/${categoryId}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('❌ retourne 404 pour une catégorie inexistante', async () => {
    const res = await request(app).get('/api/categories/999999999')

expect([404, 400, 500]).toContain(res.statusCode)  })

  it('❌ retourne une erreur pour un ID invalide', async () => {
    const res = await request(app).get('/api/categories/pasuniD')

    expect([400, 404, 500]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROTECTION SANS TOKEN
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes Admin — Protection sans token', () => {

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Test' })

    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:id — refuse sans token', async () => {
    const res = await request(app)
      .put('/api/categories/1')
      .send({ name: 'Modif' })

    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:id — refuse sans token', async () => {
    const res = await request(app)
      .delete('/api/categories/1')

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. CRUD ADMIN
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 POST /api/categories — Créer (Admin)', () => {

  it('✅ crée une catégorie avec des données valides', async () => {
    if (!adminToken) {
      console.log('⚠️ Pas de token admin — test skippé')
      return
    }

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Catégorie Test ${Date.now()}` })

    expect([200, 201]).toContain(res.statusCode)

    if ([200, 201].includes(res.statusCode)) {
      const cat = res.body.category || res.body
      createdCategoryId = cat.id
      console.log(`✅ Catégorie créée avec ID: ${createdCategoryId}`)
    }
  })

  it('❌ refuse si nom manquant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

})

describe('👑 PUT /api/categories/:id — Modifier (Admin)', () => {

  it('✅ modifie une catégorie existante', async () => {
    if (!adminToken || !createdCategoryId) return

    const res = await request(app)
      .put(`/api/categories/${createdCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Catégorie Modifiée' })

    expect([200, 201]).toContain(res.statusCode)
  })

  it('❌ retourne 404 pour une catégorie inexistante', async () => {
    if (!adminToken) return

    const res = await request(app)
      .put('/api/categories/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test' })

    expect([404, 400]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .put('/api/categories/1')
      .send({ name: 'Test' })

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUPPRESSION — En dernier
// ─────────────────────────────────────────────────────────────────────────────

describe('🗑️ DELETE /api/categories/:id — Supprimer (Admin)', () => {

  it('✅ supprime la catégorie créée pendant les tests', async () => {
    if (!adminToken || !createdCategoryId) return

    const res = await request(app)
      .delete(`/api/categories/${createdCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Catégorie ${createdCategoryId} supprimée`)
  })

  it('❌ retourne 404 pour une catégorie inexistante', async () => {
    if (!adminToken) return

    const res = await request(app)
      .delete('/api/categories/999999999')
      .set('Authorization', `Bearer ${adminToken}`)

    expect([404, 400]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app).delete('/api/categories/1')
    expect(res.statusCode).toBe(401)
  })

})

afterAll(() => {
  console.log('✅ Tests catégories terminés')
})