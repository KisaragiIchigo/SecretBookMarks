import os, sys, webbrowser, re, html, time
from urllib.parse import urlparse, urljoin
from PySide6.QtCore import Qt, QEvent, QPoint, QRect, QTimer, QByteArray, QSize
from PySide6.QtGui import QIcon, QFont, QPixmap, QImage
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QLineEdit,
    QComboBox, QTreeWidget, QTreeWidgetItem, QMessageBox, QDialog, QTextBrowser,
    QSizePolicy, QStyle, QGraphicsDropShadowEffect, QHeaderView, QFormLayout,
    QRadioButton, QButtonGroup
)

from config import (
    APP_TITLE, UI_FONT_FAMILY, DB_FILE, TITLE_SUFFIX,
    build_qss, GAP_DEFAULT, PADDING_CARD
)
from utils import (
    resource_path, is_url, extract_domain, load_settings_json, save_settings_json, normalize_url
)
from processor import (
    init_db, get_fernet, get_all_bookmarks, add_bookmark_to_db,
    update_bookmark_full, delete_bookmark_by_id, collect_all_tags, ensure_group_column,
    update_bookmark_tags, migrate_populate_url_hash, compute_url_hash, find_bookmark_by_urlhash
)

# ===== 定数：並び替えモード =====
SORT_NEW_TO_OLD = 0
SORT_OLD_TO_NEW = 1
SORT_TITLE_ASC  = 2
SORT_TITLE_DESC = 3

# ====== グローバルFernet ======
FERNET = None  # type: ignore

# ---- 影エフェクト
def apply_drop_shadow(widget: QWidget) -> QGraphicsDropShadowEffect:
    from PySide6.QtGui import QColor
    eff = QGraphicsDropShadowEffect(widget)
    eff.setBlurRadius(20)
    eff.setOffset(0, 1)
    c = QColor(0, 0, 0); c.setAlphaF(0.10)
    eff.setColor(c)
    widget.setGraphicsEffect(eff)
    return eff

