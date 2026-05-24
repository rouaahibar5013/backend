import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

let adminToken = null
let userToken = null

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    })
  if (adminRes.body.token) adminToken = adminRes.body.token

  const userRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    })
  if (userRes.body.token) userToken = userRes.body.token
})

describe('🔒 Routes Stats — Protection', () => {

  it('❌ GET / — refuse sans token', async () => {
    const res = await request(app).get('/api/stats')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /export — refuse sans token', async () => {
    const res = await request(app).get('/api/stats/export')
    expect(res.statusCode).toBe(401)
  })

  it('❌ DELETE /cache/clear — refuse sans token', async () => {
    const res = await request(app).delete('/api/stats/cache/clear')
    expect(res.statusCode).toBe(401)
  })

  it('❌ GET / — refuse un user non admin', async () => {
    if (!userToken) return
    const res = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${userToken}`)
    expect([401, 403]).toContain(res.statusCode)
  })

})

describe('👑 Admin — Stats', () => {

  it('✅ retourne les stats globales', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })

  it('✅ exporte les stats', async () => {
    if (!adminToken) return
    const res = await request(app)
      .get('/api/stats/export')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
  })

  it('✅ vide le cache des stats', async () => {
    if (!adminToken) return
    const res = await request(app)
      .delete('/api/stats/cache/clear')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([200, 204]).toContain(res.statusCode)
  })

})

afterAll(() => console.log('✅ Tests stats terminés'))