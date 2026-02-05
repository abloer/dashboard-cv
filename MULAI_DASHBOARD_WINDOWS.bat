@echo off
TITLE Memulai Dashboard Computer Vision
echo ==========================================
echo   Menjalankan Dashboard (OFFLINE MODE)
echo ==========================================

:: 1. Jalankan PocketBase di background
echo [1/3] Menjalankan Database...
start /b pocketbase.exe serve

:: 2. Tunggu sebentar agar database siap
timeout /t 2 /nobreak > nul

:: 3. Jalankan Aplikasi React & Buka Browser
echo [2/3] Menjalankan Aplikasi...
echo [3/3] Membuka Browser...
npm run dev -- --open

echo.
echo Dashboard sedang berjalan! 
echo JANGAN TUTUP jendela ini selama aplikasi digunakan.
echo ==========================================
pause
