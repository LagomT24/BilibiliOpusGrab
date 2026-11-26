#!/usr/bin/env python3
"""Bilibili 空间图文（opus）原图爬虫.

从 https://space.bilibili.com/<uid>/upload/opus 抓取全部图文，
把每篇里的图片按 “日期 + 序号” 命名保存到本地。

命名规则:  {YYYY.MM.DD} ({n}).{ext}
    同一天有多篇作品时，序号跨作品连续累加，
    按发布时间从早到晚依次编号，例如:
        2026.10.26 (1).jpg ... (6).jpg

用法:
    python bilibili_opus_grab.py --uid 2394319 --since 2021-08-01 --out images
    python bilibili_opus_grab.py --dry-run            # 只统计，不下载
    python bilibili_opus_grab.py --cookie "SESSDATA=xxx; bili_jct=yyy"   # 可选，风控更宽松
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import requests

TZ = timezone(timedelta(hours=8))
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

LIST_API = "https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space"
DETAIL_API = "https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/detail"
SPI_API = "https://api.bilibili.com/x/frontend/finger/spi"
NAV_API = "https://api.bilibili.com/x/web-interface/nav"

# WBI 签名用的固定置换表
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

KNOWN_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"}
NAME_RE = re.compile(r"^(\d{4}\.\d{2}\.\d{2}) \((\d+)\)\.([A-Za-z0-9]+)$")
BLOCK_CODES = {-352, -412, -509, -799, -10403}


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def setup_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def log(msg: str) -> None:
    print(msg, flush=True)


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def fmt_time(ts: int) -> str:
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d %H:%M")


def parse_time_arg(text: str) -> int:
    """接受 2021-08-01 / 2021-08-01 12:30 / 2021.08.01，按北京时间解析。"""
    text = text.strip().replace(".", "-").replace("/", "-")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text, fmt).replace(tzinfo=TZ)
            return int(dt.timestamp())
        except ValueError:
            continue
    raise SystemExit(f"无法解析时间: {text}")


def normalize_image_url(url: str) -> str:
    """统一成 https，并去掉 CDN 的 @xxx 压缩/裁剪后缀。"""
    if not url:
        return ""
    u = url.strip()
    if u.startswith("//"):
        u = "https:" + u
    elif u.startswith("http://"):
        u = "https://" + u[len("http://"):]
    u = u.split("?", 1)[0]
    if "@" in u:
        u = u.split("@", 1)[0]
    return u


def ext_from_url(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower().lstrip(".")
    if suffix in KNOWN_EXT:
        return "jpg" if suffix == "jpeg" else suffix
    return "jpg"


def image_dimensions(path: Path) -> tuple[int, int] | None:
    """纯 Python 读取 JPEG/PNG/GIF/WebP 的宽高，用于校验拿到的是不是原分辨率。"""
    try:
        with open(path, "rb") as fh:
            head = fh.read(1 << 20)
    except OSError:
        return None

    if head[:2] == b"\xff\xd8":  # JPEG
        i, n = 2, len(head)
        while i + 9 < n:
            if head[i] != 0xFF:
                i += 1
                continue
            marker = head[i + 1]
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            if marker == 0xDA:  # 进入扫描数据，后面不会再有 SOF
                return None
            length = int.from_bytes(head[i + 2 : i + 4], "big")
            if marker in (
                0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
            ):
                h = int.from_bytes(head[i + 5 : i + 7], "big")
                w = int.from_bytes(head[i + 7 : i + 9], "big")
                return (w, h)
            i += 2 + length
        return None

    if head[:8] == b"\x89PNG\r\n\x1a\n":  # PNG
        w = int.from_bytes(head[16:20], "big")
        h = int.from_bytes(head[20:24], "big")
        return (w, h) if w and h else None

    if head[:6] in (b"GIF87a", b"GIF89a"):  # GIF
        w = int.from_bytes(head[6:8], "little")
        h = int.from_bytes(head[8:10], "little")
        return (w, h) if w and h else None

    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":  # WebP
        chunk = head[12:16]
        if chunk == b"VP8X":
            w = int.from_bytes(head[24:27], "little") + 1
            h = int.from_bytes(head[27:30], "little") + 1
            return (w, h)
        if chunk == b"VP8 ":
            w = int.from_bytes(head[26:28], "little") & 0x3FFF
            h = int.from_bytes(head[28:30], "little") & 0x3FFF
            return (w, h)
        if chunk == b"VP8L":
            bits = int.from_bytes(head[21:25], "little")
            return ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
    return None


# --------------------------------------------------------------------------- #
# 限速器：多线程共享的全局最小请求间隔
# --------------------------------------------------------------------------- #
class RateLimiter:
    def __init__(self, min_interval: float, jitter: float = 0.35):
        self.min_interval = max(0.0, min_interval)
        self.jitter = jitter
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        if self.min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            delay = max(0.0, self._next - now)
            step = self.min_interval * random.uniform(1 - self.jitter, 1 + self.jitter)
            self._next = max(now, self._next) + step
        if delay > 0:
            time.sleep(delay)


# --------------------------------------------------------------------------- #
# B 站客户端
# --------------------------------------------------------------------------- #
class BiliError(Exception):
    def __init__(self, code: Any, message: str = "", url: str = ""):
        self.code = code
        self.message = message
        self.url = url
        super().__init__(f"code={code} message={message} url={url}")


class RiskControl(Exception):
    """连续触发风控，本轮应中止（缓存已落盘，重跑可续传）。"""


class BiliClient:
    def __init__(
        self,
        cache_dir: Path,
        delay: float = 0.3,
        retries: int = 5,
        cookie_extra: str = "",
        timeout: int = 20,
        max_risk: int = 5,
    ):
        self.cache_dir = cache_dir
        self.retries = max(1, retries)
        self.timeout = timeout
        self.limiter = RateLimiter(delay)
        self.cookie_extra = cookie_extra.strip()
        self.max_risk = max_risk
        self.risk_streak = 0
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": UA,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Origin": "https://space.bilibili.com",
            }
        )
        self._lock = threading.Lock()
        self._mixin_key = ""
        self._wbi_date = ""
        self._buvid_ready = False
        self._init_cookie()

    # -- cookie / 签名 ------------------------------------------------------ #
    def _init_cookie(self) -> None:
        if self.cookie_extra:
            for part in self.cookie_extra.split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    self.session.cookies.set(k.strip(), v.strip(), domain=".bilibili.com")
        cache = self.cache_dir / "buvid.json"
        data = load_json(cache, {})
        if data.get("buvid3") and time.time() - data.get("ts", 0) < 86400 * 7:
            self._apply_buvid(data["buvid3"], data["buvid4"])
            return
        self.refresh_buvid()

    def _apply_buvid(self, b3: str, b4: str) -> None:
        self.session.cookies.set("buvid3", b3, domain=".bilibili.com")
        self.session.cookies.set("buvid4", b4, domain=".bilibili.com")
        self.session.cookies.set("b_nut", str(int(time.time())), domain=".bilibili.com")
        self._buvid_ready = True

    def refresh_buvid(self) -> None:
        try:
            r = self.session.get(
                SPI_API, headers={"Referer": "https://www.bilibili.com/"}, timeout=self.timeout
            )
            d = (r.json() or {}).get("data") or {}
            b3, b4 = d.get("b_3"), d.get("b_4")
            if b3 and b4:
                self._apply_buvid(b3, b4)
                save_json(self.cache_dir / "buvid.json", {"buvid3": b3, "buvid4": b4, "ts": time.time()})
        except Exception:
            pass

    def _ensure_wbi(self, force: bool = False) -> None:
        today = datetime.now(TZ).strftime("%Y-%m-%d")
        with self._lock:
            if not force and self._mixin_key and self._wbi_date == today:
                return
            cache = self.cache_dir / "wbi.json"
            data = load_json(cache, {})
            if not force and data.get("date") == today and data.get("mixin_key"):
                self._mixin_key = data["mixin_key"]
                self._wbi_date = today
                return
            try:
                r = self.session.get(
                    NAV_API, headers={"Referer": "https://www.bilibili.com/"}, timeout=self.timeout
                )
                wbi = ((r.json() or {}).get("data") or {}).get("wbi_img") or {}
                img_key = wbi.get("img_url", "").split("/")[-1].split(".")[0]
                sub_key = wbi.get("sub_url", "").split("/")[-1].split(".")[0]
                if not img_key or not sub_key:
                    return
                raw = img_key + sub_key
                self._mixin_key = "".join(raw[i] for i in MIXIN_KEY_ENC_TAB)[:32]
                self._wbi_date = today
                save_json(cache, {"date": today, "mixin_key": self._mixin_key})
            except Exception:
                pass

    def _sign(self, params: dict[str, Any]) -> dict[str, Any]:
        self._ensure_wbi()
        # 官方实现会剔除值里的 !'()* 这几个字符，否则签名对不上
        p = {
            k: "".join(c for c in str(v) if c not in "!'()*")
            for k, v in params.items()
            if v is not None
        }
        p["wts"] = str(int(time.time()))
        query = urlencode(sorted(p.items()), quote_via=quote)
        p["w_rid"] = hashlib.md5((query + self._mixin_key).encode()).hexdigest()
        return p

    # -- 请求 --------------------------------------------------------------- #
    def get_json(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        signed: bool = True,
        referer: str = "https://www.bilibili.com/",
    ) -> dict[str, Any]:
        last = "unknown"
        for attempt in range(1, self.retries + 1):
            self.limiter.wait()
            p = self._sign(params or {}) if signed else dict(params or {})
            try:
                r = self.session.get(url, params=p, headers={"Referer": referer}, timeout=self.timeout)
            except requests.RequestException as exc:
                last = f"网络错误: {exc.__class__.__name__}"
                time.sleep(min(30, 2 ** attempt))
                continue

            if r.status_code == 412:
                last = "HTTP 412（风控）"
                self._on_blocked(attempt)
                continue
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                time.sleep(min(20, 2 ** attempt))
                continue

            try:
                data = r.json()
            except ValueError:
                last = "响应不是 JSON"
                time.sleep(min(20, 2 ** attempt))
                continue

            code = data.get("code")
            if code == 0:
                self.risk_streak = 0
                return data
            if code in BLOCK_CODES:
                last = f"code {code}（风控）"
                self._on_blocked(attempt)
                continue
            raise BiliError(code, str(data.get("message", "")), url)

        raise BiliError("retry_exhausted", last, url)

    def _on_blocked(self, attempt: int) -> None:
        """风控退避；连续多次仍被拦就中止本轮，避免把 IP 越封越久。"""
        self.risk_streak += 1
        if self.max_risk and self.risk_streak >= self.max_risk:
            raise RiskControl(
                f"连续 {self.risk_streak} 次触发风控，本轮中止（缓存已保存，稍后重跑可续传）"
            )
        self.refresh_buvid()
        self._ensure_wbi(force=True)
        wait = min(120, 10 * (2 ** (attempt - 1))) + random.uniform(0, 5)
        log(f"    [风控] 第 {attempt} 次触发限制，等待 {wait:.0f}s 后重试 ...")
        time.sleep(wait)


# --------------------------------------------------------------------------- #
# 抓取：列表 + 详情
# --------------------------------------------------------------------------- #
def fetch_opus_list(client: BiliClient, uid: int, cache: Path, refresh: bool) -> list[dict]:
    if cache.exists() and not refresh:
        items = load_json(cache, [])
        if items:
            log(f"[列表] 命中缓存：{len(items)} 篇（{cache}）")
            return items

    referer = f"https://space.bilibili.com/{uid}/upload/opus"
    items: list[dict] = []
    seen: set[str] = set()
    page, offset = 1, ""
    while True:
        data = client.get_json(
            LIST_API,
            {"host_mid": uid, "page": page, "offset": offset, "web_location": "333.1387"},
            signed=False,
            referer=referer,
        )
        d = data.get("data") or {}
        batch = d.get("items") or []
        new = 0
        for it in batch:
            oid = str(it.get("opus_id") or "")
            if oid and oid not in seen:
                seen.add(oid)
                items.append({"opus_id": oid, "cover": it.get("cover")})
                new += 1
        log(f"[列表] 第 {page:>3} 页 +{new:<3} 累计 {len(items)}")
        if not d.get("has_more") or not batch:
            break
        offset = d.get("offset") or ""
        if not offset:
            break
        page += 1

    save_json(cache, items)
    return items


def fetch_detail(client: BiliClient, uid: int, opus_id: str, cache_dir: Path, refresh: bool) -> dict:
    path = cache_dir / f"{opus_id}.json"
    if path.exists() and not refresh:
        data = load_json(path, None)
        if data:
            return data
    data = client.get_json(
        DETAIL_API,
        {"id": opus_id, "timezone_offset": -480},
        signed=True,
        referer=f"https://space.bilibili.com/{uid}/upload/opus",
    )
    save_json(path, data)
    return data


def parse_post(data: dict, opus_id: str) -> dict | None:
    """从 opus/detail 响应里取出发布时间和全部图片。"""
    item = ((data.get("data") or {}).get("item")) or {}
    modules = item.get("modules") or []

    author: dict = {}
    content: dict = {}
    dynamic: dict = {}
    for m in modules:
        if not author and m.get("module_author"):
            author = m["module_author"]
        if not content and m.get("module_content"):
            content = m["module_content"]
        if not dynamic and m.get("module_dynamic"):
            dynamic = m["module_dynamic"]

    try:
        pub_ts = int(author.get("pub_ts") or 0)
    except (TypeError, ValueError):
        pub_ts = 0
    if pub_ts <= 0:
        return None

    raw: list[dict] = []
    for para in content.get("paragraphs") or []:
        raw.extend(((para.get("pic") or {}).get("pics")) or [])
        line_pic = (para.get("line") or {}).get("pic")
        if line_pic:
            raw.append(line_pic)

    major = dynamic.get("major") or {}
    for key in ("opus", "draw"):
        block = major.get(key) or {}
        raw.extend(block.get("pics") or block.get("items") or [])

    pics: list[dict] = []
    seen: set[str] = set()
    for p in raw:
        url = normalize_image_url(str(p.get("url") or p.get("src") or ""))
        if not url or url in seen:
            continue
        seen.add(url)
        size = p.get("size")
        pics.append(
            {
                "url": url,
                "width": p.get("width"),
                "height": p.get("height"),
                "size_kb": float(size) if isinstance(size, (int, float)) else None,
            }
        )

    return {
        "opus_id": opus_id,
        "pub_ts": pub_ts,
        "date": datetime.fromtimestamp(pub_ts, TZ).strftime("%Y.%m.%d"),
        "pics": pics,
    }


def collect_posts(
    client: BiliClient,
    uid: int,
    items: list[dict],
    cache_dir: Path,
    since_ts: int,
    until_ts: int | None,
    limit: int | None,
    refresh: bool,
) -> tuple[list[dict], list[dict]]:
    posts: list[dict] = []
    failures: list[dict] = []
    old_streak = 0
    total = len(items)

    for i, it in enumerate(items, 1):
        opus_id = it["opus_id"]
        try:
            data = fetch_detail(client, uid, opus_id, cache_dir, refresh)
        except BiliError as exc:
            failures.append({"opus_id": opus_id, "code": exc.code, "message": exc.message})
            log(f"[详情] {i}/{total} {opus_id} 失败: {exc.code} {exc.message}")
            continue

        post = parse_post(data, opus_id)
        if post is None:
            failures.append({"opus_id": opus_id, "code": "no_pub_ts", "message": "无发布时间"})
            continue

        # 列表按时间倒序，连续 3 篇早于 since 就认为已经翻过界
        if post["pub_ts"] < since_ts:
            old_streak += 1
            if old_streak >= 3:
                log(f"[详情] 已到 {fmt_time(post['pub_ts'])}，早于起始时间，停止翻页")
                break
            continue
        old_streak = 0

        if until_ts and post["pub_ts"] > until_ts:
            continue

        posts.append(post)
        if i % 20 == 0 or i == total:
            log(f"[详情] {i}/{total}  已收集 {len(posts)} 篇 / {sum(len(p['pics']) for p in posts)} 图")
        if limit and len(posts) >= limit:
            log(f"[详情] 达到 --limit {limit}，停止")
            break

    return posts, failures


# --------------------------------------------------------------------------- #
# 命名
# --------------------------------------------------------------------------- #
def assign_filenames(posts: list[dict], out_dir: Path, manifest: dict) -> None:
    files: dict[str, str] = manifest.setdefault("files", {})
    used: dict[str, set[int]] = {}

    def mark(name: str) -> None:
        m = NAME_RE.match(name)
        if m:
            used.setdefault(m.group(1), set()).add(int(m.group(2)))

    for name in files.values():
        mark(name)
    if out_dir.exists():
        for p in out_dir.iterdir():
            if p.is_file():
                mark(p.name)

    assigned: set[str] = set()
    for post in sorted(posts, key=lambda p: (p["pub_ts"], p["opus_id"])):
        date = post["date"]
        for pic in post["pics"]:
            url = pic["url"]
            # 按 “日期 + URL” 复用：同一张图在同一天出现只存一份，
            # 但在别的日期被再次发布时，按当天重新命名（保证每篇的图都在自己日期下）
            key = f"{date}|{url}"
            name = files.get(key)
            if name:
                pic["filename"] = name
                continue

            idx = max(used.get(date) or {0}) + 1
            while True:
                candidate = f"{date} ({idx}).{ext_from_url(url)}"
                if candidate not in assigned and not (out_dir / candidate).exists():
                    break
                idx += 1
            used.setdefault(date, set()).add(idx)
            assigned.add(candidate)
            files[key] = candidate
            pic["filename"] = candidate


# --------------------------------------------------------------------------- #
# 下载
# --------------------------------------------------------------------------- #
def download_pic(
    client: BiliClient,
    pic: dict,
    out_dir: Path,
    stats: dict,
    stats_lock: threading.Lock,
    strict_size: bool = False,
) -> tuple[bool, str]:
    dest = out_dir / pic["filename"]
    if dest.exists() and dest.stat().st_size > 0:
        with stats_lock:
            stats["skipped"] += 1
        return True, ""

    url = pic["url"]
    expected = pic.get("size_kb")
    expected_bytes = int(expected * 1024) if expected else None
    tmp = dest.with_name(dest.name + ".part")
    last = "unknown"

    for attempt in range(1, 4):
        client.limiter.wait()
        try:
            with client.session.get(
                url,
                stream=True,
                timeout=60,
                headers={
                    "Referer": "https://www.bilibili.com/",
                    # 不声明 avif/webp，避免 CDN 协商成页面展示用的压缩格式
                    "Accept": "image/jpeg,image/png,image/gif,image/*;q=0.9,*/*;q=0.5",
                },
            ) as r:
                if r.status_code != 200:
                    last = f"HTTP {r.status_code}"
                    time.sleep(2 ** attempt)
                    continue
                ctype = (r.headers.get("Content-Type") or "").lower()
                if ctype.startswith("text/") or "html" in ctype:
                    last = f"返回内容异常: {ctype}"
                    time.sleep(2 ** attempt)
                    continue

                written = 0
                with open(tmp, "wb") as fh:
                    for chunk in r.iter_content(chunk_size=1 << 16):
                        if chunk:
                            fh.write(chunk)
                            written += len(chunk)

            ok = written >= 1024
            if not ok:
                last = "文件过小"

            if ok:
                # 原图判定：分辨率不能低于接口记录（这才是“查看大图”那一档）。
                # 少数图片 CDN 存的反而是更大的版本，接口元数据偏旧，这种要放行。
                got = image_dimensions(tmp)
                api_w, api_h = pic.get("width"), pic.get("height")
                if got and api_w and api_h and (got[0] < int(api_w) or got[1] < int(api_h)):
                    ok = False
                    last = f"分辨率被缩小 {got[0]}x{got[1]} < {api_w}x{api_h}"
                elif expected_bytes:
                    tolerance = max(4096, int(expected_bytes * 0.02))
                    if abs(written - expected_bytes) > tolerance:
                        # 分辨率一致但字节不同：B站 CDN 对部分历史图片做过重编码，
                        # 原始字节已不存在，保留 CDN 版本并标记
                        if strict_size:
                            ok = False
                            last = f"字节数不符 {written}/{expected_bytes} B"
                        else:
                            pic["recompressed"] = True

            if ok:
                tmp.replace(dest)
                with stats_lock:
                    stats["downloaded"] += 1
                    stats["bytes"] += written
                    if pic.get("recompressed"):
                        stats["recompressed"] += 1
                return True, ""

            tmp.unlink(missing_ok=True)
            time.sleep(2 ** attempt)
        except requests.RequestException as exc:
            last = f"网络错误: {exc.__class__.__name__}"
            tmp.unlink(missing_ok=True)
            time.sleep(2 ** attempt)

    with stats_lock:
        stats["failed"] += 1
    return False, last


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def main() -> int:
    setup_stdout()
    ap = argparse.ArgumentParser(
        description="抓取 B 站某用户空间「图文」下的全部原图，按日期+序号命名",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--uid", type=int, default=2394319, help="目标用户 UID")
    ap.add_argument("--since", default="2021-08-01", help="起始日期（含），YYYY-MM-DD")
    ap.add_argument("--until", default=None, help="结束日期（含），默认不限")
    ap.add_argument("--out", default="images", help="图片保存目录")
    ap.add_argument("--data", default="data", help="缓存/清单目录")
    ap.add_argument("--workers", type=int, default=4, help="下载并发数")
    ap.add_argument("--delay", type=float, default=0.3, help="请求最小间隔（秒）")
    ap.add_argument("--limit", type=int, default=None, help="最多处理多少篇（调试用）")
    ap.add_argument("--cookie", default="", help='可选，浏览器 Cookie，如 "SESSDATA=xxx; bili_jct=yyy"')
    ap.add_argument("--max-risk", type=int, default=5, help="连续风控多少次后中止本轮（0=不中止）")
    ap.add_argument("--strict-size", action="store_true",
                    help="严格模式：字节数与接口记录不一致就判失败（默认只校验分辨率）")
    ap.add_argument("--dry-run", action="store_true", help="只统计，不下载")
    ap.add_argument("--refresh", action="store_true", help="忽略缓存，重新抓列表和详情")
    args = ap.parse_args()

    out_dir = Path(args.out)
    data_dir = Path(args.data)
    opus_cache = data_dir / "opus"
    opus_cache.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    since_ts = parse_time_arg(args.since)
    until_ts = parse_time_arg(args.until) if args.until else None
    if until_ts and until_ts < since_ts:
        raise SystemExit("--until 不能早于 --since")

    log(f"目标 UID : {args.uid}")
    log(f"时间范围 : {fmt_time(since_ts)} ~ {fmt_time(until_ts) if until_ts else '现在'}")
    log(f"保存目录 : {out_dir.resolve()}")
    log("")

    client = BiliClient(
        data_dir / "cache",
        delay=args.delay,
        cookie_extra=args.cookie,
        max_risk=args.max_risk,
    )

    try:
        items = fetch_opus_list(client, args.uid, data_dir / "list.json", args.refresh)
        log("")

        posts, failures = collect_posts(
            client,
            args.uid,
            items,
            opus_cache,
            since_ts,
            until_ts,
            args.limit,
            args.refresh,
        )
    except RiskControl as exc:
        log("")
        log(f"[中止] {exc}")
        log("详情缓存已保存，稍后重跑会从断点继续（可加大 --delay）。")
        return 2
    log("")

    manifest_path = data_dir / "manifest.json"
    manifest = load_json(manifest_path, {})
    manifest["uid"] = args.uid
    assign_filenames(posts, out_dir, manifest)

    total_pics = sum(len(p["pics"]) for p in posts)
    days = len({p["date"] for p in posts if p["pics"]})
    est_mb = sum(
        (pic.get("size_kb") or 0) for p in posts for pic in p["pics"]
    ) / 1024
    log(f"统计：{len(posts)} 篇作品 / {total_pics} 张图 / 分布在 {days} 天 / 约 {est_mb:.1f} MB")
    if failures:
        log(f"详情失败：{len(failures)} 篇（已记录到 {data_dir / 'failed.json'}）")
        save_json(data_dir / "failed.json", failures)

    if args.dry_run:
        log("")
        log("--dry-run：仅预览前 12 个文件名")
        shown = 0
        for post in sorted(posts, key=lambda p: (p["pub_ts"], p["opus_id"])):
            for pic in post["pics"]:
                if shown >= 12:
                    break
                log(f"  {pic['filename']}   <- {pic['url']}")
                shown += 1
            if shown >= 12:
                break
        manifest["updated_at"] = datetime.now(TZ).isoformat(timespec="seconds")
        save_json(manifest_path, manifest)
        log("")
        log("缓存已写入，正式下载时无需重复请求详情。")
        return 0

    # 下载
    log("")
    log(f"开始下载（{args.workers} 线程，间隔 {args.delay}s）...")
    stats = {"downloaded": 0, "skipped": 0, "failed": 0, "bytes": 0, "recompressed": 0}
    stats_lock = threading.Lock()
    failed_pics: list[dict] = []
    todo = [(post, pic) for post in posts for pic in post["pics"]]
    done = 0

    try:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = {
                pool.submit(
                    download_pic, client, pic, out_dir, stats, stats_lock, args.strict_size
                ): pic
                for _, pic in todo
            }
            for fut in as_completed(futures):
                pic = futures[fut]
                ok, reason = fut.result()
                if not ok:
                    failed_pics.append({"filename": pic["filename"], "url": pic["url"], "reason": reason})
                done += 1
                if done % 25 == 0 or done == len(todo):
                    with stats_lock:
                        log(
                            f"[下载] {done}/{len(todo)}  新增 {stats['downloaded']}"
                            f" / 跳过 {stats['skipped']} / 失败 {stats['failed']}"
                            f" / {stats['bytes'] / 1048576:.1f} MB"
                        )
    except KeyboardInterrupt:
        log("")
        log("已中断，保存进度 ...")
    finally:
        manifest["updated_at"] = datetime.now(TZ).isoformat(timespec="seconds")
        manifest["posts"] = {
            p["opus_id"]: {"date": p["date"], "pub_ts": p["pub_ts"], "count": len(p["pics"])}
            for p in posts
        }
        save_json(manifest_path, manifest)
        if failed_pics:
            save_json(data_dir / "failed_pics.json", failed_pics)
        recompressed = {
            d["filename"]: d
            for d in load_json(data_dir / "recompressed.json", [])
            if isinstance(d, dict) and d.get("filename")
        }
        for _, pic in todo:
            if pic.get("recompressed"):
                recompressed[pic["filename"]] = {
                    "filename": pic["filename"],
                    "url": pic["url"],
                    "api_size_kb": pic.get("size_kb"),
                    "width": pic.get("width"),
                    "height": pic.get("height"),
                }
        if recompressed:
            save_json(
                data_dir / "recompressed.json",
                sorted(recompressed.values(), key=lambda d: d["filename"]),
            )

    log("")
    log("完成。")
    log(f"  新增下载 : {stats['downloaded']}")
    log(f"  已存在   : {stats['skipped']}")
    log(f"  失败     : {stats['failed']}")
    if stats["recompressed"]:
        log(
            f"  重编码   : {stats['recompressed']} 张"
            f"（分辨率与原图一致，字节被 B站 CDN 重压过，清单见 {data_dir / 'recompressed.json'}）"
        )
    if failed_pics:
        log(f"  失败清单 : {data_dir / 'failed_pics.json'}")
    return 0 if stats["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
