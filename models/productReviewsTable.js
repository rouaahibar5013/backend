import database from "../database/db.js";

export async function createProductReviewsTable() {
  try {
    const query = `
     CREATE TABLE IF NOT EXISTS reviews (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id)    ON DELETE CASCADE,
  rating     NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    
    await database.query(query);
    console.log('Table reviews créée avec succès');
  } catch (error) {
    console.error('Failed to create reviews table:', error);
    process.exit(1);
  }
}