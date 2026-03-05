import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// Create a connection pool to PostgreSQL
// A pool reuses connections instead of
// opening a new one for every request
const database = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

database.connect()
  .then(() => console.log("PostgreSQL connected successfully"))
  .catch((err) => console.error("Database connection error:", err));

export default database;