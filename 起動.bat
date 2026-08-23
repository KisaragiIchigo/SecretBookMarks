@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Electron を Node として起動させる環境変数が残っていると起動に失敗するため打ち消す
set "ELECTRON_RUN_AS_NODE="

title SecretBookMarks

where npm >nul 2>nul
if errorlevel 1 goto :nonode

if not exist "node_modules\" (
    echo.
    echo  初回セットアップを行います。回線状況によっては数分かかります。
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :failed
)

if not exist "dist\main\index.cjs" (
    echo.
    echo  アプリをビルドしています。しばらくお待ちください。
    echo.
    call npm run build
    if errorlevel 1 goto :failed
)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:nonode
echo.
echo  Node.js が見つかりませんでした。
echo  https://nodejs.org/ から LTS 版をインストールしてから、もう一度実行してください。
echo.
pause
exit /b 1

:failed
echo.
echo  処理に失敗しました。上に表示されたメッセージを確認してください。
echo.
pause
exit /b 1
