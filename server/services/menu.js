// Menyu (kategoriyalar + taomlar + "turlar") — admin panelining ma'lumot mantig'i.
//
// NEGA BU FAYL BOR: `routes/adminMenu.js` loyihadagi eng katta route fayli edi
// (~440 qator) va bazaga BEVOSITA `db.prepare()` bilan murojaat qilardi — ya'ni
// loyihaning "ma'lumot kirishi faqat `services/` ichida" qoidasi aynan eng ko'p
// qoida to'plangan joyda buzilgan edi. Bu yerda uchta bir-biriga bog'liq qoida
// to'plami yashaydi va ularning har biri ilgari HTTP handler ichiga aralashib
// ketgan edi:
//
//   1. OMBOR BILAN BOG'LANISH — bog'langan taomning narxi/tan narxi/mavjudligi
//      qo'lda kiritilmaydi, YAGONA manba `inventory_items` (bu qoida
//      `services/inventory.js` dagi syncMenuPricing()/syncMenuAvailability()
//      bilan juft ishlaydi — ikkalasi bir xil xulq berishi shart).
//   2. "TURLAR" (variantlar, `parent_item_id`) — faqat BITTA daraja chuqurlik,
//      variant har doim ota taom bilan bir xil kategoriyada.
//   3. SOFT-DELETE — buyurtma tarixiga FK bilan bog'langan qatorlar hech qachon
//      haqiqatda o'chirilmaydi, faqat `is_active = 0` bo'ladi.
//
// Bu SOF refaktor (2026-09-10): 2026-09-10 auditida tuzatilgan to'rtta xato
// (PUT'da bo'sh nom, variantning kategoriyasi, ota ko'chganda turlarning
// ko'chishi, hard-delete'da yetim qolgan turlar) mantig'i AYNAN saqlangan,
// status kodlari/xato xabarlari/JSON javob shakli o'zgarmagan. Shu sababdan
// matn/son tekshiruvlari ham avvalgi ko'rinishida qoldirildi: `validation.js`
// dagi `parseText()`/`parseAmount()` qo'shimcha chegaralar (uzunlik, yuqori
// summa) kiritgan bo'lardi — bu foydali, lekin refaktor emas, alohida
// o'zgarish bo'ladi.
//
// RASM FAYLLARI bu servisda EMAS: multer (yuklash) va diskdan o'chirish HTTP/
// fayl qatlamiga tegishli va `routes/adminMenu.js` da qoladi. Servis faqat
// "qaysi eski rasm endi kerak emas" degan ma'lumotni (`removedImageUrl`)
// qaytaradi, tozalashni route bajaradi.

const { db, nowIso } = require('../db');
const inventory = require('./inventory');

class MenuError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------------- Kategoriyalar ----------------

function getCategoryRow(id) {
  return db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(id);
}

function requireCategory(id) {
  const row = getCategoryRow(id);
  if (!row) throw new MenuError('Kategoriya topilmadi', 404);
  return row;
}

// Standart holatda faqat faol (o'chirilmagan) kategoriyalar ko'rsatiladi.
// `includeInactive` bilan — o'chirilganlar ham (2026-09-09'da qo'shildi:
// ilgari soft-delete qilingan kategoriyani admin panelidan qayta tiklashning
// HECH QANDAY yo'li yo'q edi — GET har doim ularni yashirardi, PUT esa
// is_active qayta yoqishni qabul qilardi, ya'ni yo'l "o'lik" edi).
function listCategories({ includeInactive = false } = {}) {
  return includeInactive
    ? db.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id').all()
    : db.prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id').all();
}

function createCategory(body) {
  const { name, sort_order: sortOrder, require_inventory_link: requireInventoryLink } = body || {};
  if (!name || !String(name).trim()) throw new MenuError('Nom kiritilishi shart');
  const ts = nowIso();
  const info = db
    .prepare(
      'INSERT INTO menu_categories (name, sort_order, is_active, require_inventory_link, created_at) VALUES (?, ?, 1, ?, ?)'
    )
    .run(String(name).trim(), Number(sortOrder) || 0, requireInventoryLink ? 1 : 0, ts);
  return getCategoryRow(info.lastInsertRowid);
}

