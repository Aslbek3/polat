#!/usr/bin/env node
// Po'lat — oshxona printeri agenti (2026-09-29).
//
// NEGA BU DASTUR BOR
// ──────────────────
// Ofitsiant "Oshxonaga yuborish" bosganda server `kitchen_tickets` navbatiga
// chek yozadi. Ilgari uni oshxonadagi kompyuterdagi BRAUZER (kitchen.html)
// QZ Tray orqali chop etardi. Bu ikki muammo tug'dirardi:
//   1. brauzer doim ochiq turishi va QZ Tray ishlab turishi kerak edi;
//   2. QZ har chop etishda "Allow" oynasini chiqarardi (sertifikat
//      o'rnatilmagan bo'lsa) — oshxonada buni bosadigan odam yo'q.
// Ofitsiant o'z mobil internetida ishlagani uchun uning telefoni printerga
// umuman ula olmaydi ham.
//
// Bu agent o'sha ishni brauzersiz bajaradi: serverdagi navbatni so'rab turadi
// va chekni printerning IP manziliga (ESC/POS, 9100-port) to'g'ridan-to'g'ri
// yuboradi. Restoran ichidagi istalgan doim yoqiq qurilmada ishlaydi
// (kassa kompyuteri, Raspberry Pi, eski Android/Termux).
//
//   Ofitsiant (4G) → VPS → [shu agent] → printer 192.168.1.230:9100
//
// SERVER KODI O'ZGARMAYDI — mavjud API ishlatiladi:
//   POST /api/login                             (sessiya cookie'si)
//   GET  /api/chef/kitchen-tickets/pending      (chop etilmagan cheklar)
//   POST /api/chef/kitchen-tickets/:id/printed  (chop etildi deb belgilash)
//
// ⚠️ MUHIM: agent ishga tushgandan keyin oshxonadagi brauzerda kitchen.html
// sahifasini YOPING (yoki QZ Tray'ni to'xtating). Aks holda ikkalasi bir xil
// chekni chop etib, ikki nusxa chiqishi mumkin.
//
// Ishga tushirish:
//   node print-agent.js            — doimiy ishlaydi (asosiy rejim)
//   node print-agent.js --test     — printerga sinov cheki (serversiz)
//   node print-agent.js --once     — bir marta tekshirib chiqadi (nosozlik qidirish)
//
// Hech qanday tashqi kutubxona kerak emas — faqat Node.js (18+).

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');

// ───────────────────────────── Konfiguratsiya ─────────────────────────────

const DEFAULTS = {
  server: 'https://polatuz.duckdns.org',
  username: '',
  password: '',
  printer: { host: '192.168.1.230', port: 9100 },
  pollMs: 2000,          // navbatni qanchalik tez-tez so'rash
  retryMs: 15000,        // printer/tarmoq xatosidan keyin kutish
  width: 42,             // bir qatordagi belgilar soni (80mm: 42 xavfsiz, 48 maksimal)
  beep: true,            // chek chiqqanda ovoz (printerda beeper bor)
  cut: true,             // avtomatik qirqish
  copies: 1,             // nechta nusxa
  tzOffsetMinutes: 300,  // Toshkent = UTC+5 (chekdagi vaqt uchun)
  logFile: 'print-agent.log',
};

function loadConfig() {
  const file = path.join(__dirname, 'config.json');
  let fromFile = {};
  if (fs.existsSync(file)) {
    try {
      fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`config.json o'qib bo'lmadi: ${err.message}`);
      process.exit(1);
    }
  }
  const cfg = {
    ...DEFAULTS,
    ...fromFile,
    printer: { ...DEFAULTS.printer, ...(fromFile.printer || {}) },
  };
  // Muhit o'zgaruvchilari config.json'dan ustun turadi (parolni faylsiz
  // berish kerak bo'lgan holatlar uchun).
  if (process.env.POLAT_SERVER) cfg.server = process.env.POLAT_SERVER;
  if (process.env.POLAT_USER) cfg.username = process.env.POLAT_USER;
  if (process.env.POLAT_PASS) cfg.password = process.env.POLAT_PASS;
  if (process.env.PRINTER_HOST) cfg.printer.host = process.env.PRINTER_HOST;
  if (process.env.PRINTER_PORT) cfg.printer.port = Number(process.env.PRINTER_PORT);
  if (process.env.POLAT_LOG) cfg.logFile = process.env.POLAT_LOG;
  cfg.server = String(cfg.server).replace(/\/+$/, '');
  return cfg;
}

