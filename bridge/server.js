const http = require("http");
const RPC = require("discord-rpc");
const config = require("./config");

// ---------- helpers ----------
const stamp = () => new Date().toLocaleTimeString();
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const logErr = (...a) => console.error(`[${stamp()}]`, ...a);

function safeText(value, fallback, max = 128) {
  const text = String(value || fallback || "").trim();
  return text.slice(0, max);
}

if (!config.clientId || String(config.clientId).includes("PASTE_")) {
  logErr("ERROR: Edit bridge/config.js dan isi Discord Application ID dulu.");
  process.exit(1);
}

// Extension mengirim ulang activity tiap ~30 detik (heartbeat).
// Kalau tidak ada kabar selama ini, anggap user sudah pergi dan hapus presence.
const HEARTBEAT_TIMEOUT_MS = 150 * 1000;
const RECONNECT_MS = 5000;

// ---------- state ----------
let rpc = null;
let discordReady = false;
let connecting = false;
let reconnectTimer = null;

let pending = null;       // activity terbaru dari browser
let lastSeen = 0;         // kapan terakhir dapat kabar dari browser
let appliedKey = null;    // activity yang sudah terkirim ke Discord
let stateKey = null;      // title|chapter|pageType, untuk reset timer
let startTimestamp = null;

// ---------- activity ----------
const SITE_URL_RE = /^https:\/\/([a-z0-9-]+\.)?voratoon\.com\//i;
const COVER_URL_RE = /^https:\/\/([a-z0-9-]+\.)*voratoon\.(com|id)\//i;

function validUrl(url, re, max = 512) {
  return typeof url === "string" && url.length <= max && re.test(url);
}

function buildActivity(data) {
  const pageType = data.pageType || "other";
  const title = safeText(data.title, "VoraToon");
  const chapter = data.chapter ? safeText(data.chapter, "") : "";

  let details;
  let state;

  if (pageType === "private") {
    details = "Reading on VoraToon";
  } else if (pageType === "reader") {
    details = `Reading ${title}`;
    state = chapter || undefined;
  } else if (pageType === "series") {
    details = title;
    state = "Viewing series";
  } else if (pageType === "home") {
    details = "Browsing VoraToon";
  } else {
    details = title;
  }

  const activity = {
    details: safeText(details, "VoraToon"),
    startTimestamp,
    instance: false
  };

  if (state) activity.state = safeText(state, "");

  // Gambar besar: cover (kalau ada dan valid), kalau tidak pakai aset dari config.
  // Discord membatasi URL gambar sekitar 256 karakter.
  if (pageType !== "private" && validUrl(data.cover, COVER_URL_RE, 256)) {
    activity.largeImageKey = data.cover;
    activity.largeImageText = safeText(title, "VoraToon");
  } else if (config.largeImageKey) {
    activity.largeImageKey = config.largeImageKey;
    activity.largeImageText = config.largeImageText || "VoraToon";
  }

  // Tombol (maksimal 2 menurut Discord). Tidak ada tombol di mode privat.
  if (config.showButton && (pageType === "reader" || pageType === "series")) {
    const buttons = [];

    if (validUrl(data.url, SITE_URL_RE)) {
      buttons.push({
        label: pageType === "reader" ? "Open chapter" : "Open series",
        url: data.url
      });
    }

    if (
      pageType === "reader" &&
      validUrl(data.seriesUrl, SITE_URL_RE) &&
      data.seriesUrl !== data.url
    ) {
      buttons.push({ label: "Open series", url: data.seriesUrl });
    }

    if (buttons.length) activity.buttons = buttons;
  }

  return activity;
}

async function pushActivity() {
  if (!pending || !discordReady || !rpc) return;

  const data = pending;
  const sKey = `${data.pageType}|${data.title}|${data.chapter}`;
  const fullKey = `${sKey}|${data.url}|${data.seriesUrl}|${data.cover}`;

  if (fullKey === appliedKey) return; // tidak ada perubahan

  if (sKey !== stateKey) {
    stateKey = sKey;
    startTimestamp = new Date(); // timer baru tiap ganti halaman/chapter
  }

  try {
    await rpc.setActivity(buildActivity(data));
    appliedKey = fullKey;
    log(`[Presence] ${data.title}${data.chapter ? " — " + data.chapter : ""}`);
  } catch (err) {
    logErr("[Discord RPC] Gagal set activity:", err.message);
  }
}