function updateCategory(id, body) {
  const existing = requireCategory(id);
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name;
  // NEGA (2026-09-10 auditi): ilgari PUT nomni UMUMAN tekshirmasdi — POST bo'sh
  // nomni 400 bilan rad etardi, lekin tahrirlashda String('   ').trim() = ''
  // bemalol saqlanardi. Natijada menyuda NOMSIZ bo'lim paydo bo'lardi (mijoz
  // menyusida bo'sh tugma), va uni faqat bazadan qo'lda tuzatish mumkin edi.
  // Tekshiruv POST'dagi bilan bir xil bo'lishi shart.
  if (!name) throw new MenuError('Nom kiritilishi shart');
  const sortOrder = body?.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;
  const isActive = body?.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
  const requireInventoryLink = body?.require_inventory_link !== undefined
    ? (body.require_inventory_link ? 1 : 0)
    : existing.require_inventory_link;
  db.prepare(
    'UPDATE menu_categories SET name = ?, sort_order = ?, is_active = ?, require_inventory_link = ? WHERE id = ?'
  ).run(name, sortOrder, isActive, requireInventoryLink, id);
  return getCategoryRow(id);
}

// Kategoriyaga (faol yoki allaqachon o'chirilgan) hech qanday taom bog'liq
// bo'lmasa — demak buyurtma tarixiga ham aloqasi yo'q — bazadan butunlay
// o'chiriladi. Aks holda (taomlar hali bor, ular esa buyurtma tarixi tufayli
// o'chirilmagan bo'lishi mumkin) faqat is_active=0 qilinadi — bari bir
// listCategories() bunday yozuvni endi qaytarmaydi (ro'yxatdan g'oyib bo'ladi),
// lekin FK/tarix buzilmaydi.
function deleteCategory(id) {
  requireCategory(id);
  const hasItems = db.prepare('SELECT 1 FROM menu_items WHERE category_id = ? LIMIT 1').get(id);
  if (!hasItems) {
    db.prepare('DELETE FROM menu_categories WHERE id = ?').run(id);
    return { ok: true };
  }
  db.prepare('UPDATE menu_categories SET is_active = 0 WHERE id = ?').run(id);
  return { ok: true };
}

// ---------------- Taomlar ----------------

// Ombor bilan bog'langan taomlar uchun qoldiq/birlik ma'lumotini ham (LEFT JOIN)
// qo'shib qaytaramiz — admin panelida alohida so'rovsiz ko'rsatish uchun
// (public/admin/menu.js). Bog'lanmagan taomlarda bu ustunlar NULL bo'ladi.
const ITEMS_SELECT = `
  SELECT m.*, inv.name AS inventory_name, inv.unit AS inventory_unit, inv.quantity AS inventory_quantity, inv.volume AS inventory_volume
  FROM menu_items m
  LEFT JOIN inventory_items inv ON inv.id = m.inventory_item_id
`;

function getItemView(id) {
  return db.prepare(`${ITEMS_SELECT} WHERE m.id = ?`).get(id);
}

function getItemRow(id) {
  return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
}

function requireItem(id) {
  const row = getItemRow(id);
  if (!row) throw new MenuError('Taom topilmadi', 404);
  return row;
}

