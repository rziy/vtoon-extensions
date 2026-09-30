# Changelog

## 3.0.0
- Popup extension: pause, mode privat, idle otomatis, cover (eksperimental).
- Mode privat: judul, chapter, URL, dan cover tidak keluar dari browser.
- Presence dihapus otomatis kalau tab idle (default 10 menit, bisa diatur).
- Dua tombol di halaman chapter: "Open chapter" dan "Open series".
- Badge di ikon extension (OFF / PRV).

## 2.2.0
- Judul diambil dari halaman (bukan hanya slug URL), divalidasi terhadap slug.

## 2.1.0
- Mendukung semua subdomain `*.voratoon.com` (v2, v4, dst.).

## 2.0.0
- Bridge jalan di background dan autostart Windows (`SETUP.bat`).
- Reconnect otomatis ke Discord, heartbeat, clear saat tab ditutup.
- Endpoint `/status` untuk debugging.
