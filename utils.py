
import os, re, json
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

# ---- リソースパス
def resource_path(name: str) -> str:
    base = getattr(__import__('sys'), "_MEIPASS", None)
    return os.path.join(base, name) if base else os.path.abspath(name)

# ---- URL判定
def is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text or ""))

# ---- ドメイン抽出
def extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc
    except Exception:
        return url

# ---- URL正規化
_TRACKING_KEYS = {
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "utm_name","utm_id","utm_reader","utm_viz_id","utm_pubreferrer",
    "fbclid","gclid","igshid","mc_cid","mc_eid"
}

def normalize_url(url: str) -> str:
    """
    代表的な正規化：
      - scheme/host を小文字化
      - デフォルトポート(:80/:443)除去
      - 末尾スラ削除（ただしルートは'/'のまま）
      - フラグメント(#...)除去
      - トラッキング系クエリ削除 + クエリキーで昇順ソート + 空値削除
    """
    try:
        p = urlparse(url.strip())
        if p.scheme.lower() not in ("http", "https"):
            return url  # 非HTTP(S)は触らない
        scheme = p.scheme.lower()
        netloc = p.hostname.lower() if p.hostname else ""
        port = p.port
        if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
            netloc = f"{netloc}:{port}"
        path = p.path or "/"
        path = re.sub(r"//+", "/", path)
        if path != "/" and path.endswith("/"):
            path = path[:-1]
        # クエリ処理
        params = []
        for k, v in parse_qsl(p.query, keep_blank_values=False):
            if not k: 
                continue
            if k.lower() in _TRACKING_KEYS:
                continue
            if v is None or v == "":
                continue
            params.append((k, v))
        # キーで昇順、同キーは値で安定ソート
        params.sort(key=lambda kv: (kv[0], kv[1]))
        query = urlencode(params, doseq=True)
        # フラグメント除去
        fragment = ""
        return urlunparse((scheme, netloc, path, "", query, fragment))
    except Exception:
        return url

# ---- 設定ファイル（JSON）: ~/.config/SecretBookMarks/SecretBookMarks_settings.json
def app_config_dir() -> str:
    base = os.path.expanduser("~/.config/SecretBookMarks")
    os.makedirs(base, exist_ok=True)
    return base

def settings_file_path() -> str:
    return os.path.join(app_config_dir(), "SecretBookMarks_settings.json")

def load_settings_json() -> dict:
    path = settings_file_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f) or {}
    except Exception:
        pass
    return {}

def save_settings_json(data: dict) -> None:
    path = settings_file_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data or {}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
