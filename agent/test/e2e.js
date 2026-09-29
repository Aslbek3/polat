// Agentning uchidan-uchiga sinovi — HAQIQIY printer va haqiqiy serversiz.
//
// Soxta printer (TCP) va soxta server (HTTP) ko'tariladi, agent alohida
// jarayonda `--once` bilan ishga tushiriladi. Tekshiriladi:
//   1. serverga login qiladimi va cookie'ni saqlaydimi;
//   2. navbatdagi cheklarni oladimi;
//   3. printerga to'g'ri ESC/POS baytlar ketadimi (kirill CP866 da);
//   4. faqat muvaffaqiyatli chop etilgandan KEYIN "printed" deb belgilaydimi;
//   5. printer o'chiq bo'lsa chek navbatda qoladimi (2-bosqich).
//
// Ishga tushirish:  node agent/test/e2e.js

'use strict';

const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const AGENT = path.join(__dirname, '..', 'print-agent.js');
const results = [];
const ok = (name, cond, extra) => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ' — ' + extra : ''}`);
};

// ───────────────────────── Soxta printer (TCP 9100) ───────────────────────
function startFakePrinter() {
  const chunks = [];
  const server = net.createServer((socket) => {
    socket.on('data', (d) => chunks.push(d));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        data: () => Buffer.concat(chunks),
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// ───────────────────────────── Soxta server ───────────────────────────────
function startFakeServer(tickets) {
  const state = { logins: 0, printed: [], pendingCalls: 0, unauthorizedHits: 0 };
  const server = http.createServer((req, res) => {
    const send = (code, obj, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(obj));
    };
    const cookie = req.headers.cookie || '';

    if (req.method === 'POST' && req.url === '/api/login') {
      state.logins += 1;
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const creds = JSON.parse(body || '{}');
        if (creds.username !== 'printer' || creds.password !== 'sirli') {
          return send(401, { error: "Login yoki parol noto'g'ri" });
        }
        return send(200, { ok: true, role: 'chef', full_name: 'Printer agent' }, {
          'Set-Cookie': 'polat_session=soxta-sessiya; HttpOnly; Path=/',
        });
      });
      return;
    }

    // Sessiyasiz murojaat — haqiqiy serverdagidek 401
    if (!cookie.includes('polat_session=')) {
      state.unauthorizedHits += 1;
      return send(401, { error: 'Avtorizatsiya kerak' });
    }

    if (req.method === 'GET' && req.url === '/api/chef/kitchen-tickets/pending') {
      state.pendingCalls += 1;
      return send(200, tickets.filter((t) => !state.printed.includes(t.id)));
    }

    const m = req.url.match(/^\/api\/chef\/kitchen-tickets\/(\d+)\/printed$/);
    if (req.method === 'POST' && m) {
      state.printed.push(Number(m[1]));
      return send(200, { ok: true });
    }

    return send(404, { error: 'topilmadi' });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, state, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// ─────────────────────────── Agentni ishga tushirish ──────────────────────
function runAgent(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AGENT, '--once'], {
      env: { ...process.env, ...env, POLAT_LOG: path.join(__dirname, 'test.log') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

// Boshqaruv belgilarini ko'rinadigan qilib chekni matn sifatida ko'rsatadi.
function readable(buf) {
  return buf.toString('latin1')
    .replace(/\x1B@/g, '')
    .replace(/\x1Bt\x11/g, '')
    .replace(/\x1Ba\x00/g, '')
    .replace(/\x1Ba\x01/g, '')
    .replace(/\x1B!\x00/g, '')
    .replace(/\x1B!\x10/g, '[YIRIK]')
    .replace(/\x1B!\x30/g, '[JUDA-YIRIK]')
    .replace(/\x1BB\x02\x03/g, '[SIGNAL]')
    .replace(/\x1DVA\x00/g, '[QIRQISH]');
}

(async () => {
  const TICKETS = [
    { id: 41, table_name: 'Stol 5', created_at: '2026-09-29T09:30:00.000Z', items: [{ quantity: 2, name_snapshot: 'Osh' }, { quantity: 1, name_snapshot: "Lag'mon" }] },
    { id: 42, table_name: 'VIP 1', created_at: '2026-09-29T09:31:00.000Z', items: [{ quantity: 3, name_snapshot: 'Чой' }] },
  ];

  // ── 1-bosqich: hammasi ishlaydi ──
  const printer = await startFakePrinter();
  const server = await startFakeServer(TICKETS);
  const env = {
    POLAT_SERVER: `http://127.0.0.1:${server.port}`,
    POLAT_USER: 'printer',
    POLAT_PASS: 'sirli',
    PRINTER_HOST: '127.0.0.1',
    PRINTER_PORT: String(printer.port),
  };
  const run1 = await runAgent(env);
  const data = printer.data();
  const text = readable(data);

  ok('agent xatosiz tugadi', run1.code === 0, `exit ${run1.code}`);
  ok('serverga login qildi', server.state.logins === 1, `${server.state.logins} marta`);
  ok('ikkala chek ham chop etildi', server.state.printed.join(',') === '41,42', server.state.printed.join(','));
  ok('printer baytlari keldi', data.length > 100, `${data.length} bayt`);
  ok('ESC @ (init) bor', data.includes(Buffer.from([0x1b, 0x40])));
  ok('CP866 kod sahifasi (ESC t 17) bor', data.includes(Buffer.from([0x1b, 0x74, 0x11])));
  ok('stol nomi juda yirik shriftda', text.includes('[JUDA-YIRIK]Stol 5'));
  ok('taomlar yirik shriftda', text.includes('[YIRIK]2 x Osh'));
  ok('qirqish buyrug\'i bor', text.includes('[QIRQISH]'));
  ok('signal buyrug\'i bor', text.includes('[SIGNAL]'));
  ok('Toshkent vaqti (09:30 UTC -> 14:30)', text.includes('29.09.2026  14:30'), text.match(/\d\d\.\d\d\.\d{4}\s+\d\d:\d\d/));
  // Кирилл: "Чой" -> CP866: 0x97 0xAE 0xA9
  ok('kirill CP866 da kodlangan', data.includes(Buffer.from([0x97, 0xae, 0xa9])));
  ok("apostrof oddiy ' ga aylandi", text.includes("Lag'mon"));

  await printer.close();

  // ── 2-bosqich: printer o'chiq ──
  // Yangi chek qo'shamiz, printer esa yopiq (port band emas) — chek
  // navbatda qolishi va "printed" BELGILANMASLIGI kerak.
  TICKETS.push({ id: 43, table_name: 'Stol 9', created_at: '2026-09-29T10:00:00.000Z', items: [{ quantity: 1, name_snapshot: 'Somsa' }] });
  const run2 = await runAgent(env); // printer porti endi yopiq
  ok("printer o'chiq bo'lsa chek navbatda qoladi", !server.state.printed.includes(43), server.state.printed.join(','));
  ok("printer o'chiq bo'lsa tushunarli xato yoziladi", /Chop etib bo'lmadi/.test(run2.out));

  // ── 3-bosqich: noto'g'ri parol ──
  const run3 = await runAgent({ ...env, POLAT_PASS: 'xato' });
  ok("noto'g'ri parolda aniq xabar", /login muvaffaqiyatsiz \(401\)/.test(run3.out));

  await server.close();

  console.log('\n──────── Chop etilgan chek (ko\'rinishi) ────────');
  console.log(text.split('[QIRQISH]')[0].trim());
  console.log('────────────────────────────────────────────────\n');
  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\nJAMI: ${results.length - failed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})();
