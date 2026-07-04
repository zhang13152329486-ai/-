const fs = require("fs/promises");
const path = require("path");
const { TextDecoder } = require("util");

const KEYWORDS = {
  "宽基指数": ["中长期资金", "ETF", "指数", "资本市场", "入市", "稳定市场"],
  "红利低波": ["分红", "央企", "国企", "高股息", "保险资金", "长期资金"],
  "AI算力/半导体": ["人工智能", "算力", "数据要素", "半导体", "芯片", "集成电路", "信创"],
  "高端制造/机器人": ["机器人", "工业母机", "设备更新", "智能制造", "高端制造"],
  "医药创新/医疗器械": ["创新药", "医疗器械", "医保", "集采", "生物医药"],
  "消费/食品饮料": ["消费", "扩内需", "零售", "家电", "食品", "旅游"],
  "新能源/储能": ["新能源", "储能", "光伏", "风电", "电动车", "绿色低碳"],
  "债券/固收+": ["货币政策", "利率", "降准", "逆回购", "流动性", "债券"]
};

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base, href) {
  try {
    return new URL(href || base, base).href;
  } catch {
    return base;
  }
}

function decodeHtml(buffer, contentType) {
  const match = /charset=([\w-]+)/i.exec(contentType || "");
  const encodings = [match?.[1], "utf-8", "gb18030"].filter(Boolean);
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      // Try the next decoder.
    }
  }
  return Buffer.from(buffer).toString("utf8");
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 FundAssistantDesktop/0.3",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return decodeHtml(buffer, response.headers.get("content-type") || "");
}

function scoreTitle(title) {
  let score = 0;
  Object.values(KEYWORDS).forEach((words) => {
    words.forEach((word) => {
      if (title.includes(word)) score += 1;
    });
  });
  return score;
}

function detectSectors(title) {
  const sectors = [];
  Object.entries(KEYWORDS).forEach(([sector, words]) => {
    if (words.some((word) => title.includes(word))) sectors.push(sector);
  });
  return sectors;
}

function extractItems(source, html) {
  const candidates = [];
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) {
    candidates.push({ title: cleanText(titleMatch[1]), url: source.url });
  }

  const linkPattern = /<a\b[^>]*href=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const title = cleanText(match[2]);
    if (title.length >= 8 && title.length <= 90 && !/^https?:|^javascript:/i.test(title)) {
      candidates.push({ title, url: absoluteUrl(source.url, match[1]) });
    }
  }

  const seen = new Set();
  const results = [];
  for (const item of candidates) {
    if (!item.title || seen.has(item.title)) continue;
    seen.add(item.title);
    if (scoreTitle(item.title) <= 0 && Number(source.confidence || 0) < 90) continue;
    results.push(item);
    if (results.length >= 8) break;
  }
  return results;
}

function buildSummary(items) {
  const counts = new Map();
  items.forEach((item) => {
    item.sectors.forEach((sector) => {
      counts.set(sector, (counts.get(sector) || 0) + 1);
    });
  });
  const leaders = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!leaders.length) {
    return "今日采集到政策和新闻标题，但暂未形成明确行业集中信号，建议以宽基和低波动配置为主。";
  }
  return `今日采集信号集中在${leaders.map(([name]) => name).join("、")}，建议结合资金流和估值位置分批观察，避免单日追高。`;
}

async function collectDaily({ rootDir, outputDir }) {
  const sourcePath = path.join(rootDir, "config", "news_sources.json");
  const sources = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const items = [];
  const errors = [];

  for (const source of sources) {
    try {
      const html = await fetchHtml(source.url);
      extractItems(source, html).forEach((item) => {
        const sectors = detectSectors(item.title);
        items.push({
          title: item.title,
          url: item.url,
          source: source.name,
          kind: source.kind,
          confidence: source.confidence,
          sectors: sectors.length ? sectors : ["待分类"],
          score: Number(source.confidence || 0) + scoreTitle(item.title) * 5
        });
      });
    } catch (error) {
      errors.push({ source: source.name, error: error.message });
    }
  }

  const seen = new Set();
  const deduped = items
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = `${item.title}|${item.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const generatedAt = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false
  }).replace(" ", "T") + "+08:00";

  const payload = {
    generatedAt,
    summary: buildSummary(deduped),
    items: deduped.slice(0, 40),
    errors: errors.slice(0, 20)
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "daily-news.json"), JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(
    path.join(outputDir, "live-data.js"),
    `window.FUND_ASSISTANT_LIVE = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8"
  );
  return payload;
}

module.exports = { collectDaily };
