# SecretBookMarks

ローカル完結の暗号化ブックマークヴォールト。Electron + Vite + React + TypeScript + Tailwind CSS v3 + Radix UI で作り直した、PySide6 版のリメイクです。

## 機能ハイライト

- 🔐 **ヴォールト方式の暗号化** — ブックマーク全体を 1 ファイルへまとめ、**scrypt (N=65536) で導出した鍵による AES-256-GCM** で暗号化します。URL のハッシュや件数の手がかりを平文で残しません。
- 🕒 **自動ロック** — 無操作が続くとマスターキーをメモリから破棄します。手動ロックは `Ctrl+L` です。
- 📋 **クリップボード監視** — URL をコピーすると取り込みダイアログが開き、タイトルとファビコンを自動取得します。
- 🔎 **検索構文** — `tag:python site:github.com is:favorite after:2026-01-01 "完全一致"` を組み合わせた絞り込みに対応します。
- ⌘ **コマンドパレット** — `Ctrl+K` でブックマークの横断検索と主要操作の実行ができます。
- 🏷️ **タグの自動付与** — そのページのキーワード情報から最大 5 件を選び、クリック不要で自動的に入力します。他のブックマークからタグを引き継ぐことはありません。付いたタグは取り込みダイアログ上で確認でき、不要なものはその場で外せます。同じサイトで使用中のタグや、よく使うタグは候補チップとして提示します。
- 🗂️ **タグ運用** — サイドバーからのタグ絞り込み（AND）、名前の変更、全項目からの除去、選択項目へのタグ一括編集（追加 / 削除 / 置き換え）に対応します。
- 🧭 **インスペクタ** — 選択した項目のタイトル・タグ・グループ・メモをその場で編集でき、追加日時や開いた回数も確認できます。
- 🧭 **内蔵ブラウザ** — タブ付きのブラウザを内蔵しています。ブックマークは内蔵ブラウザで開き、開いているページをそのままブックマークに追加できます。既定のブラウザーで開きたい場合はインスペクタから選べます。
- 🖱️ **右クリック禁止の解除** — Shift を押しながらの右クリックでは、ページ側の右クリック禁止を無効化してメニューを表示します（Firefox と同じ挙動）。
- 🛡️ **広告・トラッカーのブロック** — EasyList、EasyPrivacy、uBlock filters、AdGuard Japanese など 9 種類のフィルターリストを適用します。フィルターは初回起動時に取得し、3 日ごとに自動更新します。
- 🎞️ **動画の保存** — 右クリックの「この動画を保存」「名前を付けて保存(V)」に加えて、ページが読み込んだ動画を通信から検出して一覧表示します。直リンクの mp4 等はそのまま保存し、HLS / DASH（m3u8・mpd）は同梱の ffmpeg で mp4 に結合します。
- 🔎 **見つけにくい動画への対応** — 拡張子や content-type が当てにならない配信でも、Chromium がメディアとして要求した事実を手がかりに検出します。検出パネルの更新ボタンでは、iframe の中を含めてページ内の `video` 要素を直接調べ直せます。
- 🔗 **ホットリンク防止のあるサイトに対応** — 保存時に元ページの Referer と Cookie を送ります。ページ内では再生できるのに保存だけ 403 になる、という事象を避けられます。
- 🔒 **閲覧の痕跡を残さない** — 内蔵ブラウザは非永続セッションで動作し、Cookie は（設定が有効なときのみ）ヴォールト内に暗号化して保存します。ダウンロード履歴もヴォールト内に入ります。
- ♻️ **重複の解決** — 正規化した URL が一致した場合に、マージ / 上書き / スキップを選べます。
- 🗑️ **ゴミ箱** — 削除は論理削除で、保持期間を過ぎた項目だけを自動で完全削除します。
- 🔗 **リンク切れ検査** — 選択項目または表示中の項目へまとめて疎通確認を行い、結果を保持します。
- 📥 **入出力** — ブラウザの HTML ブックマークと JSON を取り込み、JSON / HTML / CSV へ書き出せます。
- 🖥️ **常駐と復元** — トレイ常駐、`Ctrl+Shift+B` のクイック追加、ウィンドウ位置とサイズの保存に対応します。
- 💾 **世代バックアップ** — 保存のたびに一時ファイル経由で書き込み、一定間隔でバックアップを最大 8 世代残します。

