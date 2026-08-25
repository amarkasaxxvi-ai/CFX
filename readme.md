# CFX — Time & Price

Terminal trading statis (tanpa backend/build step) — HTML + CSS + vanilla JS.
Terhubung ke MT5 lewat WebSocket bridge, chart lewat TradingView embed, dan
scanner zona ICT/SMC (`js/ict-zones.js`) yang jalan dari data candle asli.

## Struktur file

```
index.html          Markup utama (semua "halaman" di-toggle lewat JS, bukan multi-page)
style.css            Semua styling — token warna/spacing di :root, cari via komentar §N
script.js            Semua logic — state, MT5 bridge, chart, journal, dst.
js/ict-zones.js      Detektor zona ICT/SMC (order block, FVG, liquidity, dealing range)
manifest.json        PWA manifest — biar bisa "Add to Home Screen"
icons/icon-192.png   Ikon PWA (192×192)
icons/icon-512.png   Ikon PWA (512×512)
```

Nggak ada database atau server. Data akun/journal/preferensi user disimpan di
`localStorage` browser masing-masing (lihat kunci `shelen_*` di script.js —
namanya sengaja dipertahankan biar setting user lama nggak hilang pas update,
bukan berarti masih "Shelen").

## Menjalankan / deploy

Static file — upload apa adanya ke Vercel/Netlify/hosting statis mana pun.
Kalau di-deploy ke root domain, `manifest.json` dan folder `icons/` harus ada
di root yang sama dengan `index.html` (path di manifest pakai `/manifest.json`
dan `/icons/...`).

## Live candle data untuk zona ICT/SMC

`js/ict-zones.js` bangun candle dari tick harga live secara default — jalan
tanpa setup tambahan, tapi nggak ada histori dari sebelum halaman dibuka.
Untuk histori instan, isi API key TwelveData **asli** (bukan `demo`) di
konstanta `TD_HISTORY_KEY` di baris atas file itu.

## Yang perlu diisi ulang/dicek sebelum production

- `_url` default MT5 bridge di `script.js` (`ws://localhost:8080`) — ganti ke
  URL bridge production kamu.
- Nomor WhatsApp admin & link broker partner di `index.html` — pastikan masih
  aktif.
- `FOUNDER_EMAIL` (admin/godmode unlock) di `script.js` — logic ini nggak
  disentuh selama rebrand, masih aktif seperti semula.
