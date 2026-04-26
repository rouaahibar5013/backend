// routes/aiRoutes.js
import express from 'express';
import { recommander } from '../controllers/aiController.js';

const router = express.Router();

router.post('/recommander', recommander);

export default router;