function receiveActivity(data) {
  lastSeen = Date.now();
  pending = data;
  return pushActivity();
}

async function clearActivity(reason = "") {
  pending = null;
  appliedKey = null;
  stateKey = null;
  startTimestamp = null;

  if (!discordReady || !rpc) return;

  try {
    await rpc.clearActivity();
    log(`[Presence] Cleared${reason ? " (" + reason + ")" : ""}`);
  } catch (err) {
    logErr("[Discord RPC] Gagal clear activity:", err.message);
  }
}

// Watchdog: hapus presence kalau browser sudah tidak mengirim kabar
setInterval(() => {
  if (pending && Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS) {
    clearActivity("tidak ada kabar dari browser");
  }
}, 15000);

// ---------- Discord connection (auto reconnect) ----------
function safeDestroy(client) {
  Promise.resolve()
    .then(() => client.destroy())
    .catch(() => {});
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDiscord();
  }, RECONNECT_MS);
}

async function connectDiscord() {
  if (connecting || discordReady) return;
  connecting = true;

  const client = new RPC.Client({ transport: "ipc" });
  rpc = client;

  client.on("ready", () => {
    discordReady = true;
    appliedKey = null; // kirim ulang setelah (re)connect
    log(`[Discord] Connected as ${client.user?.username || "user"}`);
    pushActivity();
  });

  client.on("disconnected", () => {
    if (rpc !== client) return;
    discordReady = false;
    rpc = null;
    appliedKey = null;
    log("[Discord] Terputus, mencoba konek lagi...");
    safeDestroy(client);
    scheduleReconnect();
  });

  try {
    await client.login({ clientId: config.clientId });
  } catch (err) {
    if (rpc === client) rpc = null;
    discordReady = false;
    safeDestroy(client);
    logErr(`[Discord] Belum bisa konek (${err.message}). Coba lagi ${RECONNECT_MS / 1000} detik...`);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

// ---------- HTTP server (lokal saja) ----------
function sendJson(res, status, obj) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
  res.writeHead(status, headers);
  res.end(status === 204 ? undefined : JSON.stringify(obj));
}

const LOCAL_ADDRS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

const server = http.createServer((req, res) => {
  const remote = req.socket.remoteAddress;
  if (remote && !LOCAL_ADDRS.includes(remote)) {
    sendJson(res, 403, { ok: false, error: "Local connections only" });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204);
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    sendJson(res, 200, {
      ok: true,
      discordReady,
      current: pending ? { title: pending.title, chapter: pending.chapter } : null
    });
    return;
  }

  if (req.method === "POST" && req.url === "/activity") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");

        if (!data.title && !data.chapter) {
          sendJson(res, 400, { ok: false, error: "Missing activity data" });
          return;
        }

        await receiveActivity(data);
        sendJson(res, 200, { ok: true, discordReady });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
    });

    return;
  }

  if (req.method === "POST" && req.url === "/clear") {
    clearActivity("tab ditutup").finally(() => sendJson(res, 200, { ok: true }));
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logErr(`Port ${config.port} sudah dipakai. Kemungkinan bridge sudah jalan. Keluar.`);
    process.exit(0);
  }
  logErr("[Bridge] Server error:", err.message);
  process.exit(1);
});

server.listen(config.port, "127.0.0.1", () => {
  log(`[Bridge] Listening on http://127.0.0.1:${config.port}`);
  connectDiscord();
});

// ---------- keep alive & shutdown ----------
process.on("unhandledRejection", (err) => logErr("[Unhandled]", err?.message || err));
process.on("uncaughtException", (err) => logErr("[Uncaught]", err?.message || err));

async function shutdown() {
  try { await clearActivity("shutdown"); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