// `includeInactive` — kategoriyalar bilan bir xil sabab (soft-delete'ni admin
// panelidan ko'rish/tiklash imkonini berish, 2026-09-09).
function listItems({ categoryId = null, includeInactive = false } = {}) {
  const catId = categoryId ? Number(categoryId) : null;
  const clauses = [];
  const params = [];
  if (catId) { clauses.push('m.category_id = ?'); params.push(catId); }
  if (!includeInactive) clauses.push('m.is_active = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`${ITEMS_SELECT} ${where} ORDER BY m.category_id, m.sort_order, m.id`).all(...params);
}

// Bog'langan taomning narxi/mavjudligi ombordan olinishi kerak bo'lgani uchun
// har doim FRESH (joriy) qatorni qaytaradi — yaratishda yangi bog'langanda ham,
// tahrirlashda avvalgi bog'lanish saqlanganda ham bir xil manba ishlatilishi
// uchun. FAQAT faol (is_active=1) ombor mahsulotlari qaytariladi (2026-09-09'da
// tuzatildi — ilgari filtr yo'q edi, shu sabab to'g'ridan-to'g'ri API
// chaqiruvi bilan taomni o'chirilgan/soft-delete qilingan ombor mahsulotiga
// bog'lash mumkin edi, natijada taom doimiy "tugadi" holatida qolib, buni
// admin UI orqali tuzatib bo'lmasdi, chunki o'chirilgan mahsulot endi
// bog'lash uchun tanlanmaydi).
function getInventoryRow(id) {
  return db
    .prepare('SELECT id, quantity, is_active, sale_price, cost_price FROM inventory_items WHERE id = ? AND is_active = 1')
    .get(id);
}

function resolveInventoryItemId(raw) {
  if (raw === undefined) return undefined; // o'zgartirilmagan
  if (raw === null || raw === '') return null; // uzish
  const id = Number(raw);
  if (!Number.isFinite(id)) throw new MenuError("Ombor mahsuloti noto'g'ri", 400);
  const row = getInventoryRow(id);
  if (!row) throw new MenuError('Ombor mahsuloti topilmadi', 404);
  return row;
}

// ---------------- "Turi" (variant) — parent_item_id (2026-09-09) ----------------
// Admin menyuda taom qo'shganda/tahrirlaganda "+ Turi qo'shish" tugmasi bilan
// shu taomga o'xshash turlar (masalan "Osh" -> "Qovurma osh", "To'y oshi")
// qo'shilishi mumkin. Faqat BITTA daraja chuqurlikka ruxsat beriladi — variant
// o'zi yana ota bo'la olmaydi (frontend ham buni taqdim qilmaydi, lekin server
// to'g'ridan-to'g'ri API chaqiruvi bilan chetlab o'tishning oldini oladi).
// Variant har doim ota taom bilan bir xil kategoriyada bo'ladi — so'rovda
// yuborilgan category_id shu holatda e'tiborga olinmaydi, ota taomnikiga
// almashtiriladi (nested render mantiqi — public/admin/menu.js — shuni talab
// qiladi: variant faqat o'z ota taomi ostida, o'sha kategoriya ichida chiqadi).
function resolveParentItemId(raw, selfId) {
  if (raw === undefined) return undefined; // o'zgartirilmagan
  if (raw === null || raw === '') return null; // ota bilan bog'lanish uzilyapti (oddiy taomga aylanadi)
  const id = Number(raw);
  if (!Number.isFinite(id)) throw new MenuError("Ota taom noto'g'ri", 400);
  if (selfId !== undefined && id === Number(selfId)) {
    throw new MenuError("Taom o'zini o'ziga tur qilib bog'lay olmaydi", 400);
  }
  const parent = db
    .prepare('SELECT id, category_id, parent_item_id, is_active FROM menu_items WHERE id = ?')
    .get(id);
  if (!parent || !parent.is_active) throw new MenuError('Ota taom topilmadi', 404);
  if (parent.parent_item_id) {
    throw new MenuError("Bu taom o'zi biror taomning turi — unga yana tur qo'shib bo'lmaydi", 400);
  }
  return parent;
}

// Taom o'zi (kamida bitta faol) turga ega bo'lsa — uni boshqa taomning turiga
// aylantirib bo'lmaydi (ikki darajali ichma-ichlikning oldini olish uchun).
function hasActiveChildren(id) {
  return !!db.prepare('SELECT 1 FROM menu_items WHERE parent_item_id = ? AND is_active = 1 LIMIT 1').get(id);
}

// Tan narx (cost_price) — IXTIYORIY: admin har doim ham bilmasligi mumkin, shu sabab
// bo'sh/berilmagan qoldirilsa NULL bo'lib qoladi (narx kabi majburiy emas). Ombor bilan
// bog'langan taomda esa (narx kabi) yagona manba — qo'lda yuborilgan qiymatga ishonilmaydi,
// har doim inventory_items.cost_price'dan olinadi (chaqiruvchi joyda hal qilinadi).
function parseOptionalCostPrice(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) throw new MenuError("Tan narx noto'g'ri", 400);
  return n;
}

