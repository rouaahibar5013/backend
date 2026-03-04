import database from "../database/db.js"





export async function createProductsTable(){
try {
    const query =`
    
   CREATE TABLE IF NOT EXISTS products (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  description   TEXT    NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,
  images        JSONB   DEFAULT '[]'::JSONB,   -- array of { url, public_id }
  ethical_info  TEXT,                           -- ethical/sustainability info
  supplier_name VARCHAR(100),                   -- soft link to suppliers.name
  category_id   UUID    REFERENCES categories(id) ON DELETE SET NULL,
  ratings       NUMERIC(3,2) DEFAULT 0,
  status        VARCHAR(20)  DEFAULT 'approved', -- 'pending'|'approved'|'rejected'
  created_by    UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
    `;


    await database.query(query);
console.log('Table products créée avec succès');




} catch (error) {
    console.error("error creating product table",error);
    process.exit(1);
}



}