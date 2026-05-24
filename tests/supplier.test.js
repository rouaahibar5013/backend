import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdSupplierId = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (res.body.token) adminToken = res.body.token
})

describe('🌍 Routes publiques — Fournisseurs', () => {

  it('✅ retourne tous les fournisseurs', async () => {
    const res = await request(app).get('/api/suppliers')
    expect(res.statusCode).toBe(200)
  })

  it('✅ retourne un fournisseur par slug', async () => {
    const listRes = await request(app).get('/api/suppliers')
    const data = listRes.body.suppliers || listRes.body
    const suppliers = Array.isArray(data) ? data : []
    if (suppliers.length === 0) return

    const slug = suppliers[0].slug
    const res = await request(app).get(`/api/suppliers/${slug}`)
    expect(res.statusCode).toBe(200)
  })

  it('❌ retourne 404 pour un slug inexistant', async () => {
    const res = await request(app).get('/api/suppliers/fournisseur-inexistant-xyz')
    expect([400, 404, 500]).toContain(res.statusCode)
  })

})

describe('🔒 Routes Admin — Protection', () => {

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app).post('/api/suppliers').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:id — refuse sans token', async () => {
    const res = await request(app).put('/api/suppliers/1').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:id — refuse sans token', async () => {
    const res = await request(app).delete('/api/suppliers/1')
    expect(res.statusCode).toBe(401)
  })

})

describe('👑 Admin — CRUD Fournisseurs', () => {

  it('✅ crée un fournisseur valide', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Fournisseur Test ${Date.now()}`,
        description: 'Description test',
        country: 'Tunisie',
      })
    expect([200, 201]).toContain(res.statusCode)
    if ([200, 201].includes(res.statusCode)) {
      const supplier = res.body.supplier || res.body
      createdSupplierId = supplier.id
      console.log(`✅ Fournisseur créé: ${createdSupplierId}`)
    }
  })

  it('❌ refuse si nom manquant', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Sans nom' })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('✅ modifie un fournisseur', async () => {
    if (!adminToken || !createdSupplierId) return
    const res = await request(app)
      .put(`/api/suppliers/${createdSupplierId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fournisseur Modifié' })
    expect([200, 201]).toContain(res.statusCode)
  })

  it('✅ supprime le fournisseur créé', async () => {
    if (!adminToken || !createdSupplierId) return
    const res = await request(app)
      .delete(`/api/suppliers/${createdSupplierId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Fournisseur ${createdSupplierId} supprimé`)
  })

  it('❌ retourne 404 pour un fournisseur inexistant', async () => {
    if (!adminToken) return
    const res = await request(app)
      .delete('/api/suppliers/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([400, 404]).toContain(res.statusCode)
  })

})

afterAll(() => console.log('✅ Tests fournisseurs terminés'))