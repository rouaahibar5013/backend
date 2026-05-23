import { afterAll, beforeAll } from 'vitest'

// Ce fichier s'exécute avant et après tous les tests

beforeAll(async () => {
  console.log('🚀 Démarrage des tests Goofa...')
})

afterAll(async () => {
  console.log('✅ Tests terminés')
})