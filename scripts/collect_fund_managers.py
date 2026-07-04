import ast
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "fund_candidate_keywords.json"
JSON_OUTPUT = ROOT / "data" / "fund-manager-data.json"
WEB_OUTPUT = ROOT / "web" / "fund-manager-data.js"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 FundAssistant/0.2"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(enc, errors="ignore")
        except LookupError:
            continue
    return raw.decode("utf-8", errors="ignore")


def strip_tags(value):
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def load_fund_list():
    text = fetch("https://fund.eastmoney.com/js/fundcode_search.js")
    match = re.search(r"var\s+r\s*=\s*(\[.*\]);?", text, re.S)
    if not match:
        raise RuntimeError("cannot parse fund list")
    rows = ast.literal_eval(match.group(1))
    return [
        {"code": row[0], "name": row[2], "type": row[3], "spell": row[4]}
        for row in rows
    ]


def choose_candidates(funds, keyword, limit=2):
    scored = []
    clean_keyword = keyword.replace(" ", "")
    for fund in funds:
        name = fund["name"].replace(" ", "")
        score = 0
        if clean_keyword in name:
            score += 100
        for part in re.split(r"[/（）() -]+", clean_keyword):
            if len(part) >= 2 and part in name:
                score += 12
        if "C" in fund["name"][-3:]:
            score -= 5
        if "后端" in fund["name"]:
            score -= 20
        if score > 0:
            scored.append((score, fund))
    scored.sort(key=lambda item: (-item[0], item[1]["code"]))
    return [item[1] for item in scored[:limit]]


def extract_js_value(text, name):
    match = re.search(rf"var\s+{re.escape(name)}\s*=\s*\"([^\"]*)\"", text)
    return match.group(1) if match else ""


def parse_pingzhong(code):
    text = fetch(f"https://fund.eastmoney.com/pingzhongdata/{code}.js")
    return {
        "fundName": extract_js_value(text, "fS_name"),
        "code": extract_js_value(text, "fS_code") or code,
        "sourceRate": extract_js_value(text, "fund_sourceRate"),
        "rate": extract_js_value(text, "fund_Rate"),
        "minBuy": extract_js_value(text, "fund_minsg"),
        "return1m": extract_js_value(text, "syl_1y"),
        "return3m": extract_js_value(text, "syl_3y"),
        "return6m": extract_js_value(text, "syl_6y"),
        "return1y": extract_js_value(text, "syl_1n"),
    }


def parse_manager_page(code):
    text = fetch(f"https://fundf10.eastmoney.com/jjjl_{code}.html")
    title_desc = re.search(r"基金及基金经理([^。<]+)", text)
    manager_names = []
    if title_desc:
        manager_names = [name.strip(" ,，、") for name in re.split(r"[,，、]", title_desc.group(1)) if name.strip()]
    if not manager_names:
        manager_names = re.findall(r"<div class=\"jl_intro\">[\s\S]*?<a[^>]*>([^<]{2,8})</a>", text)

    manager_blocks = []
    for name in manager_names[:3]:
        name = clean_manager_name(name)
        pos = text.find(name)
        block = text[pos:pos + 3500] if pos >= 0 else ""
        dates = re.findall(r"(\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2})", block)
        manager_blocks.append({
            "name": name,
            "profile": strip_tags(block)[:260],
            "dates": dates[:4]
        })

    returns = []
    for row in re.findall(r"<tr>([\s\S]*?)</tr>", text):
        cells = [strip_tags(cell) for cell in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row)]
        if len(cells) >= 7 and re.match(r"\d{6}", cells[0]):
            returns.append({
                "code": cells[0],
                "name": cells[1],
                "type": cells[2] if len(cells) > 2 else "",
                "start": cells[3] if len(cells) > 3 else "",
                "end": cells[4] if len(cells) > 4 else "",
                "days": cells[5] if len(cells) > 5 else "",
                "return": cells[6] if len(cells) > 6 else "",
                "peerAverage": cells[7] if len(cells) > 7 else "",
                "rank": cells[8] if len(cells) > 8 else ""
            })
    return {"managers": manager_blocks, "history": returns[:8]}


