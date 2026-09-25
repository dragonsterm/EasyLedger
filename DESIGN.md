---
version: alpha
name: EasyLedger
description: Nordic minimalist warm accounting design system. Crisp typography, sage greens, and dot-grid canvas for trust and high-density financial clarity.
colors:
  primary: "#252724"
  secondary: "#626B59"
  accent: "#698675"
  page: "#F7F7F2"
  surface: "#FBFBF7"
  surface-raised: "#FCFCF9"
  canvas: "#F0F1EB"
  field: "#FAFAF6"
  outline: "#E5E8DF"
  voice: "#DFE9D8"
  kpi-mint: "#D8E8DF"
  chip-lime: "#E5EDA2"
  warm-note: "#F4F0DC"
  ink-soft: "#30382C"
  muted-strong: "#53584F"
typography:
  h1:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h2:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
  kpi-number:
    fontFamily: 'Roboto, "Segoe UI", Arial, sans-serif'
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-kpi-highlighted:
    backgroundColor: "{colors.kpi-mint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  button-voice:
    backgroundColor: "{colors.voice}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 8px
  button-action:
    backgroundColor: "{colors.chip-lime}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 8px
  banner-warning:
    backgroundColor: "{colors.warm-note}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview

EasyLedger menggabungkan estetika *Nordic Minimalist* dengan nuansa utilitas akuntansi modern (*Warm Paper & Botanical Green*). Desain ini mengutamakan keterbacaan data numerik, rasa aman pedagang (*trust signals*), transparansi sumber transaksi, dan integrasi suara yang tenang (bebas warna neon mencolok).

## Colors

- **Primary / Ink (`#252724`):** Warna teks utama. Tajam dan terbaca jelas pada latar belakang kertas hangat.
- **Page Background (`#F7F7F2`):** Latar belakang halaman off-white bernuansa kertas lembut, mengurangi kelelahan mata.
- **Surface / Cards (`#FBFBF7`):** Kartu putih hangat dengan elevasi halus untuk menampung grafik dan metrik.
- **Accent / Selected (`#698675`):** Hijau sage gelap yang digunakan untuk state kartu terpilih, garis aktif, dan outline fokus.
- **Voice Pill (`#DFE9D8`):** Hijau mint lembut yang menandai area kendali suara AssemblyAI tanpa terkesan agresif.
- **KPI Mint (`#D8E8DF`):** Kartu metrik khusus untuk rasio keberhasilan (contoh: *Complete days*).
- **Chip Lime (`#E5EDA2`):** Aksen tombol aksi penambahan widget (`+ Add widget`) atau highlight status.
- **Warm Note (`#F4F0DC`):** Latar peringatan kontekstual untuk missing price atau celah tanggal.
- **Outline / Border (`#E5E8DF`):** Garis pembatas halus 1px pada semua kartu dan pembatas kolom.

## Typography

Sistem tipografi menggunakan stack netral performa tinggi: `Roboto, "Segoe UI", Arial, sans-serif`.
- **Angka Finansial (KPI Number):** Tebal (`fontWeight: 700`), ukuran besar (`2.25rem`), dengan letter-spacing rapat (`-0.02em`) agar angka terlihat tegas.
- **Label Metrik & Sub-teks:** Ukuran `0.75rem` – `0.875rem` menggunakan warna `var(--muted)` (`#626B59`) untuk membedakan keterangan sekunder dari angka utama.

## Layout

1. **Header Toolbar (Tinggi 76px):**
   - Brand logo di kiri (`EasyLedger` + tagline `Sales, made clear.`).
   - Navigasi tab tengah (`Overview`, `Ledger`, `Dashboard`, `Catalog`).
   - Status sinkronisasi & tombol aksi simpan di kanan.
2. **Sub-header Workspace:**
   - Breadcrumb judul workspace, nama bisnis aktif, mata uang (`IDR`), dan label data.
3. **Control Bar:**
   - Pill interaktif suara (*Ask EasyLedger*), filter dropdown tanggal & produk, tombol `+ Add widget`, dan zoom scale.
4. **Grid Canvas:**
   - Latar belakang dot-grid (`var(--canvas)`) untuk area penempatan kartu widget KPI dan visualisasi grafik ECharts.
5. **Right Drawer (Inspector Panel):**
   - Panel properti widget (lebar ~320px) yang muncul saat kartu diklik untuk memeriksa parameter query, mata uang, dan kelengkapan data.

## Elevation & Depth

Hindari bayangan tebal/hitam (*black drop-shadow*). Gunakan bayangan bernuansa organik:
`box-shadow: 0 3px 8px rgba(56, 69, 46, 0.035);`

## Shapes

- **Kartu Metrik & Panel:** Sudut melengkung halus `border-radius: 12px`.
- **Input & Tombol Kecil:** `border-radius: 8px` atau `4px`.
- **Pill Suara & Tag Status:** `border-radius: 9999px` (Pill shape).

## Components

- **KPI Cards:** Kartu ringkasan angka besar dengan label atas dan status audit di bawah.
- **ECharts SVG Renderers:** Visualisasi grafik garis (*Daily Revenue*) dan grafik batang (*Sales by Product*) yang menyatu tanpa border luar tambahan.
- **Source Transactions Modal:** Pop-up tabel putih bersih yang merinci ID transaksi, produk, jumlah, dan subtotal ketika titik grafik diklik.

## Do's and Don'ts

### Do's:
- Selalu gunakan variabel warna CSS yang telah didefinisikan (`var(--page)`, `var(--surface)`, `var(--selected)`, `var(--outline)`).
- Bedakan secara visual antara hari tanpa data (*gap/null*) dan hari yang dikonfirmasi nol penjualan (*confirmed zero*).
- Berikan state fokus keyboard yang jelas: `outline: 3px solid rgba(105, 134, 117, 0.45)`.
- Selalu tampilkan label mata uang eksplisit (`IDR`) dan status data sampel jika belum terhubung ke database hidup.

### Don'ts:
- Jangan gunakan warna neon terang (misal: merah menyala, ungu terang, biru elektrik) yang merusak harmoni sage green.
- Jangan gunakan bayangan gelap pekat (*dark black shadow*).
- Jangan gunakan font non-standar yang membutuhkan download CDN lambat saat offline.
- Jangan menyembunyikan status kelengkapan pendapatan jika ada harga yang belum diketahui (*unknown price*).
