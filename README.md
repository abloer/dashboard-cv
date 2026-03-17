# Dashboard Computer Vision

## 🚀 Persiapan Cepat (Quick Start)

Jika Anda ingin memindahkan proyek ini ke komputer lain atau menjalankannya secara lokal:

1. **Copy Proyek**: Salin seluruh folder ini.
2. **Database**: Buka [Supabase](https://supabase.com), buat proyek baru, dan jalankan script di `supabase/setup.sql` pada SQL Editor.
3. **Konfigurasi**: Salin `.env.example` menjadi `.env` dan masukkan API Key dari Supabase.
4. **Jalankan**:
   ```bash
   npm install
   npm run dev
   ```

## Project info

**URL**: https://axometrix.com/projects/REPLACE_WITH_PROJECT_ID


**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Docker Deploy

Repo ini sekarang punya artefak deploy container:

- `Dockerfile.frontend`
- `Dockerfile.backend`
- `docker-compose.yml`
- `.env.production.example`
- `deploy/nginx.conf`

Quick start:

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

Arsitektur deploy:

- `frontend`: Vite build yang di-serve oleh nginx
- `backend`: Node + Python + ffmpeg untuk API analisis

Reverse proxy nginx meneruskan:

- `/api/*` ke backend
- `/analysis-output/*` ke backend
