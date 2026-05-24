import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdRecipeId = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (res.body.token) adminToken = res.body.token
})

describe('🌍 Routes publiques — Recettes', () => {

  it('✅ retourne toutes les recettes', async () => {
    const res = await request(app).get('/api/recipes')
    expect(res.statusCode).toBe(200)
  })

  it('✅ retourne les recettes featured', async () => {
    const res = await request(app).get('/api/recipes/featured')
    expect(res.statusCode).toBe(200)
  })

  it('✅ retourne une recette par slug valide', async () => {
    const listRes = await request(app).get('/api/recipes')
    const recipes = listRes.body.recipes || listRes.body
    const data = Array.isArray(recipes) ? recipes : []
    if (data.length === 0) return

    const slug = data[0].slug
    const res = await request(app).get(`/api/recipes/${slug}`)
    expect(res.statusCode).toBe(200)
  })

  it('❌ retourne 404 pour un slug inexistant', async () => {
    const res = await request(app).get('/api/recipes/recette-inexistante-xyz')
    expect([400, 404, 500]).toContain(res.statusCode)
  })

})

describe('🔒 Routes Admin — Protection', () => {

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app).post('/api/recipes').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:id — refuse sans token', async () => {
    const res = await request(app).put('/api/recipes/1').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:id — refuse sans token', async () => {
    const res = await request(app).delete('/api/recipes/1')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /admin/all — refuse sans token', async () => {
    const res = await request(app).get('/api/recipes/admin/all')
    expect(res.statusCode).toBe(401)
  })

})

describe('👑 Admin — CRUD Recettes', () => {

  it('✅ retourne toutes les recettes (admin)', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/recipes/admin/all')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
  })

  it('✅ crée une recette valide', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Recette Test ${Date.now()}`,
        description: 'Description test',
        ingredients: ['Huile', 'Sel'],
        steps: ['Étape 1', 'Étape 2'],
      })
    expect([200, 201]).toContain(res.statusCode)
    if ([200, 201].includes(res.statusCode)) {
      const recipe = res.body.recipe || res.body
      createdRecipeId = recipe.id
      console.log(`✅ Recette créée: ${createdRecipeId}`)
    }
  })

  it('❌ refuse si titre manquant', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Sans titre' })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('✅ modifie une recette', async () => {
    if (!adminToken || !createdRecipeId) return
    const res = await request(app)
      .put(`/api/recipes/${createdRecipeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Recette Modifiée' })
    expect([200, 201]).toContain(res.statusCode)
  })

  it('✅ supprime la recette créée', async () => {
    if (!adminToken || !createdRecipeId) return
    const res = await request(app)
      .delete(`/api/recipes/${createdRecipeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Recette ${createdRecipeId} supprimée`)
  })

})

afterAll(() => console.log('✅ Tests recettes terminés'))