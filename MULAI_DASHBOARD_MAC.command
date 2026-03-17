#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================="
echo "  Menjalankan Dashboard Computer Vision"
echo "=========================================="

echo "[1/2] Menjalankan backend..."
cd ./server && npm run dev &
BACKEND_PID=$!

sleep 2

echo "[2/2] Menjalankan frontend..."
cd .. && npm run dev -- --open

trap "kill $BACKEND_PID" EXIT

echo ""
echo "Dashboard sedang berjalan!"
echo "JANGAN TUTUP jendela ini selama aplikasi digunakan."
echo "=========================================="
wait
