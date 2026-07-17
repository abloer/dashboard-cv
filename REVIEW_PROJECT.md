# REVIEW PROJECT - Dashboard Computer Vision

Tanggal review: 2026-05-13

Reviewer perspective: Senior Principal Engineer, production-grade / enterprise-level review.

## 1. Ringkasan Umum

Project ini adalah dashboard Computer Vision untuk operasional HSE/PPE/Operations: manajemen media source, setup area/ROI, eksekusi analisis video, live monitoring, model registry, output data, dan deployment container. Sangat bagus bahwa project sudah memiliki pemisahan domain di frontend (`src/lib`, `src/hooks`, `src/pages`), validasi payload backend dengan Zod, job queue sederhana untuk analisis, Docker deployment, dan dokumentasi deploy awal. Untuk level prototype/hackathon menuju pilot operasional, fondasinya cukup kuat dan terlihat banyak effort senior dalam menyatukan UI, API, Python analysis pipeline, dan persistence runtime.

Namun untuk standar production-grade enterprise, area paling kritis ada pada security boundary, persistence/data integrity, observability, dan ukuran kompleksitas modul. Backend saat ini masih berupa satu file besar sekitar 5.485 baris, banyak state ditulis ke JSON file lokal secara synchronous, endpoint analisis menerima absolute path dari client, CORS terbuka, dan Supabase RLS write policy masih public. Risiko jangka panjangnya adalah data corruption saat concurrent write, attack surface besar pada video/RTSP/path processing, sulit di-scale horizontal, dan maintenance cost meningkat cepat saat modul CV bertambah.

## 2. Rating Keseluruhan

**6.5 / 10**

Penilaian ini bukan karena project tidak fungsional. Build production berhasil dan fitur inti cukup luas. Rating tertahan karena beberapa risiko production masih fundamental: endpoint backend belum memiliki autentikasi/otorisasi yang jelas, data layer runtime belum durable/transactional, policy database terlalu permisif, test coverage hampir belum ada, dan beberapa halaman memiliki kompleksitas file yang sangat tinggi. Dengan hardening 2-4 sprint, project ini bisa naik ke level pilot production yang jauh lebih aman dan maintainable.

## 3. Critical Issues

1. **Backend API belum memiliki authentication dan authorization.**

   Evidence: `server/index.js:14` memakai `cors()` default terbuka, lalu banyak endpoint mutasi seperti upload video, media source CRUD, model registry, AI assist config, dan run analysis diekspos tanpa middleware auth. Ini penting karena endpoint seperti `/analysis/upload-video`, `/analysis/source-preview`, `/media-sources`, dan `/models/*` dapat mengubah state atau memicu workload berat. Cara memperbaikinya: tambahkan middleware auth berbasis JWT/session, role-based access control untuk operator/admin, origin allowlist untuk CORS, dan audit log untuk aksi mutasi.

2. **Endpoint analisis dan preview menerima path/source dari client terlalu bebas.**

   Evidence: `/analysis/video-preview` menerima `videoPath` lalu langsung memanggil `ffprobe/ffmpeg` setelah hanya cek `fileExists` (`server/index.js:3781-3827`). Endpoint job analisis juga menerima `videoPath` dan `modelPath` dari request sebelum membuat command args (`server/index.js:5088-5106`). Untuk `/analysis/source-preview`, input `source` langsung dipakai sebagai input ffmpeg (`server/index.js:3885-3893`). Walaupun `execFile` mengurangi command injection, risiko SSRF ke RTSP/HTTP internal, local file probing, pembacaan path sensitif, dan resource exhaustion masih tinggi. Cara memperbaikinya: gunakan ID registry, bukan raw absolute path; allowlist scheme (`rtsp`, `file` lokal managed upload only); validasi realpath harus berada di `uploadRoot`, `models`, atau persistence directory yang disetujui; tolak private network target jika source URL eksternal; batasi durasi, ukuran, codec, dan concurrency.

3. **Supabase RLS write policy masih public.**

   Evidence: migration `supabase/migrations/20260205121000_ut_hackathon_rls_write.sql:3-51` membuat public insert/update dengan `WITH CHECK (true)` dan `USING (true)` untuk tabel utama. Ini bertentangan dengan enterprise security baseline karena anon key bisa menulis data jika policy aktif. Cara memperbaikinya: hapus public write policy, gunakan service role hanya di backend trusted, atau gunakan policy berbasis `auth.uid()`, role claim, dan tenant/project scope. Tambahkan migration rollback/hardening eksplisit.

