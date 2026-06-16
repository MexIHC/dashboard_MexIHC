@echo off
setlocal
set "ROOT=%~dp0"
title MexIHC — start local dashboard

echo.
echo Starting API (FastAPI port 8002) and web (Vite port 5173).
echo Open in browser: http://127.0.0.1:5173
echo.

if not exist "%ROOT%apps\api\.venv\Scripts\python.exe" (
  echo ERROR: missing apps\api\.venv
  echo In apps\api run: python -m venv .venv
  echo Then: .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

start "MexIHC-API-8002" /D "%ROOT%apps\api" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --reload"

timeout /t 2 /nobreak >nul

if not exist "%ROOT%apps\web\node_modules" (
  echo Installing web dependencies...
  pushd "%ROOT%apps\web"
  call npm install
  popd
)

start "MexIHC-VITE-5173" /D "%ROOT%apps\web" cmd /k "npm run dev"

echo.
echo Ready. Place study data under data\ (see data\README.md) and training CSV under models\.
pause
