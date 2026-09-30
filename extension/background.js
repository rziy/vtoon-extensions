const BRIDGE = "http://127.0.0.1:1738";

// Harus sama dengan DEFAULTS di content.js dan popup.js
const DEFAULTS = {
  enabled: true,
  hideTitle: false,
  idleMinutes: 10,
  useCover: false
};

function isVoratoon(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "voratoon.com" || hostname.endsWith(".voratoon.com"))
    );
  } catch {
    return false;
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

// Service worker MV3 bisa "tidur" kapan saja, jadi ID tab
// disimpan di storage.session, bukan variabel biasa.
async function getTabId() {
  const { tabId } = await chrome.storage.session.get("tabId");
  return tabId ?? null;
}

async function post(path, body) {
  const res = await fetch(BRIDGE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { ok: res.ok, status: res.status };
}

async function clearPresence() {
  await chrome.storage.session.remove("tabId");
  try {
    await post("/clear");
  } catch {
    // bridge tidak jalan, abaikan
  }
}

// Badge di ikon extension: OFF = di-pause, PRV = mode privat
async function updateBadge() {
  try {
    const s = await getSettings();
    if (!s.enabled) {
      await chrome.action.setBadgeText({ text: "OFF" });
      await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    } else if (s.hideTitle) {
      await chrome.action.setBadgeText({ text: "PRV" });
      await chrome.action.setBadgeBackgroundColor({ color: "#ff7f00" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // abaikan
  }
}

async function handleActivity(payload, sender) {
  const s = await getSettings();

  const tabId = sender.tab?.id ?? null;
  if (tabId != null) await chrome.storage.session.set({ tabId });

  if (!s.enabled) return { ok: true, skipped: "paused" };

  let out = { ...payload, tabId };

  if (s.hideTitle) {
    // Mode privat: tidak ada judul, chapter, URL, atau cover yang keluar dari browser.
    out = {
      site: payload.site,
      pageType: "private",
      title: "VoraToon",
      chapter: null,
      url: null,
      seriesUrl: null,
      cover: null,
      tabId
    };
  } else if (!s.useCover) {
    out.cover = null;
  }

  try {
    return await post("/activity", out);
  } catch (err) {
    console.debug("[VoraToon Presence] Bridge belum jalan:", err.message);
    return { ok: false, error: err.message };
  }
}

// content.js mengirim activity saat berubah dan heartbeat tiap ~30 detik.
// Bridge yang menghapus duplikat, jadi di sini langsung diteruskan.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VORATOON_ACTIVITY") {
    handleActivity(message.payload, sender).then(sendResponse);
    return true; // async response
  }

  if (message?.type === "VORATOON_IDLE") {
    clearPresence().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Pengaturan diubah dari popup
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  updateBadge();

  if (changes.enabled && changes.enabled.newValue === false) {
    clearPresence();
    return;
  }

  // Minta semua tab VoraToon mengirim ulang supaya perubahan langsung terlihat
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.voratoon.com/*" });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "RESEND" }).catch(() => {});
    }
  } catch {
    // abaikan
  }
});

// Tab VoraToon ditutup -> hapus presence
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === (await getTabId())) clearPresence();
});

// Tab VoraToon pindah ke situs lain -> hapus presence
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  if (tabId !== (await getTabId())) return;
  if (!isVoratoon(changeInfo.url)) clearPresence();
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
updateBadge();
