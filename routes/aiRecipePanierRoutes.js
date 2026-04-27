import express from 'express';
import { suggererRecettes } from '../controllers/aiRecipePanierController.js';

const router = express.Router();

router.post('/suggestions', suggererRecettes);

export default router;