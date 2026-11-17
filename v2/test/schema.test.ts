// Baza darajasidagi biznes qoidalari — kod xato qilsa ham baza noto'g'ri
// ma'lumotni qabul qilmasligini tasdiqlaydi.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from './helpers.js';

const db = testDb();
afterAll(() => db.close());

async function seed() {
  const user = (await db.query<{ id: number }>(
    "INSERT INTO users (username, password_hash, password_salt, role) VALUES ('ali', 'h', 's', 'waiter') RETURNING id",
  )).rows[0]!;
  const table = (await db.query<{ id: number }>("INSERT INTO tables (name) VALUES ('Stol 1') RETURNING id")).rows[0]!;
  const cat = (await db.query<{ id: number }>("INSERT INTO menu_categories (name) VALUES ('Taomlar') RETURNING id")).rows[0]!;
  const item = (await db.query<{ id: number }>(
    'INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, $3) RETURNING id',
    [cat.id, 'Osh', 35000],
  )).rows[0]!;
  return { userId: user.id, tableId: table.id, catId: cat.id, itemId: item.id };
}

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

describe('sxema cheklovlari', () => {
  beforeEach(() => truncateAll(db));

  it("BIGINT ustunlar JS soni bo'lib qaytadi", async () => {
    const { itemId } = await seed();
    const { rows } = await db.query<{ id: unknown; price: unknown }>('SELECT id, price FROM menu_items WHERE id = $1', [itemId]);
    expect(rows[0]).toEqual({ id: itemId, price: 35000 });
  });

  it("noma'lum rolni qabul qilmaydi", async () => {
    expect(await code(db.query(
      "INSERT INTO users (username, password_hash, password_salt, role) VALUES ('x', 'h', 's', 'boss')",
    ))).toBe('23514');
  });

  it('bir stolda ikkita ochiq buyurtma bo\'lmaydi', async () => {
    const { userId, tableId } = await seed();
    await db.query('INSERT INTO orders (table_id, opened_by) VALUES ($1, $2)', [tableId, userId]);
    expect(await code(db.query('INSERT INTO orders (table_id, opened_by) VALUES ($1, $2)', [tableId, userId]))).toBe('23505');
  });

  it('bir kassirda ikkita ochiq smena bo\'lmaydi', async () => {
    const { userId } = await seed();
    await db.query('INSERT INTO cash_shifts (opened_by) VALUES ($1)', [userId]);
    expect(await code(db.query('INSERT INTO cash_shifts (opened_by) VALUES ($1)', [userId]))).toBe('23505');
  });

  it("yopilgan smenada closed_at bo'lishi shart", async () => {
    const { userId } = await seed();
    expect(await code(db.query("INSERT INTO cash_shifts (opened_by, status) VALUES ($1, 'closed')", [userId]))).toBe('23514');
  });

  it("ombor qoldig'i manfiy bo'lolmaydi", async () => {
    const { rows } = await db.query<{ id: number }>("INSERT INTO inventory_items (name, quantity) VALUES ('Pepsi', 2) RETURNING id");
    expect(await code(db.query('UPDATE inventory_items SET quantity = quantity - 3 WHERE id = $1', [rows[0]!.id]))).toBe('23514');
  });

  it("manfiy narx va nol miqdor qabul qilinmaydi", async () => {
    const { catId, userId, tableId, itemId } = await seed();
    expect(await code(db.query("INSERT INTO menu_items (category_id, name, price) VALUES ($1, 'X', -1)", [catId]))).toBe('23514');
    const order = (await db.query<{ id: number }>('INSERT INTO orders (table_id, opened_by) VALUES ($1, $2) RETURNING id', [tableId, userId])).rows[0]!;
    expect(await code(db.query(
      "INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, quantity, subtotal, added_by) VALUES ($1, $2, 'Osh', 35000, 0, 0, $3)",
      [order.id, itemId, userId],
    ))).toBe('23514');
  });

  it("noma'lum to'lov turini qabul qilmaydi", async () => {
    const { userId, tableId } = await seed();
    expect(await code(db.query(
      "INSERT INTO orders (table_id, opened_by, status, payment_method) VALUES ($1, $2, 'closed', 'crypto')",
      [tableId, userId],
    ))).toBe('23514');
  });

  it('oshxona cheki yo stolga, yo onlayn buyurtmaga tegishli bo\'ladi', async () => {
    expect(await code(db.query("INSERT INTO kitchen_tickets (table_name) VALUES ('?')"))).toBe('23514');
  });

  it("mijoz telefoni +998XXXXXXXXX formatida bo'lishi shart", async () => {
    expect(await code(db.query("INSERT INTO customers (phone) VALUES ('901234567')"))).toBe('23514');
    expect(await code(db.query("INSERT INTO customers (phone) VALUES ('+998901234567')"))).toBe('ok');
  });

  it("menyu taomi mavjud bo'lmagan ombor mahsulotiga bog'lanmaydi", async () => {
    const { itemId } = await seed();
    expect(await code(db.query('UPDATE menu_items SET inventory_item_id = 999 WHERE id = $1', [itemId]))).toBe('23503');
  });
});

describe('withTransaction', () => {
  beforeEach(() => truncateAll(db));

  it('xato bo\'lsa hammasini bekor qiladi', async () => {
    await expect(db.withTransaction(async (tx) => {
      await tx.query("INSERT INTO settings (key, value) VALUES ('a', '1')");
      throw new Error('portladi');
    })).rejects.toThrow('portladi');
    const { rows } = await db.query("SELECT * FROM settings WHERE key = 'a'");
    expect(rows).toHaveLength(0);
  });

  it('muvaffaqiyatli bo\'lsa saqlaydi', async () => {
    await db.withTransaction(async (tx) => {
      await tx.query("INSERT INTO settings (key, value) VALUES ('b', '2')");
    });
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'b'");
    expect(rows[0]).toEqual({ value: '2' });
  });
});
