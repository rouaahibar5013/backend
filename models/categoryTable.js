import database from "../database/db.js"

export async function createCategoriesTable(){
    try {
        const query = `
        
  CREATE TABLE IF NOT EXISTS categories (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  images      JSONB   DEFAULT '[]'::JSONB,
  parent_id   UUID    REFERENCES categories(id) ON DELETE SET NULL, -- NULL = root category
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `;

        await database.query(query);
        console.log("Table categories créée avec succès");

    } catch (error) {
        console.error("error creating categories table", error);
        process.exit(1);
    }
}