import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fileUpload from "express-fileupload";
import cookieParser from 'cookie-parser';
import productRoutes   from "./routes/productRoutes.js";
import categoryRoutes  from "./routes/categoryRoutes.js";
import supplierRoutes  from "./routes/supplierRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import authRoutes from "./routes/authRoutes.js";

import { errorMiddleware } from "./middlewares/errorMiddleware.js";

dotenv.config();

const app = express();

app.use(cookieParser());
// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

// Routes
app.use("/api/products",   productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/suppliers",  supplierRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/auth", authRoutes);

// Global error handler
app.use(errorMiddleware);

export default app; // 👈 this is what was missing