# GUIDELINE INTEGRASI — Smart AI HSE × System Jack

Disusun: 2026-07-17. Dokumen ini merangkum diskusi perencanaan awal dan menjadi acuan progress menuju dua goal di bawah. Update checkbox + tambahkan catatan progress bertanggal di bawah tiap item (mengikuti konvensi `ROADMAP_TASKLIST.md`).

## 1. Konteks & Goals

- **Smart AI HSE** (repo ini): dashboard computer vision HSE — deteksi pelanggaran keselamatan (no-helmet, safety vest, life vest, working-at-height, red light, dump truck bed open) berbasis YOLO + ffmpeg, backend Express modular, frontend React, Supabase, deploy Docker.
- **System Jack** (`~/qmindstudio/jackartha`): Personal AI Assistant + business automation berbahasa Indonesia; Telegram bot (privat owner), WhatsApp via Baileys, Streamlit dashboard, arsitektur skill Python, deploy VPS via pm2.
- **Goal 1 (internal):** Jack menjadi antarmuka percakapan & notifikasi untuk Smart AI HSE bagi owner via Telegram.
- **Goal 2 (komersial):** Smart AI HSE dijual sebagai value-added System Jack; pelanggan mengakses via **WhatsApp dan web saja** — Telegram khusus owner.

## 2. Keputusan Arsitektur (sudah final)

1. Integrasi **loosely-coupled via REST API** — TIDAK merge codebase. Kontrak = `docs/openapi.json`.
2. **Dua host terpisah.** Beban YOLO/ffmpeg tetap di host Smart AI HSE; VPS Jack hanya melakukan HTTP call (memori pm2 VPS Jack sudah kritis).
3. **Smart AI HSE = source of truth** data CV. Jack tidak menyimpan data CV kecuali marker dedup alert (last-seen event ID).
4. Setelah Jack jadi konsumen, API naik status dari internal → **published**: perubahan endpoint yang dipakai Jack wajib backward-compatible atau di-versioning (dijaga CI `check:api-types` / `validate:api-contract`).
5. **Kebijakan channel:** Telegram = privat owner (panel kendali: monitoring lintas tenant, alert operasional, approval). Pelanggan = WhatsApp (conversational) + web (UI penuh).
6. Auth machine-to-machine: **service token role `operator`** (bukan admin), disimpan sebagai env var di VPS Jack, HTTPS wajib.
7. **Pola async job:** `cv_run_analysis` langsung balikan job ID (tidak blocking); hasil dicek via `cv_job_status` oleh scheduler/perintah susulan.
8. **Snapshot:** Jack download bytes dari signed URL lalu upload ke channel — jangan teruskan URL mentah (ber-expiry).
9. **Identitas di-inject server-side.** `tenant_id`/identitas pemanggil pada tool call WAJIB dibubuhkan kode dari identitas channel terverifikasi, tidak pernah diambil dari teks LLM (pelajaran "tool context injection" di Jack).
10. Tidak ada perubahan konsep inti Smart AI HSE: model YOLO, modul deteksi, ROI/config, model registry, pipeline analisis, UI operator — semua tetap. Jack murni klien API.

## 3. Jalur Internal — owner via Telegram (estimasi total 3–5 hari kerja)

- [ ] **Fase 0 — Persiapan sisi dashboard (±1 hari)**
  - Commit/amankan working tree yang menggantung (~37 modified + puluhan untracked), CI hijau.
  - Deploy Smart AI HSE ke host sendiri dengan HTTPS (`deploy/deploy_remote.sh` sudah ada).
  - Terbitkan service token khusus Jack, role `operator`.
- [ ] **Fase 1 — Skill read-only di Jack (±1 hari)**
  - `skills/cv_dashboard/` dengan tools: `cv_daily_summary`, `cv_latest_violations`, `cv_list_sources`, `cv_job_status`.
  - Daftarkan dulu ke `ROADMAP.md` Jack (aturan CLAUDE.md Jack), sediakan `/simulate` untuk uji tanpa server nyata.
- [ ] **Fase 2 — Aksi tulis (±1 hari)**
  - `cv_run_analysis(mediaSourceId, module)` dengan pola async job ID; kirim snapshot hasil ke Telegram.
- [ ] **Fase 3 — Alert proaktif (±1–2 hari)**
  - Job apscheduler polling ringkasan pelanggaran; dedup last-seen event ID; pelanggaran baru → Telegram + foto.
  - Upgrade ke webhook push dari backend hanya bila polling terbukti tidak cukup.