# ===== 軽量タイトル取得 =====
def _normalize_title_text(raw: str) -> str:
    t = html.unescape(raw or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t or ""

def _extract_title_from_html(html_text: str) -> str | None:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")
    if soup.title and soup.title.string:
        t = soup.title.string.strip()
        if t: return t
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        t = og.get("content").strip()
        if t: return t
    tw = soup.find("meta", attrs={"name": "twitter:title"})
    if tw and tw.get("content"):
        t = tw.get("content").strip()
        if t: return t
    return None

def _http_get(url: str, *, timeout=(3, 6), headers: dict | None = None) -> tuple[str | None, dict]:
    try:
        import requests
        _headers = {
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/124.0.0.0 Safari/537.36"),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
            "Referer": "https://www.google.com/",
        }
        if headers: _headers.update(headers)
        res = requests.get(url, headers=_headers, timeout=timeout, allow_redirects=True)
        res.encoding = res.apparent_encoding or res.encoding
        return res.text, res.headers
    except Exception:
        return None, {}

def get_page_title(url: str) -> str:
    if not is_url(url): return url
    try:
        for i in range(2):
            text, headers = _http_get(url, timeout=(2 + i, 4 + 2*i))
            if not text:
                time.sleep(0.1 * (2 ** i)); continue
            ctype = (headers.get("Content-Type") or "").lower()
            if "html" not in ctype and "<html" not in (text.lower() if text else ""):
                return url
            cand = _extract_title_from_html(text)
            if cand:
                return _normalize_title_text(cand)
    except Exception:
        pass
    return url

# ===== ファビコン =====
ICON_CACHE: dict[str, QIcon] = {}

def _domain_root(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}/"

def _extract_favicon_from_html(base_url: str, html_text: str) -> str | None:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")
    for rel_name in ("icon", "shortcut icon", "apple-touch-icon"):
        link = soup.find("link", rel=lambda v: v and rel_name in " ".join(v).lower())
        if link and link.get("href"):
            return urljoin(base_url, link.get("href").strip())
    return None

def _http_get_bytes(url: str, *, timeout=(3, 6)) -> bytes | None:
    try:
        import requests
        res = requests.get(url, headers={
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/124.0.0.0 Safari/537.36"),
        }, timeout=timeout, allow_redirects=True)
        if res.status_code == 200:
            return res.content
    except Exception:
        pass
    return None

def get_site_icon(url: str, *, fetch_timeout=(2, 4)) -> QIcon | None:
    domain = extract_domain(url)
    if domain in ICON_CACHE: return ICON_CACHE[domain]
    try:
        root = _domain_root(url)
        text, _ = _http_get(root, timeout=fetch_timeout)
        icon_url = _extract_favicon_from_html(root, text) if text else None
        if not icon_url:
            icon_url = urljoin(root, "favicon.ico")
        data = _http_get_bytes(icon_url, timeout=fetch_timeout)
        if data:
            img = QImage.fromData(QByteArray(data))
            if not img.isNull():
                pm = QPixmap.fromImage(img).scaled(24,24, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                ICON_CACHE[domain] = QIcon(pm)
                return ICON_CACHE[domain]
    except Exception:
        pass
    ICON_CACHE[domain] = None
    return None

def get_page_thumbnail(url: str, *, max_size: QSize = QSize(360, 200)) -> QPixmap | None:
    return None

# ===== ナチュラルソート用キー =====
_num_re = re.compile(r"(\d+)", re.UNICODE)
def natural_key(s: str):
    """
    'File2' < 'File10' のように、数字を数値として比べるキー。
    大文字小文字無視＆全角混在でもそこそこ安定。
    """
    s_norm = (s or "").casefold()
    parts = _num_re.split(s_norm)
    out = []
    for p in parts:
        if p.isdigit():
            try:
                out.append(int(p))
            except ValueError:
                out.append(p)
        else:
            out.append(p)
    return tuple(out)

# ====== 一括タグ編集ダイアログ ======
class BulkTagDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"タグ一括編集 {TITLE_SUFFIX}")
        self.setWindowFlags(Qt.Dialog | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setMinimumSize(520, 260)

        outer = QVBoxLayout(self); outer.setContentsMargins(0,0,0,0)
        bg = QWidget(); bg.setObjectName("bgRoot"); outer.addWidget(bg)
        bgLay = QVBoxLayout(bg); bgLay.setContentsMargins(GAP_DEFAULT,GAP_DEFAULT,GAP_DEFAULT,GAP_DEFAULT); bgLay.setSpacing(GAP_DEFAULT)

        card = QWidget(); card.setObjectName("glassRoot"); bgLay.addWidget(card)
        apply_drop_shadow(card)

        lay = QVBoxLayout(card); lay.setContentsMargins(PADDING_CARD,PADDING_CARD,PADDING_CARD,PADDING_CARD); lay.setSpacing(GAP_DEFAULT)

        bar = QHBoxLayout()
        title = QLabel("タグ一括編集"); title.setObjectName("titleLabel")
        btn_close = QPushButton("ｘ"); btn_close.setObjectName("closeBtn"); btn_close.setFixedSize(28,28)
        btn_close.clicked.connect(self.reject)
        bar.addWidget(title); bar.addStretch(1); bar.addWidget(btn_close)
        lay.addLayout(bar)

        form = QFormLayout(); form.setHorizontalSpacing(10); form.setVerticalSpacing(8)
        self.ed_tags = QLineEdit()
        self.ed_tags.setPlaceholderText("例) python, ai, memo")
        form.addRow("対象タグ", self.ed_tags)

        self.rb_replace = QRadioButton("置き換え")
        self.rb_add     = QRadioButton("追加（追記）")
        self.rb_remove  = QRadioButton("削除（一致するタグを除去）")
        self.rb_add.setChecked(True)
        self._grp = QButtonGroup(self)
        for i, rb in enumerate((self.rb_replace, self.rb_add, self.rb_remove)):
            self._grp.addButton(rb, i)
        row_mode = QHBoxLayout()
        row_mode.addWidget(self.rb_replace); row_mode.addWidget(self.rb_add); row_mode.addWidget(self.rb_remove); row_mode.addStretch(1)
        mode_box = QWidget(); mode_box.setLayout(row_mode)
        form.addRow("操作モード", mode_box)
        lay.addLayout(form)

        btns = QHBoxLayout(); btns.addStretch(1)
        ok = QPushButton("反映"); cancel = QPushButton("キャンセル")
        ok.clicked.connect(self.accept); cancel.clicked.connect(self.reject)
        btns.addWidget(ok); btns.addWidget(cancel)
        lay.addLayout(btns)

        self.setStyleSheet(build_qss())

    def mode(self) -> str:
        if self.rb_replace.isChecked(): return "replace"
        if self.rb_remove.isChecked():  return "remove"
        return "add"

    def tags_input(self) -> list[str]:
        raw = (self.ed_tags.text() or "")
        parts = [t.strip() for t in raw.split(",")]
        return [t for t in parts if t]

# ===== 個別編集 =====
class BookmarkEditDialog(QDialog):
    def __init__(self, parent=None, *, title="", url="", tags="", is_new=False):
        super().__init__(parent)
        self.setWindowTitle(f"編集 {TITLE_SUFFIX}")
        self.setWindowFlags(Qt.Dialog | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setMinimumSize(560, 420)

        self._moving = False
        self._drag_offset = QPoint()

        outer = QVBoxLayout(self); outer.setContentsMargins(0,0,0,0); outer.setSpacing(0)
        bg = QWidget(); bg.setObjectName("bgRoot"); outer.addWidget(bg)
        bgLay = QVBoxLayout(bg); bgLay.setContentsMargins(GAP_DEFAULT,GAP_DEFAULT,GAP_DEFAULT,GAP_DEFAULT); bgLay.setSpacing(GAP_DEFAULT)

        card = QWidget(); card.setObjectName("glassRoot"); bgLay.addWidget(card)
        apply_drop_shadow(card)
        lay = QVBoxLayout(card); lay.setContentsMargins(PADDING_CARD,PADDING_CARD,PADDING_CARD,PADDING_CARD); lay.setSpacing(GAP_DEFAULT)

        bar = QHBoxLayout()
        cap = QLabel("ブックマーク編集" if not is_new else "ブックマーク追加")
        cap.setObjectName("titleLabel")
        btn_close = QPushButton("ｘ"); btn_close.setObjectName("closeBtn"); btn_close.setFixedSize(28,28)
        btn_close.clicked.connect(self.reject)
        bar.addWidget(cap); bar.addStretch(1); bar.addWidget(btn_close)
        lay.addLayout(bar)

        form = QFormLayout(); form.setHorizontalSpacing(10); form.setVerticalSpacing(8)
        self.ed_title = QLineEdit(title)
        self.ed_url   = QLineEdit(url)
        self.ed_tags  = QLineEdit(tags)
        self.ed_title.setPlaceholderText("ページタイトル（空なら自動取得）")
        self.ed_url.setPlaceholderText("https://example.com/...")
        self.ed_tags.setPlaceholderText("例) tech, python, note")
        form.addRow("タイトル", self.ed_title)
        form.addRow("URL", self.ed_url)
        form.addRow("タグ", self.ed_tags)
        lay.addLayout(form)

        self.thumb_label = QLabel("（サムネイル機能はオフです）")
        self.thumb_label.setAlignment(Qt.AlignCenter)
        self.thumb_label.setFixedHeight(200)
        self.thumb_label.setStyleSheet("border:1px solid #ccd; background: #fff; border-radius:8px; color:#666;")
        lay.addWidget(self.thumb_label, 1)

        btns = QHBoxLayout(); btns.addStretch(1)
        self.btn_save = QPushButton("保存"); self.btn_save.setDefault(True)
        btn_cancel = QPushButton("キャンセル")
        self.btn_save.clicked.connect(self._on_save); btn_cancel.clicked.connect(self.reject)
        btns.addWidget(self.btn_save); btns.addWidget(btn_cancel)
        lay.addLayout(btns)

        self.setStyleSheet(build_qss())
        for ed in (self.ed_title, self.ed_url, self.ed_tags):
            ed.returnPressed.connect(self._on_save)

    def _on_save(self):
        url = (self.ed_url.text() or "").strip()
        if not is_url(url):
            QMessageBox.warning(self, "URLエラー", "URLが正しくないみたい。")
            return
        self.accept()

# ===== README =====
class ReadmeDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"README {TITLE_SUFFIX}")
        self.setWindowFlags(Qt.Dialog | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setMinimumSize(680, 520)

        outer = QVBoxLayout(self); outer.setContentsMargins(0,0,0,0)
        bg = QWidget(); bg.setObjectName("bgRoot"); outer.addWidget(bg)
        bgLay = QVBoxLayout(bg); bgLay.setContentsMargins(GAP_DEFAULT, GAP_DEFAULT, GAP_DEFAULT, GAP_DEFAULT)
        bgLay.setSpacing(GAP_DEFAULT)

        card = QWidget(); card.setObjectName("glassRoot"); bgLay.addWidget(card)
        apply_drop_shadow(card)

        lay = QVBoxLayout(card); lay.setContentsMargins(PADDING_CARD,PADDING_CARD,PADDING_CARD,PADDING_CARD); lay.setSpacing(8)

        bar = QHBoxLayout()
        title = QLabel("README"); title.setObjectName("titleLabel")
        btn_close = QPushButton("ｘ"); btn_close.setObjectName("closeBtn"); btn_close.setFixedSize(28,28)
        btn_close.clicked.connect(self.accept)
        bar.addWidget(title); bar.addStretch(1); bar.addWidget(btn_close)
        lay.addLayout(bar)

        viewer = QTextBrowser()
        viewer.setObjectName("readmeText")
        viewer.setOpenExternalLinks(True)
        viewer.setFont(QFont(UI_FONT_FAMILY, 10))
        viewer.setMarkdown(
            f"# {APP_TITLE} {TITLE_SUFFIX}\n\n"
            "- URLコピー検知で自動登録\n"
            "- タグ/キーワード検索\n"
            "- 暗号化DB保存（サムネ機能はオフ）\n"
            "- ダブルクリックで開く\n"
            "- 複数選択→タグ一括編集（追加は大文字小文字を無視して重複排除）\n"
            "- 追加/編集時：URL重複は『マージ/上書き/スキップ』\n"
            "- ★ 並び替え：追加順/タイトル（ナチュラル）に対応\n"
        )
        btn = QPushButton("閉じる"); btn.clicked.connect(self.accept)

        lay.addWidget(viewer, 1)
        lay.addWidget(btn)
        self.setStyleSheet(build_qss())

# ===== メインウィンドウ =====
class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"{APP_TITLE} {TITLE_SUFFIX}")
        self.resize(980, 640)
        self.setMinimumSize(720, 420)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground, True)

        icon_path = resource_path("SecretBookMarks.ico")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        else:
            self.setWindowIcon(self.style().standardIcon(QStyle.SP_ComputerIcon))

        root = QVBoxLayout(self); root.setContentsMargins(0,0,0,0); root.setSpacing(0)
        self.bgRoot = QWidget(); self.bgRoot.setObjectName("bgRoot")
        root.addWidget(self.bgRoot)

        bgLay = QVBoxLayout(self.bgRoot); bgLay.setContentsMargins(GAP_DEFAULT, GAP_DEFAULT, GAP_DEFAULT, GAP_DEFAULT)
        bgLay.setSpacing(GAP_DEFAULT)

        self.card = QWidget(); self.card.setObjectName("glassRoot")
        bgLay.addWidget(self.card)
        self._shadow = apply_drop_shadow(self.card)

        main = QVBoxLayout(self.card); main.setContentsMargins(PADDING_CARD, PADDING_CARD, PADDING_CARD, PADDING_CARD)
        main.setSpacing(GAP_DEFAULT)
        self.setStyleSheet(build_qss())

        # 認証 & マイグレーション
        init_db(); ensure_group_column()
        self._password_flow()
        migrate_populate_url_hash(self.f)

        # 位置・サイズ復元
        self._restore_geometry()

        # タイトルバー
        title_bar = QHBoxLayout()
        self.lbl_title = QLabel(APP_TITLE); self.lbl_title.setObjectName("titleLabel")
        self.btn_min   = QPushButton("🗕"); self.btn_min.setObjectName("minBtn");  self.btn_min.setFixedSize(28,28)
        self.btn_max   = QPushButton("🗖"); self.btn_max.setObjectName("maxBtn");  self.btn_max.setFixedSize(28,28)
        self.btn_close = QPushButton("ｘ"); self.btn_close.setObjectName("closeBtn"); self.btn_close.setFixedSize(28,28)
        self.btn_min.clicked.connect(self.showMinimized)
        self.btn_max.clicked.connect(lambda: self.showNormal() if self.isMaximized() else self.showMaximized())
        self.btn_close.clicked.connect(self.close)

        title_bar.addWidget(self.lbl_title); title_bar.addStretch(1)
        title_bar.addWidget(self.btn_max); title_bar.addWidget(self.btn_min); title_bar.addWidget(self.btn_close)
        main.addLayout(title_bar)

        # 検索行
        row = QHBoxLayout()
        self.edit_search = QLineEdit(); self.edit_search.setPlaceholderText("キーワード検索（スペースでAND）")
        self.combo_tag   = QComboBox(); self.combo_tag.setMinimumWidth(140)
        self.combo_sort  = QComboBox(); self.combo_sort.setMinimumWidth(190)
        self.combo_sort.addItems([
            "追加順（新→旧）",  # 0
            "追加順（旧→新）",  # 1
            "タイトル（昇順）",  # 2
            "タイトル（降順）",  # 3
        ])
        self.btn_search  = QPushButton("検索")
        self.btn_add     = QPushButton("手動追加")
        self.btn_edit    = QPushButton("編集")
        self.btn_del     = QPushButton("削除")
        self.btn_tagbulk = QPushButton("タグ一括")
        self.btn_readme  = QPushButton("README")
        for b in (self.btn_search, self.btn_add, self.btn_edit, self.btn_del, self.btn_tagbulk, self.btn_readme):
            b.setMinimumWidth(86)
        row.addWidget(self.edit_search, 1)
        row.addWidget(self.combo_tag)
        row.addWidget(self.combo_sort)
        row.addWidget(self.btn_search)
        row.addWidget(self.btn_add)
        row.addWidget(self.btn_edit)
        row.addWidget(self.btn_del)
        row.addWidget(self.btn_tagbulk)
        row.addWidget(self.btn_readme)
        main.addLayout(row)

        # ツリー
        self.tree = QTreeWidget()
        self.tree.setColumnCount(4)
        self.tree.setHeaderLabels(["分類", "ページタイトル", "URL", "タグ"])
        self.tree.setAlternatingRowColors(True)
        self.tree.setUniformRowHeights(True)
        self.tree.setRootIsDecorated(True)
        self.tree.setFont(QFont(UI_FONT_FAMILY, 10))
        self.tree.setSelectionMode(QTreeWidget.ExtendedSelection)

        header = self.tree.header()
        header.setStretchLastSection(False)
        header.setSectionResizeMode(0, QHeaderView.Interactive)
        header.setSectionResizeMode(1, QHeaderView.Stretch)
        header.setSectionResizeMode(2, QHeaderView.Interactive)
        header.setSectionResizeMode(3, QHeaderView.Interactive)
        self.tree.setColumnWidth(0, 180)
        self.tree.setColumnWidth(2, 320)
        self.tree.setColumnWidth(3, 160)
        main.addWidget(self.tree, 1)

        # シグナル
        self.btn_search.clicked.connect(self.update_list)
        self.btn_add.clicked.connect(self._manual_add)
        self.btn_edit.clicked.connect(self._edit_selected)
        self.btn_del.clicked.connect(self._delete_selected)
        self.btn_tagbulk.clicked.connect(self._bulk_edit_tags)
        self.btn_readme.clicked.connect(self._show_readme)
        self.tree.itemDoubleClicked.connect(self._on_double_click)
        self.edit_search.returnPressed.connect(self.update_list)
        self.combo_sort.currentIndexChanged.connect(self._on_sort_changed)

        # 初期ロード
        self._load_sort_option()
        self._refresh_tag_menu()
        self.update_list()

        # クリップボード監視
        self._last_clip = ""
        self.clip_timer = QTimer(self); self.clip_timer.timeout.connect(self._check_clipboard)
        self.clip_timer.start(1000)

        # フレームレス移動/リサイズ
        self._moving = False; self._drag_offset = QPoint()
        self._resizing = False; self._resize_edges = ""; self._start_geo = None; self._start_mouse = None
        self.bgRoot.setMouseTracking(True); self.bgRoot.installEventFilter(self)

        # 起動時だけ最前面
        QTimer.singleShot(0, self._bring_to_front_once)

    # ===== 認証 =====
    def _password_flow(self):
        from PySide6.QtWidgets import QInputDialog
        global FERNET
        if not os.path.exists(DB_FILE):
            while True:
                pw1, ok1 = QInputDialog.getText(self, "新規パスワード設定", "新しいパスワード:", QLineEdit.Password)
                if not ok1 or not pw1: sys.exit(0)
                pw2, ok2 = QInputDialog.getText(self, "確認", "もう一度入力:", QLineEdit.Password)
                if not ok2 or not pw2: sys.exit(0)
                if pw1 != pw2:
                    QMessageBox.warning(self, "不一致", "パスワードが一致しないよ。")
                    continue
                QMessageBox.information(self, "設定完了", "パスワードを設定したよ。忘れないでね！")
                self.f = get_fernet(pw1); FERNET = self.f; break
        else:
            pw, ok = QInputDialog.getText(self, "パスワード入力", "パスワード:", QLineEdit.Password)
            if not ok or not pw: sys.exit(0)
            self.f = get_fernet(pw); FERNET = self.f

    # ===== 位置・サイズ保存/復元 =====
    def _restore_geometry(self):
        st = load_settings_json()
        g = st.get("window_geometry") or {}
        try:
            x, y = int(g.get("x", 0)), int(g.get("y", 0))
            w, h = int(g.get("w", 0)), int(g.get("h", 0))
            if w > 0 and h > 0:
                self.resize(w, h)
            if (w > 0 and h > 0) or (x != 0 or y != 0):
                self.move(max(0, x), max(0, y))
        except Exception:
            pass

    def _save_geometry(self):
        try:
            g = {"x": self.x(), "y": self.y(), "w": self.width(), "h": self.height()}
            st = load_settings_json()
            st["window_geometry"] = g
            save_settings_json(st)
        except Exception:
            pass

    def _bring_to_front_once(self):
        self.setWindowFlag(Qt.WindowStaysOnTopHint, True)
        self.show(); self.raise_(); self.activateWindow()
        def _drop():
            self.setWindowFlag(Qt.WindowStaysOnTopHint, False)
            self.show()
        QTimer.singleShot(400, _drop)

    # ===== タグ・リスト =====
    def _refresh_tag_menu(self):
        tags = collect_all_tags(self.f)
        self.combo_tag.clear(); self.combo_tag.addItem("全て")
        for t in sorted(tags):
            if t: self.combo_tag.addItem(t)

    # ===== 並びオプションの保存/読込 =====
    def _load_sort_option(self):
        st = load_settings_json()
        idx = int(st.get("sort_option", SORT_NEW_TO_OLD))
        if idx < 0 or idx > 3: idx = SORT_NEW_TO_OLD
        self.combo_sort.blockSignals(True)
        self.combo_sort.setCurrentIndex(idx)
        self.combo_sort.blockSignals(False)

    def _on_sort_changed(self, _=None):
        # 保存して即反映
        st = load_settings_json()
        st["sort_option"] = self.combo_sort.currentIndex()
        save_settings_json(st)
        self.update_list()

    # ===== リストの更新（検索 + 並び替え + グルーピング） =====
    def update_list(self):
        keyword = (self.edit_search.text() or "").strip().lower()
        tag_kw  = self.combo_tag.currentText()
        sort_idx = self.combo_sort.currentIndex()
        self.tree.clear()

        items = get_all_bookmarks(self.f)
        terms = keyword.split() if keyword else []

        # フィルタ
        filtered = []
        for bm in items:
            tag_ok = (tag_kw == "全て") or (tag_kw.lower() in (bm["tags"] or "").lower())
            if not tag_ok: continue
            if terms:
                joined = f'{bm["title"]} {bm["url"]} {bm["domain"]} {bm["tags"]}'.lower()
                if not all(t in joined for t in terms): continue
            filtered.append(bm)

        # 並び替え
        if sort_idx == SORT_NEW_TO_OLD:
            # 追加順（新→旧）: id の降順
            filtered.sort(key=lambda x: x["id"], reverse=True)
        elif sort_idx == SORT_OLD_TO_NEW:
            # 追加順（旧→新）: id の昇順
            filtered.sort(key=lambda x: x["id"])
        elif sort_idx == SORT_TITLE_ASC:
            filtered.sort(key=lambda x: natural_key(x["title"]))
        else:  # SORT_TITLE_DESC
            filtered.sort(key=lambda x: natural_key(x["title"]), reverse=True)

        # グループ化
        groups = {}
        for bm in filtered:
            g = bm.get("group") or bm["domain"]
            groups.setdefault(g, []).append(bm)

        # ツリーへ反映
        for g in sorted(groups.keys()):
            parent = QTreeWidgetItem([g, "", "", ""])
            parent.setData(0, Qt.UserRole, None)
            font = parent.font(0); font.setBold(True); parent.setFont(0, font)
            self.tree.addTopLevelItem(parent)
            for bm in groups[g]:
                child = QTreeWidgetItem(["", bm["title"], bm["url"], bm["tags"]])
                child.setData(0, Qt.UserRole, bm)
                child.setToolTip(1, bm["title"])
                child.setToolTip(2, bm["url"])
                child.setToolTip(3, bm["tags"])
                icon = get_site_icon(bm["url"])
                if icon: child.setIcon(1, icon)
                parent.addChild(child)
            parent.setExpanded(True)

    # ====== 共通：タグ結合ロジック ======
    @staticmethod
    def _merge_add_case_insensitive(current: list[str], to_add: list[str]) -> list[str]:
        out = []
        seen_lower = {}
        for t in current:
            key = t.lower()
            if key not in seen_lower:
                seen_lower[key] = t
                out.append(t)
        for t in to_add:
            key = t.lower()
            if key not in seen_lower:
                seen_lower[key] = t
                out.append(t)
        return out

    @staticmethod
    def _parse_tags(s: str) -> list[str]:
        return [t.strip() for t in (s or "").split(",") if t.strip()]

    @staticmethod
    def _join_unique(tags: list[str]) -> str:
        seen = set(); out = []
        for t in tags:
            if t not in seen:
                seen.add(t); out.append(t)
        return ", ".join(out)

    # ====== 追加/編集で使う重複処理 ======
    def _handle_duplicate_flow(self, new_domain, new_title, new_url, new_tags, new_group):
        h = compute_url_hash(new_url)
        exist = find_bookmark_by_urlhash(h, self.f)
        if not exist:
            return ("none", None)
        msg = QMessageBox(self)
        msg.setWindowTitle("重複URLを検出")
        msg.setIcon(QMessageBox.Question)
        msg.setText("このURLは既に登録されているみたい。\nどうする？")
        btn_merge  = msg.addButton("マージ", QMessageBox.AcceptRole)
        btn_over   = msg.addButton("上書き", QMessageBox.DestructiveRole)
        btn_skip   = msg.addButton("スキップ", QMessageBox.RejectRole)
        msg.exec()
        if msg.clickedButton() is btn_merge:
            return ("merge", exist)
        elif msg.clickedButton() is btn_over:
            return ("overwrite", exist)
        else:
            return ("skip", exist)

    # ====== タグ一括処理 ======
    def _bulk_edit_tags(self):
        selected_children = [it for it in self.tree.selectedItems() if it.parent()]
        if not selected_children:
            QMessageBox.information(self, "未選択", "タグを編集するブックマーク（複数可）を選んでね。")
            return
        dlg = BulkTagDialog(self)
        if dlg.exec() != QDialog.Accepted:
            return
        mode = dlg.mode()
        inputs = dlg.tags_input()
        count = 0
        for it in selected_children:
            bm = it.data(0, Qt.UserRole)
            if not bm: continue
            cur_tags = self._parse_tags(bm.get("tags") or "")
            if mode == "replace":
                new_tags_list = inputs
            elif mode == "add":
                new_tags_list = self._merge_add_case_insensitive(cur_tags, inputs)
            else:  # remove（区別あり）
                rm = set(inputs)
                new_tags_list = [t for t in cur_tags if t not in rm]
            new_tags_str = self._join_unique(new_tags_list)
            update_bookmark_tags(bm["id"], new_tags_str, self.f)
            count += 1
        self._refresh_tag_menu()
        self.update_list()
        QMessageBox.information(self, "完了", f"{count} 件のタグを更新したよ。")

    # ===== CRUD =====
    def _manual_add(self):
        dlg = BookmarkEditDialog(self, is_new=True)
        if dlg.exec() == QDialog.Accepted:
            url   = normalize_url(dlg.ed_url.text().strip())
            title = dlg.ed_title.text().strip() or get_page_title(url)
            tags  = dlg.ed_tags.text().strip()
            domain = extract_domain(url)
            group  = domain
            action, exist = self._handle_duplicate_flow(domain, title, url, tags, group)
            if action == "skip":
                return
            elif action == "merge":
                cur = self._parse_tags(exist["tags"]); put = self._parse_tags(tags)
                merged_tags = self._merge_add_case_insensitive(cur, put)
                tags = self._join_unique(merged_tags)
                if len(title) > len(exist["title"]):
                    update_bookmark_full(exist["id"], domain, title, url, tags, group, self.f)
                else:
                    update_bookmark_full(exist["id"], exist["domain"], exist["title"], url, tags, exist["group"] or group, self.f)
                self._refresh_tag_menu(); self.update_list()
            elif action == "overwrite":
                update_bookmark_full(exist["id"], domain, title, url, tags, group, self.f)
                self._refresh_tag_menu(); self.update_list()
            else:
                add_bookmark_to_db(domain, title, url, tags or "", group, self.f)
                self._refresh_tag_menu(); self.update_list()

    def _edit_selected(self):
        item = self.tree.currentItem()
        if not item or not item.parent():
            QMessageBox.information(self, "未選択", "編集するブックマーク（子項目）を選んでね。")
            return
        bm = item.data(0, Qt.UserRole)
        if not bm: return
        dlg = BookmarkEditDialog(self, title=bm["title"], url=bm["url"], tags=bm["tags"], is_new=False)
        if dlg.exec() == QDialog.Accepted:
            new_url   = normalize_url(dlg.ed_url.text().strip())
            new_title = dlg.ed_title.text().strip() or get_page_title(new_url)
            new_tags  = dlg.ed_tags.text().strip()
            new_domain = extract_domain(new_url)
            new_group  = new_domain

            h = compute_url_hash(new_url)
            exist = find_bookmark_by_urlhash(h, self.f)
            if exist and exist["id"] != bm["id"]:
                msg = QMessageBox(self)
                msg.setWindowTitle("重複URLを検出")
                msg.setIcon(QMessageBox.Question)
                msg.setText("編集後のURLは既に登録されているみたい。\nどうする？")
                btn_merge  = msg.addButton("マージ", QMessageBox.AcceptRole)
                btn_over   = msg.addButton("上書き", QMessageBox.DestructiveRole)
                btn_cancel = msg.addButton("キャンセル", QMessageBox.RejectRole)
                msg.exec()
                if msg.clickedButton() is btn_merge:
                    cur = self._parse_tags(exist["tags"]); put = self._parse_tags(new_tags)
                    merged_tags = self._merge_add_case_insensitive(cur, put)
                    new_tags = self._join_unique(merged_tags)
                    if len(new_title) > len(exist["title"]):
                        update_bookmark_full(exist["id"], new_domain, new_title, new_url, new_tags, new_group, self.f)
                    else:
                        update_bookmark_full(exist["id"], exist["domain"], exist["title"], new_url, new_tags, exist["group"] or new_group, self.f)
                    delete_bookmark_by_id(bm["id"])
                    self._refresh_tag_menu(); self.update_list()
                    return
                elif msg.clickedButton() is btn_over:
                    update_bookmark_full(exist["id"], new_domain, new_title, new_url, new_tags, new_group, self.f)
                    delete_bookmark_by_id(bm["id"])
                    self._refresh_tag_menu(); self.update_list()
                    return
                else:
                    return
            update_bookmark_full(bm["id"], new_domain, new_title, new_url, new_tags, new_group, self.f)
            self._refresh_tag_menu(); self.update_list()

    def _delete_selected(self):
        item = self.tree.currentItem()
        if not item or not item.parent():
            QMessageBox.information(self, "未選択", "削除するブックマーク（子項目）を選んでね。")
            return
        bm = item.data(0, Qt.UserRole)
        if not bm: return
        if QMessageBox.question(self, "確認", "本当に削除する？") == QMessageBox.Yes:
            delete_bookmark_by_id(bm["id"])
            self._refresh_tag_menu(); self.update_list()

    # ===== 動作 =====
    def _on_double_click(self, item, col):
        bm = item.data(0, Qt.UserRole)
        if bm and is_url(bm["url"]): webbrowser.open(bm["url"])

    def _show_readme(self):
        ReadmeDialog(self).exec()

    # ===== クリップボード監視 =====
    def _check_clipboard(self):
        from PySide6.QtGui import QGuiApplication
        text = (QGuiApplication.clipboard().text() or "").strip()
        if text == self._last_clip: return
        self._last_clip = text
        if is_url(text):
            nurl  = normalize_url(text)
            title = get_page_title(nurl)
            dlg = BookmarkEditDialog(self, is_new=True, title=title, url=nurl, tags="")
            if dlg.exec() == QDialog.Accepted:
                url   = normalize_url(dlg.ed_url.text().strip())
                title = dlg.ed_title.text().strip() or get_page_title(url)
                tags  = dlg.ed_tags.text().strip()
                domain = extract_domain(url)
                group  = domain
                action, exist = self._handle_duplicate_flow(domain, title, url, tags, group)
                if action == "skip":
                    return
                elif action == "merge":
                    cur = self._parse_tags(exist["tags"]); put = self._parse_tags(tags)
                    merged_tags = self._merge_add_case_insensitive(cur, put)
                    tags = self._join_unique(merged_tags)
                    if len(title) > len(exist["title"]):
                        update_bookmark_full(exist["id"], domain, title, url, tags, group, self.f)
                    else:
                        update_bookmark_full(exist["id"], exist["domain"], exist["title"], url, tags, exist["group"] or group, self.f)
                    self._refresh_tag_menu(); self.update_list()
                elif action == "overwrite":
                    update_bookmark_full(exist["id"], domain, title, url, tags, group, self.f)
                    self._refresh_tag_menu(); self.update_list()
                else:
                    add_bookmark_to_db(domain, title, url, tags or "", group, self.f)
                    self._refresh_tag_menu(); self.update_list()

    # ===== フレームレス移動/リサイズ =====
    def eventFilter(self, obj, e):
        if obj is self.bgRoot:
            if e.type() == QEvent.MouseButtonPress and e.button() == Qt.LeftButton:
                pos = self.mapFromGlobal(e.globalPosition().toPoint())
                edges = self._edge_at(pos)
                if edges:
                    self._resizing = True; self._resize_edges = edges
                    self._start_geo = self.geometry(); self._start_mouse = e.globalPosition().toPoint()
                else:
                    self._moving = True; self._drag_offset = e.globalPosition().toPoint() - self.frameGeometry().topLeft()
                return True
            elif e.type() == QEvent.MouseMove:
                if self._resizing:
                    self._resize_to(e.globalPosition().toPoint()); return True
                if self._moving and (e.buttons() & Qt.LeftButton) and not self.isMaximized():
                    self.move(e.globalPosition().toPoint() - self._drag_offset); return True
                self._update_cursor(self._edge_at(self.mapFromGlobal(e.globalPosition().toPoint())))
            elif e.type() == QEvent.MouseButtonRelease:
                self._resizing = False; self._moving = False; return True
        return super().eventFilter(obj, e)

    def _edge_at(self, pos):
        m = 8; r = self.bgRoot.rect(); edges = ""
        if pos.y() <= m: edges += "T"
        if pos.y() >= r.height()-m: edges += "B"
        if pos.x() <= m: edges += "L"
        if pos.x() >= r.width()-m: edges += "R"
        return edges

    def _update_cursor(self, edges):
        if edges in ("TL","BR"): self.setCursor(Qt.SizeFDiagCursor)
        elif edges in ("TR","BL"): self.setCursor(Qt.SizeBDiagCursor)
        elif edges in ("L","R"):  self.setCursor(Qt.SizeHorCursor)
        elif edges in ("T","B"):  self.setCursor(Qt.SizeVerCursor)
        else: self.setCursor(Qt.ArrowCursor)

    def _resize_to(self, gpos):
        dx = gpos.x() - self._start_mouse.x(); dy = gpos.y() - self._start_mouse.y()
        geo = self._start_geo; x,y,w,h = geo.x(),geo.y(),geo.width(),geo.height()
        minw, minh = 720, 420
        if "L" in self._resize_edges:
            new_w = max(minw, w - dx); x += (w - new_w); w = new_w
        if "R" in self._resize_edges:
            w = max(minw, w + dx)
        if "T" in self._resize_edges:
            new_h = max(minh, h - dy); y += (h - new_h); h = new_h
        if "B" in self._resize_edges:
            h = max(minh, h + dy)
        self.setGeometry(QRect(x, y, w, h))

    def closeEvent(self, e):
        self._save_geometry()
        return super().closeEvent(e)