// image_url — IXTIYORIY (majburiy emas): bo'sh/berilmagan qoldirilsa NULL
// bo'lib qoladi, frontend rasmsiz (faqat nom/narx) ko'rsatadi.
function createItem(body) {
  const {
    category_id, name, price, cost_price, sort_order, description, image_url,
    volume, inventory_item_id, parent_item_id,
  } = body || {};
  const priceNum = Number(price);
  if (!name || !String(name).trim()) throw new MenuError('Nom kiritilishi shart');
  if (!Number.isFinite(priceNum) || priceNum < 0) throw new MenuError("Narx noto'g'ri");
  // Tur (variant) qo'shilayotgan bo'lsa — kategoriya ota taomnikidan olinadi
  // (yuborilgan category_id e'tiborga olinmaydi, izoh yuqorida).
  const parentRow = resolveParentItemId(parent_item_id, undefined);
  const categoryId = parentRow ? parentRow.category_id : Number(category_id);
  if (!Number.isFinite(categoryId)) throw new MenuError('Kategoriya tanlanmagan');
  const category = db
    .prepare('SELECT id, require_inventory_link FROM menu_categories WHERE id = ?')
    .get(categoryId);
  if (!category) throw new MenuError('Kategoriya topilmadi', 404);
  // Ombor bilan bog'langan bo'lsa — narx VA mavjudlik ombordan olinadi (mijoz/admin
  // yuborgan narxga ISHONILMAYDI — yagona manba ombordagi sotuv narxi), aks holda
  // odatdagidek qo'lda kiritilgan narx va doim mavjud (1) bilan boshlanadi.
  const invRow = resolveInventoryItemId(inventory_item_id);
  // require_inventory_link=1 bo'lgan bo'limda ombor bilan bog'lanmagan taom
  // yaratib bo'lmaydi — ilgari bu qoida faqat frontendda (public/admin/menu.js)
  // tekshirilardi, to'g'ridan-to'g'ri API chaqiruvi bilan chetlab o'tish mumkin
  // edi, natijada yaratilgan taom waiterMenu.js/publicMenu.js filtridan o'tolmay
  // hech qayerda ko'rinmaydigan "arvoh" yozuv bo'lib qolardi (2026-09-09'da
  // serverga ham qo'shildi).
  if (category.require_inventory_link && !invRow) {
    throw new MenuError("Bu bo'lim faqat ombor bilan bog'langan taomlarni qabul qiladi");
  }
  // Ombor bilan bog'langan taomning narxi ombordan olinadi — lekin o'sha narx 0
  // bo'lsa taom mijozga TEKINGA tushib qoladi (2026-09-10 auditi, batafsil izoh
  // server/services/inventory.js'dagi MENU_PRICE_ERROR yonida). Shu sabab
  // bunday bog'lanish yaratilmaydi: avval ombor mahsulotiga sotuv narxi
  // kiritilishi kerak.
  if (invRow && !inventory.hasMenuPrice(invRow)) {
    throw new MenuError(inventory.MENU_PRICE_ERROR);
  }
  const finalPrice = invRow ? invRow.sale_price : Math.round(priceNum);
  // Tan narx ham xuddi shunday — bog'langan bo'lsa ombordan, aks holda admin qo'lda
  // kiritgan (ixtiyoriy, bo'sh qoldirilsa NULL) qiymat.
  const finalCostPrice = invRow ? invRow.cost_price : parseOptionalCostPrice(cost_price);
  const isAvailable = invRow ? inventory.computeAvailability(invRow) : 1;
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO menu_items (category_id, name, price, cost_price, is_available, is_active, sort_order, description, image_url, volume, inventory_item_id, parent_item_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      categoryId, String(name).trim(), finalPrice, finalCostPrice, isAvailable, Number(sort_order) || 0,
      description ? String(description).trim() : null,
      image_url ? String(image_url).trim() : null,
      volume ? String(volume).trim() : null,
      invRow ? invRow.id : null,
      parentRow ? parentRow.id : null,
      ts, ts
    );
  return getItemView(info.lastInsertRowid);
}

