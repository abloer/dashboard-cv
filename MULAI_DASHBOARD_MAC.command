#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================="
echo "  Menjalankan Dashboard (OFFLINE MODE)"
echo "=========================================="

# 1. Pastikan PocketBase memiliki izin eksekusi
chmod +x ./pocketbase

# 2. Jalankan PocketBase di background
echo "[1/3] Menjalankan Database..."
./pocketbase serve &
PB_PID=$!

# 3. Tunggu sebentar agar database siap
sleep 2

# 4. Jalankan Aplikasi React & Buka Browser
echo "[2/3] Menjalankan Aplikasi..."
echo "[3/3] Membuka Browser..."
npm run dev -- --open

# Cleanup: Matikan PocketBase saat script dihentikan
trap "kill $PB_PID" EXIT

echo ""
echo "Dashboard sedang berjalan!"
echo "JANGAN TUTUP jendela ini selama aplikasi digunakan."
echo "=========================================="
wait
