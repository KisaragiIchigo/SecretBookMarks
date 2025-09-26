import sqlite3, base64, os, hashlib
from cryptography.fernet import Fernet
from config import DB_FILE
from utils import normalize_url

# --- 暗号 ---
def _generate_key(password: str):
    return base64.urlsafe_b64encode(password.ljust(32, "0").encode("utf-8")[:32])

def get_fernet(password: str) -> Fernet:
    return Fernet(_generate_key(password))

# --- DB初期化 ---
def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enc_domain TEXT NOT NULL,
            enc_title  TEXT NOT NULL,
            enc_url    TEXT NOT NULL,
            enc_tags   TEXT,
            enc_group  TEXT,
            url_hash   TEXT   -- ★ 正規化URLのSHA256（平文）
        );
        """)
        conn.commit()

def ensure_group_column():
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(bookmarks);")
        cols = [c[1] for c in cur.fetchall()]
        if "enc_group" not in cols:
            cur.execute("ALTER TABLE bookmarks ADD COLUMN enc_group TEXT;")
        if "url_hash" not in cols:
            cur.execute("ALTER TABLE bookmarks ADD COLUMN url_hash TEXT;")
        conn.commit()

def compute_url_hash(url: str) -> str:
    n = normalize_url(url)
    return hashlib.sha256(n.encode("utf-8")).hexdigest()

def _create_unique_index_for_urlhash(conn):
    cur = conn.cursor()
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_urlhash ON bookmarks(url_hash);")
    conn.commit()

def migrate_populate_url_hash(f: Fernet):
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        # url_hash が NULL/空のものだけ選別
        cur.execute("SELECT id, enc_url FROM bookmarks WHERE (url_hash IS NULL OR url_hash='');")
        rows = cur.fetchall()
        for _id, enc_url in rows:
            try:
                url = f.decrypt(enc_url).decode("utf-8")
            except Exception:
                url = ""
            h = compute_url_hash(url) if url else None
            cur2 = conn.cursor()
            cur2.execute("UPDATE bookmarks SET url_hash=? WHERE id=?", (h, _id))
        conn.commit()
        _create_unique_index_for_urlhash(conn)

# --- CRUD ---
def add_bookmark_to_db(domain, title, url, tags, group, f: Fernet):
    h = compute_url_hash(url)
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO bookmarks (enc_domain, enc_title, enc_url, enc_tags, enc_group, url_hash)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (
            f.encrypt(domain.encode("utf-8")),
            f.encrypt(title.encode("utf-8")),
            f.encrypt(url.encode("utf-8")),
            f.encrypt((tags or "").encode("utf-8")),
            f.encrypt((group or domain).encode("utf-8")),
            h
        ))
        conn.commit()

def get_all_bookmarks(f: Fernet):
    data = []
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, enc_domain, enc_title, enc_url, enc_tags, enc_group, url_hash FROM bookmarks;")
        for row in cur.fetchall():
            try:
                domain = f.decrypt(row[1]).decode("utf-8")
                title  = f.decrypt(row[2]).decode("utf-8")
                url    = f.decrypt(row[3]).decode("utf-8")
                tags   = f.decrypt(row[4]).decode("utf-8") if row[4] else ""
                group  = f.decrypt(row[5]).decode("utf-8") if row[5] else domain
                urlhash = row[6]
                data.append({"id": row[0], "domain": domain, "title": title, "url": url, "tags": tags, "group": group, "url_hash": urlhash})
            except Exception:
                continue
    return data

def update_bookmark_title(bm_id: int, new_title: str, f: Fernet):
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("UPDATE bookmarks SET enc_title=? WHERE id=?",
                    (f.encrypt(new_title.encode("utf-8")), bm_id))
        conn.commit()

def update_bookmark_full(bm_id: int, domain: str, title: str, url: str, tags: str, group: str, f: Fernet):
    h = compute_url_hash(url)
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE bookmarks
                       SET enc_domain=?, enc_title=?, enc_url=?, enc_tags=?, enc_group=?, url_hash=?
                       WHERE id=?""",
                    (f.encrypt(domain.encode("utf-8")),
                     f.encrypt(title.encode("utf-8")),
                     f.encrypt(url.encode("utf-8")),
                     f.encrypt((tags or "").encode("utf-8")),
                     f.encrypt((group or domain).encode("utf-8")),
                     h,
                     bm_id))
        conn.commit()

def delete_bookmark_by_id(bm_id: int):
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM bookmarks WHERE id=?", (bm_id,))
        conn.commit()

# --- タグ集計 ---
def collect_all_tags(f: Fernet):
    tags = set()
    for bm in get_all_bookmarks(f):
        for t in (bm["tags"] or "").split(","):
            t = t.strip()
            if t: tags.add(t)
    return tags

def update_bookmark_tags(bm_id: int, new_tags: str, f: Fernet):
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("UPDATE bookmarks SET enc_tags=? WHERE id=?",
                    (f.encrypt((new_tags or "").encode("utf-8")), bm_id))
        conn.commit()

# --- 重複検索 ---
def find_bookmark_by_urlhash(url_hash: str, f: Fernet):
    with sqlite3.connect(DB_FILE) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, enc_domain, enc_title, enc_url, enc_tags, enc_group FROM bookmarks WHERE url_hash=? LIMIT 1;", (url_hash,))
        row = cur.fetchone()
        if not row:
            return None
        try:
            return {
                "id": row[0],
                "domain": f.decrypt(row[1]).decode("utf-8"),
                "title":  f.decrypt(row[2]).decode("utf-8"),
                "url":    f.decrypt(row[3]).decode("utf-8"),
                "tags":   f.decrypt(row[4]).decode("utf-8") if row[4] else "",
                "group":  f.decrypt(row[5]).decode("utf-8") if row[5] else "",
            }
        except Exception:
            return None
