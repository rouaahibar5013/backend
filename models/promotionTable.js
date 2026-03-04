import database from "../database/db.js"

export async function createPromotionTable(){
    try {
        const query = `
        
  CREATE TABLE IF NOT EXISTS promotions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code             VARCHAR(50)   NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2)  NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  start_date       TIMESTAMP     NOT NULL,
  end_date         TIMESTAMP     NOT NULL,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL, -- NULL = applies to all
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `;

        await database.query(query);
        console.log("Table categories créée avec succès");

    } catch (error) {
        console.error("error creating promotion table", error);
        process.exit(1);
    }
}