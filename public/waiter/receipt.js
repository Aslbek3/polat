const params = new URLSearchParams(window.location.search);
const ORDER_ID = params.get('order');
const TABLE_ID = params.get('table');
let lastView = null;

// QZ Tray xavfsizlik sozlamasi, ESC/POS qurish va chop etishning o'zi endi
// bu yerda TAKRORLANMAYDI — `public/app.js`dagi umumiy `printReceiptView()`
// (+ `setupQzSecurity()`/`buildEscPosReceipt()`/`loadQzTray()`) ishlatiladi,
// chunki bu sahifa ham `../app.js`ni ulaydi. MUHIM — 2026-09-07'da haqiqiy
// production bug sifatida topildi: bu yerda ilgari xuddi shu nomlar bilan
// (`let qzSecuritySetUp`, `function buildEscPosReceipt`) alohida nusxa bor
// edi — `app.js`ga xuddi shu funksiyalar (admin modal uchun) qo'shilgach,
// ikkala <script> BITTA sahifada (`let qzSecuritySetUp` ikkalasida ham)
// "Identifier 'qzSecuritySetUp' has already been declared" SyntaxError
// bilan to'qnashib, `receipt.js`ning BUTUN faylini ishga tushirmay qo'ygan
// edi — natijada chek hech qachon yuklanmasdi ("Yuklanmoqda..." holatida
// abadiy qotib qolardi). Endi bu yerda faqat shu sahifaga xos (`escapeHtml`,
// `renderReceipt`, `load`) qoladi, umumiy qism esa `app.js`dan bir marta
// olinadi — kelajakda shunga o'xshash nom to'qnashuvi bo'lmasligi uchun.

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
//
// Bu sahifaga amalda faqat ADMINISTRATOR keladi (admin panelidagi "chop
// etish kutilmoqda" bildirishnomasi yangi tabda ochadi, yoki Hisobot
// bo'limidagi "Chek" havolasi orqali) — afitsiantning o'z hisob-kitob
// oqimi (order.js) endi bevosita shu sahifaga o'tmaydi. Shu sabab chek
// muvaffaqiyatli chop etilgandan so'ng admin qo'lda "Stollarga qaytish"ni
// (bu afitsiant uchun mo'ljallangan havola) bosishiga hojat qoldirmasdan,
// avtomatik ravishda administrator bo'limiga qaytariladi.
async function returnToAdminAfterPrint() {
  try {
    const me = await api('/me');
    if (!me || me.role !== 'admin') return; // faqat admin uchun
  } catch (e) {
    return; // rolni aniqlab bo'lmasa hech narsa qilmaymiz
  }
  toast('Chek chop etildi — administrator bo\'limiga qaytilmoqda...');
  setTimeout(() => {
    // Bildirishnoma havolasi yangi tab (target="_blank") ochgan bo'lsa,
    // shu tabni yopib, admin allaqachon ochiq turgan asosiy admin tabiga
    // qaytariladi. Yopib bo'lmasa (masalan Hisobot sahifasidan xuddi shu
    // tabda ochilgan bo'lsa) — qayerdan kelingan bo'lsa o'sha admin
    // sahifasiga, aks holda admin bosh sahifasiga yo'naltiramiz.
    if (window.opener && !window.opener.closed) {
      window.close();
    }
    setTimeout(() => {
      if (document.referrer && document.referrer.includes('/admin/')) {
        window.location.href = document.referrer;
      } else {
        window.location.href = '../admin/index.html';
      }
    }, 300);
  }, 900);
}

async function chekChopEtish() {
  if (!lastView) {
    alert("Chek ma'lumoti hali yuklanmagan.");
    return;
  }
  try {
    await printReceiptView(lastView); // app.js — umumiy QZ Tray ulanish+chop etish
    returnToAdminAfterPrint();
  } catch (err) {
    console.error(err);
    alert(
      `Printerga chop etib bo'lmadi: ${err.message || err}\n\n` +
      `Tekshiring: QZ Tray dasturi ishga tushirilganmi va Windows'da printer aynan "${RECEIPT_PRINTER_NAME}" deb nomlanganmi.`
    );
  }
}

function renderReceipt(view) {
  const box = document.getElementById('receiptBox');
  const activeItems = view.items.filter((it) => it.status === 'active');
  box.innerHTML = `
    <h2>Ziyo Famliy restorani</h2>
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
window.addEventListener('afterprint', returnToAdminAfterPrint);
document.addEventListener('DOMContentLoaded', load);
