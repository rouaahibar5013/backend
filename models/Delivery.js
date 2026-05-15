import database from "../database/db.js";

class Delivery {
  // ─── Trouver par order_id ─────────────────────────────
  static async findByOrderId(orderId) {
    const result = await database.query(
      "SELECT * FROM delivery WHERE order_id = $1",
      [orderId]
    );
    return result.rows[0] || null;
  }

  // ─── Créer une livraison ──────────────────────────────
  static async create(orderId) {
    const result = await database.query(
      "INSERT INTO delivery (order_id, status) VALUES ($1, 'en_preparation') RETURNING *",
      [orderId]
    );
    return result.rows[0];
  }

  // ─── Mettre à jour la livraison ───────────────────────
  static async update(orderId, { carrier, tracking_number, estimated_date, status, notes }) {
    const current = await Delivery.findByOrderId(orderId);
    if (!current) return null;

    const result = await database.query(
      `UPDATE delivery
       SET carrier         = $1,
           tracking_number = $2,
           estimated_date  = $3,
           status          = $4,
           notes           = $5,
           updated_at      = NOW()
       WHERE order_id = $6
       RETURNING *`,
      [
        carrier         ?? current.carrier,
        tracking_number ?? current.tracking_number,
        estimated_date  ?? current.estimated_date,
        status          ?? current.status,
        notes           ?? current.notes,
        orderId,
      ]
    );
    return result.rows[0];
  }

  // ─── Marquer comme expédié ────────────────────────────
  static async markShipped(orderId) {
    await database.query(
      "UPDATE delivery SET status = 'expedie', shipped_at = NOW(), updated_at = NOW() WHERE order_id = $1",
      [orderId]
    );
  }
static async markInPreparation(orderId) {
  await database.query(
    "UPDATE delivery SET status = 'en_preparation', updated_at = NOW() WHERE order_id = $1",
    [orderId]
  );
}
  // ─── Marquer comme livré ──────────────────────────────
  static async markDelivered(orderId) {
    await database.query(
      "UPDATE delivery SET status = 'livre', delivered_at = NOW(), updated_at = NOW() WHERE order_id = $1",
      [orderId]
    );
  }

  // ─── Marquer comme retourné (annulation) ─────────────
  static async markReturned(orderId) {
    await database.query(
      "UPDATE delivery SET status = 'retourne', updated_at = NOW() WHERE order_id = $1",
      [orderId]
    );
  }
}

export default Delivery;