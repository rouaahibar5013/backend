import database from "../database/db.js";

export async function createfournisseurTable() {
  try {
    const query = `CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(150) NOT NULL UNIQUE,  -- used in URL: /suppliers/atelier-x
  description TEXT,
  address     TEXT,
  contact     VARCHAR(150),
  website     VARCHAR(255),
  images      JSONB   DEFAULT '[]'::JSONB,   -- array of { url, public_id }
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) `;
    await database.query(query);
console.log('Table products créée avec succès');




} catch (error) {
    console.error("error creating fournisseur table",error);
    process.exit(1);
}}