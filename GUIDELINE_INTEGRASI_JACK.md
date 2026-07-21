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

- [x] **Fase 0 — Persiapan sisi dashboard (±1 hari)**
  - Commit/amankan working tree yang menggantung (~37 modified + puluhan untracked), CI hijau.
  - Deploy Smart AI HSE ke host sendiri dengan HTTPS (`deploy/deploy_remote.sh` sudah ada).
  - Terbitkan service token khusus Jack, role `operator`.
  - Selesai 2026-07-19: deploy production sukses ke VPS eMIND (103.127.98.173, path `/srv/hosting/apps/vision`, persistence `/srv/hosting/apps/vision-data`) pada commit `160b4cd`. HTTPS via Traefik + Cloudflare edge (domain `vision.axometrix.com`). Perbaikan saat deploy: compose meneruskan env auth (`ad23d6ff`) dan `HOST=0.0.0.0` di Dockerfile.backend (`160b4cd`) karena default hardened `127.0.0.1` membuat nginx 502. Verifikasi lulus: health OK, tanpa token 401, token operator 200, viewer 200, operator ke endpoint admin 403 (RBAC aktif), frontend 200, data lama utuh (2 media sources). Token Jack = `AUTH_TOKEN_OPERATOR` di `.env.production` (lokal & server). Residual infra (di luar repo, aksi owner di Cloudflare): (1) token API Cloudflare untuk DNS challenge Traefik invalid — renewal cert SEMUA domain di VPS gagal; buat token baru (Zone:DNS:Edit) dan update env container traefik; (2) Cloudflare managed challenge memblokir klien API non-browser — buat WAF skip rule untuk `vision.axometrix.com/api/*` sebelum Fase 1 agar Jack bisa memanggil API via domain; (3) UI perlu bootstrap session sekali via POST `/api/auth/session` (exchange key + token) sampai login flow Fase A dibangun.
  - Progress 2026-07-18: working tree selesai di-commit sebagai 8 commit logis (migrasi Supabase, modularisasi server, test suite backend, kontrak API + code splitting frontend, CI/tooling QA, dokumentasi, upgrade Vite 6.4.3, fix test hermetis) dan di-push ke `origin/main`. Quality gate CI hijau penuh pada commit `c39f2474` setelah 5 iterasi perbaikan nyata: test bergantung data runtime lokal → hermetis; kerentanan high Vite → upgrade 6.4.3 + audit bersih; env Supabase absen di CI (frontend test runner + Playwright webServer) → fixture env; tag `trivy-action` salah format → `v0.36.0`; base image stale/EOL (`nginx:1.27-alpine`, `node:20`) → `nginx:1.31-alpine` + `node:22` + `ignore-unfixed` Trivy; HIGH vulns fixable image backend (setuptools venv, npm/corepack bundled) → upgrade setuptools + strip npm dari image final. Residual Fase 0: deploy HTTPS ke host (butuh alamat host + SSH key dari owner) dan penerbitan `AUTH_TOKEN_OPERATOR` untuk Jack di env host tersebut. Catatan: isu `server/data` ter-track git sudah diflag sebagai task terpisah.
- [~] **Fase 1 — Skill read-only di Jack (±1 hari)** — IMPLEMENTASI SELESAI 2026-07-20 (commit Jack `9073f8d`). `skills/cv_dashboard/` (SKILL.md + cv_dashboard.py + __init__) dengan 4 tools `cv_daily_summary`, `cv_list_sources`, `cv_source_latest`, `cv_job_status`; config `CV_DASHBOARD_BASE_URL/TOKEN/SIMULATE` di `config.py` + `.env.example`; mode simulate; unit test 13 kasus; suite Jack 119/119. Terdaftar di ROADMAP Jack (`WP-CV-DASHBOARD`) + spec `docs/spec-cv-dashboard-skill.md` + INDEX. Uji live via CLI (skill → edge → API produksi) LULUS: 11 run, 69 event, 2 source nyata. **Residual (aksi owner):** isi `CV_DASHBOARD_TOKEN` di `.env` VPS Jack (= `AUTH_TOKEN_OPERATOR`), `./sync.sh`, lalu uji dari Telegram.
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

## 4b. Rancangan Skill `cv_dashboard` (Fase 1, read-only) — disusun 2026-07-19

Lokasi implementasi: repo Jack `~/qmindstudio/jackartha/skills/cv_dashboard/`. Konvensi terverifikasi dari skill existing (`kurs_uang`, `db_admin`, `gambar_ai`): folder `skills/<nama>/` berisi `SKILL.md` (spec compact: "Kapan menggunakan / Kapan TIDAK / contoh `<tool_call>`") + `<nama>.py` (dict `TOOLS` + `execute(tool_name, params) -> str` + helper `_`). Output skill = string. Secret via `.env` root → di-expose di `config.py` (`os.getenv`), skill `from config import ...`. HTTP pakai `requests`.