// ───────────────────────────────── Loglar ─────────────────────────────────
// Ekranga ham, faylga ham yoziladi. Fayl 1 MB dan oshsa .old ga ko'chiriladi —
// agent oylab ishlaganda disk to'lib qolmasin.

let logPath = null;

function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'XATO') console.error(line); else console.log(line);
  if (!logPath) return;
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 1024 * 1024) {
      fs.renameSync(logPath, `${logPath}.old`);
    }
    fs.appendFileSync(logPath, line + '\n');
  } catch (_) { /* log yozilmasa ham agent ishlashda davom etadi */ }
}

// ──────────────────────────── CP866 kodlash ───────────────────────────────
// Printerning standart kod sahifasi — Page17 (PC866, kirill). O'zbek lotin
// harflari ASCII, ular o'zgarishsiz o'tadi; kirill harflar CP866 baytiga
// aylantiriladi (mijoz ismi "Алина" bo'lsa to'g'ri chiqadi). Apostrof turlari
// (oʻ, gʻ, ’) oddiy ' ga keltiriladi — aks holda printer tushunmaydigan
// belgi chiqarardi.

function cp866Byte(ch) {
  const c = ch.codePointAt(0);
  if (c <= 0x7f) return c;                                   // ASCII
  if (c >= 0x410 && c <= 0x43f) return 0x80 + (c - 0x410);   // А..Я, а..п
  if (c >= 0x440 && c <= 0x44f) return 0xe0 + (c - 0x440);   // р..я
  if (c === 0x401) return 0xf0;                              // Ё
  if (c === 0x451) return 0xf1;                              // ё
  if (c === 0x2116) return 0xfc;                             // №
  if (c === 0x00a0) return 0x20;                             // uzilmas probel
  if ('‘’ʻʼ´`'.indexOf(ch) !== -1) return 0x27; // ' turlari
  if ('–—−'.indexOf(ch) !== -1) return 0x2d;  // tire turlari
  return 0x3f;                                               // qolgani: ?
}

function toCp866(text) {
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = cp866Byte(text[i]);
  return out;
}

// ──────────────────────────── ESC/POS buyruqlari ──────────────────────────

const ESC = {
  init: '\x1B\x40',            // printerni boshlang'ich holatga
  codepage866: '\x1B\x74\x11', // ESC t 17 — PC866 (init'dan KEYIN yuborilishi shart)
  alignLeft: '\x1B\x61\x00',
  alignCenter: '\x1B\x61\x01',
  sizeNormal: '\x1B\x21\x00',
  sizeTall: '\x1B\x21\x10',    // ikki barobar BO'Y (en o'zgarmaydi — qator sig'imi saqlanadi)
  sizeBig: '\x1B\x21\x30',     // ikki barobar en + bo'y
  beep: '\x1B\x42\x02\x03',    // ESC B n t — 2 marta signal
  cut: '\x1D\x56\x41\x00',     // qog'ozni surib qirqish
};

