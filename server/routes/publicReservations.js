// Ochiq (login shart emas) endpoint — landing sahifadagi "Stol bron qilish"
// oynasidan yuboriladi. server/index.js'da bu router auth.requireAuth'dan
// OLDIN ulanadi, shu sabab mehmon hech qanday sessiyasiz murojaat qila oladi.
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.post('/', asyncRoute((req, res) => {
  const { full_name, phone, party_size, res_date, res_time, note } = req.body || {};

  const name = String(full_name || '').trim();
  const phoneNum = String(phone || '').trim();
  const size = Number(party_size);
  const date = String(res_date || '').trim();
  const time = String(res_time || '').trim();
  const noteText = String(note || '').trim();

  if (!name) return res.status(400).json({ error: 'Ismingizni kiriting' });
  if (name.length > 120) return res.status(400).json({ error: 'Ism juda uzun' });
  if (!phoneNum || phoneNum.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: "Telefon raqamini to'g'ri kiriting" });
  }
  if (!Number.isFinite(size) || size <= 0 || size > 50) {
    return res.status(400).json({ error: "Kishilar sonini to'g'ri kiriting" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Sanani to'g'ri tanlang" });
  if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Vaqtni to'g'ri tanlang" });

  const info = db
    .prepare(
      `INSERT INTO reservations (full_name, phone, party_size, res_date, res_time, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
    )
    .run(name, phoneNum, Math.round(size), date, time, noteText || null, nowIso());

  res.json({ ok: true, id: info.lastInsertRowid });
}));

module.exports = router;
