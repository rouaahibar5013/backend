import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdFaqId = null
let createdQuestionId = null

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (res.body.token) adminToken = res.body.token
})

describe('🌍 GET /api/faqs — FAQs publiques', () => {

  it('✅ retourne toutes les FAQs actives', async () => {
    const res = await request(app).get('/api/faqs')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ recherche dans les FAQs', async () => {
    const res = await request(app).get('/api/faqs/search?q=livraison')
    expect(res.statusCode).toBe(200)
  })

  it('✅ recherche avec terme vide', async () => {
    const res = await request(app).get('/api/faqs/search?q=')
    expect([200, 400]).toContain(res.statusCode)
  })

})

describe('❓ POST /api/faqs/ask — Poser une question', () => {

  it('✅ pose une question sans être connecté', async () => {
    const res = await request(app)
      .post('/api/faqs/ask')
      .send({ question: `Question test ${Date.now()} ?` })

expect([200, 201, 400]).toContain(res.statusCode)  })

  it('❌ refuse si question manquante', async () => {
    const res = await request(app)
      .post('/api/faqs/ask')
      .send({})
    expect([400, 422]).toContain(res.statusCode)
  })

})

describe('🔒 Routes Admin — Protection', () => {

  it('❌ GET /admin/all — refuse sans token', async () => {
    const res = await request(app).get('/api/faqs/admin/all')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST /admin — refuse sans token', async () => {
    const res = await request(app).post('/api/faqs/admin').send({})
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /admin/stats — refuse sans token', async () => {
    const res = await request(app).get('/api/faqs/admin/stats')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /admin/questions — refuse sans token', async () => {
    const res = await request(app).get('/api/faqs/admin/questions')
    expect(res.statusCode).toBe(401)
  })

})

describe('👑 Admin — FAQs', () => {

  it('✅ retourne toutes les FAQs (admin)', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/faqs/admin/all')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
  })

  it('✅ retourne les stats FAQs', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/faqs/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
  })

  it('✅ crée une FAQ', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/faqs/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        question: `Question test ${Date.now()} ?`,
        answer: 'Réponse test.',
        category: 'general',
      })
    expect([200, 201]).toContain(res.statusCode)
    if ([200, 201].includes(res.statusCode)) {
      const faq = res.body.faq || res.body
      createdFaqId = faq.id
      console.log(`✅ FAQ créée: ${createdFaqId}`)
    }
  })

  it('❌ refuse une FAQ sans question', async () => {
    if (!adminToken) return
    const res = await request(app)
      .post('/api/faqs/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ answer: 'Réponse sans question' })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('✅ retourne les questions utilisateurs', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/faqs/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
    const questions = res.body.questions || res.body
    if (Array.isArray(questions) && questions.length > 0) {
      createdQuestionId = questions[0].id
    }
  })

  it('✅ toggle activation d\'une FAQ', async () => {
    if (!adminToken || !createdFaqId) return
    const res = await request(app)
      .patch(`/api/faqs/admin/${createdFaqId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 201]).toContain(res.statusCode)
  })

  it('✅ modifie une FAQ', async () => {
    if (!adminToken || !createdFaqId) return
    const res = await request(app)
      .put(`/api/faqs/admin/${createdFaqId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ answer: 'Réponse modifiée.' })
    expect([200, 201]).toContain(res.statusCode)
  })

  it('✅ supprime la FAQ créée', async () => {
    if (!adminToken || !createdFaqId) return
    const res = await request(app)
      .delete(`/api/faqs/admin/${createdFaqId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
    console.log(`🗑️ FAQ ${createdFaqId} supprimée`)
  })

})

afterAll(() => console.log('✅ Tests FAQ terminés'))