## アーキテクチャ概要

```text
remake/
├── electron/
│   ├── main/                       … Main プロセス（Node.js 環境・OS 操作と暗号処理）
│   │   ├── index.ts                … 起動シーケンス、単一インスタンス制御、常駐とショートカット
│   │   ├── paths.ts                … データフォルダーの解決、ポータブル判定、Chromium データの隔離
│   │   ├── window.ts               … BrowserWindow 生成、ジオメトリ保存、外部遷移の遮断
│   │   ├── tray.ts                 … タスクトレイのメニュー構築
│   │   ├── settings.ts             … 設定 JSON の読み書き（Zod 検証つき）
│   │   ├── assets.ts               … dev / 本番でのアセットパス解決
│   │   ├── vault/
│   │   │   ├── crypto.ts           … scrypt 鍵導出、AES-256-GCM の封緘と開封
│   │   │   ├── file.ts             … 原子的な書き込みとバックアップ世代管理
│   │   │   ├── session.ts          … 復号モデルと鍵の保持、遅延保存、自動ロック
│   │   │   └── repository.ts       … ブックマークの CRUD とタグ操作
│   │   ├── ipc/
│   │   │   ├── index.ts            … ハンドラ登録のオーケストレータ
│   │   │   ├── register.ts         … Zod 検証と Result 化の共通ラッパ
│   │   │   ├── schemas.ts          … IPC ペイロードのスキーマ定義
│   │   │   ├── vaultHandlers.ts    … 作成・解錠・施錠・パスワード変更
│   │   │   ├── bookmarkHandlers.ts … 一覧、CRUD、リンク検査、メタ取得
│   │   │   ├── ioHandlers.ts       … 取り込み / 書き出しダイアログ
│   │   │   └── systemHandlers.ts   … 設定、外部起動、ウィンドウ操作
│   │   ├── metadata/
│   │   │   ├── fetchPageMeta.ts    … タイトル / ファビコン取得、疎通確認
│   │   │   └── faviconQueue.ts     … 未取得ドメインの並列取得キュー
│   │   ├── browser/
│   │   │   ├── adblock.ts          … フィルターリストの取得・キャッシュ・適用
│   │   │   ├── session.ts          … 非永続セッションと Cookie の暗号化保存
│   │   │   ├── mediaSniffer.ts     … 通信を監視して動画・音声の URL を捕捉
│   │   │   └── webviewBridge.ts    … 右クリックメニューと webview の安全設定
│   │   ├── download/
│   │   │   ├── manager.ts          … ダウンロードの実行・進捗・履歴
│   │   │   └── ffmpeg.ts           … ffmpeg の解決、引数生成、再生時間の推定
│   │   ├── clipboard/watcher.ts    … クリップボード監視と自己コピーの除外
│   │   └── io/
│   │       ├── importFile.ts       … Netscape HTML / JSON の解析
│   │       └── exportFile.ts       … JSON / HTML / CSV の生成
│   └── preload/index.ts            … ContextBridge（window.sbm）の公開
├── shared/                         … Main と Renderer が共有する型と純粋関数
│   ├── types.ts                    … ドメイン型
│   ├── ipc.ts                      … チャンネル名と Result 型
│   ├── url.ts                      … URL 判定・正規化・ドメイン抽出
│   └── tags.ts                     … タグの正規化とマージ
├── src/                            … Renderer プロセス（UI）
│   ├── main.tsx                    … エントリ（フォント読み込みと Provider の合成）
│   ├── App.tsx                     … 画面の切り替えと設定ダイアログの保持
│   ├── index.css                   … Tailwind ベースとアクリル調の共有クラス
│   ├── state/VaultProvider.tsx     … 解錠状態・データ・設定の単一情報源
│   ├── hooks/
│   │   ├── useLibrary.ts           … 絞り込み → 並び替え → グループ化の派生
│   │   ├── useSelection.ts         … 複数選択と範囲選択
│   │   ├── useCaptureFlow.ts       … 取り込みダイアログと重複解決
│   │   └── useAppHotkeys.ts        … アプリ全体のキーボード操作
│   ├── lib/
│   │   ├── library.ts              … 絞り込み・並び替え・集計の純粋関数
│   │   ├── tagSuggest.ts           … タグの自動引き継ぎ・候補生成・入力補完の純粋関数
│   │   ├── searchQuery.ts          … 検索構文のパースと判定
│   │   ├── format.ts               … 日時・件数・URL の表示整形
│   │   └── cn.ts                   … クラス名連結
│   └── components/
│       ├── Workspace/              … 解錠後の画面オーケストレータ
│       ├── Browser/                … タブ、URL バー、webview、検出メディア一覧
│       ├── Downloads/              … ダウンロードの進捗と履歴
│       ├── TitleBar/               … フレームレスのカスタムタイトルバー
│       ├── UnlockGate/             … ヴォールト作成 / 解錠
│       ├── Sidebar/                … スマートビューとタグ一覧
│       ├── Toolbar/                … 検索、並び替え、一括操作、入出力
│       ├── BookmarkList/           … グループ見出しつき一覧（逐次描画）
│       ├── Inspector/              … 選択項目の詳細と直接編集
│       ├── CommandPalette/         … Ctrl+K の横断検索
│       ├── StatusBar/              … 件数・監視状態・保存状態
│       ├── dialogs/                … 取り込み / 重複 / タグ一括 / 設定
│       └── ui/                     … Button・Input・TagInput・TagSuggestions・Modal・Select・Switch・Toast 等
├── scripts/                        … dev サーバーと Main バンドルのビルド
├── 起動.bat                        … 依存取得・ビルド・起動をまとめたランチャー
├── makeexe.bat                     … インストーラーとポータブル版の生成
├── tools/migrate_legacy.py         … 旧 PySide6 版 DB からの移行スクリプト
├── project_style.json              … 配色・フォント・質感の単一情報源
└── changelogs.json                 … 変更履歴
```

