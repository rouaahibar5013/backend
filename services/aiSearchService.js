import pool from '../database/db.js'
import { extractSearchCriteria } from './groqService.js'

export const searchProductsByText = async (userDescription) => {

  const criteria = await extractSearchCriteria(userDescription)
  let { keywords, price_max, price_min, category_name } = criteria

  // Nettoyer les keywords
  keywords = keywords
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  console.log('Keywords nettoyés:', keywords)

  // ← Déclare values ICI avant les conditions
  const values = [keywords]
  let paramIndex = 2

  const conditions = [
    `p.is_active = true`,
    `pv.is_active = true`,
    `to_tsvector('french', 
      regexp_replace(
        p.name_fr || ' ' || COALESCE(p.description_fr, ''),
        '[^a-zA-ZÀ-ÿ0-9\\s]', ' ', 'g'
      )
    ) @@ plainto_tsquery('french', $1)`
  ]

  if (price_max) {
    conditions.push(`pv.price <= $${paramIndex}`)
    values.push(price_max)
    paramIndex++
  }

  if (price_min) {
    conditions.push(`pv.price >= $${paramIndex}`)
    values.push(price_min)
    paramIndex++
  }

  //if (category_name) {
    //conditions.push(`c.name_fr ILIKE $${paramIndex}`)
    //values.push(`%${category_name}%`)
    //paramIndex++
  //}

  const query = `
    SELECT DISTINCT ON (p.id)
      p.id,
      p.name_fr,
      p.name_ar,
      p.description_fr,
      p.images,
      p.slug,
      p.rating_avg,
      p.rating_count,
      c.name_fr AS category_name,
      MIN(pv.price) AS price,
      MIN(pv.compare_price) AS compare_price,
      ts_rank(
        to_tsvector('french', 
          regexp_replace(
            p.name_fr || ' ' || COALESCE(p.description_fr, ''),
            '[^a-zA-ZÀ-ÿ0-9\\s]', ' ', 'g'
          )
        ),
        plainto_tsquery('french', $1)
      ) AS relevance_score        
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY p.id, p.name_fr, p.name_ar, p.description_fr,
             p.images, p.slug, p.rating_avg, p.rating_count, c.name_fr
    ORDER BY p.id, relevance_score DESC
    LIMIT 10
  `

  console.log('Values:', values)

  const result = await pool.query(query, values)

  return {
    criteria,
    products: result.rows
  }
}