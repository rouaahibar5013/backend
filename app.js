import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fileUpload from "express-fileupload";
import cookieParser from "cookie-parser";
import passport from "./config/passport.js";

import productRoutes   from "./routes/productRoutes.js";
import categoryRoutes  from "./routes/categoryRoutes.js";
import supplierRoutes  from "./routes/supplierRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import authRoutes      from "./routes/authRoutes.js";
import cartRoutes      from "./routes/cartRoutes.js";
import orderRoutes     from "./routes/orderRoutes.js";

import { errorMiddleware } from "./middlewares/errorMiddleware.js";

dotenv.config();

const app = express();

// ─── Middlewares ───────────────────────────────────────────

// 1. CORS — en tout premier
app.use(cors({
  origin:      process.env.FRONTEND_URL,
  credentials: true,
  methods:     ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));

// 2. fileUpload — AVANT express.json() pour traiter le multipart/form-data
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir:  "/tmp/",
}));

// 3. Parsers JSON et URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Cookie parser
app.use(cookieParser());

// 5. Passport
app.use(passport.initialize());

// ─── Routes ───────────────────────────────────────────────

app.use("/api/products",   productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/suppliers",  supplierRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/auth",       authRoutes);
app.use("/api/cart",       cartRoutes);
app.use("/api/orders",     orderRoutes);

// ─── Global error handler ─────────────────────────────────
app.use(errorMiddleware);

export default app;