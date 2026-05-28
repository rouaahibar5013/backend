import { config } from 'dotenv'
config({ path: '.env.test' })

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../models/index.js', () => ({
  Order:            { findById: vi.fn(), updateStatus: vi.fn(), cancel: vi.fn() },
  OrderItem:        { findByOrderIdSimple: vi.fn() },
  Delivery:         { markInPreparation: vi.fn(), markShipped: vi.fn(), markDelivered: vi.fn() },
  ProductVariant:   { findActiveByIds: vi.fn(), decrementStock: vi.fn(), findById: vi.fn(), findLowStock: vi.fn() },
  VariantPromotion: { findActiveByVariantIds: vi.fn() },
  Promotion:        { findValidByCode: vi.fn(), incrementUsed: vi.fn() },
  User:             { findById: vi.fn(), updateAddresses: vi.fn() },
}))

vi.mock('stripe', () => {
  function StripeMock() {
    this.paymentIntents = { create: vi.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'secret_test' }) }
    this.refunds        = { create: vi.fn().mockResolvedValue({ id: 'ref_test' }) }
    this.webhooks       = { constructEvent: vi.fn() }
  }
  return { default: StripeMock }
})

vi.mock('../utils/sendEmail.js',            () => ({ default: vi.fn().mockResolvedValue(true) }))
vi.mock('../utils/websocket.js',            () => ({ notifyUser: vi.fn() }))
vi.mock('../utils/cacheInvalideation.js',   () => ({ invalidateDashboardCache: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/authService.js',       () => ({ createGuestAccountService: vi.fn() }))
vi.mock('../services/odooService.js',       () => ({ exportOrderToOdoo: vi.fn().mockResolvedValue(true) }))
vi.mock('pdfkit',                           () => ({ default: vi.fn() }))

import {
  getShippingCostService,
  validatePromoService,
  updateOrderStatusService,
  cancelOrderService,
} from '../services/orderService.js'

import {
  Order, OrderItem, Delivery,
  ProductVariant, VariantPromotion, Promotion, User,
} from '../models/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. getShippingCostService — Calcul frais de livraison
// ─────────────────────────────────────────────────────────────────────────────

describe('🚚 getShippingCostService — Calcul frais livraison', () => {

  it('✅ retourne 0 CHF si subtotal >= seuil gratuit (100 CHF)', () => {
    const result = getShippingCostService(100)
    expect(result.shipping_cost).toBe(0)
    expect(result.is_free).toBe(true)
    expect(result.remaining_for_free).toBe(0)
  })

  it('✅ retourne 0 CHF si subtotal > 100 CHF', () => {
    const result = getShippingCostService(150)
    expect(result.shipping_cost).toBe(0)
    expect(result.is_free).toBe(true)
  })

  it('✅ retourne 9.90 CHF si subtotal < 100 CHF', () => {
    const result = getShippingCostService(50)
    expect(result.shipping_cost).toBe(9.9)
    expect(result.is_free).toBe(false)
  })

  it('✅ calcule correctement le montant restant pour la livraison gratuite', () => {
    const result = getShippingCostService(70)
    expect(result.remaining_for_free).toBe(30)
    expect(result.shipping_cost).toBe(9.9)
  })

  it('✅ retourne remaining_for_free = 0 si déjà gratuit', () => {
    const result = getShippingCostService(200)
    expect(result.remaining_for_free).toBe(0)
    expect(result.is_free).toBe(true)
  })

  it('✅ retourne le seuil de livraison gratuite', () => {
    const result = getShippingCostService(50)
    expect(result.free_shipping_threshold).toBe(100)
  })

  it('✅ subtotal exactement à 99.99 CHF → pas gratuit', () => {
    const result = getShippingCostService(99.99)
    expect(result.shipping_cost).toBe(9.9)
    expect(result.is_free).toBe(false)
    expect(result.remaining_for_free).toBe(0.01)
  })

  it('✅ subtotal = 0 CHF → frais de livraison', () => {
    const result = getShippingCostService(0)
    expect(result.shipping_cost).toBe(9.9)
    expect(result.is_free).toBe(false)
    expect(result.remaining_for_free).toBe(100)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. validatePromoService — Validation codes promo
// ─────────────────────────────────────────────────────────────────────────────

describe('🎟️ validatePromoService — Codes promo', () => {

  beforeEach(() => vi.clearAllMocks())

  it('✅ applique une réduction en pourcentage (10%)', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'GOFFA10',
      discount_type:   'percent',
      discount_value:  '10',
      min_order_amount: null,
    })

    const result = await validatePromoService({ code: 'GOFFA10', subtotal: 100 })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(10)         // 10% de 100
    expect(result.subtotalAfterDiscount).toBe(90)  // 100 - 10
    expect(result.label).toBe('-10%')
    console.log(`✅ Promo 10%: -${result.discountAmount} CHF → total ${result.totalAmount} CHF`)
  })

  it('✅ applique une réduction fixe (20 CHF)', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'GOFFA20',
      discount_type:   'fixed',
      discount_value:  '20',
      min_order_amount: null,
    })

    const result = await validatePromoService({ code: 'GOFFA20', subtotal: 100 })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(20)
    expect(result.subtotalAfterDiscount).toBe(80)
    expect(result.label).toBe('-20 CHF')
  })

  it('✅ la réduction fixe ne dépasse jamais le subtotal', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'GOFFA200',
      discount_type:   'fixed',
      discount_value:  '200',   // plus grand que le subtotal
      min_order_amount: null,
    })

    const result = await validatePromoService({ code: 'GOFFA200', subtotal: 50 })

    expect(result.discountAmount).toBe(50)  // limité au subtotal
    expect(result.subtotalAfterDiscount).toBe(0)
    console.log('✅ Réduction fixe plafonnée au subtotal')
  })

  it('✅ livraison gratuite après réduction (subtotal >= 100)', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'GOFFA5',
      discount_type:   'fixed',
      discount_value:  '5',
      min_order_amount: null,
    })

    // 110 - 5 = 105 → livraison gratuite
    const result = await validatePromoService({ code: 'GOFFA5', subtotal: 110 })

    expect(result.subtotalAfterDiscount).toBe(105)
    expect(result.shippingCost).toBe(0)
    expect(result.totalAmount).toBe(105)
    console.log('✅ Livraison gratuite après réduction')
  })

  it('✅ livraison payante après réduction (subtotal < 100)', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'GOFFA20',
      discount_type:   'fixed',
      discount_value:  '20',
      min_order_amount: null,
    })

    // 110 - 20 = 90 → livraison payante
    const result = await validatePromoService({ code: 'GOFFA20', subtotal: 110 })

    expect(result.subtotalAfterDiscount).toBe(90)
    expect(result.shippingCost).toBe(9.9)
    expect(result.totalAmount).toBe(99.9)
    console.log('✅ Livraison payante après réduction')
  })

  it('❌ refuse un code promo invalide', async () => {
    Promotion.findValidByCode.mockResolvedValue(null)

    await expect(
      validatePromoService({ code: 'CODEINVALIDE', subtotal: 100 })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse si montant minimum non atteint', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:               'promo-uuid',
      code:             'GOFFA50',
      discount_type:    'percent',
      discount_value:   '10',
      min_order_amount: '150',   // minimum 150 CHF
    })

    await expect(
      validatePromoService({ code: 'GOFFA50', subtotal: 100 })
    ).rejects.toThrow('minimum')
  })

  it('✅ accepte si subtotal = montant minimum exact', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:               'promo-uuid',
      code:             'GOFFA10',
      discount_type:    'percent',
      discount_value:   '10',
      min_order_amount: '100',
    })

    const result = await validatePromoService({ code: 'GOFFA10', subtotal: 100 })
    expect(result.valid).toBe(true)
  })

  it('❌ refuse si code manquant', async () => {
    await expect(
      validatePromoService({ code: '', subtotal: 100 })
    ).rejects.toThrow('requis')
  })

  it('❌ refuse si subtotal manquant', async () => {
    await expect(
      validatePromoService({ code: 'GOFFA10', subtotal: null })
    ).rejects.toThrow('requis')
  })

  it('✅ retourne le code en majuscules', async () => {
    Promotion.findValidByCode.mockResolvedValue({
      id:              'promo-uuid',
      code:            'goffa10',
      discount_type:   'percent',
      discount_value:  '10',
      min_order_amount: null,
    })

    const result = await validatePromoService({ code: 'goffa10', subtotal: 100 })
    expect(result.promoCode).toBe('GOFFA10')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. updateOrderStatusService — Mise à jour statut commande
// ─────────────────────────────────────────────────────────────────────────────

describe('📦 updateOrderStatusService — Statuts commande', () => {

  const mockOrder = {
    id:           'order-uuid',
    order_number: 'CMD-001',
    user_id:      'user-uuid',
    total_price:  '99.90',
    status:       'en_attente',
    payment_status: 'en_attente',
  }

  const mockUser = {
    id:    'user-uuid',
    name:  'Ahmed',
    email: 'ahmed@goofa.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Order.findById.mockResolvedValue(mockOrder)
    Order.updateStatus.mockResolvedValue(true)
    User.findById.mockResolvedValue(mockUser)
    Delivery.markInPreparation.mockResolvedValue(true)
    Delivery.markShipped.mockResolvedValue(true)
    Delivery.markDelivered.mockResolvedValue(true)
  })

  it('✅ met à jour vers "confirmee"', async () => {
    const result = await updateOrderStatusService({ orderId: 'order-uuid', status: 'confirmee' })
    expect(Order.updateStatus).toHaveBeenCalledWith('order-uuid', 'confirmee')
    expect(result.message).toContain('confirmee')
  })

  it('✅ met à jour vers "en_preparation" et marque la livraison', async () => {
    await updateOrderStatusService({ orderId: 'order-uuid', status: 'en_preparation' })
    expect(Delivery.markInPreparation).toHaveBeenCalledWith('order-uuid')
  })

  it('✅ met à jour vers "expediee" et marque la livraison', async () => {
    await updateOrderStatusService({ orderId: 'order-uuid', status: 'expediee' })
    expect(Delivery.markShipped).toHaveBeenCalledWith('order-uuid')
  })

  it('✅ met à jour vers "livree" et marque la livraison', async () => {
    await updateOrderStatusService({ orderId: 'order-uuid', status: 'livree' })
    expect(Delivery.markDelivered).toHaveBeenCalledWith('order-uuid')
  })

  it('✅ tous les statuts valides sont acceptés', async () => {
    const validStatuses = ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'livree', 'en_reclamation', 'retournee']

    for (const status of validStatuses) {
      Order.findById.mockResolvedValue({ ...mockOrder, status: 'en_attente' })
      const result = await updateOrderStatusService({ orderId: 'order-uuid', status })
      expect(result.message).toContain(status)
    }
  })

  it('❌ refuse un statut invalide', async () => {
    await expect(
      updateOrderStatusService({ orderId: 'order-uuid', status: 'statutinvalide' })
    ).rejects.toThrow('invalide')
  })

  it('❌ refuse le statut "annulee" (route dédiée)', async () => {
    await expect(
      updateOrderStatusService({ orderId: 'order-uuid', status: 'annulee' })
    ).rejects.toThrow('annuler')
  })

  it('❌ refuse le statut "remboursee" (via Stripe)', async () => {
    await expect(
      updateOrderStatusService({ orderId: 'order-uuid', status: 'remboursee' })
    ).rejects.toThrow('remboursement')
  })

  it('❌ refuse si commande inexistante', async () => {
    Order.findById.mockResolvedValue(null)
    await expect(
      updateOrderStatusService({ orderId: 'uuid-inexistant', status: 'confirmee' })
    ).rejects.toThrow('introuvable')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. cancelOrderService — Annulation commande
// ─────────────────────────────────────────────────────────────────────────────

describe('❌ cancelOrderService — Annulation commande', () => {

  const cancellableOrder = {
    id:             'order-uuid',
    order_number:   'CMD-001',
    user_id:        'user-uuid',
    status:         'en_attente',
    payment_status: 'en_attente',
    payment_id:     null,
    total_price:    '99.90',
  }

  const mockUser = {
    id:    'user-uuid',
    name:  'Ahmed',
    email: 'ahmed@goofa.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Order.findById.mockResolvedValue(cancellableOrder)
    Order.cancel.mockResolvedValue(true)
    User.findById.mockResolvedValue(mockUser)
    OrderItem.findByOrderIdSimple.mockResolvedValue([])
  })

  it('✅ annule une commande en_attente avec une raison valide', async () => {
    const result = await cancelOrderService({
      orderId: 'order-uuid',
      reason: 'Client a changé d\'avis',
    })
    expect(result.message).toContain('annulée')
    expect(Order.cancel).toHaveBeenCalledWith('order-uuid', 'Client a changé d\'avis')
  })

  it('✅ annule une commande "confirmee"', async () => {
    Order.findById.mockResolvedValue({ ...cancellableOrder, status: 'confirmee' })
    const result = await cancelOrderService({ orderId: 'order-uuid', reason: 'Raison test' })
    expect(result.message).toContain('annulée')
  })

  it('✅ annule une commande "en_preparation"', async () => {
    Order.findById.mockResolvedValue({ ...cancellableOrder, status: 'en_preparation' })
    const result = await cancelOrderService({ orderId: 'order-uuid', reason: 'Raison test' })
    expect(result.message).toContain('annulée')
  })

  it('❌ refuse si raison manquante', async () => {
    await expect(
      cancelOrderService({ orderId: 'order-uuid', reason: '' })
    ).rejects.toThrow('raison')
  })

  it('❌ refuse si raison = espaces uniquement', async () => {
    await expect(
      cancelOrderService({ orderId: 'order-uuid', reason: '   ' })
    ).rejects.toThrow('raison')
  })

  it('❌ refuse si commande déjà expédiée', async () => {
    Order.findById.mockResolvedValue({ ...cancellableOrder, status: 'expediee' })
    await expect(
      cancelOrderService({ orderId: 'order-uuid', reason: 'Trop tard' })
    ).rejects.toThrow('annuler')
  })

  it('❌ refuse si commande déjà livrée', async () => {
    Order.findById.mockResolvedValue({ ...cancellableOrder, status: 'livree' })
    await expect(
      cancelOrderService({ orderId: 'order-uuid', reason: 'Trop tard' })
    ).rejects.toThrow('annuler')
  })

  it('❌ refuse si commande déjà annulée', async () => {
    Order.findById.mockResolvedValue({ ...cancellableOrder, status: 'annulee' })
    await expect(
      cancelOrderService({ orderId: 'order-uuid', reason: 'Déjà annulée' })
    ).rejects.toThrow('annuler')
  })

  it('❌ refuse si commande inexistante', async () => {
    Order.findById.mockResolvedValue(null)
    await expect(
      cancelOrderService({ orderId: 'uuid-inexistant', reason: 'Raison test' })
    ).rejects.toThrow('introuvable')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Logique calcul livraison — Tests de frontière
// ─────────────────────────────────────────────────────────────────────────────

describe('📐 Logique livraison — Cas limites', () => {

  it('✅ seuil exact 100 CHF → livraison gratuite', () => {
    const result = getShippingCostService(100)
    expect(result.is_free).toBe(true)
    expect(result.shipping_cost).toBe(0)
  })

  it('✅ 100.01 CHF → livraison gratuite', () => {
    const result = getShippingCostService(100.01)
    expect(result.is_free).toBe(true)
  })

  it('✅ 99.99 CHF → livraison payante', () => {
    const result = getShippingCostService(99.99)
    expect(result.is_free).toBe(false)
    expect(result.shipping_cost).toBe(9.9)
  })

  it('✅ le total avec frais est bien calculé', () => {
    const subtotal = 50
    const result = getShippingCostService(subtotal)
    const totalAttendu = subtotal + result.shipping_cost
    expect(totalAttendu).toBe(59.9)
  })

  it('✅ remaining_for_free est toujours positif ou zéro', () => {
    const cases = [0, 50, 99.99, 100, 200]
    cases.forEach(subtotal => {
      const result = getShippingCostService(subtotal)
      expect(result.remaining_for_free).toBeGreaterThanOrEqual(0)
    })
  })

})