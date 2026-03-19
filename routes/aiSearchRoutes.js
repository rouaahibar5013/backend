import express from 'express'
import { aiTextSearch } from '../controllers/aiSearchController.js'

const router = express.Router()

router.post('/text', aiTextSearch)

export default router