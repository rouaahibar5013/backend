import dotenv from "dotenv";
dotenv.config(); // 👈 must be first before reading process.env
import { createServer } from "http";
import app from "./app.js";
import { v2 as cloudinary } from "cloudinary";
import { initWebSocket }             from "./utils/websocket.js";           // ← ajouter
import { startScheduler } from "./utils/Scheduler.js";

// Configure Cloudinary once
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const server = createServer(app);
initWebSocket(server);
startScheduler();

server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});