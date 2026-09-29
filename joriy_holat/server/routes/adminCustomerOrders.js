const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');
const inventory = require('../services/inventory');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  const orders = db.prepare('SELECT * FROM customer_orders ORDER BY id DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM customer_order_items WHERE customer_order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
}));

// Ombordan (suv/salfetka va h.k.) sarflangan miqdorni qaytaradi/qayta ayiradi —
// buyurtma qatorlariga bog'langan har bir ombor mahsuloti uchun.
//
// 2026-09-09'da tuzatildi (avval ikkita real bug bor edi):
//  1) Ombor faqat existing.status !== 'cancelled' shartida qaytarilardi — bu
//     DELETE handleridagi (pastda) 'completed' istisnosiga mos kelmasdi, shu
//     sabab allaqachon 'completed' (kuryer yetkazgan/tayyorlangan) buyurtma
//     bekor qilinganda ombor NOTO'G'RI qaytarilardi (real qoldiqdan ko'proq
//     ko'rsatilib, keyinchalik ortiqcha sotish xavfini keltirib chiqarardi).
//  2) Bekor qilingan buyurtma qaytadan faollashtirilganda (masalan xato bosib
//     bekor qilingan buyurtmani "tasdiqlash"ga qaytarish) ombor UMUMAN qayta
//     yechilmasdi — endi consumeStockForCustomerOrder() shu holatni qamrab
//     oladi (yetarli qoldiq bo'lmasa InventoryError otadi, butun status
//     o'zgarishi bekor qilinadi — xuddi yangi buyurtma yaratishdagi kabi).
function returnStockForCustomerOrder(orderId) {
  const items = db
    .prepare(
      `SELECT coi.id AS customer_order_item_id, coi.quantity, m.inventory_item_id
       FROM customer_order_items coi
       JOIN menu_items m ON m.id = coi.menu_item_id
       WHERE coi.customer_order_id = ? AND m.inventory_item_id IS NOT NULL`
    )
    .all(orderId);
  for (const it of items) {
    inventory.release(it.inventory_item_id, it.quantity, { customerOrderItemId: it.customer_order_item_id });
  }
}

function consumeStockForCustomerOrder(orderId) {
  const items = db
    .prepare(
      `SELECT coi.id AS customer_order_item_id, coi.quantity, m.inventory_item_id, m.name AS product_name
       FROM customer_order_items coi
       JOIN menu_items m ON m.id = coi.menu_item_id
       WHERE coi.customer_order_id = ? AND m.inventory_item_id IS NOT NULL`
    )
    .all(orderId);
  for (const it of items) {
    inventory.consume(it.inventory_item_id, it.quantity, {
      customerOrderItemId: it.customer_order_item_id,
      productName: it.product_name,
    });
  }
}

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const status = req.body?.status;
  if (!['new', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: "Holatni to'g'ri tanlang" });
  }
  const run = db.transaction(() => {
    db.prepare('UPDATE customer_orders SET status = ? WHERE id = ?').run(status, req.params.id);
    // 'completed' bo'lgan buyurtma (DELETE handleridagi bilan bir xil qoida —
    // taom allaqachon tayyorlangan/sarflangan deb hisoblanadi) bekor qilinsa
    // ombor QAYTARILMAYDI. Faqat hali 'completed'ga yetmagan ('new'/'confirmed')
    // buyurtma bekor qilinganda qaytariladi.
    if (status === 'cancelled' && existing.status !== 'cancelled' && existing.status !== 'completed') {
      returnStockForCustomerOrder(req.params.id);
    } else if (status !== 'cancelled' && existing.status === 'cancelled') {
      // Bekor qilingan buyurtma qayta faollashtirilmoqda — avval qaytarilgan
      // ombor endi qayta sarflanadi (yetarli qoldiq bo'lmasa InventoryError
      // butun tranzaksiyani bekor qiladi, status ham o'zgarmaydi).
      consumeStockForCustomerOrder(req.params.id);
    }
  });
  run();
  res.json(db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const run = db.transaction(() => {
    // Hali bekor qilinmagan/hisoblanmagan (tugallanmagan) buyurtma to'g'ridan-to'g'ri
    // o'chirilsa ham, sarflangan ombor qoldig'i abadiy yo'qolib qolmasin uchun
    // avval qaytaramiz (items o'chirilishidan OLDIN — join shunga tayanadi).
    if (existing.status !== 'cancelled' && existing.status !== 'completed') {
      returnStockForCustomerOrder(req.params.id);
    }
    db.prepare('DELETE FROM customer_order_items WHERE customer_order_id = ?').run(req.params.id);
    db.prepare('DELETE FROM customer_orders WHERE id = ?').run(req.params.id);
  });
  run();
  res.json({ ok: true });
}));

module.exports = router;