4. **Persistence runtime berbasis JSON file synchronous rentan race condition dan data loss.**

   Evidence: `appendAnalysisHistory` membaca seluruh JSON, `unshift`, lalu `writeFileSync` (`server/index.js:1128-1137`). Pola serupa dipakai untuk media registry, module configs, datasets, training jobs, versions, evaluations, benchmarks. Ini penting karena upload, monitoring interval, dan job completion dapat berjalan berdekatan; tanpa lock/transaction, update bisa saling menimpa. Cara memperbaikinya: pindahkan state operasional ke database transactional (Postgres/Supabase) atau minimal gunakan append-only log + atomic write + file lock. Untuk production, database adalah opsi yang lebih tepat.

5. **Tidak ada automated test suite yang memadai untuk API, UI flow, dan analysis orchestration.**

   Evidence: `package.json:6-12` hanya menyediakan `dev`, `build`, `lint`, `preview`, dan script analisis; tidak ada `test`. README juga menyatakan testing manual. Untuk sistem keselamatan/HSE, regressions pada rule engine, polling job, parsing report, dan UI operator sangat riskan. Cara memperbaikinya: tambahkan unit tests untuk lib/hooks, integration tests untuk backend endpoints dengan fixture video kecil, dan Playwright smoke tests untuk flow utama.

## 4. Major Improvements

1. **Pisahkan backend monolith menjadi modul bounded context.**

   `server/index.js` sudah mencapai sekitar 5.485 baris. Ini membuat review, testing, ownership, dan perubahan fitur menjadi mahal. Saya sarankan memecah menjadi `routes/`, `services/`, `repositories/`, `schemas/`, `jobs/`, dan `analysis-runners/`. Mulai dari ekstraksi tanpa mengubah behavior: media sources, module configs, model registry, analysis jobs, AI assist, dan sync.

2. **Perkuat kontrak API antara frontend dan backend.**

   Frontend memiliki type manual seperti `src/lib/noHelmetAnalysis.ts:122-175`, tetapi backend schema Zod hidup terpisah. Risiko jangka panjangnya adalah contract drift. Pertimbangkan shared OpenAPI spec atau shared Zod schema package, lalu generate client types. Ini juga membantu dokumentasi API dan test contract.

3. **Code splitting frontend perlu dilakukan.**

   `npm run build` berhasil, tetapi menghasilkan bundle JS utama sekitar **1,104.17 kB** minified (**276.32 kB gzip**) dan Vite memberi warning chunk > 500 kB. Karena `src/App.tsx:7-24` mengimport semua page secara eager, halaman berat seperti `RunAnalysis` dan `Models` ikut masuk initial bundle. Cara memperbaikinya: gunakan `React.lazy` + route-level `Suspense`, pisahkan vendor chunks untuk `recharts`, Radix, dan halaman model/analysis.

4. **React Hook warnings perlu dibereskan sebelum merge besar berikutnya.**

   `npm run lint` selesai tanpa error, tetapi menghasilkan 11 warning, terutama missing dependency pada `NoHelmetAnalysis.tsx` dan `RunAnalysis.tsx`. Ini penting karena job polling, queue runner, dan saved config rentan stale closure. Cara memperbaikinya: stabilkan callback dengan `useCallback`, pisahkan effect per concern, gunakan refs hanya untuk state yang memang tidak perlu trigger render, dan tambahkan dependency lengkap.

5. **Konfigurasi lint belum mengabaikan virtual environment.**

   Evidence: lint ikut membaca `.venv-analysis/lib/python3.11/site-packages/...` walaupun `eslint.config.js:8` hanya ignore `dist`, `pb_data`, `server`, dan `supabase`. Ini membuat lint lambat, noisy, dan tidak deterministik. Tambahkan ignore untuk `.venv*`, `runtime-analysis`, `node_modules`, dan generated artifacts.

6. **Data model Supabase masih beraroma legacy/prototype.**

   Evidence: tabel seperti `"VIDEO_ANALITYC"` memiliki typo dan uppercase quoted identifiers (`supabase/migrations/20260205120000_ut_hackathon_schema.sql:3-15`). Ini menyulitkan query, typing, migration, dan maintainability. Pertimbangkan schema baru dengan naming konsisten snake_case, explicit `not null`, timestamp audit, status enum, tenant/project key, dan migration path dari schema lama.

7. **Observability perlu naik kelas.**

   Saat ini logging terutama `console.warn/error/log`. Belum terlihat structured log, request id, metrics job duration, queue depth, per-module failure rate, atau tracing ffmpeg/Python analysis. Untuk production, tambahkan pino/winston JSON logger, middleware request id, metrics endpoint Prometheus, dan job lifecycle events.

8. **Endpoint static analysis output perlu access control dan retention policy.**

   Evidence: `app.use("/analysis-output", express.static(analysisOutputRoot))` di `server/index.js:954`. Ini praktis untuk demo, tetapi production perlu akses berbasis role, expiry token/signed URL, dan redaction strategy karena snapshot bisa memuat orang, lokasi tambang, atau informasi operasional sensitif.

## 5. Minor Improvements / Suggestions

1. Update `README.md` agar tidak lagi berisi placeholder Lovable URL (`README.md:16-18`, `README.md:45-55`) dan tambahkan arsitektur runtime yang aktual.

