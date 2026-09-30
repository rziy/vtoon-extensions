# VoraToon Discord Presence

Tampilkan manga/manhwa yang sedang kamu baca di [VoraToon](https://v4.voratoon.com/)
sebagai **Discord Rich Presence**. Jalan di background, nyala otomatis saat login Windows.

> Proyek tidak resmi. Tidak berafiliasi dengan VoraToon maupun Discord.

```
Playing VoraToon
Reading Magic Academy's Genius Blinker
Chapter 1
[Open chapter] [Open series]
```

## Fitur

- Judul dan chapter terdeteksi otomatis, timer reset tiap ganti chapter.
- **Mode privat**: hanya tampil "Reading on VoraToon", tanpa judul, chapter, atau tombol.
- **Idle otomatis**: presence hilang kalau tab tidak disentuh (default 10 menit).
- **Pause** kapan saja dari popup extension.
- Tombol "Open chapter" dan "Open series" untuk teman kamu.
- Reconnect otomatis kalau Discord di-restart.
- Jalan di background tanpa jendela terminal, autostart saat login Windows.
- Cover manga (eksperimental, lihat catatan di bawah).

## Cara kerja

```
Browser (extension)  --HTTP lokal-->  bridge (Node.js)  --IPC-->  Discord Desktop
   membaca URL halaman               127.0.0.1:1738              Rich Presence
```

Semua komunikasi hanya di komputer kamu (`127.0.0.1`). Tidak ada token Discord atau bot
yang dipakai, dan tidak ada data yang dikirim ke server lain.

## Instalasi (Windows)

Butuh: [Node.js](https://nodejs.org), Discord Desktop (Stable/PTB/Canary), Chrome atau Brave.

1. Download repo ini (Code, Download ZIP) atau `git clone`, simpan di folder permanen.
2. Buat aplikasi di [Discord Developer Portal](https://discord.com/developers/applications),
   salin **Application ID**, lalu isi `clientId` di `bridge/config.js`.
   Nama aplikasi itulah yang tampil sebagai "Playing ...". Tidak butuh bot token.
   (Application ID bukan rahasia, aman ada di repo publik.)
3. Double-click **`SETUP.bat`**. Ia menginstal dependency, memasang autostart, dan menjalankan
   bridge di background.
4. Buka `chrome://extensions` (Brave: `brave://extensions`), aktifkan **Developer mode**,
   klik **Load unpacked**, lalu pilih folder `extension`.
5. Buka VoraToon dengan Discord terbuka.

Setelah itu tidak ada yang perlu diklik lagi.

## Pengaturan (klik ikon extension)

| Pengaturan | Fungsi |
| --- | --- |
| Presence aktif | Matikan untuk pause total dan langsung menghapus presence |
| Mode privat | Sembunyikan judul, chapter, dan tombol |
| Hapus saat idle | Hapus presence kalau tab tanpa aktivitas (5 sampai 60 menit, atau tidak pernah) |
| Cover manga | Eksperimental, lihat di bawah |

Badge di ikon: `OFF` = di-pause, `PRV` = mode privat. Titik warna di popup menunjukkan
status bridge dan Discord.

## Skrip

| File | Fungsi |
| --- | --- |
| `SETUP.bat` | Install dependency, pasang autostart, jalankan bridge |
| `START-NOW.bat` | Jalankan/restart bridge di background |
| `STOP.bat` | Hentikan bridge |
| `UNINSTALL-AUTOSTART.bat` | Hapus autostart dan hentikan bridge |

Log bridge ada di `bridge/bridge.log`.

## Troubleshooting

- Buka `http://127.0.0.1:1738/status`:
  - Tidak bisa dibuka: bridge belum jalan. Jalankan `START-NOW.bat`, cek `bridge/bridge.log`.
  - `discordReady:false`: Discord Desktop belum terbuka (bridge coba konek lagi tiap 5 detik).
  - `current:null` padahal sedang membuka VoraToon: extension belum aktif di tab itu.
    Cek `chrome://extensions`, reload extension, lalu refresh tab dengan Ctrl+F5.
- Di Discord: Settings, Activity Privacy, aktifkan "Share your detected activities".
- Jangan buka Discord Stable dan Canary bersamaan, presence bisa masuk ke yang tidak kamu lihat.
- Tombol tidak terlihat di profil kamu sendiri. Itu bawaan Discord, hanya terlihat oleh orang lain.
- Tulisan "Playing" dan nama aplikasi adalah bawaan Discord untuk semua Rich Presence lokal.

### Catatan cover (eksperimental)

Cover asli di situs memakai URL bertanda tangan yang panjang, sedangkan Discord hanya menerima
URL gambar sekitar 256 karakter. Karena itu opsi ini hanya memakai `og:image` halaman kalau
URL-nya pendek dan dari domain VoraToon. Kalau situs tidak menyediakannya, tampilan tetap
memakai ikon aplikasi. Opsi ini mati secara default.

## Kustomisasi

- `bridge/config.js`: `clientId`, `port`, `largeImageKey`, `showButton`.
- Judul diambil dari halaman (h1, og:title, judul tab, breadcrumb) dan hanya dipakai kalau
  cocok dengan slug URL (huruf besar/kecil dan tanda baca diabaikan). Kalau tidak cocok,
  dipakai judul dari slug. Lihat `resolveTitle` di `extension/content.js`.
- Kalau situs mengganti struktur URL, ubah pola di `getPageInfo()` (`extension/content.js`).

## Pengembangan

```bash
cd bridge
npm install
npm start        # node server.js --voratoon-bridge
```

Muat ulang extension di `chrome://extensions` setelah mengubah file di `extension/`.

## Lisensi

[MIT](LICENSE)
