"""旧 SecretBookMarks（PySide6 版）の暗号化 SQLite を、新アプリで取り込める JSON へ変換します。

使い方:
    python migrate_legacy.py <secret_bookmarks.db> <output.json>

実行するとパスワードを尋ねます。旧アプリと同じパスワードを入力してください。
出力された JSON は、新アプリの「入出力 → 取り込む」から読み込めます。
変換後の JSON は平文です。取り込みが終わったら必ず削除してください。

必要なライブラリ: cryptography
"""

import base64
import getpass
import json
import sqlite3
import sys
from pathlib import Path

from cryptography.fernet import Fernet


def legacy_fernet(password: str) -> Fernet:
    """旧実装の鍵導出（KDF なし・パスワードを 32 バイトへ 0 埋め）をそのまま再現します。"""
    return Fernet(base64.urlsafe_b64encode(password.ljust(32, "0").encode("utf-8")[:32]))


def decrypt(f: Fernet, value) -> str:
    if not value:
        return ""
    try:
        return f.decrypt(value).decode("utf-8")
    except Exception:
        return ""


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    db_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not db_path.exists():
        print(f"データベースが見つかりません: {db_path}")
        return 1

    f = legacy_fernet(getpass.getpass("旧アプリのパスワード: "))

    rows = []
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, enc_domain, enc_title, enc_url, enc_tags, enc_group FROM bookmarks;")
        for _id, enc_domain, enc_title, enc_url, enc_tags, enc_group in cur.fetchall():
            url = decrypt(f, enc_url)
            if not url:
                continue
            domain = decrypt(f, enc_domain)
            rows.append(
                {
                    "url": url,
                    "title": decrypt(f, enc_title) or url,
                    "tags": [t.strip() for t in decrypt(f, enc_tags).split(",") if t.strip()],
                    "group": decrypt(f, enc_group) or domain,
                    "note": "",
                }
            )

    if not rows:
        print("復号できたブックマークがありません。パスワードを確認してください。")
        return 1

    out_path.write_text(
        json.dumps({"app": "SecretBookMarks", "version": 1, "bookmarks": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"{len(rows)} 件を {out_path} へ書き出しました。取り込み後はこのファイルを削除してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
