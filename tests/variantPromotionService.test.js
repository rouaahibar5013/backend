import { config } from 'dotenv'
config({ path: '.env.test' })

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../models/index.js', () => ({
  VariantPromotion: {
    findByVariantId:        vi.fn(),
    deactivateAllByVariantId: vi.fn(),
    create:                 vi.fn(),
    toggle:                 vi.fn(),
    delete:                 vi.fn(),
  }
}))

vi.mock('../utils/cacheInvalideation.js', () => ({
  invalidateOffresCache: vi.fn().mockResolvedValue(true)
}))

import { VariantPromotion } from '../models/index.js'
import { invalidateOffresCache } from '../utils/cacheInvalideation.js'
import {
  getVariantPromotionsService,
  createVariantPromotionService,
  toggleVariantPromotionService,
  deleteVariantPromotionService,
} from '../services/variantPromotionService.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. getVariantPromotionsService
// ─────────────────────────────────────────────────────────────────────────────

describe('📋 getVariantPromotionsService — Récupérer promotions', () => {

  beforeEach(() => vi.clearAllMocks())

  it('✅ retourne les promotions d\'un variant', async () => {
    const mockPromos = [
      { id: 'promo-1', variant_id: 'variant-uuid', discount_type: 'percent', discount_value: 10 },
      { id: 'promo-2', variant_id: 'variant-uuid', discount_type: 'fixed',   discount_value: 5  },
    ]
    VariantPromotion.findByVariantId.mockResolvedValue(mockPromos)

    const result = await getVariantPromotionsService('variant-uuid')

    expect(result).toEqual(mockPromos)
    expect(VariantPromotion.findByVariantId).toHaveBeenCalledWith('variant-uuid')
    console.log(`✅ ${result.length} promotion(s) trouvée(s)`)
  })

  it('✅ retourne un tableau vide si aucune promotion', async () => {
    VariantPromotion.findByVariantId.mockResolvedValue([])

    const result = await getVariantPromotionsService('variant-sans-promo')

    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  it('✅ appelle findByVariantId avec le bon variantId', async () => {
    VariantPromotion.findByVariantId.mockResolvedValue([])

    await getVariantPromotionsService('mon-variant-id')

    expect(VariantPromotion.findByVariantId).toHaveBeenCalledOnce()
    expect(VariantPromotion.findByVariantId).toHaveBeenCalledWith('mon-variant-id')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. createVariantPromotionService — Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('➕ createVariantPromotionService — Créer une promotion', () => {

  const validData = {
    variantId:      'variant-uuid',
    discount_type:  'percent',
    discount_value: 10,
    starts_at:      '2025-01-01',
    expires_at:     '2025-12-31',
  }

  const mockPromo = {
    id:             'promo-uuid',
    variant_id:     'variant-uuid',
    discount_type:  'percent',
    discount_value: 10,
    is_active:      true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    VariantPromotion.deactivateAllByVariantId.mockResolvedValue(true)
    VariantPromotion.create.mockResolvedValue(mockPromo)
  })

  it('✅ crée une promotion percent valide', async () => {
    const result = await createVariantPromotionService(validData)

    expect(result).toEqual(mockPromo)
    expect(VariantPromotion.create).toHaveBeenCalledOnce()
    console.log(`✅ Promotion créée: ${result.discount_type} ${result.discount_value}`)
  })

  it('✅ crée une promotion fixed valide', async () => {
    VariantPromotion.create.mockResolvedValue({ ...mockPromo, discount_type: 'fixed', discount_value: 20 })

    const result = await createVariantPromotionService({
      ...validData,
      discount_type:  'fixed',
      discount_value: 20,
    })

    expect(result.discount_type).toBe('fixed')
    expect(result.discount_value).toBe(20)
  })

  it('✅ désactive les promotions existantes avant de créer', async () => {
    await createVariantPromotionService(validData)

    expect(VariantPromotion.deactivateAllByVariantId).toHaveBeenCalledWith('variant-uuid')
    expect(VariantPromotion.deactivateAllByVariantId).toHaveBeenCalledBefore(
      VariantPromotion.create
    )
    console.log('✅ Anciennes promotions désactivées avant création')
  })

  it('✅ invalide le cache après création', async () => {
    await createVariantPromotionService(validData)
    expect(invalidateOffresCache).toHaveBeenCalledOnce()
  })

  it('✅ accepte une réduction de 1% (minimum)', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_value: 1 })
    ).resolves.toBeDefined()
  })

  it('✅ accepte une réduction de 100% (maximum)', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_value: 100 })
    ).resolves.toBeDefined()
  })

  it('❌ refuse un type de promotion invalide', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'invalid' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse un type "gratuit" (non autorisé)', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'gratuit' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse un pourcentage de 0%', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'percent', discount_value: 0 })
    ).rejects.toThrow('Pourcentage')
  })

  it('❌ refuse un pourcentage > 100%', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'percent', discount_value: 101 })
    ).rejects.toThrow('Pourcentage')
  })

  it('❌ refuse un pourcentage négatif', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'percent', discount_value: -10 })
    ).rejects.toThrow('Pourcentage')
  })

  it('✅ fixed — accepte n\'importe quelle valeur positive', async () => {
    await expect(
      createVariantPromotionService({ ...validData, discount_type: 'fixed', discount_value: 999 })
    ).resolves.toBeDefined()
  })

  it('❌ refuse si expires_at est avant starts_at', async () => {
    await expect(
      createVariantPromotionService({
        ...validData,
        starts_at:  '2025-12-31',
        expires_at: '2025-01-01',
      })
    ).rejects.toThrow('expires_at')
  })

  it('❌ refuse si expires_at = starts_at', async () => {
    await expect(
      createVariantPromotionService({
        ...validData,
        starts_at:  '2025-06-01',
        expires_at: '2025-06-01',
      })
    ).rejects.toThrow('expires_at')
  })

  it('✅ expires_at après starts_at — accepté', async () => {
    await expect(
      createVariantPromotionService({
        ...validData,
        starts_at:  '2025-01-01',
        expires_at: '2025-01-02',
      })
    ).resolves.toBeDefined()
  })

  it('✅ passe les bons arguments à VariantPromotion.create', async () => {
    await createVariantPromotionService(validData)

    expect(VariantPromotion.create).toHaveBeenCalledWith({
      variant_id:     'variant-uuid',
      discount_type:  'percent',
      discount_value: 10,
      starts_at:      '2025-01-01',
      expires_at:     '2025-12-31',
    })
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. toggleVariantPromotionService — Activer/Désactiver
// ─────────────────────────────────────────────────────────────────────────────

describe('🔄 toggleVariantPromotionService — Activer/Désactiver', () => {

  const mockPromo = {
    id:        'promo-uuid',
    is_active: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    VariantPromotion.toggle.mockResolvedValue(mockPromo)
  })

  it('✅ active une promotion', async () => {
    const result = await toggleVariantPromotionService('promo-uuid', true)

    expect(result).toEqual(mockPromo)
    expect(VariantPromotion.toggle).toHaveBeenCalledWith('promo-uuid', true)
    console.log(`✅ Promotion activée: ${result.id}`)
  })

  it('✅ désactive une promotion', async () => {
    VariantPromotion.toggle.mockResolvedValue({ ...mockPromo, is_active: false })

    const result = await toggleVariantPromotionService('promo-uuid', false)

    expect(VariantPromotion.toggle).toHaveBeenCalledWith('promo-uuid', false)
    expect(result.is_active).toBe(false)
  })

  it('✅ invalide le cache après toggle', async () => {
    await toggleVariantPromotionService('promo-uuid', true)
    expect(invalidateOffresCache).toHaveBeenCalledOnce()
  })

  it('❌ refuse si promotion inexistante', async () => {
    VariantPromotion.toggle.mockResolvedValue(null)

    await expect(
      toggleVariantPromotionService('uuid-inexistant', true)
    ).rejects.toThrow('introuvable')
  })

  it('✅ appelle toggle avec les bons arguments', async () => {
    await toggleVariantPromotionService('promo-uuid', false)
    expect(VariantPromotion.toggle).toHaveBeenCalledWith('promo-uuid', false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. deleteVariantPromotionService — Supprimer
// ─────────────────────────────────────────────────────────────────────────────

describe('🗑️ deleteVariantPromotionService — Supprimer', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    VariantPromotion.delete.mockResolvedValue(true)
  })

  it('✅ supprime une promotion existante', async () => {
    await expect(
      deleteVariantPromotionService('promo-uuid')
    ).resolves.toBeUndefined()

    expect(VariantPromotion.delete).toHaveBeenCalledWith('promo-uuid')
    console.log('✅ Promotion supprimée')
  })

  it('✅ invalide le cache après suppression', async () => {
    await deleteVariantPromotionService('promo-uuid')
    expect(invalidateOffresCache).toHaveBeenCalledOnce()
  })

  it('❌ refuse si promotion inexistante', async () => {
    VariantPromotion.delete.mockResolvedValue(null)

    await expect(
      deleteVariantPromotionService('uuid-inexistant')
    ).rejects.toThrow('introuvable')
  })

  it('❌ le cache n\'est pas invalidé si promotion inexistante', async () => {
    VariantPromotion.delete.mockResolvedValue(null)

    await expect(
      deleteVariantPromotionService('uuid-inexistant')
    ).rejects.toThrow()

    expect(invalidateOffresCache).not.toHaveBeenCalled()
  })

  it('✅ appelle delete avec le bon promoId', async () => {
    await deleteVariantPromotionService('mon-promo-id')
    expect(VariantPromotion.delete).toHaveBeenCalledWith('mon-promo-id')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Logique métier — Validation des dates
// ─────────────────────────────────────────────────────────────────────────────

describe('📅 Validation des dates — Logique métier', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    VariantPromotion.deactivateAllByVariantId.mockResolvedValue(true)
    VariantPromotion.create.mockResolvedValue({ id: 'promo-uuid' })
  })

  const base = {
    variantId:      'variant-uuid',
    discount_type:  'percent',
    discount_value: 10,
  }

  it('✅ promotion valide sur une année entière', async () => {
    await expect(
      createVariantPromotionService({
        ...base,
        starts_at:  '2025-01-01',
        expires_at: '2025-12-31',
      })
    ).resolves.toBeDefined()
  })

  it('✅ promotion valide sur une journée', async () => {
    await expect(
      createVariantPromotionService({
        ...base,
        starts_at:  '2025-06-01',
        expires_at: '2025-06-02',
      })
    ).resolves.toBeDefined()
  })

  it('❌ expires_at dans le passé par rapport à starts_at', async () => {
    await expect(
      createVariantPromotionService({
        ...base,
        starts_at:  '2025-12-01',
        expires_at: '2025-11-01',
      })
    ).rejects.toThrow('expires_at')
  })

  it('❌ dates identiques → refusé', async () => {
    await expect(
      createVariantPromotionService({
        ...base,
        starts_at:  '2025-06-15',
        expires_at: '2025-06-15',
      })
    ).rejects.toThrow('expires_at')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Logique métier — Validation des pourcentages
// ─────────────────────────────────────────────────────────────────────────────

describe('💯 Validation pourcentages — Cas limites', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    VariantPromotion.deactivateAllByVariantId.mockResolvedValue(true)
    VariantPromotion.create.mockResolvedValue({ id: 'promo-uuid' })
  })

  const base = {
    variantId:     'variant-uuid',
    discount_type: 'percent',
    starts_at:     '2025-01-01',
    expires_at:    '2025-12-31',
  }

  it('✅ 1% → accepté', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: 1 })).resolves.toBeDefined()
  })

  it('✅ 50% → accepté', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: 50 })).resolves.toBeDefined()
  })

  it('✅ 100% → accepté', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: 100 })).resolves.toBeDefined()
  })

  it('❌ 0% → refusé', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: 0 })).rejects.toThrow()
  })

  it('❌ 101% → refusé', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: 101 })).rejects.toThrow()
  })

  it('❌ -1% → refusé', async () => {
    await expect(createVariantPromotionService({ ...base, discount_value: -1 })).rejects.toThrow()
  })

})