## データフロー

```text
[クリップボード / 手動入力]
        │
        ▼
Renderer（React）──invoke──▶ preload（ContextBridge）──▶ Main（Zod 検証）
        ▲                                                     │
        │                                                     ├─▶ metadata: タイトル / ファビコン取得（HTTP）
        │                                                     ├─▶ repository: メモリ上のモデルを更新
        │                                                     └─▶ session: gzip → AES-256-GCM → vault.sbm へ原子的書き込み
        └───── event（favicon 更新 / 施錠 / 保存状態）─────────┘
```

ネットワークアクセスは Main プロセスだけが行います。Renderer は CSP で `connect-src 'self'` に制限され、外部への接続経路を持ちません。

## 主要技術

| カテゴリ | 採用技術 |
| --- | --- |
| デスクトップ基盤 | Electron 43（contextIsolation 有効 / nodeIntegration 無効） |
| ビルド | Vite 5（Renderer）、esbuild（Main・Preload） |
| UI | React 18 + TypeScript 5 |
| スタイル | Tailwind CSS v3、Radix UI、Framer Motion（LazyMotion + m） |
| フォント | Space Grotesk / IBM Plex Sans JP / IBM Plex Mono（@fontsource でローカル同梱） |
| 内蔵ブラウザ | Electron webview（非永続パーティション） |
| 広告ブロック | @ghostery/adblocker-electron（uBlock Origin と同じフィルター形式） |
| 動画の結合 | ffmpeg（ffmpeg-static を同梱） |
| 暗号 | Node.js crypto（scrypt + AES-256-GCM）、zlib gzip |
| 入力検証 | Zod（IPC 境界と設定ファイル） |
| パッケージング | electron-builder（NSIS / ポータブル） |

## 保存先