// Vaqtni Toshkent mintaqasida ko'rsatadi (server UTC ISO yuboradi).
function fmtTime(iso, tzOffsetMinutes) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso || '');
  const d = new Date(t + tzOffsetMinutes * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Oshxona cheki. Bu chek PUL hujjati EMAS — oshpaz uchun ish qog'ozi, shuning
// uchun narx yo'q; stol nomi va taom miqdori eng yirik ko'rinadi.
// Taomlar uchun "ikki barobar bo'y" tanlangan (ikki barobar en emas): harflar
// yirik bo'ladi, lekin qatorga baribir 42 belgi sig'adi — uzun taom nomi
// keyingi qatorga o'ralib ketmaydi.
function buildKitchenTicket(ticket, cfg) {
  const w = cfg.width;
  const parts = [];
  parts.push(ESC.init, ESC.codepage866);
  parts.push(ESC.alignCenter, ESC.sizeNormal, 'OSHXONA CHEKI\n');
  parts.push(ESC.sizeBig, `${ticket.table_name || ''}\n`);
  parts.push(ESC.sizeNormal, `${fmtTime(ticket.created_at, cfg.tzOffsetMinutes)}\n`);
  parts.push('='.repeat(w) + '\n');
  parts.push(ESC.alignLeft, ESC.sizeTall);
  (ticket.items || []).forEach((it) => {
    parts.push(`${it.quantity} x ${it.name_snapshot}\n`);
  });
  parts.push(ESC.sizeNormal, '='.repeat(w) + '\n');
  parts.push(ESC.alignCenter, `Chek #${ticket.id}\n`);
  parts.push(ESC.alignLeft, '\n\n');
  if (cfg.beep) parts.push(ESC.beep);
  if (cfg.cut) parts.push(ESC.cut);
  return toCp866(parts.join(''));
}

function buildTestTicket(cfg) {
  return buildKitchenTicket({
    id: 0,
    table_name: 'SINOV',
    created_at: new Date().toISOString(),
    items: [
      { quantity: 2, name_snapshot: 'Osh' },
      { quantity: 1, name_snapshot: "Lag'mon" },
      { quantity: 3, name_snapshot: 'Чой' },
    ],
  }, cfg);
}

// ──────────────────────── Printerga yuborish (TCP 9100) ───────────────────

function printRaw(buffer, cfg) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: cfg.printer.host, port: cfg.printer.port });
    let failed = null;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err); else resolve();
    };
    socket.setTimeout(8000);
    socket.on('timeout', () => finish(new Error('printer javob bermadi (timeout)')));
    socket.on('error', (err) => { failed = err; finish(err); });
    socket.on('connect', () => {
      socket.write(buffer, () => {
        // Baytlar tarmoqqa chiqqanidan keyin ulanishni TARTIBLI yopamiz —
        // darhol destroy qilinsa printer oxirgi qismini olmay qolishi mumkin.
        socket.end();
      });
    });
    socket.on('close', () => finish(failed));
  });
}

// ─────────────────────────── Server bilan aloqa ───────────────────────────
// Oddiy HTTP klient (tashqi kutubxonasiz) + sessiya cookie'si. 401/403 kelsa
// avtomatik qayta login qilinadi — server qayta ishga tushsa yoki sessiya
// eskirsa agent o'zi tiklanadi, odam aralashuvi kerak emas.

class ServerClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.cookie = null;
    this.base = new URL(cfg.server);
  }

  request(method, pathname, body) {
    return new Promise((resolve, reject) => {
      const isHttps = this.base.protocol === 'https:';
      const lib = isHttps ? https : http;
      const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const headers = { Accept: 'application/json' };
      if (data) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = data.length;
      }
      if (this.cookie) headers.Cookie = this.cookie;
      const req = lib.request({
        protocol: this.base.protocol,
        hostname: this.base.hostname,
        port: this.base.port || (isHttps ? 443 : 80),
        path: pathname,
        method,
        headers,
        timeout: 15000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const setCookie = res.headers['set-cookie'];
          if (setCookie && setCookie.length) {
            this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
          }
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (_) { /* JSON bo'lmasligi mumkin */ }
          resolve({ status: res.statusCode, body: json, text });
        });
      });
      req.on('timeout', () => req.destroy(new Error('server javob bermadi (timeout)')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async login() {
    const res = await this.request('POST', '/api/login', {
      username: this.cfg.username,
      password: this.cfg.password,
    });
    if (res.status !== 200) {
      throw new Error(`login muvaffaqiyatsiz (${res.status}): ${(res.body && res.body.error) || res.text}`);
    }
    if (!this.cookie) throw new Error('server sessiya cookie qaytarmadi');
    log('INFO', `Serverga kirildi: ${this.cfg.username} (${res.body && res.body.role})`);
  }

  // 401/403 bo'lsa bir marta qayta login qilib, so'rovni takrorlaydi.
  async authed(method, pathname, body) {
    if (!this.cookie) await this.login();
    let res = await this.request(method, pathname, body);
    if (res.status === 401 || res.status === 403) {
      log('INFO', 'Sessiya eskirdi — qayta kirilmoqda');
      this.cookie = null;
      await this.login();
      res = await this.request(method, pathname, body);
    }
    return res;
  }

  async pendingTickets() {
    const res = await this.authed('GET', '/api/chef/kitchen-tickets/pending');
    if (res.status !== 200) throw new Error(`navbatni olishda xato (${res.status})`);
    return Array.isArray(res.body) ? res.body : [];
  }

  async markPrinted(id) {
    const res = await this.authed('POST', `/api/chef/kitchen-tickets/${id}/printed`);
    if (res.status !== 200) throw new Error(`"chop etildi" belgilashda xato (${res.status})`);
  }
}

// ──────────────────────────────── Asosiy tsikl ────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bir xil xato har 2 soniyada logga yozilib ketmasin — faqat holat
// o'zgarganda (xato boshlandi / tuzaldi) yoziladi.
function makeStateLogger() {
  let last = null;
  return (key, level, message) => {
    if (key === last) return;
    last = key;
    log(level, message);
  };
}

async function printTicket(client, ticket, cfg) {
  const buf = buildKitchenTicket(ticket, cfg);
  for (let copy = 0; copy < Math.max(1, cfg.copies); copy += 1) {
    await printRaw(buf, cfg);
  }
  // Faqat chop etish MUVAFFAQIYATLI tugagandan keyin belgilaymiz — printer
  // o'chiq bo'lsa chek navbatda qoladi va keyingi urinishda chiqadi
  // (buyurtma hech qachon "yo'qolib" ketmaydi).
  await client.markPrinted(ticket.id);
  const items = (ticket.items || []).map((i) => `${i.quantity}x${i.name_snapshot}`).join(', ');
  log('INFO', `Chop etildi: #${ticket.id} — ${ticket.table_name} (${items})`);
}

async function runLoop(cfg, once) {
  const client = new ServerClient(cfg);
  const stateLog = makeStateLogger();
  log('INFO', `Agent ishga tushdi — server: ${cfg.server}, printer: ${cfg.printer.host}:${cfg.printer.port}`);

  for (;;) {
    let wait = cfg.pollMs;
    try {
      const tickets = await client.pendingTickets();
      stateLog('ok', 'INFO', 'Server bilan aloqa yaxshi');
      for (const ticket of tickets) {
        try {
          await printTicket(client, ticket, cfg);
        } catch (err) {
          stateLog(`print-err:${err.message}`, 'XATO', `Chop etib bo'lmadi (#${ticket.id}): ${err.message} — chek navbatda qoldi, qayta urinaman`);
          wait = cfg.retryMs;
          break; // tartib buzilmasin: keyingi chekka o'tmaymiz
        }
      }
    } catch (err) {
      stateLog(`srv-err:${err.message}`, 'XATO', `Server bilan aloqa yo'q: ${err.message}`);
      wait = cfg.retryMs;
    }
    if (once) return;
    await sleep(wait);
  }
}

// ───────────────────────────────── Boshlanish ─────────────────────────────

async function main() {
  const cfg = loadConfig();
  logPath = path.isAbsolute(cfg.logFile) ? cfg.logFile : path.join(__dirname, cfg.logFile);
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    log('INFO', `Sinov cheki yuborilmoqda -> ${cfg.printer.host}:${cfg.printer.port}`);
    await printRaw(buildTestTicket(cfg), cfg);
    log('INFO', "Sinov cheki yuborildi. Printerdan qog'oz chiqqan bo'lsa — hammasi joyida.");
    return;
  }

  if (!cfg.username || !cfg.password) {
    console.error('config.json da "username" va "password" ko\'rsatilmagan (oshpaz roli bilan hisob).');
    process.exit(1);
  }

  await runLoop(cfg, args.includes('--once'));
}

process.on('SIGINT', () => { log('INFO', "Agent to'xtatildi (Ctrl+C)"); process.exit(0); });
process.on('SIGTERM', () => { log('INFO', "Agent to'xtatildi"); process.exit(0); });

// Testlar ichki funksiyalarni tekshira olishi uchun (agent to'g'ridan-to'g'ri
// ishga tushirilganda esa odatdagidek main() bajariladi).
module.exports = { buildKitchenTicket, buildTestTicket, toCp866, cp866Byte, fmtTime, DEFAULTS };

if (require.main === module) {
  main().catch((err) => {
    log('XATO', `Agent to'xtadi: ${err.message}`);
    process.exit(1);
  });
}
