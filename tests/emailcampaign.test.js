import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let createdCampaignId = null

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
// 1. SUBSCRIBE — Public
// ─────────────────────────────────────────────────────────────────────────────

describe('📧 POST /api/email-campaigns/subscribe — S\'abonner', () => {

  it('✅ s\'abonne avec un email valide', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({ email: `subscriber_${Date.now()}@test.com` })

    expect([200, 201]).toContain(res.statusCode)
    expect(res.body).toBeDefined()
  })

  it('✅ s\'abonner deux fois avec le même email ne plante pas', async () => {
    const email = `double_${Date.now()}@test.com`

    await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({ email })

    const res = await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({ email })

    expect([200, 201, 400, 409]).toContain(res.statusCode)
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un email invalide', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({ email: 'pasunemail' })

expect([400, 422]).toContain(res.statusCode)
})

  it('✅ s\'abonne en étant connecté', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns/subscribe')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `connected_${Date.now()}@test.com` })

    expect([200, 201]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNSUBSCRIBE — Public
// ─────────────────────────────────────────────────────────────────────────────

describe('🚫 POST /api/email-campaigns/unsubscribe — Se désabonner', () => {

  it('✅ se désabonne avec un email existant', async () => {
    const email = `unsub_${Date.now()}@test.com`

    // S'abonner d'abord
    await request(app)
      .post('/api/email-campaigns/subscribe')
      .send({ email })

    // Puis se désabonner
    const res = await request(app)
      .post('/api/email-campaigns/unsubscribe')
      .send({ email })

    expect([200, 204]).toContain(res.statusCode)
  })

  it('✅ se désabonner avec un email inexistant ne plante pas', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/unsubscribe')
      .send({ email: 'nexistepas@test.com' })

    expect([200, 204, 400, 404]).toContain(res.statusCode)
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/unsubscribe')
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un email invalide', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/unsubscribe')
      .send({ email: 'pasunemail' })

    expect([400, 422]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROTECTION — Routes Admin
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Routes Admin — Protection sans token', () => {

  it('❌ GET / — refuse sans token', async () => {
    const res = await request(app).get('/api/email-campaigns')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /subscribers — refuse sans token', async () => {
    const res = await request(app).get('/api/email-campaigns/subscribers')
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST / — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/email-campaigns')
      .send({ subject: 'Test', content: 'Contenu test' })
    expect(res.statusCode).toBe(401)
  })

  it('❌ POST /:id/send — refuse sans token', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/1/send')
    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. ADMIN — Liste des campagnes et abonnés
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 Admin — Campagnes', () => {

  it('✅ retourne toutes les campagnes', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/email-campaigns')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ retourne tous les abonnés', async () => {
    if (!adminToken) return

    const res = await request(app)
      .get('/api/email-campaigns/subscribers')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ crée une campagne valide', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
              title: `Campagne Test ${Date.now()}`,      // ← title

        subject: `Campagne Test ${Date.now()}`,
              type: 'newsletter',                         // ← type obligatoire

      content_fr: 'Contenu de la campagne test.', // ← content_fr
        name: `Newsletter Test ${Date.now()}`,
      })

    expect([200, 201]).toContain(res.statusCode)

    if ([200, 201].includes(res.statusCode)) {
      const campaign = res.body.campaign || res.body
      createdCampaignId = campaign.id
      console.log(`✅ Campagne créée: ${createdCampaignId}`)
    }
  })

  it('❌ refuse si sujet manquant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Test', type: 'newsletter', content_fr: 'Contenu' }) // ← sans subject

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse si contenu manquant', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Test', subject: 'Sujet', type: 'newsletter' }) // ← sans content_fr

    expect([400, 422]).toContain(res.statusCode)
  })

  it('❌ refuse un body vide', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect([400, 422]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. ADMIN — Envoyer une campagne
// ─────────────────────────────────────────────────────────────────────────────

describe('📨 POST /api/email-campaigns/:id/send — Envoyer', () => {

  it('✅ envoie la campagne créée', async () => {
    if (!adminToken || !createdCampaignId) {
      console.log('⚠️ Pas de campagne créée — test skippé')
      return
    }

    const res = await request(app)
      .post(`/api/email-campaigns/${createdCampaignId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)

    // 200 si envoyée, 400 si déjà envoyée, 404 si inexistante
    expect([200, 201, 400]).toContain(res.statusCode)
    console.log(`📨 Campagne ${createdCampaignId} envoyée`)
  })

  it('❌ retourne une erreur pour une campagne inexistante', async () => {
    if (!adminToken) return

    const res = await request(app)
      .post('/api/email-campaigns/999999999/send')
      .set('Authorization', `Bearer ${adminToken}`)

    expect([400, 404]).toContain(res.statusCode)
  })

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .post('/api/email-campaigns/1/send')

    expect(res.statusCode).toBe(401)
  })

  it('❌ refuse un user non admin', async () => {
    const userRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: process.env.TEST_USER_EMAIL,
        password: process.env.TEST_USER_PASSWORD,
      })

    const userToken = userRes.body.token
    if (!userToken) return

    const res = await request(app)
      .post('/api/email-campaigns/1/send')
      .set('Authorization', `Bearer ${userToken}`)

    expect([401, 403]).toContain(res.statusCode)
  })

})

afterAll(() => console.log('✅ Tests email campaigns terminés'))