// Qaytaradi: `{ item, removedImageUrl }`. `removedImageUrl` — endi
// ishlatilmaydigan eski rasm (yo'q bo'lsa null); uni diskdan tozalash route
// qatlamining ishi (fayl tizimi bu servisga tegishli emas, fayl boshidagi
// izohga qarang).
function updateItem(id, body) {
  const existing = requireItem(id);
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name;
  // NEGA (2026-09-10 auditi): updateCategory() bilan bir xil sabab — bo'sh
  // nom tahrirlashda o'tib ketardi va nomsiz taom chekda ham bo'sh
  // name_snapshot bo'lib muhrlanib qolardi.
  if (!name) throw new MenuError('Nom kiritilishi shart');
  const priceRaw = body?.price !== undefined ? Math.round(Number(body.price)) : existing.price;
  // Ota taom (parent_item_id) o'zgartirilayotgan bo'lsa — bog'lanish qoidalari
  // createItem()'dagi bilan bir xil (resolveParentItemId), qo'shimcha: taomning
  // o'zi hozir kamida bitta faol turga ega bo'lsa, uni boshqa taomning turiga
  // aylantirib bo'lmaydi (ikki darajali ichma-ichlik oldini olinadi).
  const parentRowChange = resolveParentItemId(body?.parent_item_id, id);
  if (parentRowChange && hasActiveChildren(existing.id)) {
    throw new MenuError("Bu taomning o'zi turlarga ega — uni boshqa taomning turiga aylantirib bo'lmaydi");
  }
  const parentItemId = parentRowChange === undefined
    ? existing.parent_item_id
    : (parentRowChange ? parentRowChange.id : null);
  // Tur (variant) bo'lsa — kategoriya HAR DOIM ota taomnikidan olinadi,
  // so'rovdagi category_id e'tiborsiz qoldiriladi.
  // NEGA (2026-09-10 auditi): ilgari bu tenglashtirish faqat AYNI so'rovda
  // parent_item_id kelganda ishlardi. Ya'ni mavjud variantga {category_id: X}
  // yuborilsa, u otasidan boshqa bo'limga ko'chib ketardi — kod izohi
  // ("variant har doim ota bilan bir xil kategoriyada", resolveParentItemId)
  // shu yo'lda buzilardi. Endi yakuniy parentItemId mavjud bo'lsa, kategoriya
  // otadan o'qiladi (parentRowChange bo'lmasa — bazadan alohida so'rov bilan).
  const requestedCategoryId = body?.category_id !== undefined ? Number(body.category_id) : existing.category_id;
  let categoryId = requestedCategoryId;
  if (parentItemId) {
    const parentRow = parentRowChange
      || db.prepare('SELECT id, category_id FROM menu_items WHERE id = ?').get(parentItemId);
    if (!parentRow) throw new MenuError('Ota taom topilmadi', 404);
    categoryId = parentRow.category_id;
  }
  const sortOrder = body?.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;
  const isActive = body?.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
  const description = body?.description !== undefined ? (String(body.description).trim() || null) : existing.description;
  const imageUrl = body?.image_url !== undefined ? (String(body.image_url).trim() || null) : existing.image_url;
  const volume = body?.volume !== undefined ? (String(body.volume).trim() || null) : existing.volume;
  if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new MenuError("Narx noto'g'ri");
  const costPriceRaw = body?.cost_price !== undefined ? parseOptionalCostPrice(body.cost_price) : existing.cost_price;

  const category = db
    .prepare('SELECT id, require_inventory_link FROM menu_categories WHERE id = ?')
    .get(categoryId);
  if (!category) throw new MenuError('Kategoriya topilmadi', 404);

  const invRowChange = resolveInventoryItemId(body?.inventory_item_id);
  const inventoryItemId = invRowChange === undefined
    ? existing.inventory_item_id
    : (invRowChange ? invRowChange.id : null);
  // Taom (yangi yoki avvaldan) omborga bog'langan bo'lsa — har doim JORIY ombor
  // qatorini qayta o'qiymiz (invRowChange faqat SHU so'rovda link o'zgargan
  // bo'lsagina to'ldirilgan bo'ladi — avvalgi bog'lanish saqlanganda ham narx/
  // mavjudlik yangilanib turishi uchun bu yerda alohida so'rov shart).
  const effectiveInvRow = inventoryItemId ? getInventoryRow(inventoryItemId) : null;
  // createItem()'dagi bilan bir xil server-tomon qoida (2026-09-09) —
  // require_inventory_link bo'limida ombor bilan bog'lanmagan taom qoldirib
  // bo'lmaydi. FAQAT bog'lanish yoki bo'lim HAQIQATDA shu so'rovda
  // o'zgartirilganda tekshiriladi (categoryChanged/linkChanged) — aks holda
  // eski (qoida qo'shilishidan oldingi yoki ombor mahsuloti o'chirilib
  // avtomatik "uzilgan", server/services/inventory.js deleteItem()'ga qarang)
  // bog'lanmagan taomni oddiy tahrirlash (masalan nomini o'zgartirish yoki
  // ♻️ Tiklash bilan is_active qaytarish) ham bloklanib qolar edi — bu haqiqiy
  // yangi buzilish emas, faqat mavjud holat.
  const categoryChanged = categoryId !== existing.category_id;
  const linkChanged = body?.inventory_item_id !== undefined;
  if (category.require_inventory_link && !effectiveInvRow && (categoryChanged || linkChanged)) {
    throw new MenuError("Bu bo'lim faqat ombor bilan bog'langan taomlarni qabul qiladi");
  }
  // Sotuv narxi 0 bo'lgan ombor mahsuloti menyu narxini 0 ga tushirmaydi
  // (2026-09-10 auditi — createItem()'dagi bilan bir xil sabab). Bog'lanish
  // AYNAN shu so'rovda o'rnatilayotgan bo'lsa (linkChanged) — rad etiladi;
  // avvaldan mavjud bog'lanishda esa taomning boshqa maydonlarini tahrirlash
  // bloklanmaydi, faqat narx eski (musbat) qiymatida qoldiriladi —
  // services/inventory.js'dagi syncMenuPricing() bilan bir xil xulq.
  if (effectiveInvRow && !inventory.hasMenuPrice(effectiveInvRow) && linkChanged) {
    throw new MenuError(inventory.MENU_PRICE_ERROR);
  }
  const price = effectiveInvRow
    ? (inventory.hasMenuPrice(effectiveInvRow) ? effectiveInvRow.sale_price : existing.price)
    : priceRaw;
  const costPrice = effectiveInvRow ? effectiveInvRow.cost_price : costPriceRaw;
  const isAvailable = effectiveInvRow ? inventory.computeAvailability(effectiveInvRow) : existing.is_available;

  db.prepare(
    'UPDATE menu_items SET name = ?, price = ?, cost_price = ?, category_id = ?, sort_order = ?, is_active = ?, description = ?, image_url = ?, volume = ?, inventory_item_id = ?, parent_item_id = ?, is_available = ?, updated_at = ? WHERE id = ?'
  ).run(name, price, costPrice, categoryId, sortOrder, isActive, description, imageUrl, volume, inventoryItemId, parentItemId, isAvailable, nowIso(), id);
  // Ota taom boshqa bo'limga ko'chirilgan bo'lsa — turlari ham u bilan birga
  // ko'chadi.
  // NEGA (2026-09-10 auditi): ilgari turlar eski category_id da qolib ketardi.
  // Ro'yxat ko'rinishida sezilmasdi (publicMenu/waiterMenu/kassirMenu
  // variantlarni faqat parent_item_id bo'yicha oladi), lekin uchta real
  // oqibati bor edi: (1) require_inventory_link ikki manbadan hisoblanardi —
  // variant YANGI bo'lim bayrog'i bilan filtrlanib mijoz menyusidan jimgina
  // yo'qolardi, PUT bilan tuzatishga urinilsa esa validatsiya ESKI bo'lim
  // qoidasini tekshirib bog'lanmagan holicha saqlashga ruxsat berardi
  // ("arvoh" yozuv abadiy qolardi); (2) listItems({categoryId: <yangi>})
  // variantni qaytarmasdi (endpoint kontrakti buzuq); (3) deleteCategory(<eski>)
  // ko'rinmas variant tufayli hard-delete o'rniga soft-delete qilardi.
  if (categoryChanged && !parentItemId) {
    db.prepare('UPDATE menu_items SET category_id = ?, updated_at = ? WHERE parent_item_id = ?').run(
      categoryId, nowIso(), existing.id
    );
  }
  return {
    item: getItemView(id),
    // Rasm almashtirilgan/olib tashlangan bo'lsa — eski faylni route diskdan
    // tozalaydi (bo'sh joy to'planib qolmasin uchun).
    removedImageUrl: existing.image_url && existing.image_url !== imageUrl ? existing.image_url : null,
  };
}

