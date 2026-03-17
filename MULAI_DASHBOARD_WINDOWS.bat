@echo off
TITLE Memulai Dashboard Computer Vision
echo ==========================================
echo   Menjalankan Dashboard Computer Vision
echo ==========================================

:: 1. Jalankan backend di background
echo [1/2] Menjalankan Backend...
start /b cmd /c "cd /d %~dp0server && npm run dev"

:: 2. Tunggu sebentar agar backend siap
timeout /t 2 /nobreak > nul

:: 3. Jalankan frontend & buka browser
echo [2/2] Menjalankan Frontend...
npm run dev -- --open

echo.
echo Dashboard sedang berjalan! 
echo JANGAN TUTUP jendela ini selama aplikasi digunakan.
echo ==========================================
pause
