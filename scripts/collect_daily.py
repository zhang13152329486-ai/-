import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path


ROOT = Path(os.environ.get("FUND_ASSISTANT_ROOT", Path(__file__).resolve().parents[1]))
SOURCE_FILE = Path(os.environ.get("FUND_ASSISTANT_SOURCE_FILE", ROOT / "config" / "news_sources.json"))
WEB_OUTPUT = Path(os.environ.get("FUND_ASSISTANT_WEB_OUTPUT", ROOT / "web" / "live-data.js"))
JSON_OUTPUT = Path(os.environ.get("FUND_ASSISTANT_JSON_OUTPUT", ROOT / "data" / "daily-news.json"))

KEYWORDS = {
    "宽基指数": ["中长期资金", "ETF", "指数", "资本市场", "入市", "稳定市场"],
    "红利低波": ["分红", "央企", "国企", "高股息", "保险资金", "长期资金"],
    "AI算力/半导体": ["人工智能", "算力", "数据要素", "半导体", "芯片", "集成电路", "信创"],
    "高端制造/机器人": ["机器人", "工业母机", "设备更新", "智能制造", "高端制造"],
    "医药创新/医疗器械": ["创新药", "医疗器械", "医保", "集采", "生物医药"],
    "消费/食品饮料": ["消费", "扩内需", "零售", "家电", "食品", "旅游"],
    "新能源/储能": ["新能源", "储能", "光伏", "风电", "电动车", "绿色低碳"],
    "债券/固收+": ["货币政策", "利率", "降准", "逆回购", "流动性", "债券"]
}


def read_sources():
    return json.loads(SOURCE_FILE.read_text(encoding="utf-8"))


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 FundAssistant/0.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read(800_000)
        content_type = response.headers.get("Content-Type", "")
    charset = "utf-8"
    match = re.search(r"charset=([\w-]+)", content_type, re.I)
    if match:
        charset = match.group(1)
    for enc in [charset, "utf-8", "gb18030"]:
        try:
            return raw.decode(enc, errors="ignore")
        except LookupError:
            continue
    return raw.decode("utf-8", errors="ignore")


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" -_|·\t\r\n")


def absolute_url(base, href):
    if not href:
        return base
    return urllib.parse.urljoin(base, html.unescape(href))


def extract_items(source, content):
    candidates = []
    title_match = re.search(r"<title[^>]*>(.*?)</title>", content, re.I | re.S)
    if title_match:
        candidates.append({
            "title": clean_text(title_match.group(1)),
            "url": source["url"]
        })

    pattern = re.compile(r"<a\b[^>]*href=[\"']?([^\"'>\s]+)[\"']?[^>]*>(.*?)</a>", re.I | re.S)
    for href, label in pattern.findall(content):
        title = clean_text(label)
        if 8 <= len(title) <= 80 and not title.lower().startswith(("http", "javascript")):
            candidates.append({
                "title": title,
                "url": absolute_url(source["url"], href)
            })

    seen = set()
    results = []
    for item in candidates:
        key = item["title"]
        if key in seen:
            continue
        seen.add(key)
        if score_title(key) <= 0 and source["confidence"] < 90:
            continue
        results.append(item)
        if len(results) >= 8:
            break
    return results


def detect_sectors(title):
    sectors = []
    for sector, words in KEYWORDS.items():
        if any(word in title for word in words):
            sectors.append(sector)
    return sectors


def score_title(title):
    return sum(1 for words in KEYWORDS.values() for word in words if word in title)


def build_summary(items):
    sector_counts = {}
    for item in items:
        for sector in item["sectors"]:
            sector_counts[sector] = sector_counts.get(sector, 0) + 1
    leaders = sorted(sector_counts.items(), key=lambda pair: pair[1], reverse=True)[:3]
    if not leaders:
        return "今日采集到政策和新闻标题，但暂未形成明确行业集中信号，建议以宽基和低波动配置为主。"
    names = "、".join(name for name, _ in leaders)
    return f"今日采集信号集中在{names}，建议结合资金流和估值位置分批观察，避免单日追高。"


def collect():
    items = []
    errors = []
    for source in read_sources():
        try:
            content = fetch(source["url"])
            for item in extract_items(source, content):
                sectors = detect_sectors(item["title"])
                items.append({
                    "title": item["title"],
                    "url": item["url"],
                    "source": source["name"],
                    "kind": source["kind"],
                    "confidence": source["confidence"],
                    "sectors": sectors or ["待分类"],
                    "score": source["confidence"] + score_title(item["title"]) * 5
                })
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            errors.append({"source": source["name"], "error": str(exc)})

    deduped = []
    seen = set()
    for item in sorted(items, key=lambda x: x["score"], reverse=True):
        key = (item["title"], item["source"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    now = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    payload = {
        "generatedAt": now,
        "summary": build_summary(deduped),
        "items": deduped[:40],
        "errors": errors[:20]
    }
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    WEB_OUTPUT.write_text(
        "window.FUND_ASSISTANT_LIVE = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8"
    )
    return payload


if __name__ == "__main__":
    result = collect()
    print(f"collected {len(result['items'])} items at {result['generatedAt']}")
    if result["errors"]:
        print(f"errors: {len(result['errors'])}", file=sys.stderr)
