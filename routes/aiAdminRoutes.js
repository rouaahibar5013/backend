import express from 'express';
import { adminAIChat } from '../controllers/aiAdminController.js';
import { isAuthenticated, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// POST /api/admin/ai/chat

router.post('/chat', isAuthenticated, isAdmin, adminAIChat);

export default router;