import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdPromotionId = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (res.body.token) adminToken = res.body.token
})

describe('🎟️ POST /api/promotions/validate — Valider un code', () => {

  it('❌ refuse un code invalide', async () => {
    const res = await request(app)
      .post('/api/promotions/validate')
      .send({ code: 'CODEINVALIDE999' })
    expect([400, 404]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    const res = await request(app)
      .post('/api/promotions/validate')
      .send({})
    expect([400, 422]).toContain(res.statusCode)
  })

})

describe('🔒 Routes Admin — Protection', () => {

  it('❌ GET / — refuse sans token', async () => {
    const res = await request(app).get('/api/promotions')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app).post('/api/promotions').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ PUT /:id — refuse sans token', async () => {
    const res = await request(app).put('/api/promotions/1').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /:id — refuse sans token', async () => {
    const res = await request(app).delete('/api/promotions/1')
    expect(res.statusCode).toBe(401)
  })

})

describe('👑 Admin — CRUD Promotions', () => {

  it('✅ retourne toutes les promotions', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
  })

  it('✅ crée une promotion valide', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `TEST${Date.now()}`,
        discount: 10,
        type: 'percentage',
        expiresAt: '2099-12-31',
      })
    expect([200, 201]).toContain(res.statusCode)
    if ([200, 201].includes(res.statusCode)) {
      const promo = res.body.promotion || res.body
      createdPromotionId = promo.id
      console.log(`✅ Promotion créée: ${createdPromotionId}`)
    }
  })

  it('❌ refuse si code manquant', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discount: 10, type: 'percentage' })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un discount invalide', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'TEST', discount: -10, type: 'percentage' })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('✅ modifie une promotion', async () => {
    if (!adminToken || !createdPromotionId) return
    const res = await request(app)
      .put(`/api/promotions/${createdPromotionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discount: 20 })
    expect([200, 201]).toContain(res.statusCode)
  })

  it('✅ supprime la promotion créée', async () => {
    if (!adminToken || !createdPromotionId) return
    const res = await request(app)
      .delete(`/api/promotions/${createdPromotionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ Promotion ${createdPromotionId} supprimée`)
  })

  it('❌ retourne 404 pour une promotion inexistante', async () => {
    if (!adminToken) return
    const res = await request(app)
      .delete('/api/promotions/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([400, 404]).toContain(res.statusCode)
  })

})

afterAll(() => console.log('✅ Tests promotions terminés'))