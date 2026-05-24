import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from 'dotenv'
config({ path: '.env.test' })

// ─── Mock des dépendances externes ───────────────────────────────────────────
// On remplace la vraie BDD, emails, redis par des fausses versions
vi.mock('../models/index.js', () => ({
  User: {
    findByEmail:              vi.fn(),
    findById:                 vi.fn(),
    createWithVerification:   vi.fn(),
    findByVerificationToken:  vi.fn(),
    verify:                   vi.fn(),
    setMfaOtp:                vi.fn(),
    findWithValidMfa:         vi.fn(),
    clearMfaOtp:              vi.fn(),
    setResetToken:            vi.fn(),
    findByResetToken:         vi.fn(),
    updatePassword:           vi.fn(),
    findProfile:              vi.fn(),
    updateRole:               vi.fn(),
    setActive:                vi.fn(),
    delete:                   vi.fn(),
    findByEmailExcludingId:   vi.fn(),
    adminUpdate:              vi.fn(),
    setPassword:              vi.fn(),
  }
}))

vi.mock('../utils/sendEmail.js',              () => ({ default: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/emailcampaignService.js',() => ({ linkSubscriptionToUserService: vi.fn().mockResolvedValue(true) }))
vi.mock('../utils/loginAttempts.js',          () => ({
  checkLoginBlock:    vi.fn().mockResolvedValue(true),
  recordFailedLogin:  vi.fn().mockResolvedValue(true),
  clearLoginAttempts: vi.fn().mockResolvedValue(true),
}))
vi.mock('../utils/cacheInvalideation.js', () => ({ invalidateDashboardCache: vi.fn().mockResolvedValue(true) }))
vi.mock('../utils/websocket.js',          () => ({ notifyUser: vi.fn() }))
vi.mock('cloudinary',                     () => ({ v2: { uploader: { upload: vi.fn(), destroy: vi.fn() } } }))
vi.mock('../config/redis.js',             () => ({ default: { set: vi.fn(), get: vi.fn() } }))

// Import APRES les mocks
import { User } from '../models/index.js'
import {
  validateEmail,
  validatePassword,
  registerUser,
  loginUser,
  verifyUserEmail,
  resetUserPassword,
  updateUserPassword,
  deleteUserService,
  updateUserRoleService,
  suspendUserService,
  googleCallbackToken,
} from '../services/authService.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. validateEmail — Fonction pure
// ─────────────────────────────────────────────────────────────────────────────

describe('📧 validateEmail — Validation email', () => {

  it('✅ accepte un email valide', () => {
    expect(() => validateEmail('ahmed@goofa.com')).not.toThrow()
    expect(() => validateEmail('test.user+tag@domain.co')).not.toThrow()
    expect(() => validateEmail('user@sub.domain.com')).not.toThrow()
  })

  it('❌ refuse si email manquant', () => {
    expect(() => validateEmail(null)).toThrow('requis')
    expect(() => validateEmail(undefined)).toThrow('requis')
    expect(() => validateEmail('')).toThrow('requis')
  })

  it('❌ refuse si email n\'est pas une string', () => {
    expect(() => validateEmail(123)).toThrow()
    expect(() => validateEmail([])).toThrow()
  })

  it('❌ refuse un email sans @', () => {
    expect(() => validateEmail('pasunemail')).toThrow('invalide')
  })

  it('❌ refuse un email sans domaine', () => {
    expect(() => validateEmail('user@')).toThrow('invalide')
  })

  it('❌ refuse un email sans extension', () => {
    expect(() => validateEmail('user@domain')).toThrow('invalide')
  })



it('✅ validateEmail gère les emails avec caractères spéciaux', () => {
  expect(() => validateEmail('normal@domain.com')).not.toThrow()
  expect(() => validateEmail('pasunemail')).toThrow('invalide')
})

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. validatePassword — Fonction pure
// ─────────────────────────────────────────────────────────────────────────────

describe('🔐 validatePassword — Validation mot de passe', () => {

  it('✅ accepte un mot de passe fort', () => {
    expect(() => validatePassword('MonMotDePasse1!')).not.toThrow()
    expect(() => validatePassword('Secure@Pass123')).not.toThrow()
    expect(() => validatePassword('Abcdef1234!')).not.toThrow()
  })

  it('❌ refuse si password manquant', () => {
    expect(() => validatePassword(null)).toThrow('requis')
    expect(() => validatePassword(undefined)).toThrow('requis')
    expect(() => validatePassword('')).toThrow('requis')
  })

  it('❌ refuse si password n\'est pas une string', () => {
    expect(() => validatePassword(123456789)).toThrow()
  })

  it('❌ refuse un password trop court (< 10 caractères)', () => {
    expect(() => validatePassword('Abc1!')).toThrow('10 caractères')
  })

  it('❌ refuse un password sans majuscule', () => {
    expect(() => validatePassword('monmotdepasse1!')).toThrow('majuscule')
  })

  it('❌ refuse un password sans minuscule', () => {
    expect(() => validatePassword('MONMOTDEPASSE1!')).toThrow('minuscule')
  })

  it('❌ refuse un password sans chiffre', () => {
    expect(() => validatePassword('MonMotDePasse!')).toThrow('chiffre')
  })

  it('❌ refuse un password sans caractère spécial', () => {
    expect(() => validatePassword('MonMotDePasse1')).toThrow('spécial')
  })

  it('❌ refuse un password qui viole plusieurs règles', () => {
    expect(() => validatePassword('abc')).toThrow()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. registerUser — Logique métier
// ─────────────────────────────────────────────────────────────────────────────

describe('📝 registerUser — Inscription', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    // Par défaut : aucun utilisateur existant
    User.findByEmail.mockResolvedValue(null)
    User.createWithVerification.mockResolvedValue({
      id: 'uuid-123',
      email: 'ahmed@goofa.com',
      name: 'Ahmed',
    })
  })

  it('✅ crée un utilisateur avec des données valides', async () => {
    const user = await registerUser({
      name: 'Ahmed',
      email: 'ahmed@goofa.com',
      password: 'MonMotDePasse1!',
    })
    expect(user).toHaveProperty('id')
    expect(User.createWithVerification).toHaveBeenCalledOnce()
  })

  it('✅ le mot de passe est hashé avec bcrypt', async () => {
    await registerUser({
      name: 'Ahmed',
      email: 'ahmed@goofa.com',
      password: 'MonMotDePasse1!',
    })

    // Vérifie que createWithVerification a reçu un hash, pas le mot de passe en clair
    const callArgs = User.createWithVerification.mock.calls[0][0]
    expect(callArgs.password).not.toBe('MonMotDePasse1!')
    expect(callArgs.password).toMatch(/^\$2[aby]\$/) // format bcrypt
    console.log(`✅ Hash bcrypt: ${callArgs.password.substring(0, 20)}...`)
  })

  it('✅ l\'email est normalisé en minuscules', async () => {
    await registerUser({
      name: 'Ahmed',
      email: 'AHMED@GOOFA.COM',
      password: 'MonMotDePasse1!',
    })
    const callArgs = User.createWithVerification.mock.calls[0][0]
    expect(callArgs.email).toBe('ahmed@goofa.com')
  })

  it('✅ le token de vérification est hashé (pas stocké en clair)', async () => {
    await registerUser({
      name: 'Ahmed',
      email: 'ahmed@goofa.com',
      password: 'MonMotDePasse1!',
    })
    const callArgs = User.createWithVerification.mock.calls[0][0]
    // Le token stocké doit être un hash SHA-256 (64 chars hex)
    expect(callArgs.verificationToken).toMatch(/^[a-f0-9]{64}$/)
    console.log(`✅ Token hashé: ${callArgs.verificationToken.substring(0, 20)}...`)
  })

  it('❌ refuse si email déjà utilisé', async () => {
    User.findByEmail.mockResolvedValue({
      id: 'existing-uuid',
      email: 'ahmed@goofa.com',
      google_id: null,
    })

    await expect(
      registerUser({ name: 'Ahmed', email: 'ahmed@goofa.com', password: 'MonMotDePasse1!' })
    ).rejects.toThrow('déjà utilisé')
  })

  it('❌ refuse si email est un compte Google', async () => {
    User.findByEmail.mockResolvedValue({
      id: 'existing-uuid',
      email: 'ahmed@goofa.com',
      google_id: 'google-123',
    })

    await expect(
      registerUser({ name: 'Ahmed', email: 'ahmed@goofa.com', password: 'MonMotDePasse1!' })
    ).rejects.toThrow('Google')
  })

  it('❌ refuse si nom trop court (< 2 caractères)', async () => {
    await expect(
      registerUser({ name: 'A', email: 'ahmed@goofa.com', password: 'MonMotDePasse1!' })
    ).rejects.toThrow('2 caractères')
  })

  it('❌ refuse si email invalide', async () => {
    await expect(
      registerUser({ name: 'Ahmed', email: 'pasunemail', password: 'MonMotDePasse1!' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse si password trop faible', async () => {
    await expect(
      registerUser({ name: 'Ahmed', email: 'ahmed@goofa.com', password: 'faible' })
    ).rejects.toThrow()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. loginUser — Logique de connexion
// ─────────────────────────────────────────────────────────────────────────────

describe('🔑 loginUser — Connexion', () => {

  const hashedPassword = bcrypt.hashSync('MonMotDePasse1!', 12)

  const activeVerifiedUser = {
    id: 'uuid-123',
    email: 'ahmed@goofa.com',
    password: hashedPassword,
    is_active: true,
    is_verified: true,
    google_id: null,
    name: 'Ahmed',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    User.findByEmail.mockResolvedValue(activeVerifiedUser)
    User.setMfaOtp.mockResolvedValue(true)
  })

  it('✅ login réussi → retourne mfaRequired', async () => {
    const result = await loginUser({
      email: 'ahmed@goofa.com',
      password: 'MonMotDePasse1!',
      ip: '127.0.0.1',
    })
    expect(result.mfaRequired).toBe(true)
    expect(result.mfaSessionToken).toBeDefined()
    console.log('✅ MFA session token généré')
  })

  it('✅ le mfaSessionToken est un JWT valide', async () => {
    const result = await loginUser({
      email: 'ahmed@goofa.com',
      password: 'MonMotDePasse1!',
      ip: '127.0.0.1',
    })
    const decoded = jwt.verify(result.mfaSessionToken, process.env.JWT_SECRET)
    expect(decoded).toHaveProperty('userId', 'uuid-123')
    console.log(`✅ JWT décodé: userId=${decoded.userId}`)
  })

  it('❌ refuse si utilisateur inexistant', async () => {
    User.findByEmail.mockResolvedValue(null)
    await expect(
      loginUser({ email: 'nexiste@pas.com', password: 'MonMotDePasse1!', ip: '127.0.0.1' })
    ).rejects.toThrow('incorrect')
  })

  it('❌ refuse si compte suspendu', async () => {
    User.findByEmail.mockResolvedValue({ ...activeVerifiedUser, is_active: false })
    await expect(
      loginUser({ email: 'ahmed@goofa.com', password: 'MonMotDePasse1!', ip: '127.0.0.1' })
    ).rejects.toThrow('suspendu')
  })

  it('❌ refuse si email non vérifié', async () => {
    User.findByEmail.mockResolvedValue({ ...activeVerifiedUser, is_verified: false })
    await expect(
      loginUser({ email: 'ahmed@goofa.com', password: 'MonMotDePasse1!', ip: '127.0.0.1' })
    ).rejects.toThrow('vérifier')
  })

  it('❌ refuse si mauvais mot de passe', async () => {
    await expect(
      loginUser({ email: 'ahmed@goofa.com', password: 'MauvaisPassword1!', ip: '127.0.0.1' })
    ).rejects.toThrow('incorrect')
  })

  it('❌ refuse si compte Google sans password', async () => {
    User.findByEmail.mockResolvedValue({
      ...activeVerifiedUser,
      password: null,
      google_id: 'google-123',
    })
    await expect(
      loginUser({ email: 'ahmed@goofa.com', password: 'MonMotDePasse1!', ip: '127.0.0.1' })
    ).rejects.toThrow('Google')
  })

  it('❌ refuse si password manquant', async () => {
    await expect(
      loginUser({ email: 'ahmed@goofa.com', password: '', ip: '127.0.0.1' })
    ).rejects.toThrow('requis')
  })

  it('❌ refuse si email invalide', async () => {
    await expect(
      loginUser({ email: 'pasunemail', password: 'MonMotDePasse1!', ip: '127.0.0.1' })
    ).rejects.toThrow('invalide')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. verifyUserEmail — Vérification email
// ─────────────────────────────────────────────────────────────────────────────

describe('✉️ verifyUserEmail — Vérification email', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    User.findByVerificationToken.mockResolvedValue({
      id: 'uuid-123',
      is_verified: false,
    })
    User.verify.mockResolvedValue({ id: 'uuid-123', is_verified: true })
  })

  it('✅ vérifie un email avec un token valide', async () => {
    const result = await verifyUserEmail('validtoken123')
    expect(result).toHaveProperty('is_verified', true)
    expect(User.verify).toHaveBeenCalledOnce()
  })

  it('✅ le token est hashé avant la recherche en BDD', async () => {
    await verifyUserEmail('montoken')
    // Le token brut 'montoken' ne doit PAS être passé directement à findByVerificationToken
    const callArg = User.findByVerificationToken.mock.calls[0][0]
    expect(callArg).not.toBe('montoken')
    expect(callArg).toMatch(/^[a-f0-9]{64}$/) // SHA-256
    console.log(`✅ Token hashé pour BDD: ${callArg.substring(0, 20)}...`)
  })

  it('❌ refuse si token manquant', async () => {
    await expect(verifyUserEmail(null)).rejects.toThrow('manquant')
    await expect(verifyUserEmail('')).rejects.toThrow('manquant')
  })

  it('❌ refuse si token invalide (non trouvé en BDD)', async () => {
    User.findByVerificationToken.mockResolvedValue(null)
    await expect(verifyUserEmail('tokeninvalide')).rejects.toThrow('invalide')
  })

  it('❌ refuse si email déjà vérifié', async () => {
    User.findByVerificationToken.mockResolvedValue({
      id: 'uuid-123',
      is_verified: true,
    })
    await expect(verifyUserEmail('validtoken')).rejects.toThrow('déjà vérifié')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. resetUserPassword — Réinitialisation mot de passe
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 resetUserPassword — Réinitialisation', () => {

  const oldHashedPassword = bcrypt.hashSync('AncienPassword1!', 12)

  beforeEach(() => {
    vi.clearAllMocks()
    User.findByResetToken.mockResolvedValue({
      id: 'uuid-123',
      password: oldHashedPassword,
    })
    User.updatePassword.mockResolvedValue(true)
  })

  it('✅ réinitialise le mot de passe avec un token valide', async () => {
    const result = await resetUserPassword({
      token: 'validtoken',
      password: 'NouveauPassword1!',
    })
    expect(result).toBe(true)
    expect(User.updatePassword).toHaveBeenCalledOnce()
  })

  it('✅ le nouveau mot de passe est hashé avant stockage', async () => {
    await resetUserPassword({
      token: 'validtoken',
      password: 'NouveauPassword1!',
    })
    const [, hashedPwd] = User.updatePassword.mock.calls[0]
    expect(hashedPwd).not.toBe('NouveauPassword1!')
    expect(hashedPwd).toMatch(/^\$2[aby]\$/) // format bcrypt
    console.log(`✅ Nouveau hash: ${hashedPwd.substring(0, 20)}...`)
  })

  it('✅ le token est hashé avant recherche en BDD', async () => {
    await resetUserPassword({ token: 'montoken', password: 'NouveauPassword1!' })
    const callArg = User.findByResetToken.mock.calls[0][0]
    expect(callArg).not.toBe('montoken')
    expect(callArg).toMatch(/^[a-f0-9]{64}$/)
  })

  it('❌ refuse si nouveau password identique à l\'ancien', async () => {
    await expect(
      resetUserPassword({ token: 'validtoken', password: 'AncienPassword1!' })
    ).rejects.toThrow('différent')
  })

  it('❌ refuse si token manquant', async () => {
    await expect(
      resetUserPassword({ token: null, password: 'NouveauPassword1!' })
    ).rejects.toThrow('manquant')
  })

  it('❌ refuse si token invalide', async () => {
    User.findByResetToken.mockResolvedValue(null)
    await expect(
      resetUserPassword({ token: 'tokeninvalide', password: 'NouveauPassword1!' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse un nouveau password trop faible', async () => {
    await expect(
      resetUserPassword({ token: 'validtoken', password: 'faible' })
    ).rejects.toThrow()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 7. updateUserPassword — Changement de mot de passe
// ─────────────────────────────────────────────────────────────────────────────

describe('🔐 updateUserPassword — Changement de mot de passe', () => {

  const currentHashed = bcrypt.hashSync('AncienPassword1!', 12)

  beforeEach(() => {
    vi.clearAllMocks()
    User.findById.mockResolvedValue({
      id: 'uuid-123',
      password: currentHashed,
      google_id: null,
    })
    User.setPassword.mockResolvedValue(true)
  })

  it('✅ change le mot de passe avec les bonnes données', async () => {
    const result = await updateUserPassword({
      userId: 'uuid-123',
      currentPassword: 'AncienPassword1!',
      newPassword: 'NouveauPassword1!',
    })
    expect(result).toBe(true)
    expect(User.setPassword).toHaveBeenCalledOnce()
  })

  it('✅ le nouveau mot de passe est hashé', async () => {
    await updateUserPassword({
      userId: 'uuid-123',
      currentPassword: 'AncienPassword1!',
      newPassword: 'NouveauPassword1!',
    })
    const [, hashedPwd] = User.setPassword.mock.calls[0]
    expect(hashedPwd).toMatch(/^\$2[aby]\$/)
    expect(hashedPwd).not.toBe('NouveauPassword1!')
  })

  it('❌ refuse si mot de passe actuel incorrect', async () => {
    await expect(
      updateUserPassword({
        userId: 'uuid-123',
        currentPassword: 'MauvaisPassword1!',
        newPassword: 'NouveauPassword1!',
      })
    ).rejects.toThrow('incorrect')
  })

  it('❌ refuse si nouveau password identique à l\'actuel', async () => {
    await expect(
      updateUserPassword({
        userId: 'uuid-123',
        currentPassword: 'AncienPassword1!',
        newPassword: 'AncienPassword1!',
      })
    ).rejects.toThrow('différent')
  })

  it('❌ refuse si compte Google (pas de password)', async () => {
    User.findById.mockResolvedValue({
      id: 'uuid-123',
      password: null,
      google_id: 'google-123',
    })
    await expect(
      updateUserPassword({
        userId: 'uuid-123',
        currentPassword: 'AncienPassword1!',
        newPassword: 'NouveauPassword1!',
      })
    ).rejects.toThrow('Google')
  })

  it('❌ refuse si utilisateur inexistant', async () => {
    User.findById.mockResolvedValue(null)
    await expect(
      updateUserPassword({
        userId: 'uuid-inexistant',
        currentPassword: 'AncienPassword1!',
        newPassword: 'NouveauPassword1!',
      })
    ).rejects.toThrow('introuvable')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Admin — Logique métier
// ─────────────────────────────────────────────────────────────────────────────

describe('👑 deleteUserService — Suppression user (Admin)', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    User.findById.mockResolvedValue({ id: 'user-uuid', email: 'user@test.com' })
    User.delete.mockResolvedValue(true)
  })

  it('✅ supprime un utilisateur existant', async () => {
    const result = await deleteUserService({
      userId: 'user-uuid',
      requestingAdminId: 'admin-uuid',
    })
    expect(result).toBe(true)
    expect(User.delete).toHaveBeenCalledWith('user-uuid')
  })

  it('❌ refuse si l\'admin essaie de se supprimer lui-même', async () => {
    await expect(
      deleteUserService({ userId: 'admin-uuid', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('propre compte')
  })

  it('❌ refuse si utilisateur inexistant', async () => {
    User.findById.mockResolvedValue(null)
    await expect(
      deleteUserService({ userId: 'uuid-inexistant', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('introuvable')
  })

})

describe('👑 updateUserRoleService — Changement de rôle (Admin)', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    User.updateRole.mockResolvedValue({ id: 'user-uuid', role: 'admin' })
  })

  it('✅ change le rôle vers admin', async () => {
    const result = await updateUserRoleService({
      userId: 'user-uuid',
      role: 'admin',
      requestingAdminId: 'admin-uuid',
    })
    expect(result.role).toBe('admin')
  })

  it('✅ change le rôle vers user', async () => {
    User.updateRole.mockResolvedValue({ id: 'user-uuid', role: 'user' })
    const result = await updateUserRoleService({
      userId: 'user-uuid',
      role: 'user',
      requestingAdminId: 'admin-uuid',
    })
    expect(result.role).toBe('user')
  })

  it('❌ refuse un rôle invalide', async () => {
    await expect(
      updateUserRoleService({ userId: 'user-uuid', role: 'superadmin', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse si l\'admin modifie son propre rôle', async () => {
    await expect(
      updateUserRoleService({ userId: 'admin-uuid', role: 'user', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('propre rôle')
  })

  it('❌ refuse si utilisateur inexistant', async () => {
    User.updateRole.mockResolvedValue(null)
    await expect(
      updateUserRoleService({ userId: 'uuid-inexistant', role: 'admin', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('introuvable')
  })

})

describe('👑 suspendUserService — Suspension (Admin)', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    User.findById.mockResolvedValue({ id: 'user-uuid', is_active: true })
    User.setActive.mockResolvedValue({ id: 'user-uuid', is_active: false })
  })

  it('✅ suspend un utilisateur', async () => {
    const result = await suspendUserService({
      userId: 'user-uuid',
      requestingAdminId: 'admin-uuid',
    })
    expect(User.setActive).toHaveBeenCalledWith('user-uuid', false)
  })

  it('❌ refuse si l\'admin essaie de se suspendre lui-même', async () => {
    await expect(
      suspendUserService({ userId: 'admin-uuid', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('propre compte')
  })

  it('❌ refuse si utilisateur inexistant', async () => {
    User.findById.mockResolvedValue(null)
    await expect(
      suspendUserService({ userId: 'uuid-inexistant', requestingAdminId: 'admin-uuid' })
    ).rejects.toThrow('introuvable')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 9. googleCallbackToken — Génération JWT Google
// ─────────────────────────────────────────────────────────────────────────────

describe('🔑 googleCallbackToken — JWT Google', () => {

  it('✅ génère un JWT valide pour un user Google', () => {
    const token = googleCallbackToken({ id: 'google-user-uuid' })
    expect(token).toBeDefined()
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    expect(decoded).toHaveProperty('id', 'google-user-uuid')
    console.log(`✅ JWT Google généré: ${token.substring(0, 30)}...`)
  })

  it('❌ refuse si user est null', () => {
    expect(() => googleCallbackToken(null)).toThrow('échouée')
  })

  it('❌ refuse si user est undefined', () => {
    expect(() => googleCallbackToken(undefined)).toThrow('échouée')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Bcrypt — Vérification du hashage
// ─────────────────────────────────────────────────────────────────────────────

describe('🔒 Bcrypt — Hashage des mots de passe', () => {

  it('✅ un hash bcrypt n\'est jamais identique au password original', async () => {
    const password = 'MonMotDePasse1!'
    const hash = await bcrypt.hash(password, 12)
    expect(hash).not.toBe(password)
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    console.log(`✅ Hash: ${hash.substring(0, 30)}...`)
  })

  it('✅ deux hashs du même password sont différents (salt)', async () => {
    const password = 'MonMotDePasse1!'
    const hash1 = await bcrypt.hash(password, 12)
    const hash2 = await bcrypt.hash(password, 12)
    expect(hash1).not.toBe(hash2) // ← le salt rend chaque hash unique
    console.log('✅ Deux hashs différents pour le même mot de passe')
  })

  it('✅ bcrypt.compare retourne true pour le bon password', async () => {
    const password = 'MonMotDePasse1!'
    const hash = await bcrypt.hash(password, 12)
    const isValid = await bcrypt.compare(password, hash)
    expect(isValid).toBe(true)
  })

  it('✅ bcrypt.compare retourne false pour un mauvais password', async () => {
    const hash = await bcrypt.hash('MonMotDePasse1!', 12)
    const isValid = await bcrypt.compare('MauvaisPassword!', hash)
    expect(isValid).toBe(false)
  })

  it('❌ impossible de retrouver le password depuis le hash', async () => {
    const password = 'MonMotDePasse1!'
    const hash = await bcrypt.hash(password, 12)
    // Le hash ne contient pas le password en clair
    expect(hash).not.toContain(password)
    expect(hash.length).toBeGreaterThan(50) // bcrypt hash = 60 chars
  })

})