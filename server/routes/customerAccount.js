// Mijoz hisobi API'si (login qilgan mijoz uchun) — 2026-11-01.
// server/index.js'da /api/customer ostida, customerAuth.requireCustomer bilan,
// xodimlar requireAuth'idan OLDIN ulanadi. Har bir so'rov FAQAT
// req.customer.id'ga tegishli yozuvlarni ko'radi/o'zgartiradi.
//
//   GET    /me                          profil + manzillar
//   PUT    /me                          { full_name }
//   POST   /logout-all                  barcha qurilmalardagi sessiyalarni bekor qilish
//   GET    /addresses                   ro'yxat
//   POST   /addresses                   { label, address, location_lat, location_lng, is_default }
//   PUT    /addresses/:id               xuddi shu maydonlar
//   DELETE /addresses/:id
//   GET    /orders                      buyurtmalar tarixi (oxirgi 50 ta, tarkibi bilan)
//   GET    /reservations                bronlar tarixi
//   POST   /reservations/:id/cancel     kelajakdagi bronni bekor qilish
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');
const { publicCustomer } = require('./customerAuth');

const router = express.Router();
const MAX_ADDRESSES = 10;

// ---------- Profil ----------

function listAddresses(customerId) {
  return db.prepare(
    `SELECT id, label, address, location_lat, location_lng, is_default, created_at
     FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC`
  ).all(customerId);
}

router.get('/me', asyncRoute((req, res) => {
  res.json({ customer: publicCustomer(req.customer), addresses: listAddresses(req.customer.id) });
}));

router.put('/me', asyncRoute((req, res) => {
  const name = String((req.body && req.body.full_name) || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Ismingizni to‘liq kiriting (2–60 belgi)', field: 'full_name' });
  }
  db.prepare('UPDATE customers SET full_name = ? WHERE id = ?').run(name, req.customer.id);
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
  res.json({ ok: true, customer: publicCustomer(updated) });
}));

router.post('/logout-all', asyncRoute((req, res) => {
  db.prepare('UPDATE customers SET session_version = session_version + 1 WHERE id = ?').run(req.customer.id);
  req.app.locals.customerAuth.logout(req, res);
  res.json({ ok: true });
}));

// ---------- Manzillar ----------

function parseAddress(body) {
  const label = String(body.label || '').trim().slice(0, 30);
  const address = String(body.address || '').trim();
  if (address.length < 5 || address.length > 200) {
    return { error: "Manzilni to'liq kiriting (5–200 belgi)", field: 'address' };
  }
  const lat = Number(body.location_lat);
  const lng = Number(body.location_lng);
  const hasLoc = body.location_lat != null && body.location_lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return {
    label: label || null,
    address,
    lat: hasLoc ? lat : null,
    lng: hasLoc ? lng : null,
    isDefault: body.is_default ? 1 : 0,
  };
}

function getOwnAddress(req) {
  return db.prepare('SELECT * FROM customer_addresses WHERE id = ? AND customer_id = ?')
    .get(Number(req.params.id), req.customer.id);
}

router.get('/addresses', asyncRoute((req, res) => {
  res.json({ addresses: listAddresses(req.customer.id) });
}));

