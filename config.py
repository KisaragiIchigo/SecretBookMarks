
APP_TITLE      = "SecretBookMarks"
TITLE_SUFFIX   = "©️2025 KisaragiIchigo"
DB_FILE        = "secret_bookmarks.db"
UI_FONT_FAMILY = "メイリオ"

# ===== カラーパレット =====
PRIMARY_COLOR       = "#4169e1"
HOVER_COLOR         = "#7000e0"
TITLE_COLOR         = "black"
TEXT_COLOR          = "white"
CLOSEBTN_COLOR      = "#FF0000"
MINBTN_COLOR        = "#FFD600"
MAXBTN_COLOR        = "#00C853"

WINDOW_BG        = "rgba(153,179,255,0)"            
GLASSROOT_BG     = "rgba(240,255,255,230)"          
GLASSROOT_BORDER = "3px solid rgba(65,105,255,255)" 
TEXTPANEL_BG     = "rgba(153,179,255,220)"         
BORDER_DROP_DASHED  = f"2px dashed {PRIMARY_COLOR}"

# ===== 角丸・余白 =====
RADIUS_WINDOW = 18
RADIUS_CARD   = 16
RADIUS_PANEL  = 10
RADIUS_BUTTON = 8
RADIUS_CLOSE  = 6
RADIUS_DROP   = 12
PADDING_CARD  = 16
GAP_DEFAULT   = 10

def build_qss() -> str:
    return f"""
    QWidget#bgRoot {{
        background-color:{WINDOW_BG};
        border-radius:{RADIUS_WINDOW}px;
        font-family: "{UI_FONT_FAMILY}";
    }}
    QWidget#glassRoot {{
        background-color:{GLASSROOT_BG};
        border:{GLASSROOT_BORDER};
        border-radius:{RADIUS_CARD}px;
    }}

    /* タイトル */
    QLabel#titleLabel {{
        color:{TITLE_COLOR};
        font-weight:bold;
        font-size:7pt; /* GUIsample準拠 */
    }}

    /* パネル（暗めの面） */
    .DarkPanel, #textPanel {{
        background-color:{TEXTPANEL_BG};
        border-radius:{RADIUS_PANEL}px;
        border:1px solid black;
        padding:8px;
    }}

    /* 一般文字色（DarkPanel内） */
    .DarkPanel QLabel, .DarkPanel QLineEdit, .DarkPanel QComboBox, .DarkPanel QDateEdit,
    .DarkPanel QCheckBox, .DarkPanel QRadioButton, .DarkPanel QSpinBox,
    #textPanel QTextEdit, #textPanel QListWidget {{
        color:{TEXT_COLOR};
        background-color:transparent;
    }}

    /* READMEだけ黒背景（可読性UP） */
    QTextEdit#readmeText, QTextBrowser#readmeText {{
        color:{TEXT_COLOR};
        background-color:#333333;
        border-radius:{RADIUS_PANEL}px;
        padding:6px;
    }}

    /* 入力系 */
    QLineEdit, QComboBox {{
        border:1px solid #888;
        border-radius:4px;
        padding:4px 6px;
        background-color:#fff;
        color:#222;
    }}
    .DarkPanel QLineEdit, .DarkPanel QComboBox, .DarkPanel QDateEdit {{
        background-color:#696969;
        border-radius:3px;
        border:1px solid #888;
        padding:2px 6px;
        color:{TEXT_COLOR};
    }}
    .DarkPanel QComboBox QAbstractItemView {{
        background-color:#3c3c3c; color:#e0e0e0; border:1px solid #888;
        selection-background-color:{PRIMARY_COLOR};
    }}

    /* ボタン */
    QPushButton {{
        background-color:{PRIMARY_COLOR};
        color:white;
        border:none;
        padding:6px 10px;
        border-radius:{RADIUS_BUTTON}px;
    }}
    QPushButton:hover {{ background-color:{HOVER_COLOR}; }}

    /* タイトルバーの三点（色だけルール準拠） */
    QPushButton#minBtn {{
        background:transparent; color:{MINBTN_COLOR};
        border-radius:{RADIUS_CLOSE}px; font-weight:bold; padding:0px;
    }}
    QPushButton#minBtn:hover {{ background:rgba(153,179,255,0.06); }}
    QPushButton#maxBtn {{
        background:transparent; color:{MAXBTN_COLOR};
        border-radius:{RADIUS_CLOSE}px; font-weight:bold; padding:0px;
    }}
    QPushButton#maxBtn:hover {{ background:rgba(153,179,255,0.06); }}
    QPushButton#closeBtn {{
        background:transparent; color:{CLOSEBTN_COLOR};
        border-radius:{RADIUS_CLOSE}px; font-weight:bold; padding:0px;
    }}
    QPushButton#closeBtn:hover {{ background:rgba(153,179,255,0.06); }}

    /* ==== ツリー（視認性UP） ==== */
    QTreeWidget {{
        border:1px solid #ccd;
        background:white;
        alternate-background-color:#f5f8ff; /* 交互色で視線誘導 */
        color:#111; /* 文字は濃い目 */
    }}
    QTreeWidget::item {{
        padding:4px 8px; /* 行高を取り、窮屈さを解消 */
    }}
    /* 選択時ははっきりした青+白文字 */
    QTreeView::item:selected {{
        background:{PRIMARY_COLOR};
        color:white;
    }}
    /* フォーカス外選択も同等に（Windowsで薄色化する問題対策） */
    QTreeView::item:selected:!active {{
        background:{PRIMARY_COLOR};
        color:white;
    }}
    /* ヘッダはやや目立つ色に */
    QHeaderView::section {{
        background:#e8efff;
        color:#222;
        border:1px solid #ccd;
        padding:6px 10px;
        font-weight:bold;
    }}

    """
