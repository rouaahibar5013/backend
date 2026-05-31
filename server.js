import dotenv from "dotenv";
dotenv.config(); // 
import { createServer } from "http";
import app from "./app.js";

import { initWebSocket }             from "./utils/websocket.js";           // ← ajouter
import { startScheduler } from "./utils/Scheduler.js";


const server = createServer(app);
initWebSocket(server);
startScheduler();

server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});