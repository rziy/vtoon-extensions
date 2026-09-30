(() => {
  const SITE_NAME = "VoraToon";

  // Harus sama dengan DEFAULTS di background.js dan popup.js
  const DEFAULTS = {
    enabled: true,
    hideTitle: false,
    idleMinutes: 10,
    useCover: false
  };

  let settings = { ...DEFAULTS };

  function clean(text) {
    return (text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  function titleFromSlug(slug) {
    if (!slug) return "Unknown title";

    return safeDecode(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  // ---------- Judul asli dari halaman ----------
  // Slug URL menghilangkan tanda baca (Academy's -> academys), jadi kita cari
  // judul aslinya di halaman. Kandidat HANYA diterima kalau cocok dengan slug
  // (abaikan huruf besar/kecil dan tanda baca), supaya tidak salah ambil teks lain.
  function normalize(text) {
    return clean(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "");
  }

  function variantsOf(text) {
    const whole = clean(text);
    if (!whole) return [];

    const noSite = whole.replace(/\s*[|–—•·-]\s*VoraToon.*$/i, "");
    const stripChapter = (t) =>
      t
        .replace(/^chapter\s*[\d.]+\s*[-–—:|]?\s*/i, "")
        .replace(/\s*[-–—:|]?\s*chapter\s*[\d.]+.*$/i, "");
    const pieces = whole.split(/\s+[|–—•·]\s+|\s+-\s+/).map(clean);

    return [
      whole,
      noSite,
      stripChapter(whole),
      stripChapter(noSite),
      ...pieces
    ].filter(Boolean);
  }

  function pickTitle(slugText, candidates) {
    const target = normalize(slugText);
    if (!target) return null;

    for (const candidate of candidates) {
      for (const variant of variantsOf(candidate)) {
        if (variant.length > 200) continue;

        const norm = normalize(variant);
        if (norm === target) return variant;

        // Slug yang sangat panjang biasanya terpotong oleh situs.
        if (target.length >= 100 && norm.startsWith(target)) return variant;
      }
    }

    return null;
  }

  function collectCandidates(slugRaw) {
    const out = [];

    try {
      for (const sel of [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]'
      ]) {
        const el = document.querySelector(sel);
        if (el) out.push(el.getAttribute("content"));
      }

      out.push(document.title);

      document.querySelectorAll("h1, h2").forEach((el) => {
        out.push(el.textContent);
      });

      const seriesPath = "/series/" + safeDecode(slugRaw);
      document.querySelectorAll('a[href*="/series/"]').forEach((a) => {
        let path = "";
        try {
          path = safeDecode(new URL(a.href, location.href).pathname).replace(/\/+$/, "");
        } catch {
          return;
        }
        if (path === seriesPath) {
          out.push(a.textContent);
          out.push(a.getAttribute("title"));
          out.push(a.getAttribute("aria-label"));
        }
      });
    } catch {
      // DOM belum siap, pakai slug saja
    }

    return out.filter(Boolean);
  }

  function resolveTitle(slugRaw) {
    const fromSlug = titleFromSlug(slugRaw);
    return pickTitle(safeDecode(slugRaw), collectCandidates(slugRaw)) || fromSlug;
  }

  // ---------- Cover (eksperimental) ----------
  // Hanya memakai og:image kalau URL-nya pendek dan dari domain VoraToon.
  // Cover asli di situs memakai URL bertanda tangan yang panjang, yang
  // ditolak Discord, jadi tidak dipakai.
  function extractCover() {
    try {
      const og = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");

      if (
        og &&
        og.length <= 256 &&
        /^https:\/\/([a-z0-9-]+\.)*voratoon\.(com|id)\//i.test(og) &&
        !/title=Baca\+Komik/i.test(og)
      ) {
        return og;
      }
    } catch {
      // abaikan
    }
    return null;
  }

  function getPageInfo() {
    const path = location.pathname.replace(/\/+$/, "") || "/";

    // HOME
    if (path === "/") {
      return {
        pageType: "home",
        title: "Home",
        chapter: null,
        seriesUrl: null,
        cover: null
      };
    }

    // READER: /series/<slug>/chapter/<n>
    const readerMatch = path.match(
      /^\/series\/([^/]+)\/chapter\/([^/]+)$/i
    );

    if (readerMatch) {
      const slug = readerMatch[1];
      const chapterNumber = safeDecode(readerMatch[2]);

      return {
        pageType: "reader",
        title: resolveTitle(slug),
        chapter: `Chapter ${chapterNumber}`,
        seriesUrl: `${location.origin}/series/${slug}`,
        cover: extractCover()
      };
    }

    // DETAIL SERIES: /series/<slug>
    const seriesMatch = path.match(/^\/series\/([^/]+)$/i);

    if (seriesMatch) {
      const slug = seriesMatch[1];

      return {
        pageType: "series",
        title: resolveTitle(slug),
        chapter: null,
        seriesUrl: `${location.origin}/series/${slug}`,
        cover: extractCover()
      };
    }

    // FALLBACK
    return {
      pageType: "other",
      title: clean(document.title) || "VoraToon",
      chapter: null,
      seriesUrl: null,
      cover: null
    };
  }

  function detect() {
    const info = getPageInfo();

    return {
      site: SITE_NAME,
      pageType: info.pageType,
      title: info.title,
      chapter: info.chapter,
      url: location.href,
      seriesUrl: info.seriesUrl,
      cover: info.cover,
      timestamp: Date.now()
    };
  }

  // ---------- Settings ----------
  try {
    chrome.storage.local
      .get(DEFAULTS)
      .then((s) => {
        settings = { ...DEFAULTS, ...s };
      })
      .catch(() => {});

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const key of Object.keys(changes)) {
        settings[key] = changes[key].newValue ?? DEFAULTS[key];
      }
    });
  } catch {
    // konteks extension tidak valid
  }

  // ---------- Kirim ke background ----------
  let previous = "";
  let idle = false;
  let lastInput = Date.now();

  function safeSend(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // Extension di-reload/update: content script lama sudah tidak valid.
    }
  }

  function sendActivity(force = false) {
    if (idle) return;

    const payload = detect();

    const fingerprint = JSON.stringify({
      pageType: payload.pageType,
      title: payload.title,
      chapter: payload.chapter,
      url: payload.url
    });

    if (!force && fingerprint === previous) return;

    previous = fingerprint;
    safeSend({ type: "VORATOON_ACTIVITY", payload });
  }

  // ---------- Idle ----------
  function onInput() {
    lastInput = Date.now();
    if (idle) {
      idle = false;
      sendActivity(true);
    }
  }

  for (const ev of ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart"]) {
    window.addEventListener(ev, onInput, { passive: true, capture: true });
  }

  // Heartbeat tiap 30 detik: kabari bridge bahwa tab masih aktif,
  // atau hapus presence kalau sudah idle terlalu lama.
  function heartbeat() {
    const limit = (Number(settings.idleMinutes) || 0) * 60000;

    if (limit <= 0) {
      idle = false;
    } else if (Date.now() - lastInput > limit) {
      if (!idle) {
        idle = true;
        safeSend({ type: "VORATOON_IDLE" });
      }
      return;
    }

    sendActivity(true);
  }

  // Background meminta kirim ulang (misalnya setelah pengaturan diubah)
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "RESEND") sendActivity(true);
    });
  } catch {
    // abaikan
  }

  // Initial scan
  sendActivity();
  setInterval(heartbeat, 30000);

  // VoraToon adalah SPA, jadi pantau perubahan halaman.
  const observer = new MutationObserver(() => {
    clearTimeout(window.__voratoonPresenceTimer);

    window.__voratoonPresenceTimer = setTimeout(() => sendActivity(), 700);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Deteksi perubahan URL tanpa reload penuh.
  let lastUrl = location.href;

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      previous = "";

      setTimeout(() => sendActivity(), 500);
    }
  }, 1000);
})();
