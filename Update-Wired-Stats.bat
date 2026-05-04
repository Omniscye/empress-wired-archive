@echo off
setlocal

cd /d "%~dp0"

echo.
echo === Empress Wired Stats Refresh ===
echo Repo: %cd%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found in PATH.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  pause
  exit /b 1
)

echo Pulling latest repo...
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo ERROR: Could not pull cleanly. Resolve git changes first.
  pause
  exit /b 1
)

echo.
echo Refreshing Thunderstore stats...
node OwO.mjs
if errorlevel 1 (
  echo.
  echo ERROR: Stats refresh failed.
  pause
  exit /b 1
)

git diff --quiet -- stats.json app.js
if not errorlevel 1 (
  echo.
  echo No stats changes found. Nothing to push.
  pause
  exit /b 0
)

echo.
echo Committing updated stats...
git add stats.json app.js
git commit -m "update stats"
if errorlevel 1 (
  echo.
  echo ERROR: Commit failed.
  pause
  exit /b 1
)

echo.
echo Pushing to GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo ERROR: Push failed.
  pause
  exit /b 1
)

echo.
echo Done. GitHub Pages should update in a minute or two.
pause
