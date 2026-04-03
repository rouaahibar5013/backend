import express from "express";
import {
  getRecipeSuggestions,
  aiProductSearch,
  aiChat,
} from "../controllers/aiController.js";

const router = express.Router();

// ── Public — pas besoin d'être connecté ──────────────────
router.post("/recipes", getRecipeSuggestions);  // suggestion recettes
router.post("/search",  aiProductSearch);        // recherche produits
router.post("/chat",    aiChat);                 // chatbot général

export default router;