// Telegram bot — mijozlar saytga kirishi uchun tasdiqlash kodini yuboradi
// (2026-11-01, "Mijoz hisobi"). Tashqi dependency yo'q: Node'ning o'zidagi
// fetch() + Telegram Bot API "long polling" (getUpdates). Webhook EMAS —
// nginx/SSL sozlamasiga tegish shart emas, server ichkaridan ulanadi.
//
// OQIM:
//  1) Saytda mijoz raqamini kiritadi -> server /start havolasi beradi:
//     https://t.me/<bot>?start=<token>
//  2) Mijoz botda "Start" bosadi -> bot "📱 Raqamni ulashish" tugmasini
//     chiqaradi (request_contact).
//  3) Kontakt keladi -> faqat O'Z kontakti qabul qilinadi
//     (contact.user_id === from.id, ya'ni raqamni Telegram tasdiqlagan).
//     Raqam saytdagi bilan mos kelsa — bog'lanadi va 6 xonali kod yuboriladi.
//  4) Keyingi kirishlarda havola shart emas — kod to'g'ridan-to'g'ri botga keladi.
//
// MUHIM: bitta bot tokeni bilan faqat BITTA jarayon getUpdates qila oladi.
// Shu bot uchun webhook o'rnatilgan bo'lsa yoki boshqa server ham shu tokenni
// ishlatsa, Telegram 409 Conflict qaytaradi — bu holda alohida bot oching.
const login = require('./services/customerLogin');

const API_BASE = 'https://api.telegram.org';

function createTelegramBot({ token, username, api } = {}) {
  const enabled = Boolean(token);
  let botUsername = username ? String(username).replace(/^@/, '') : null;
  let running = false;
  let offset = 0;
  let abort = null;
  let cleanupTimer = null;

  // `api` — testlarda soxta (mock) funksiya berish uchun.
  const call = api || (async (method, payload) => {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: abort ? abort.signal : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      const err = new Error(`Telegram ${method}: ${data.description || res.status}`);
      err.code = data.error_code || res.status;
      throw err;
    }
    return data.result;
  });

  function send(chatId, text, extra) {
    return call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  }

  const contactKeyboard = {
    reply_markup: {
      keyboard: [[{ text: '📱 Raqamni ulashish', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
  const removeKeyboard = { reply_markup: { remove_keyboard: true } };

  function codeMessage(code) {
    return (
      `🔐 <b>Ziyo Family</b> saytiga kirish kodi:\n\n<code>${code}</code>\n\n` +
      `Kod ${Math.round(login.CODE_TTL_MS / 60000)} daqiqa amal qiladi. Uni hech kimga bermang — ` +
      'restoran xodimlari hech qachon kodni so\'ramaydi.'
    );
  }

  // Bog'langan raqamga kod yuboradi. true — yuborildi; false — bog'lanmagan
  // yoki mijoz botni bloklagan (bu holda bog'lanish o'chiriladi, sayt qayta
  // havola beradi).
  async function sendCode(phone) {
    const chat = login.getTelegramChat(phone);
    if (!chat) return false;
    const code = login.issueCode(phone);
    try {
      await send(chat.chat_id, codeMessage(code));
      return true;
    } catch (err) {
      if (err.code === 403 || err.code === 400) {
        login.forgetTelegramChat(phone);
        return false;
      }
      throw err;
    }
  }

  async function handleUpdate(update) {
    const msg = update && update.message;
    if (!msg || !msg.chat || msg.chat.type !== 'private') return;
    const chatId = msg.chat.id;

    if (typeof msg.text === 'string' && msg.text.startsWith('/start')) {
      const token = msg.text.split(/\s+/)[1];
      const link = token ? login.getLink(token) : null;
      if (link && !link.linked_at && link.expires_at > new Date().toISOString()) {
        login.attachChatToLink(token, chatId);
        await send(
          chatId,
          `Assalomu alaykum! <b>Ziyo Family</b> saytiga <b>${login.maskPhone(link.phone)}</b> raqami bilan kirish uchun ` +
            'pastdagi tugma orqali raqamingizni ulashing.',
          contactKeyboard
        );
        return;
      }
      if (token) {
        await send(chatId, "Bu havolaning muddati tugagan. Saytda raqamingizni qayta kiriting.", removeKeyboard);
        return;
      }
      await send(
        chatId,
        'Assalomu alaykum! Bu bot <b>Ziyo Family</b> saytiga kirish kodlarini yuboradi.\n' +
          'Saytdagi "Kirish" bo\'limida telefon raqamingizni kiriting.'
      );
      return;
    }

    if (msg.contact) {
      const contact = msg.contact;
      if (!msg.from || contact.user_id !== msg.from.id) {
        await send(chatId, "Iltimos, boshqa odamning emas, o'zingizning raqamingizni tugma orqali ulashing.", contactKeyboard);
        return;
      }
      const phone = login.normalizePhone(contact.phone_number);
      if (!phone) {
        await send(chatId, "Hozircha faqat O'zbekiston (+998) raqamlari qo'llab-quvvatlanadi.", removeKeyboard);
        return;
      }
      const link = login.findPendingLinkByChat(chatId);
      if (!link) {
        // Havolasiz kontakt — baribir bog'lab qo'yamiz, keyingi safar kod shu yerga keladi.
        login.saveTelegramChat(phone, chatId, contact.user_id);
        await send(chatId, '✅ Raqamingiz bog\'landi. Endi saytda raqamingizni kiritsangiz, kod shu yerga keladi.', removeKeyboard);
        return;
      }
      if (link.phone !== phone) {
        login.markLinkError(link.token, 'phone_mismatch');
        await send(
          chatId,
          `Saytda <b>${login.maskPhone(link.phone)}</b> kiritilgan, Telegram raqamingiz esa boshqa. ` +
            "Saytda Telegram'dagi raqamingizni kiriting.",
          removeKeyboard
        );
        return;
      }
      login.saveTelegramChat(phone, chatId, contact.user_id);
      login.markLinkLinked(link.token);
      const code = login.issueCode(phone);
      await send(chatId, '✅ Raqamingiz tasdiqlandi.', removeKeyboard);
      await send(chatId, codeMessage(code));
    }
  }

  async function poll() {
    while (running) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            await handleUpdate(u);
          } catch (err) {
            console.error('Telegram xabarini qayta ishlashda xato:', err.message);
          }
        }
      } catch (err) {
        if (!running) return;
        console.error('Telegram getUpdates xatosi:', err.message);
        // 409 = boshqa jarayon/webhook shu tokenni ishlatmoqda — sekinroq urinamiz.
        await new Promise((r) => setTimeout(r, err.code === 409 ? 30_000 : 5_000));
      }
    }
  }

  async function start() {
    if (!enabled || running) return;
    running = true;
    abort = new AbortController();
    try {
      const me = await call('getMe');
      botUsername = me.username;
      console.log(`Telegram bot @${botUsername} ishga tushdi (mijoz kirishi)`);
    } catch (err) {
      console.error('Telegram bot tokeni ishlamadi:', err.message);
    }
    cleanupTimer = setInterval(() => {
      try { login.cleanup(); } catch (e) { console.error(e); }
    }, 3600_000);
    cleanupTimer.unref();
    poll();
  }

  function stop() {
    running = false;
    if (abort) abort.abort();
    if (cleanupTimer) clearInterval(cleanupTimer);
  }

  return {
    get enabled() { return enabled && Boolean(botUsername); },
    get username() { return botUsername; },
    botUrl(token) { return `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`; },
    sendCode,
    handleUpdate,
    start,
    stop,
  };
}

module.exports = { createTelegramBot };