**Config baru di Jack** (`.env` + `config.py`):
- `CV_DASHBOARD_BASE_URL` = `https://vision.axometrix.com/api` (atau host origin unproxied bila jalur Cloudflare dilewati — lihat §6).
- `CV_DASHBOARD_TOKEN` = nilai `AUTH_TOKEN_OPERATOR` dari `.env.production` dashboard.
- `CV_DASHBOARD_SIMULATE` = `true|false` (default false) untuk mode fixture tanpa server.

**Tools Fase 1 (read-only) → endpoint riil dashboard** (semua kirim header `Authorization: Bearer {CV_DASHBOARD_TOKEN}`, timeout ~15s):
| Tool | Endpoint | Guna |
|---|---|---|
| `cv_daily_summary` | `GET /dashboard-summary` | ringkasan: total source, run, event pelanggaran, run terakhir |
| `cv_list_sources` | `GET /media-sources` | daftar kamera/upload + status |
| `cv_source_latest` | `GET /dashboard-summary/source/{id}/latest-analysis` | analisis terbaru satu source |
| `cv_job_status` | `GET /analysis/{moduleKey}/jobs/{id}` | status job analisis (untuk Fase 2) |

**Kontrak API — SELESAI 2026-07-20 (commit `595babfa`):** `GET /dashboard-summary` dan `GET /dashboard-summary/source/:id/latest-analysis` kini terdokumentasi di `docs/openapi.json` (+ response schema `DashboardSummary`/`SourceLatestAnalysis`), `apiContract.ts` di-regen, dan validator naik ke 22 required paths. Contract drift ditutup — Jack boleh bergantung pada kedua endpoint ini sebagai kontrak resmi.

**Error handling:** setiap tool kembalikan string Indonesia yang jelas untuk 401/403/timeout/connection-refused (jangan bocorkan detail internal). Nilai numerik diformat ramah.

**`/simulate` (aturan Jack — fitur dependent inbound eksternal wajib punya mode simulasi):** bila `CV_DASHBOARD_SIMULATE=true`, `execute()` kembalikan fixture statis (bentuk sama dengan respons riil) tanpa HTTP call, agar bisa uji brain + SKILL.md tanpa server dashboard.

**Urutan kerja Fase 1:** (1) ~~tambah 2 path ke OpenAPI dashboard + regen types~~ SELESAI 2026-07-20 (`595babfa`). (2) Daftarkan work package di `ROADMAP.md` Jack (aturan CLAUDE.md Jack — ROADMAP-first). (3) ~~Bereskan §6 (Cloudflare) agar API reachable dari VPS Jack~~ SELESAI 2026-07-20 (WAF skip rule, Blocker 1). (4) Implement skill + `/simulate`. (5) Uji: `/simulate` dulu, lalu live via token operator.

## 6. Runbook Cloudflare (aksi owner — blocker Fase 1)

Domain `vision.axometrix.com` proxied Cloudflare (zone `axometrix.com`). Traefik shared-stack `hosting-traefik-1` melayani banyak zona lain di VPS (beritapers.id, geosyndo.co.id, medlink, dll) — hati-hati, perubahan traefik berdampak ke semua.

**Blocker 1 — challenge blokir `/api/*` — SELESAI 2026-07-20.** Cloudflare tidak lagi menampilkan legacy IP Access Rules (diarahkan ke WAF custom rule). Solusi yang dipakai: WAF Custom Rule "Skip challenge for API" (order 1, Active) dengan expression `(starts_with(http.request.uri.path, "/api/") and http.host eq "vision.axometrix.com")`, action **Skip**, semua komponen dicentang termasuk Browser Integrity Check + Security Level. Basis path (bukan IP) karena `/api/*` sudah dilindungi token operator, sekaligus memudahkan verifikasi dari mana saja. Terverifikasi via edge: `/api/health`+token → 200 (sebelumnya 403 "Just a moment"), `/api/dashboard-summary`+token → 200, tanpa token → 401 (auth tetap jalan). Jack kini bisa panggil API via `https://vision.axometrix.com/api/...`.

**Blocker 2 — token DNS Cloudflare Traefik invalid (higiene, bukan blocker langsung).** Log traefik: `Invalid access token` (403/429) → renewal Let's Encrypt SEMUA domain VPS gagal; cert `vision.axometrix.com` masih default Traefik (aman karena cert edge Cloudflare menutupi). Perbaikan: Cloudflare → My Profile → API Tokens → Create Token → template "Edit zone DNS" → Zone:DNS:Edit untuk SEMUA zona yang dikelola Traefik → update env `CF_DNS_API_TOKEN`/`CF_API_TOKEN` di stack traefik → restart `hosting-traefik-1`.

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
