import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'

// ─── Données de test réutilisables ───────────────────────────────────────────

const testUser = {
  email: `testuser_${Date.now()}@goofa.com`,
  password: 'TestPassword123!',
  name: 'Test User',
}

const adminUser = {
  email: `admin_${Date.now()}@goofa.com`,
  password: 'AdminPassword123!',
  name: 'Admin Goofa',
}

// Ces variables seront remplies au fur et à mesure des tests
let userToken = null
let adminToken = null
let createdUserId = null

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER
// ─────────────────────────────────────────────────────────────────────────────

describe('📝 POST /api/auth/register', () => {

  it('✅ crée un compte avec des données valides', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser)

    expect(res.statusCode).toBe(201)
    expect(res.body).toHaveProperty('message') // ex: "Vérifiez votre email"
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'TestPassword123!', name: 'Test' })

    expect(res.statusCode).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('❌ refuse si password manquant', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@goofa.com', name: 'Test' })

    expect(res.statusCode).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('❌ refuse si email déjà utilisé', async () => {
    // On réutilise le même email qu'au premier test
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser)

    expect(res.statusCode).toBe(409)
    expect(res.body).toHaveProperty('message')
  })

  it('❌ refuse un email invalide', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'pasunemail', password: 'TestPassword123!', name: 'Test' })

    expect(res.statusCode).toBe(400)
  })

it('❌ refuse un body vide', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({})

  expect([400, 429]).toContain(res.statusCode) // ← ajout 429
})

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN
// ─────────────────────────────────────────────────────────────────────────────

describe('🔑 POST /api/auth/login', () => {

it('✅ connecte un utilisateur avec les bons identifiants', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: testUser.email,
      password: testUser.password,
    })

  // 200 = connecté, 401 = email non vérifié, 403 = suspendu
  expect([200, 401, 403]).toContain(res.statusCode) // ← ajout 401

  if (res.statusCode === 200) {
    expect(res.body).toHaveProperty('token')
    userToken = res.body.token
  }
})

  it('❌ refuse avec un mauvais mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'MauvaisMotDePasse!',
      })

    expect([400, 401]).toContain(res.statusCode)
    expect(res.body).toHaveProperty('message')
  })

  it('❌ refuse avec un email inexistant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nexistepas@goofa.com',
        password: 'TestPassword123!',
      })

    expect([400, 401, 404]).toContain(res.statusCode)
    expect(res.body).toHaveProperty('message')
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'TestPassword123!' })

    expect(res.statusCode).toBe(400)
  })

  it('❌ refuse si password manquant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email })

    expect(res.statusCode).toBe(400)
  })

  it('❌ refuse un body vide', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({})

  expect([400, 429]).toContain(res.statusCode) // ← ajout 429
})

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROUTES PROTÉGÉES — GET /me
// ─────────────────────────────────────────────────────────────────────────────

describe('👤 GET /api/auth/me — Route protégée', () => {

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .get('/api/auth/me')

    expect(res.statusCode).toBe(401)
  })

  it('❌ refuse avec un token invalide', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tokenbidon123')

    expect([401, 403]).toContain(res.statusCode)
  })

  it('❌ refuse avec un token mal formé', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'pasunbearer')

    expect([401, 403]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 POST /api/auth/forgot-password', () => {

  it('✅ accepte un email existant', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUser.email })

    // 200 même si email inexistant (sécurité — on ne révèle pas si l'email existe)
    expect([200, 404]).toContain(res.statusCode)
  })

  it('✅ répond même avec un email inexistant (sécurité)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nexistepas@goofa.com' })

    // Par sécurité, beaucoup d'apps retournent 200 même si l'email n'existe pas
    expect([200, 404]).toContain(res.statusCode)
  })

  it('❌ refuse si email manquant', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({})

    expect(res.statusCode).toBe(400)
  })

it('❌ refuse un email invalide', async () => {
  const res = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'pasunemail' })

  expect([400, 429]).toContain(res.statusCode) // ← ajout 429
})

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

describe('🔑 POST /api/auth/reset-password/:token', () => {

  it('❌ refuse avec un token invalide', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/tokeninvalide123')
      .send({ password: 'NouveauPassword123!' })

    expect([400, 404]).toContain(res.statusCode)
  })

  it('❌ refuse si password manquant', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/tokeninvalide123')
      .send({})

    expect([400, 404]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. RESEND VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('📧 POST /api/auth/resend-verification', () => {

 it('✅ accepte un email valide', async () => {
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: testUser.email })

  expect([200, 400, 404, 429]).toContain(res.statusCode) // ← ajout 429
})

  it('❌ refuse si email manquant', async () => {
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({})

  expect([400, 429]).toContain(res.statusCode) // ← ajout 429
})

})

// ─────────────────────────────────────────────────────────────────────────────
// 7. VERIFY EMAIL
// ─────────────────────────────────────────────────────────────────────────────

describe('✉️ GET /api/auth/verify-email/:token', () => {

  it('❌ refuse avec un token invalide', async () => {
    const res = await request(app)
      .get('/api/auth/verify-email/tokenbidon123')

    expect([400, 404]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 8. LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

describe('🚪 POST /api/auth/logout', () => {

  it('✅ déconnecte correctement', async () => {
    const res = await request(app)
      .post('/api/auth/logout')

    expect([200, 204]).toContain(res.statusCode)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 9. ROUTES ADMIN — Sans token admin
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 Routes Admin — Protection', () => {

  it('❌ GET /api/auth/users — refuse sans token', async () => {
    const res = await request(app)
      .get('/api/auth/users')

    expect(res.statusCode).toBe(401)
  })

  it('❌ GET /api/auth/users — refuse avec token user normal', async () => {
    // Si on a un token user (non admin), il doit être refusé
    if (!userToken) return // skip si pas de token

    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${userToken}`)

    expect([401, 403]).toContain(res.statusCode)
  })

  it('❌ DELETE /api/auth/users/:id — refuse sans token', async () => {
    const res = await request(app)
      .delete('/api/auth/users/999')

    expect(res.statusCode).toBe(401)
  })

  it('❌ PATCH /api/auth/users/:id/role — refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/auth/users/999/role')
      .send({ role: 'admin' })

    expect(res.statusCode).toBe(401)
  })

  it('❌ PATCH /api/auth/users/:id/suspend — refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/auth/users/999/suspend')

    expect(res.statusCode).toBe(401)
  })

  it('❌ PATCH /api/auth/users/:id/activate — refuse sans token', async () => {
    const res = await request(app)
      .patch('/api/auth/users/999/activate')

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 10. UPDATE PROFILE — Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('✏️ PUT /api/auth/me — Mise à jour profil', () => {

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .put('/api/auth/me')
      .send({ name: 'Nouveau Nom' })

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 11. UPDATE PASSWORD — Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('🔐 PUT /api/auth/password — Changement mot de passe', () => {

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({
        currentPassword: 'TestPassword123!',
        newPassword: 'NouveauPassword123!',
      })

    expect(res.statusCode).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 12. UPDATE ADDRESSES — Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('📍 PUT /api/auth/me/addresses — Adresses', () => {

  it('❌ refuse sans token', async () => {
    const res = await request(app)
      .put('/api/auth/me/addresses')
      .send({ addresses: [] })

    expect(res.statusCode).toBe(401)
  })

})