- [ ] **Fase 4 — Opsional (setelah stabil)**
  - Briefing pagi otomatis berisi ringkasan HSE.
  - Keputusan konsolidasi lapisan LLM (brain Jack vs AI assist dashboard) — putuskan dari pengalaman pakai, bukan sekarang.

## 4. Jalur Komersial — setelah jalur internal stabil

- [ ] **Fase A — Multi-tenancy Smart AI HSE (fondasi jualan, pekerjaan terbesar)**
  - Konsep tenant masuk inti data model: media sources, module configs, analysis history, artifacts, model registry — scoping per pelanggan, ditegakkan di setiap endpoint.
  - Kerjakan BERSAMAAN dengan migrasi persistence JSON → Postgres/Supabase dan login flow sungguhan (residual P0 yang naik jadi prasyarat komersial).
  - **Desain rinci multi-tenancy dibuat saat fase ini dimulai** (kesepakatan 2026-07-17).
- [ ] **Fase B — Channel WhatsApp pelanggan**
  - Mapping nomor WA → tenant di Jack, injected server-side (lihat keputusan #9).
  - Skill `cv_dashboard` yang sama melayani pelanggan dengan scope tenant-nya; service token tunggal tidak cukup — perlu konteks "atas nama tenant X" atau token per tenant.
  - Bridge WA (Baileys) sudah live & stabil per Jul 2026 — transport bukan hambatan.
- [ ] **Fase C — Akses web pelanggan**
  - Opsi termurah: UI dashboard existing dengan akun viewer per tenant. Portal khusus pelanggan dipertimbangkan belakangan.
- Privasi berubah dari kebijakan internal → **komitmen kontraktual** (isolasi data antar pelanggan, retensi jelas) mulai fase A.

## 5. Prasyarat Teknis dari Roadmap Existing (paralel, bukan bagian integrasi)

- Migrasi persistence JSON → database — naik prioritas: prasyarat Fase A.
- Login flow sungguhan (bukan static token exchange) — prasyarat Fase A/C. Catatan: static service token untuk M2M Jack tetap wajar.
- Queue durable (job queue & live monitoring masih in-memory) — bereskan sebelum beban komersial.
- Pisahkan worker analisis Python dari proses API — sebelum skala komersial / kebutuhan real-time.
- Refactor frontend `RunAnalysis.tsx` (~4.800 baris) — jalur paralel, pola sama dengan pemecahan `server/index.js` yang sudah berhasil.

## 6. Backlog Penyempurnaan Konsep Smart AI HSE (hasil review ahli 2026-07-17)

Prioritas masuk roadmap lebih dulu:
1. **Flywheel data:** operator memvalidasi tiap event (valid / false positive) → hasil validasi jadi kandidat dataset retraining. Menentukan akurasi membaik atau memburuk seiring waktu.
2. **Case management pelanggaran:** deteksi → penugasan supervisor → tindak lanjut → verifikasi → tutup kasus. Mengubah produk dari alat monitoring menjadi sistem manajemen keselamatan.

Wajib beres sebelum deployment luas:
3. **Privasi & tata kelola data pekerja** (UU PDP): retensi otomatis, opsi blur wajah, pemisahan akses snapshot vs statistik, audit trail akses bukti.

Menyusul setelah pilot:
4. Metrik ternormalisasi eksposur (pelanggaran per jam-kamera, heatmap area/shift, selaras SMK3/ISO 45001) — bukan hitungan mentah.
5. Verifikasi dua tahap: YOLO sebagai kandidat → VLM (AI assist existing) sebagai verifikator otomatis untuk kasus confidence menengah.
6. Camera health & drift monitoring: deteksi view berubah dari baseline, audit presisi lapangan per kamera.

Catatan sinergi: butir 1 & 2 cocok berantarmuka lewat Jack (validasi event dan penugasan tindak lanjut via chat).

## 7. Status & Langkah Berikutnya

- Status 2026-07-17: perencanaan selesai; belum ada fase yang dimulai.
- **Langkah berikutnya: Fase 0** — membereskan working tree Smart AI HSE.
- Keputusan yang sengaja ditunda: desain rinci multi-tenancy (saat Fase A), konsolidasi LLM (Fase 4), webhook push (bila polling tak memadai).
