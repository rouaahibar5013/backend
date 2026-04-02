import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fileUpload from "express-fileupload";
import cookieParser from "cookie-parser";
import passport from "./config/passport.js";
import statsRoutes     from "./routes/statsRoutes.js";
import homeRoutes      from "./routes/homeRoutes.js";
import productRoutes   from "./routes/productRoutes.js";
import categoryRoutes  from "./routes/categoryRoutes.js";
import supplierRoutes  from "./routes/supplierRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import authRoutes      from "./routes/authRoutes.js";

import orderRoutes     from "./routes/orderRoutes.js";
import reviewRoutes    from "./routes/reviewRoutes.js";
import wishlistRoutes  from "./routes/wishlistRoutes.js";
import offresRoutes    from "./routes/offresRoutes.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import { stripeWebhook } from "./controllers/orderController.js";

dotenv.config();

const app = express();

// ─── Middlewares ───────────────────────────────────────────

// 1. CORS
app.use(cors({
  origin:      process.env.FRONTEND_URL,
  credentials: true,
  methods:     ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));

// ✅ 2. Stripe Webhook — DOIT être AVANT express.json()
// Stripe envoie du raw body — pas du JSON parsé
app.post(
  "/api/orders/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// 3. Parsers JSON et URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. fileUpload
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir:  "/tmp/",
}));

// 5. Cookie parser
app.use(cookieParser());

// 6. Passport
app.use(passport.initialize());

// ─── Routes ───────────────────────────────────────────────
app.use("/api/home",       homeRoutes);
app.use("/api/products",   productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/suppliers",  supplierRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/auth",       authRoutes);

app.use("/api/orders",     orderRoutes);
app.use("/api/reviews",    reviewRoutes);
app.use("/api/wishlist",   wishlistRoutes);
app.use("/api/offres",     offresRoutes);
app.use("/api/stats",      statsRoutes);

// ─── Global error handler ─────────────────────────────────
app.use(errorMiddleware);

export default app;