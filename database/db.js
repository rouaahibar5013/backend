import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const database = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
   ssl: { rejectUnauthorized: false },
});

database.connect()
  .then(() => console.log("PostgreSQL connected successfully"))
  .catch((err) => console.error("Database connection error:", err));

// Export query helper pour utiliser dans les controllers
export const query = (text, params) => database.query(text, params);
export const getClient = () => database.connect();
export default database;