function setAvailability(id, isAvailableRaw) {
  const existing = requireItem(id);
  if (existing.inventory_item_id) {
    throw new MenuError(
      "Bu taom omborga bog'langan — mavjudligi ombor qoldig'idan avtomatik hisoblanadi (Ombor bo'limidan boshqaring)"
    );
  }
  const isAvailable = isAvailableRaw ? 1 : 0;
  db.prepare('UPDATE menu_items SET is_available = ?, updated_at = ? WHERE id = ?').run(isAvailable, nowIso(), id);
  return getItemRow(id);
}

// Taom hech qanday buyurtma tarixida (ichki afitsiant order_items HAM mijozlar
// customer_order_items) ishlatilmagan bo'lsa — bazadan butunlay o'chiriladi.
// Ishlatilgan bo'lsa (eski chek/hisobotlar shu qatorga FK bilan bog'liq)
// haqiqiy o'chirish mumkin emas — faqat is_active=0, lekin listItems() uni
// baribir ro'yxatda ko'rsatmaydi.
//
// Qaytaradi: `{ removedImageUrl }` — hard-delete bo'lgandagina to'ldiriladi
// (soft-delete'da rasm saqlanib qoladi, chunki taom "♻️ Tiklash" bilan
// qaytarilishi mumkin).
function deleteItem(id) {
  const existing = requireItem(id);
  // Bu taomning (kamida bitta faol) turi bo'lsa — avval o'shalarni o'chirish
  // kerak, aks holda ular "yetim" (mavjud bo'lmagan ota taomga bog'langan)
  // bo'lib qolib, hech qayerda (mijoz/afitsiant menyusida ham) ko'rinmay
  // qoladi (izoh yuqorida, resolveParentItemId/hasActiveChildren).
  if (hasActiveChildren(existing.id)) {
    throw new MenuError("Avval bu taomning turlarini o'chiring");
  }
  const usedInOrders =
    db.prepare('SELECT 1 FROM order_items WHERE menu_item_id = ? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM customer_order_items WHERE menu_item_id = ? LIMIT 1').get(id);
  if (!usedInOrders) {
    // NEGA (2026-09-10 auditi): yuqoridagi hasActiveChildren() faqat FAOL
    // turlarni sanaydi, shu sabab turlari AVVAL soft-delete qilingan ota taom
    // bemalol HARD-delete qilinardi va o'sha turlar mavjud bo'lmagan
    // parent_item_id ga ishora qilib qolardi (parent_item_id FK emas —
    // schema.sql). Admin keyin turni "♻️ Tiklash" bilan qaytarsa, u HECH
    // QANDAY menyuda ko'rinmasdi: publicMenu/waiterMenu/kassirMenu asosiy
    // ro'yxatga faqat parent_item_id IS NULL taomlarni oladi, variants esa
    // endi yo'q ota orqali hech qachon so'ralmaydi. Shu sabab ota o'chishidan
    // OLDIN barcha bolalarning (faol va nofaol) bog'lanishini uzamiz — ular
    // oddiy taomga aylanadi va ko'rinadi.
    db.prepare('UPDATE menu_items SET parent_item_id = NULL, updated_at = ? WHERE parent_item_id = ?').run(
      nowIso(), id
    );
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    return { removedImageUrl: existing.image_url || null };
  }
  db.prepare('UPDATE menu_items SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), id);
  return { removedImageUrl: null };
}

module.exports = {
  MenuError,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  createItem,
  updateItem,
  setAvailability,
  deleteItem,
};
