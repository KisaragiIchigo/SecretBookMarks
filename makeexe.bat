@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "ELECTRON_RUN_AS_NODE="

title SecretBookMarks - exe ビルド

where npm >nul 2>nul
if errorlevel 1 goto :nonode

if not exist "node_modules\" (
    echo.
    echo  初回セットアップを行います。回線状況によっては数分かかります。
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :failed
)

echo.
echo  インストーラーとポータブル版を作成します。
echo  初回は electron-builder が数百 MB の部品を取得するため、時間がかかります。
echo.

call npm run dist
if errorlevel 1 goto :failed

echo.
echo  完成しました。release フォルダーを開きます。
echo.
start "" "%~dp0release"
pause
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
echo  ビルドに失敗しました。上に表示されたメッセージを確認してください。
echo.
pause
exit /b 1
