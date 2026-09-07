const params = new URLSearchParams(window.location.search);
const ORDER_ID = params.get('order');
const TABLE_ID = params.get('table');
const PRINTER_NAME = 'Kassa-Printer';
let lastView = null;
let qzSecuritySetUp = false;

// QZ Tray'ning har safar chiqadigan "Action Required" (imzosiz/anonim
// ulanish) so'rovnomasini butunlay yo'qotish uchun — serverdagi
// /api/admin/qz/certificate va /api/admin/qz/sign orqali ulanishni raqamli
// imzolaymiz. Admin kompyuteridagi QZ Tray shu ochiq sertifikatni ("override.crt"
// sifatida o'rnatilgan bo'lsa, polat/CLAUDE.mdga qarang) ishonchli deb tan olsa,
// oyna umuman chiqmaydi. Faqat bir marta o'rnatiladi (har chop etishda emas).
function setupQzSecurity() {
  if (qzSecuritySetUp) return;
  qzSecuritySetUp = true;
  qz.security.setCertificatePromise((resolve, reject) => {
    api('/admin/qz/certificate').then((data) => resolve(data.certificate)).catch(reject);
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    api('/admin/qz/sign', { method: 'POST', body: { request: toSign } })
      .then((data) => resolve(data.signature))
      .catch(reject);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Chap va o'ng matnni bitta qatorga (belgilangan kenglikda) tekislaydi —
// termal printerda ustunlar (nom ... narx) to'g'ri qatorga tushishi uchun.
function padLine(left, right, width = 42) {
  left = String(left);
  right = String(right);
  const space = width - left.length - right.length;
  if (space < 1) {
    left = left.slice(0, Math.max(0, width - right.length - 1));
    return `${left} ${right}`;
  }
  return left + ' '.repeat(space) + right;
}

// Chekni ESC/POS xom (raw) buyruqlar ketma-ketligiga aylantiradi.
// \x1B... — printer mikrosxemasiga to'g'ridan-to'g'ri boradigan buyruqlar
// (tekislash/shrift/kesish), oddiy matn emas — brauzer print dialogidan
// farqli o'laroq sifat va avtomatik kesish shu orqali ta'minlanadi.
function buildEscPosReceipt(view) {
  const WIDTH = 42; // 80mm qog'ozda standart shrift uchun taxminiy belgi soni
  const activeItems = view.items.filter((it) => it.status === 'active');
  const data = [];

  data.push('\x1B\x40'); // ESC @ — printerni boshlang'ich holatga qaytarish
  data.push('\x1B\x61\x01'); // markazga tekislash
  data.push('\x1B\x21\x30'); // kattalashtirilgan shrift (sarlavha)
  data.push("Po'lat restorani\n");
  data.push('\x1B\x21\x00'); // oddiy shrift
  data.push(`${view.order.table_name}\n`);
  data.push(`${fmtDateTime(view.order.closed_at || view.order.opened_at)}\n`);
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x00'); // chapga tekislash

  activeItems.forEach((it) => {
    const name = `${it.name_snapshot} x${it.quantity}`;
    data.push(padLine(name, fmtMoney(it.subtotal), WIDTH) + '\n');
  });

  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x21\x30'); // jami summani ham kattaroq/qalin chiqarish
  data.push(padLine('JAMI', fmtMoney(view.total), WIDTH) + '\n');
  data.push('\x1B\x21\x00');
  data.push('\x1B\x61\x01');
  data.push('Xaridingiz uchun rahmat!\n');
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00'); // GS V A 0 — qog'ozni avtomatik kesish

  return data;
}

async function chekChopEtish() {
  if (!lastView) {
    alert("Chek ma'lumoti hali yuklanmagan.");
    return;
  }
  if (typeof qz === 'undefined') {
    alert('QZ Tray kutubxonasi yuklanmadi (internet aloqasini tekshiring).');
    return;
  }
  try {
    setupQzSecurity();
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }
    const config = qz.configs.create(PRINTER_NAME, { encoding: 'CP866' });
    const data = buildEscPosReceipt(lastView);
    await qz.print(config, data);
  } catch (err) {
    console.error(err);
    alert(
      `Printerga chop etib bo'lmadi: ${err.message || err}\n\n` +
      `Tekshiring: QZ Tray dasturi ishga tushirilganmi va Windows'da printer aynan "${PRINTER_NAME}" deb nomlanganmi.`
    );
  }
}

function renderReceipt(view) {
  const box = document.getElementById('receiptBox');
  const activeItems = view.items.filter((it) => it.status === 'active');
  box.innerHTML = `
    <h2>Po'lat restorani</h2>
    <div class="r-sub">${escapeHtml(view.order.table_name)} · ${fmtDateTime(view.order.closed_at || view.order.opened_at)}</div>
    <hr>
    <table>
      ${activeItems.map((it) => `
        <tr>
          <td>${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:12px;">
      ${view.order.opened_by_name ? `Ochdi: ${escapeHtml(view.order.opened_by_name)}<br>` : ''}
      ${view.order.closed_by_name ? `Yopdi: ${escapeHtml(view.order.closed_by_name)}<br>` : ''}
      Holat: ${view.order.status === 'closed' ? 'Yopilgan' : 'Ochiq'}
    </div>
  `;
}

async function load() {
  try {
    let view;
    if (ORDER_ID) {
      view = await api(`/waiter/orders/${ORDER_ID}/receipt`);
    } else if (TABLE_ID) {
      view = await api(`/waiter/tables/${TABLE_ID}/receipt/latest`);
    } else {
      throw new Error("Chek ma'lumoti topilmadi");
    }
    lastView = view;
    renderReceipt(view);
  } catch (err) {
    document.getElementById('receiptBox').innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('printBtn').addEventListener('click', chekChopEtish);
document.getElementById('fallbackPrintLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.print();
});
document.addEventListener('DOMContentLoaded', load);
