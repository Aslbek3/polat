// SQLite drayveri tanlash qatlami (2026-09-10).
//
// NEGA KERAK: `better-sqlite3` — native modul, u har bir Node versiyasi uchun
// alohida kompilyatsiya qilingan binar talab qiladi. Yangi Node (v24+) chiqqanda
// prebuild hali mavjud bo'lmaydi va `npm install` manbadan qurishga urinadi —
// bu Windows'da Visual Studio Build Tools, Linux'da build-essential talab qiladi.
// Natijada loyihani yangi mashinada ochib TEST YOZIB BO'LMAY qolardi.
//
// Node 22.5+ o'zida `node:sqlite` (DatabaseSync) modulini olib keldi — API'si
// `better-sqlite3` bilan deyarli bir xil (sinxron, `prepare/get/all/run/exec`).
// Shu sabab: PRODUCTION hamon `better-sqlite3`da qoladi (u tezroq va sinovdan
// o'tgan), lekin u yuklanmasa avtomatik ravishda `node:sqlite`ga tushamiz.
// Testlar (`npm test`) ATAYLAB har doim `node:sqlite`da ishlaydi
// (`POLAT_SQLITE_DRIVER=node`) — shunda testlar hech qanday native buildsiz,
// har qanday mashinada ishga tushadi.
//
// MUHIM: bu qatlam better-sqlite3'ning FAQAT shu loyiha ishlatadigan qismini
// taqlid qiladi (prepare/exec/pragma/transaction). To'liq mos kelish maqsad emas.

const NODE_DRIVER = 'node';
const BETTER_DRIVER = 'better-sqlite3';

// better-sqlite3'da `db.transaction(fn)` ichma-ich chaqirilsa SAVEPOINT
// ishlatadi (ichkarisi alohida qaytarilishi mumkin). `services/orders.js`
// aynan shunga tayanadi — `addItemToTable()` tranzaksiyasi ichida
// `inventory.consume()` o'zining tranzaksiyasini ochadi. Shu sabab bu yerda
// ham chuqurlikni sanab, ichkarilariga SAVEPOINT beramiz.
function wrapNodeSqlite(DatabaseSync, filename) {
  const raw = new DatabaseSync(filename);
  let depth = 0;
  let savepointSeq = 0;

  function pragma(source) {
    // better-sqlite3: `db.pragma('foreign_key_check')` qatorlar massivini,
    // `db.pragma('foreign_keys = ON')` esa bo'sh massiv qaytaradi. Ikkalasini
    // bitta yo'l bilan qoplaymiz: avval natijali so'rov sifatida urinib
    // ko'ramiz, natija bermasa oddiy exec sifatida bajaramiz.
    try {
      return raw.prepare(`PRAGMA ${source}`).all();
    } catch (err) {
      raw.exec(`PRAGMA ${source}`);
      return [];
    }
  }

  function transaction(fn) {
    return function runInTransaction(...args) {
      const isOuter = depth === 0;
      const savepoint = isOuter ? null : `sp_${++savepointSeq}`;
      raw.exec(isOuter ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      depth += 1;
      try {
        const result = fn.apply(this, args);
        raw.exec(isOuter ? 'COMMIT' : `RELEASE ${savepoint}`);
        depth -= 1;
        return result;
      } catch (err) {
        // Rollback'ning o'zi ham otishi mumkin (masalan ulanish yopilgan
        // bo'lsa) — asl xatoni yo'qotmaslik uchun uni yutamiz.
        try {
          raw.exec(isOuter ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        } catch (rollbackErr) { /* asl xato muhimroq */ }
        depth -= 1;
        throw err;
      }
    };
  }

  return {
    driver: NODE_DRIVER,
    prepare: (sql) => raw.prepare(sql),
    exec: (sql) => raw.exec(sql),
    close: () => raw.close(),
    pragma,
    transaction,
  };
}

// Qaysi drayver ishlatilishini aniqlaydi. `POLAT_SQLITE_DRIVER=node` bo'lsa
// majburan `node:sqlite` (testlar shuni ishlatadi), aks holda avval
// `better-sqlite3`, u yuklanmasa ogohlantirish bilan `node:sqlite`.
function openDatabase(filename) {
  const forced = process.env.POLAT_SQLITE_DRIVER;

  if (forced !== NODE_DRIVER) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(filename);
      db.driver = BETTER_DRIVER;
      return db;
    } catch (err) {
      if (forced === BETTER_DRIVER) throw err; // majburan so'ralgan — yashirmaymiz
      console.warn(
        `[polat] better-sqlite3 yuklanmadi (${err.code || err.message}) — ` +
        "o'rniga o'rnatilgan node:sqlite ishlatilmoqda. " +
        'Production uchun better-sqlite3 tavsiya etiladi.'
      );
    }
  }

  const { DatabaseSync } = require('node:sqlite');
  return wrapNodeSqlite(DatabaseSync, filename);
}

module.exports = { openDatabase, NODE_DRIVER, BETTER_DRIVER };
