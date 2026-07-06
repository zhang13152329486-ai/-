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
MANAGER_DATA_FILE = Path(os.environ.get("FUND_ASSISTANT_MANAGER_DATA", ROOT / "data" / "fund-manager-data.json"))

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

ALIPAY_PICK_TEMPLATES = [
    {
        "key": "broad",
        "bucket": "A股宽基底仓",
        "name": "中证A500 / 沪深300 指数基金",
        "market": "A股",
        "baseScore": 78,
        "search": ["中证A500指数", "沪深300ETF联接", "沪深300指数增强"],
        "reason": "适合作为场外基金底仓，政策托底和中长期资金入市信号通常先落到宽基。",
        "maxWeight": "组合 25%-35%",
        "avoid": "若当日大涨超过 2%，只观察不追高。"
    },
    {
        "key": "hongkong",
        "bucket": "港股弹性仓",
        "name": "恒生科技 / 港股互联网联接",
        "market": "港股",
        "baseScore": 70,
        "search": ["恒生科技ETF联接", "港股互联网", "恒生互联网"],
        "reason": "港股估值弹性大，受南向资金、美元利率和平台经济预期影响更明显。",
        "maxWeight": "组合 10%-15%",
        "avoid": "若已有港股仓位超过 20%，今日不继续加。"
    },
    {
        "key": "ai",
        "bucket": "科技主题",
        "name": "半导体 / 人工智能 / 算力主题",
        "market": "A股",
        "baseScore": 74,
        "search": ["半导体ETF联接", "人工智能ETF联接", "云计算ETF联接", "通信ETF联接"],
        "reason": "全球 AI 趋势仍是主线，但主题波动大，更适合小仓位分批。",
        "maxWeight": "组合 8%-12%",
        "avoid": "若近 5 日连续上涨，暂停追买。"
    },
    {
        "key": "us",
        "bucket": "美股QDII",
        "name": "纳斯达克100 / 标普500 QDII",
        "market": "美股",
        "baseScore": 72,
        "search": ["纳斯达克100指数QDII", "标普500指数QDII", "全球科技QDII"],
        "reason": "美股长期质量较高，但 AI 和半导体集中度高，适合已有仓位持有或小额定投。",
        "maxWeight": "组合 10%-20%",
        "avoid": "若支付宝显示高估或 QDII 溢价明显，等待。"
    },
    {
        "key": "fixed",
        "bucket": "防守仓",
        "name": "中短债 / 货币基金",
        "market": "债券/货币",
        "baseScore": 68,
        "search": ["中短债", "短债债券", "货币基金", "同业存单指数"],
        "reason": "用于降低波动和保留补仓资金，适合权益信号不清晰时过渡。",
        "maxWeight": "组合 20%-40%",
        "avoid": "若权益仓位很低且计划主动加仓，不必继续堆现金。"
    }
]


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


def load_manager_context():
    if not MANAGER_DATA_FILE.exists():
        return {}
    try:
        data = json.loads(MANAGER_DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    context = {}
    for bucket in data.get("buckets", []):
        candidates = bucket.get("candidates") or []
        valid_scores = [
            item.get("managerScore", 0)
            for item in candidates[:3]
            if isinstance(item.get("managerScore", 0), (int, float))
        ]
        brief_candidates = []
        for item in candidates[:3]:
            managers = item.get("manager", {}).get("managers", [])
            brief_candidates.append({
                "code": item.get("code", ""),
                "name": item.get("name") or item.get("fundName", ""),
                "managerScore": item.get("managerScore", 0),
                "managerAction": item.get("managerAction", ""),
                "managers": [manager.get("name", "") for manager in managers if manager.get("name")],
                "reasons": (item.get("scoreReasons") or [])[:2]
            })
        if valid_scores:
            context[bucket.get("bucket", "")] = {
                "score": round(sum(valid_scores) / len(valid_scores)),
                "candidates": brief_candidates
            }
    return context


def count_sector_signals(items):
    counts = {}
    title_text = " ".join(item.get("title", "") for item in items)
    for item in items:
        for sector in item.get("sectors", []):
            counts[sector] = counts.get(sector, 0) + 1
    counts["港股"] = len(re.findall(r"港股|恒生|南向|互联网平台", title_text))
    counts["美股"] = len(re.findall(r"美股|纳斯达克|标普|美元|美联储|科技股", title_text))
    return counts


def pick_signal_count(template, counts):
    key = template["key"]
    if key == "broad":
        return counts.get("宽基指数", 0) + counts.get("红利低波", 0)
    if key == "hongkong":
        return counts.get("港股", 0)
    if key == "ai":
        return counts.get("AI算力/半导体", 0) + counts.get("高端制造/机器人", 0)
    if key == "us":
        return counts.get("美股", 0)
    if key == "fixed":
        return counts.get("债券/固收+", 0)
    return 0


def action_for_score(score, key):
    if key == "fixed":
        if score >= 78:
            return "提高防守仓"
        if score >= 70:
            return "保留弹药"
        return "少量配置"
    if score >= 86:
        return "优先小额补仓"
    if score >= 78:
        return "分批加购"
    if score >= 70:
        return "定投/观察"
    return "暂缓追买"


def buy_rule_for_score(score, key):
    if key == "fixed":
        return "权益信号不清晰时可先放短债/货币，等待更好的补仓点。"
    if score >= 86:
        return "今日可小额加购 1 份，后续回撤 1.5%-2.5% 再补 1 份。"
    if score >= 78:
        return "适合拆成 3-5 次买入，不一次买满。"
    if score >= 70:
        return "只做定投或观察，等回调和成交确认。"
    return "今日不主动加仓，已有仓位以持有观察为主。"


def build_alipay_picks(items, generated_at):
    counts = count_sector_signals(items)
    manager_context = load_manager_context()
    picks = []
    for template in ALIPAY_PICK_TEMPLATES:
        signal_count = pick_signal_count(template, counts)
        manager_info = manager_context.get(template["bucket"], {})
        manager_score = manager_info.get("score", 70)
        score = min(95, template["baseScore"] + signal_count * 4 + max(0, manager_score - 75) // 4)
        picks.append({
            **{k: v for k, v in template.items() if k not in {"key", "bucket", "baseScore"}},
            "rank": 0,
            "score": score,
            "signalCount": signal_count,
            "managerScore": manager_score,
            "managerCandidates": manager_info.get("candidates", []),
            "action": action_for_score(score, template["key"]),
            "buy": buy_rule_for_score(score, template["key"]),
        })

    picks.sort(key=lambda item: item["score"], reverse=True)
    for index, item in enumerate(picks, start=1):
        item["rank"] = index
        item["reason"] = (
            f"{item['reason']} 今日相关新闻/政策信号 {item['signalCount']} 条，"
            f"基金经理候选均分约 {item['managerScore']} 分。"
        )

    top = picks[0] if picks else None
    stance = "分批加购，不追单日大涨"
    if top and top["score"] < 72:
        stance = "谨慎观察，保留补仓资金"
    elif top and top["score"] >= 86:
        stance = f"今日优先看 {top['name']}，但只小额分批"

    return {
        "date": generated_at[:10],
        "generatedAt": generated_at,
        "stance": stance,
        "note": "支付宝里优先搜索基金类型和指数关键词，再按规模、费率、跟踪误差、成立时间、回撤和基金经理稳定性筛选；以下为方向建议，不是收益承诺。",
        "items": picks
    }


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
        "alipayPicks": build_alipay_picks(deduped, now),
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
