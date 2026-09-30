// Harus sama dengan DEFAULTS di content.js dan background.js
const DEFAULTS = {
  enabled: true,
  hideTitle: false,
  idleMinutes: 10,
  useCover: false
};

const $ = (id) => document.getElementById(id);

async function init() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };

  for (const id of ["enabled", "hideTitle", "useCover"]) {
    $(id).checked = !!s[id];
    $(id).addEventListener("change", () => {
      chrome.storage.local.set({ [id]: $(id).checked });
    });
  }

  $("idleMinutes").value = String(s.idleMinutes);
  $("idleMinutes").addEventListener("change", () => {
    chrome.storage.local.set({ idleMinutes: Number($("idleMinutes").value) });
  });

  refreshStatus();
  setInterval(refreshStatus, 4000);
}

async function refreshStatus() {
  const dot = $("dot");
  const text = $("statusText");

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("http://127.0.0.1:1738/status", { signal: ctrl.signal });
    clearTimeout(timer);
    const info = await res.json();

    if (info.discordReady) {
      dot.className = "dot ok";
      text.textContent = info.current
        ? `Terhubung: ${info.current.title}`
        : "Terhubung ke Discord";
    } else {
      dot.className = "dot warn";
      text.textContent = "Bridge jalan, Discord belum terhubung";
    }
  } catch {
    dot.className = "dot bad";
    text.textContent = "Bridge tidak jalan (jalankan START-NOW.bat)";
  }
}

init();
