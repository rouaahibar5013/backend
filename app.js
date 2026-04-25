import express       from "express";
import dotenv        from "dotenv";
import cors          from "cors";
import fileUpload    from "express-fileupload";
import cookieParser  from "cookie-parser";
import passport      from "./config/passport.js";

import statsRoutes         from "./routes/statsRoutes.js";
import faqRouter           from "./routes/faqRoutes.js";
import homeRoutes          from "./routes/homeRoutes.js";
import productRoutes       from "./routes/productRoutes.js";
import categoryRoutes      from "./routes/categoryRoutes.js";
import supplierRoutes      from "./routes/supplierRoutes.js";
import promotionRoutes     from "./routes/promotionRoutes.js";
import authRoutes          from "./routes/authRoutes.js";
import orderRoutes         from "./routes/orderRoutes.js";
import reviewRoutes        from "./routes/reviewRoutes.js";
import wishlistRoutes      from "./routes/wishlistRoutes.js";
import recipeRoutes        from "./routes/recipeRoutes.js";
import offresRoutes        from "./routes/offresRoutes.js";
import emailcampaignRoutes from "./routes/emailcampaignRoutes.js";
import reclamationRoutes   from "./routes/reclamationRoutes.js";

import { errorMiddleware } from "./middlewares/errorMiddleware.js";

dotenv.config();

const app = express();

// ─── Middlewares ───────────────────────────────────────────

// 1. CORS — toujours en premier
app.use(cors({
  origin:      process.env.FRONTEND_URL,
  credentials: true,
  methods:     ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));

// 2. Stripe webhook — raw body AVANT express.json()
app.use(
  "/api/orders/webhooks/stripe",
  express.raw({ type: "application/json" })
);

// 3. fileUpload — AVANT express.json() ✅
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir:  "/tmp/",
}));

// 4. Parsers JSON et URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Cookie parser
app.use(cookieParser());

// 6. Passport
app.use(passport.initialize());

// ─── Routes ───────────────────────────────────────────────
app.use("/api/home",             homeRoutes);
app.use("/api/auth",             authRoutes);
app.use("/api/products",         productRoutes);
app.use("/api/categories",       categoryRoutes);
app.use("/api/suppliers",        supplierRoutes);
app.use("/api/promotions",       promotionRoutes);
app.use("/api/orders",           orderRoutes);
app.use("/api/reviews",          reviewRoutes);
app.use("/api/reclamations",     reclamationRoutes);  // ✅ /api/reclamations
app.use("/api/wishlist",         wishlistRoutes);
app.use("/api/offres",           offresRoutes);
app.use("/api/stats",            statsRoutes);
app.use("/api/email-campaigns",  emailcampaignRoutes);
app.use("/api/faqs",             faqRouter);
app.use("/api/recipes",          recipeRoutes);

// ─── Global error handler — toujours en dernier ───────────
app.use(errorMiddleware);

export default app;