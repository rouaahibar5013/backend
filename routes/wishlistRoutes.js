import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../controllers/wishlistController.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

// Toutes les routes wishlist nécessitent d'être connecté
router.get("/",                   isAuthenticated, getWishlist);
router.post("/:productId",        isAuthenticated, addToWishlist);
router.delete("/",           isAuthenticated, clearWishlist);
router.delete("/:productId", isAuthenticated, removeFromWishlist);

export default router;