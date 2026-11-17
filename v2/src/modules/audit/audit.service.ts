// O'zgarishlar izi. `q` — tranzaksiya ichidan chaqirilsa o'sha tranzaksiya
// (amal bekor bo'lsa audit yozuvi ham bekor bo'ladi).
import type { Queryable } from '../../db/pool.js';

export async function logAudit(
  q: Queryable,
  entry: {
    action: string;
    entityType: string;
    entityId: number;
    oldValue?: unknown;
    newValue?: unknown;
    performedBy?: number | null;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (action, entity_type, entity_id, old_value, new_value, performed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldValue == null ? null : JSON.stringify(entry.oldValue),
      entry.newValue == null ? null : JSON.stringify(entry.newValue),
      entry.performedBy ?? null,
    ],
  );
}

export async function listAuditLog(q: Queryable, limit = 200) {
  const lim = Math.min(Math.max(Math.trunc(limit) || 200, 1), 500);
  const { rows } = await q.query(
    `SELECT al.*, COALESCE(u.full_name, u.username) AS performed_by_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.performed_by
      ORDER BY al.id DESC
      LIMIT $1`,
    [lim],
  );
  return rows;
}

/** Admin "Audit" sahifasi: oxirgi 30 kun bo'yicha xulosa. */
export async function auditSummary(q: Queryable) {
  const [cancellations, manualBills, failedLogins, auditLog] = await Promise.all([
    q.query(
      `SELECT oi.cancelled_by AS user_id, COALESCE(u.full_name, u.username) AS employee_name,
              COUNT(*)::int AS cancelled_count, COALESCE(SUM(oi.subtotal), 0)::bigint AS cancelled_amount
         FROM order_items oi
         LEFT JOIN users u ON u.id = oi.cancelled_by
        WHERE oi.status = 'cancelled' AND oi.cancelled_at >= now() - interval '30 days'
        GROUP BY oi.cancelled_by, u.full_name, u.username
        ORDER BY cancelled_count DESC`,
    ),
    q.query(
      `SELECT mb.created_by AS user_id, COALESCE(u.full_name, u.username) AS employee_name,
              COUNT(*)::int AS bill_count, COALESCE(SUM(mb.total_amount), 0)::bigint AS bill_amount
         FROM manual_bills mb
         JOIN users u ON u.id = mb.created_by
        WHERE mb.created_at >= now() - interval '30 days'
        GROUP BY mb.created_by, u.full_name, u.username
        ORDER BY bill_amount DESC`,
    ),
    q.query(
      `SELECT username, COUNT(*)::int AS attempt_count, MAX(created_at) AS last_attempt
         FROM login_attempts
        WHERE NOT success AND created_at >= now() - interval '30 days'
        GROUP BY username
        ORDER BY attempt_count DESC
        LIMIT 50`,
    ),
    listAuditLog(q, 100),
  ]);
  return {
    cancellations: cancellations.rows,
    manualBills: manualBills.rows,
    failedLogins: failedLogins.rows,
    auditLog,
  };
}
