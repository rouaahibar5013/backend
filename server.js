import dotenv from "dotenv";
dotenv.config(); // 👈 must be first before reading process.env

import app from "./app.js";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary once
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});