def clean_manager_name(name):
    name = re.sub(r"的信息.*$", "", name)
    name = re.sub(r"基金经理.*$", "", name)
    name = name.strip(" ：:，,、。 ")
    return name


def parse_float(value):
    if value is None:
        return None
    value = str(value).replace("%", "").replace(",", "").strip()
    if value in ("", "--", "---"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def score_fund(item):
    detail = item["detail"]
    manager = item["manager"]
    score = 50
    reasons = []

    r1y = parse_float(detail.get("return1y"))
    r6m = parse_float(detail.get("return6m"))
    r1m = parse_float(detail.get("return1m"))
    fee = parse_float(detail.get("rate"))
    source_fee = parse_float(detail.get("sourceRate"))

    if r1y is not None:
        if r1y > 15:
            score += 12
            reasons.append("近一年表现较强")
        elif r1y > 0:
            score += 6
            reasons.append("近一年正收益")
        else:
            score -= 8
            reasons.append("近一年表现偏弱")
    if r6m is not None and r6m > 0:
        score += 5
    if r1m is not None and r1m > 8:
        score -= 6
        reasons.append("近一个月涨幅较高，避免追高")
    if fee is not None and fee <= 0.2:
        score += 5
        reasons.append("支付宝/销售端费率较低")
    if source_fee and fee is not None and fee < source_fee:
        score += 2

    managers = manager.get("managers", [])
    if managers:
        score += 8
        reasons.append("已取得现任基金经理资料")
        profile = " ".join(m.get("profile", "") for m in managers)
        if len(profile) > 120:
            score += 4
            reasons.append("基金经理履历信息较完整")
    else:
        score -= 10
        reasons.append("未抓到基金经理资料")

    history = manager.get("history", [])
    positive_history = 0
    for row in history[:5]:
        value = parse_float(row.get("return"))
        if value is not None and value > 0:
            positive_history += 1
    if positive_history >= 3:
        score += 6
        reasons.append("历任基金正回报记录较多")

    score = max(0, min(100, round(score)))
    if score >= 78:
        action = "优先观察/可小额加购"
    elif score >= 65:
        action = "可定投/分批"
    elif score >= 55:
        action = "观察"
    else:
        action = "暂缓"
    return score, action, reasons[:5]


def collect():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    funds = load_fund_list()
    buckets = []
    seen_codes = set()

    for group in config:
        candidates = []
        for keyword in group["keywords"]:
            for fund in choose_candidates(funds, keyword, limit=2):
                if fund["code"] in seen_codes:
                    continue
                seen_codes.add(fund["code"])
                try:
                    detail = parse_pingzhong(fund["code"])
                    manager = parse_manager_page(fund["code"])
                    item = {
                        **fund,
                        "keyword": keyword,
                        "bucket": group["bucket"],
                        "market": group["market"],
                        "strategy": group["strategy"],
                        "detail": detail,
                        "manager": manager
                    }
                    score, action, reasons = score_fund(item)
                    item["managerScore"] = score
                    item["managerAction"] = action
                    item["scoreReasons"] = reasons
                    candidates.append(item)
                except Exception as exc:
                    candidates.append({
                        **fund,
                        "keyword": keyword,
                        "bucket": group["bucket"],
                        "market": group["market"],
                        "strategy": group["strategy"],
                        "error": str(exc),
                        "managerScore": 0,
                        "managerAction": "数据失败",
                        "scoreReasons": ["公开资料抓取失败"]
                    })
        candidates.sort(key=lambda item: item.get("managerScore", 0), reverse=True)
        buckets.append({**group, "candidates": candidates[:5]})

    now = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    payload = {
        "generatedAt": now,
        "source": "东方财富/天天基金公开页面",
        "disclaimer": "基金经理和产品数据来自公开网页抓取，可能存在延迟；具体以基金合同、招募说明书、基金公司公告和支付宝页面为准。",
        "buckets": buckets
    }
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    WEB_OUTPUT.write_text("window.FUND_MANAGER_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    data = collect()
    count = sum(len(bucket["candidates"]) for bucket in data["buckets"])
    print(f"collected {count} fund candidates at {data['generatedAt']}")