データは 1 つのフォルダーにまとまっています。フォルダーごとコピーすれば、そのまま別の端末へ引っ越せます。

| 対象 | パス |
| --- | --- |
| データフォルダー | `%APPDATA%/SecretBookMarks/` |
| ヴォールト | `<データフォルダー>/vault.sbm` |
| バックアップ | `<データフォルダー>/backups/vault-*.sbm` |
| 設定 | `<データフォルダー>/settings.json` |
| Chromium のキャッシュ | `<データフォルダー>/chromium-cache/` |

Electron の既定では Chromium のキャッシュ（`GPUCache`、`Local Storage` など）がヴォールトと同じ階層に散らばるため、`chromium-cache` サブフォルダーへ隔離しています。このフォルダーは削除しても再生成されます。

設定ファイルにパスワードや鍵は保存されません。マスターパスワードは復旧できないため、必ず控えを残してください。

### ポータブル動作

exe と同じ場所に `portable.txt` という空ファイルを置くと、データの保存先が exe の隣の `SecretBookMarks-data` フォルダーへ切り替わります。ポータブル版 exe（`SecretBookMarks-portable-*.exe`）は、この指定がなくても自動的にポータブル動作になります。USB メモリーへ入れて持ち歩く場合に利用してください。

## 旧バージョンからの移行

旧 PySide6 版のデータは、同梱のスクリプトで JSON へ書き出してから取り込みます。

```powershell
python tools/migrate_legacy.py "C:\path\to\secret_bookmarks.db" legacy.json
```

出力された `legacy.json` を「入出力 → 取り込む」から読み込んでください。JSON は平文のため、取り込み後に削除してください。

## かんたん起動（コマンド操作が不要な方向け）

| ファイル | 動作 |
| --- | --- |
| `起動.bat` | 初回は依存関係の取得とビルドを自動で行い、以降はそのままアプリを起動します。 |
| `makeexe.bat` | インストーラーとポータブル版の exe を `release` フォルダーへ生成します。 |

どちらも Node.js（LTS 版）がインストールされている必要があります。ソースコードを変更したあとは、`起動.bat` の前に `npm run build` を実行するか、`makeexe.bat` で作り直してください。

## 開発

```powershell
npm install          # 依存関係の取得
npm run dev          # Vite dev サーバー + Electron（Main 変更時は自動で再起動）
npm run typecheck    # Renderer と Electron の両方を型チェック
npm run build        # 型チェック → Renderer ビルド → Main / Preload バンドル
npm start            # ビルド済みの成果物で Electron を起動
npm run dist         # Windows 向けインストーラーとポータブル版を生成
```

`npm run dev` は Renderer を `http://localhost:5173` から読み込みます。本番ビルドは `file://` 起動になるため、アセットは相対パス（`base: './'`）で解決しています。

## キーボードショートカット

| キー | 動作 |
| --- | --- |
| `Ctrl+K` | コマンドパレット |
| `Ctrl+N` | ブックマークを追加 |
| `Ctrl+F` | 検索ボックスへフォーカス |
| `Ctrl+A` | 表示中のすべてを選択 |
| `Ctrl+L` | ヴォールトをロック |
| `Delete` | 選択項目をゴミ箱へ（ゴミ箱では完全削除） |
| `Ctrl+Shift+B` | ウィンドウを呼び出してクイック追加（グローバル） |
| `Shift` + 右クリック → `V` | 動画を「名前を付けて保存」（保存先は前回の場所を記憶） |
| マウスのサイドボタン | 内蔵ブラウザの戻る / 進む |
| `Enter` / ダブルクリック | ブラウザで開く |

## 動画の保存について

保存できるのは、ページが実際に読み込んだファイルとストリーミングのマニフェストです。次のものは対象外です。

- YouTube のように、断片を JavaScript が組み立てて再生する形式（`blob:` URL になり実体がありません）
- DRM で保護されたコンテンツ（保護の回避にあたるため実装していません）

各サイトの利用規約と著作権に従ってご利用ください。

## ライセンス

© 2026 KisaragiIchigo / MIT License