2. Nama package masih generic `vite_react_shadcn_ts` (`package.json:2`). Ganti menjadi nama domain project agar jelas di CI/artifact.

3. Tambahkan `.env` validation di frontend dan backend. Saat ini Supabase client dibuat langsung dari env (`src/integrations/supabase/client.ts`) tanpa fail-fast message yang jelas jika env kosong.

4. Tambahkan confirmation dialog untuk destructive actions seperti delete media source. UI sudah punya toast, tetapi aksi delete production sebaiknya punya konfirmasi dan audit trail.

5. Form upload perlu validasi client-side untuk MIME, extension, dan ukuran sebelum mengirim file 1GB ke backend.

6. Pertimbangkan pagination/virtualization untuk tabel media source, analysis output, model datasets, dan job history agar UI tetap responsif saat data bertambah.

7. Dokumentasikan lifecycle job: queued, running, completed, failed, retention 50 job, serta konsekuensi restart backend terhadap in-memory job state.

8. Tambahkan security headers di nginx/backend: CSP, `X-Content-Type-Options`, `Referrer-Policy`, dan cache policy untuk output sensitif.

## 6. Positive Highlights

1. **Sangat bagus** bahwa backend memakai Zod untuk banyak payload. Ini membantu menjaga shape input dan membuat error validasi lebih eksplisit.

2. **Elegan** bahwa frontend memakai React Query untuk server-state (`src/hooks/useMediaRegistry.ts`, `src/hooks/useDashboardSummary.ts`). Pattern invalidation cukup konsisten dan mudah dikembangkan.

3. Docker deployment sudah dipikirkan cukup serius: frontend/backend terpisah, healthcheck ada, model directory read-only, dan persistence path dipisahkan lewat volume.

4. Error boundary frontend sudah tersedia (`src/components/app/AppErrorBoundary.tsx`) sehingga runtime error tidak langsung membuat blank screen tanpa konteks.

5. Modul domain cukup kaya: PPE, HSE, Operations, model registry, benchmark, deployment gate, live monitoring. Ini menunjukkan product direction jelas, bukan hanya single-page demo.

6. Penggunaan `execFile` untuk memanggil Python/ffmpeg lebih aman daripada shell string interpolation. Ini baseline yang baik, walaupun boundary path/source masih perlu diperketat.

## 7. Tasklist Compliance

Karena tidak ada ticket/user story/acceptance criteria eksplisit yang disertakan selain instruksi review, compliance di bawah ini berbasis kemampuan yang terlihat dari repo.

- [x] Media source management tersedia: upload/camera source, status, monitoring mode, CRUD.
- [x] Analysis setup dan run analysis tersedia untuk beberapa domain: PPE, HSE, Operations.
- [x] Backend analysis runner tersedia dengan job queue sederhana dan summary output.
- [x] Dashboard/output/reporting tersedia sebagai halaman dan endpoint summary.
- [x] Model registry/training/evaluation/benchmark UI dan local JSON backend tersedia.
- [x] Docker-based deployment tersedia untuk frontend dan backend.
- [~] Supabase integration tersedia, tetapi schema dan RLS belum production-grade.
- [~] Live monitoring tersedia, tetapi scheduling/state masih in-memory dan belum durable.
- [~] Error handling tersedia, tetapi observability dan audit trail belum cukup untuk operasi production.
- [~] Build/lint tersedia, tetapi lint masih warning dan scope lint belum bersih.
- [ ] Automated tests belum tersedia untuk frontend, backend, atau pipeline analysis.
- [ ] Authentication/authorization belum terlihat pada API dan UI.
- [ ] API documentation/OpenAPI/ADR belum tersedia.
- [ ] Security hardening untuk file upload, RTSP/URL preview, static output, and Supabase write policy belum lengkap.

## 8. Rekomendasi Tambahan

1. **Target arsitektur production:** frontend stateless, backend API modular, database Postgres untuk registry/history/job metadata, object storage untuk upload/output snapshots, worker queue terpisah untuk analysis jobs, dan signed URL untuk artifact access.

2. **Minimum release gate:** `npm run lint` zero warning, `npm run build` zero critical warning atau accepted budget, backend integration tests pass, Playwright smoke test pass, security checklist pass.

3. **Security baseline:** auth middleware, CORS allowlist, rate limit, upload scanner/validation, path allowlist, SSRF protection, protected artifact output, and hardened Supabase RLS.

4. **Operational baseline:** structured logs, request id, job metrics, health/readiness split, queue depth metrics, disk usage monitor for `runtime-analysis`, retention policy, and backup/restore docs.

5. **Documentation baseline:** architecture diagram, API contract, environment matrix, local setup including Python/ffmpeg/model requirements, deployment rollback, and incident runbook for failed jobs or corrupted runtime state.