router.post('/addresses', asyncRoute((req, res) => {
  const a = parseAddress(req.body || {});
  if (a.error) return res.status(400).json(a);
  const customerId = req.customer.id;
  const count = db.prepare('SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ?').get(customerId).n;
  if (count >= MAX_ADDRESSES) {
    return res.status(400).json({ error: `Ko'pi bilan ${MAX_ADDRESSES} ta manzil saqlash mumkin` });
  }
  // Bir xil matnli manzil qayta saqlanmasin (checkout'dagi "saqlash" belgisi uchun).
  const dup = db.prepare('SELECT id FROM customer_addresses WHERE customer_id = ? AND address = ?').get(customerId, a.address);
  if (dup) return res.json({ ok: true, id: dup.id, duplicate: true, addresses: listAddresses(customerId) });

  const id = db.transaction(() => {
    const makeDefault = a.isDefault || count === 0 ? 1 : 0; // birinchi manzil — avtomatik asosiy
    if (makeDefault) db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(customerId);
    return db.prepare(
      `INSERT INTO customer_addresses (customer_id, label, address, location_lat, location_lng, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(customerId, a.label, a.address, a.lat, a.lng, makeDefault, nowIso()).lastInsertRowid;
  })();
  res.json({ ok: true, id, addresses: listAddresses(customerId) });
}));

router.put('/addresses/:id', asyncRoute((req, res) => {
  const existing = getOwnAddress(req);
  if (!existing) return res.status(404).json({ error: 'Manzil topilmadi' });
  const a = parseAddress(req.body || {});
  if (a.error) return res.status(400).json(a);
  db.transaction(() => {
    if (a.isDefault) db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(req.customer.id);
    db.prepare(
      `UPDATE customer_addresses SET label = ?, address = ?, location_lat = ?, location_lng = ?,
         is_default = CASE WHEN ? = 1 THEN 1 ELSE is_default END
       WHERE id = ?`
    ).run(a.label, a.address, a.lat, a.lng, a.isDefault, existing.id);
  })();
  res.json({ ok: true, addresses: listAddresses(req.customer.id) });
}));

router.delete('/addresses/:id', asyncRoute((req, res) => {
  const existing = getOwnAddress(req);
  if (!existing) return res.status(404).json({ error: 'Manzil topilmadi' });
  db.transaction(() => {
    db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(existing.id);
    if (existing.is_default) {
      // Asosiy manzil o'chirilsa — eng yangisi asosiy bo'ladi.
      db.prepare(
        `UPDATE customer_addresses SET is_default = 1 WHERE id =
           (SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id DESC LIMIT 1)`
      ).run(req.customer.id);
    }
  })();
  res.json({ ok: true, addresses: listAddresses(req.customer.id) });
}));

// ---------- Buyurtmalar tarixi ----------

// Mijozga ko'rinadigan holat. `completed` = oshxonada tayyor (CLAUDE.md),
// yetkazilgani esa `delivered_at`dan bilinadi.
function orderStage(o) {
  if (o.status === 'cancelled') return { key: 'cancelled', label: 'Bekor qilindi' };
  if (o.fulfillment === 'delivery' && o.delivered_at) return { key: 'done', label: 'Yetkazildi' };
  if (o.status === 'completed') {
    return o.fulfillment === 'delivery'
      ? { key: 'onway', label: "Tayyor, yo'lda" }
      : { key: 'done', label: 'Tayyor — olib ketishingiz mumkin' };
  }
  if (o.status === 'confirmed') return { key: 'cooking', label: 'Tayyorlanmoqda' };
  return { key: 'new', label: 'Qabul qilindi' };
}

router.get('/orders', asyncRoute((req, res) => {
  const orders = db.prepare(
    `SELECT id, fulfillment, address, note, total_amount, status, delivered_at, delivery_fee, created_at
     FROM customer_orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50`
  ).all(req.customer.id);
  const itemsStmt = db.prepare(
    `SELECT menu_item_id, name_snapshot AS name, unit_price, quantity, subtotal
     FROM customer_order_items WHERE customer_order_id = ? ORDER BY id`
  );
  res.json({
    orders: orders.map((o) => {
      const stage = orderStage(o);
      return { ...o, stage: stage.key, stage_label: stage.label, items: itemsStmt.all(o.id) };
    }),
  });
}));

// ---------- Bronlar ----------

function todayTashkent() {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function canCancelReservation(r) {
  return (r.status === 'new' || r.status === 'confirmed') && r.res_date >= todayTashkent();
}

router.get('/reservations', asyncRoute((req, res) => {
  const rows = db.prepare(
    `SELECT id, full_name, phone, party_size, res_date, res_time, note, status, created_at
     FROM reservations WHERE customer_id = ? ORDER BY res_date DESC, res_time DESC LIMIT 50`
  ).all(req.customer.id);
  res.json({ reservations: rows.map((r) => ({ ...r, can_cancel: canCancelReservation(r) })) });
}));

router.post('/reservations/:id/cancel', asyncRoute((req, res) => {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ? AND customer_id = ?')
    .get(Number(req.params.id), req.customer.id);
  if (!r) return res.status(404).json({ error: 'Bron topilmadi' });
  if (!canCancelReservation(r)) return res.status(400).json({ error: "Bu bronni endi bekor qilib bo'lmaydi" });
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(r.id);
  res.json({ ok: true });
}));

module.exports = router;
