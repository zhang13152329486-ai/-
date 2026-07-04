const data = window.FUND_ASSISTANT_DATA;
let liveData = window.FUND_ASSISTANT_LIVE || null;
const fundManagerData = window.FUND_MANAGER_DATA || null;
const appConfig = window.FUND_ASSISTANT_CONFIG || {};
const storeKey = "cnFundAssistantStateV1";
const cloudDailyUrlKey = "cnFundAssistantCloudDailyUrl";

const els = {
  refresh: document.getElementById("refreshBtn"),
  tabs: [...document.querySelectorAll(".tab")],
  views: {
    report: document.getElementById("reportView"),
    markets: document.getElementById("marketsView"),
    sectors: document.getElementById("sectorsView"),
    sources: document.getElementById("sourcesView"),
    portfolio: document.getElementById("portfolioView")
  },
  reportDate: document.getElementById("reportDate"),
  marketMood: document.getElementById("marketMood"),
  summary: document.getElementById("summary"),
  totalScore: document.getElementById("totalScore"),
  hero: document.querySelector(".hero"),
  signalRing: document.querySelector(".signal-ring"),
  scoreStandard: document.getElementById("scoreStandard"),
  riskSelect: document.getElementById("riskSelect"),
  riskTitle: document.getElementById("riskTitle"),
  riskAdvice: document.getElementById("riskAdvice"),
  pickDate: document.getElementById("pickDate"),
  alipayPicks: document.getElementById("alipayPicks"),
  liveStatus: document.getElementById("liveStatus"),
  liveList: document.getElementById("liveList"),
  topSignals: document.getElementById("topSignals"),
  alerts: document.getElementById("alerts"),
  marketFilter: document.getElementById("marketFilter"),
  marketList: document.getElementById("marketList"),
  globalLinks: document.getElementById("globalLinks"),
  sectorFilter: document.getElementById("sectorFilter"),
  sectorList: document.getElementById("sectorList"),
  sourceList: document.getElementById("sourceList"),
  cloudDailyUrlInput: document.getElementById("cloudDailyUrlInput"),
  saveCloudUrl: document.getElementById("saveCloudUrlBtn"),
  testCloudUrl: document.getElementById("testCloudUrlBtn"),
  cloudUrlStatus: document.getElementById("cloudUrlStatus"),
  holdingName: document.getElementById("holdingName"),
  holdingWeight: document.getElementById("holdingWeight"),
  holdingMarket: document.getElementById("holdingMarket"),
  holdingType: document.getElementById("holdingType"),
  addHolding: document.getElementById("addHoldingBtn"),
  holdingList: document.getElementById("holdingList"),
  importText: document.getElementById("importText"),
  parseImport: document.getElementById("parseImportBtn"),
  clearImport: document.getElementById("clearImportBtn"),
  sampleImport: document.getElementById("sampleImportBtn"),
  importPreview: document.getElementById("importPreview"),
  screenshotInput: document.getElementById("screenshotInput"),
  screenshotPreview: document.getElementById("screenshotPreview"),
  ocrBtn: document.getElementById("ocrBtn"),
  ocrStatus: document.getElementById("ocrStatus"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  exportBox: document.getElementById("exportBox")
};

function loadState() {
  try {
    const saved = localStorage.getItem(storeKey);
    if (saved) return JSON.parse(saved);
  } catch {
    return { risk: "均衡型", holdings: [] };
  }
  return { risk: "均衡型", holdings: [] };
}

let state = loadState();

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function currentCloudDailyUrl() {
  return (localStorage.getItem(cloudDailyUrlKey) || appConfig.cloudDailyUrl || "").trim();
}

function saveCloudDailyUrl(url) {
  const value = (url || "").trim();
  if (value) {
    localStorage.setItem(cloudDailyUrlKey, value);
  } else {
    localStorage.removeItem(cloudDailyUrlKey);
  }
  return value;
}

function averageScore() {
  const scores = data.sectors.map((item) => item.score);
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function scoreBand(score) {
  if (score >= 80) return { className: "score-hot", label: "积极", text: "政策、资金、景气共振较强，可分批进攻。" };
  if (score >= 65) return { className: "score-warm", label: "中性偏积极", text: "适合底仓和定投，主题仓控制节奏。" };
  if (score >= 50) return { className: "score-cool", label: "中性谨慎", text: "信号分歧，优先等待回调和确认。" };
  return { className: "score-risk", label: "防守", text: "风险较高，优先现金、短债和低波动资产。" };
}

function renderScoreStandard(score) {
  const band = scoreBand(score);
  els.scoreStandard.innerHTML = `
    <div class="score-band ${band.className}">
      <strong>${score} · ${band.label}</strong>
      <p>${band.text}</p>
    </div>
    <div class="metrics">
      ${metric("政策力度", "25%")}
      ${metric("资金流向", "25%")}
      ${metric("景气数据", "20%")}
      ${metric("估值位置", "15%")}
      ${metric("技术趋势", "10%")}
      ${metric("风险惩罚", "-5~-30")}
    </div>
    <p class="muted">80分以上偏积极；65-79分中性偏积极；50-64分谨慎；50分以下防守。评分用于控制仓位和节奏，不等于涨跌预测。</p>
  `;
}

function applyScoreColor(score) {
  const band = scoreBand(score);
  ["score-hot", "score-warm", "score-cool", "score-risk"].forEach((name) => {
    els.hero.classList.remove(name);
    els.signalRing.classList.remove(name);
  });
  els.hero.classList.add(band.className);
  els.signalRing.classList.add(band.className);
}

function trendText(value) {
  if (value > 2) return `升温 +${value}`;
  if (value > 0) return `小幅升温 +${value}`;
  if (value < 0) return `降温 ${value}`;
  return "持平";
}

function selectedAdvice() {
  return data.report.actions.find((item) => item.level === state.risk) || data.report.actions[1];
}

function formatLiveTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未采集";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function liveItems() {
  if (!liveData || !Array.isArray(liveData.items)) return [];
  return liveData.items.slice(0, 8);
}

function renderLive() {
  const items = liveItems();
  els.liveStatus.textContent = liveData
    ? `已采集 ${formatLiveTime(liveData.generatedAt)}`
    : "等待采集";
  els.liveList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "还没有联网采集结果。运行每日采集器后，这里会显示政策、行业新闻和资金信号。";
    els.liveList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "news-item";
    const sectors = Array.isArray(item.sectors) ? item.sectors : [];
    article.innerHTML = `
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      <p class="muted">${item.source} · ${item.kind} · 可信度 ${item.confidence}</p>
      <div class="tag-row">
        ${sectors.map((sector) => `<span class="tag">${sector}</span>`).join("")}
      </div>
    `;
    els.liveList.appendChild(article);
  });
}

function loadLiveDataFromScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `live-data.js?t=${Date.now()}`;
    script.onload = () => {
      liveData = window.FUND_ASSISTANT_LIVE || liveData;
      script.remove();
      resolve(liveData);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("live-data.js 加载失败"));
    };
    document.head.appendChild(script);
  });
}

async function loadLiveDataFromCloud() {
  const url = currentCloudDailyUrl();
  if (!url) {
    throw new Error("云端日报地址未配置");
  }
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`云端日报返回 ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("云端日报格式不正确");
  }
  liveData = payload;
  window.FUND_ASSISTANT_LIVE = payload;
  return payload;
}

async function refreshDailyReport() {
  els.refresh.disabled = true;
  const oldText = els.refresh.textContent;
  els.refresh.textContent = "...";
  els.liveStatus.textContent = "正在刷新";
  try {
    const desktopPayload = window.DesktopDaily
      ? await window.DesktopDaily.refresh()
      : null;
    const cloudPayload = desktopPayload || await loadLiveDataFromCloud();
    if (desktopPayload) {
      liveData = desktopPayload;
      window.FUND_ASSISTANT_LIVE = desktopPayload;
    }
    renderReport();
    renderSectors();
    renderMarkets();
    const livePanel = els.liveList?.closest("details");
    if (livePanel) livePanel.open = true;
    els.liveStatus.textContent = liveData
      ? `${desktopPayload ? "本机" : "云端"}已刷新 ${formatLiveTime(liveData.generatedAt)}`
      : "刷新完成";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    await loadLiveDataFromScript().catch(() => {});
    renderReport();
    let detail = error.message || "刷新失败";
    if (window.DesktopDaily?.logPath) {
      try {
        const logPath = await window.DesktopDaily.logPath();
        detail = `${detail}，日志：${logPath}`;
      } catch {
        // Ignore log path lookup failures.
      }
    }
    els.liveStatus.textContent = `${detail}，当前显示离线包数据`;
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = oldText || "↻";
  }
}

function renderAlipayPicks() {
  const picks = data.alipayPicks;
  els.pickDate.textContent = picks ? picks.date : "待更新";
  els.alipayPicks.innerHTML = "";
  if (!picks || !Array.isArray(picks.items)) return;

  const head = document.createElement("p");
  head.className = "muted";
  head.textContent = `${picks.stance}。${picks.note}`;
  els.alipayPicks.appendChild(head);

  picks.items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "pick-card";
    card.innerHTML = `
      <div class="pick-head">
        <span class="rank">${item.rank}</span>
        <div>
          <strong>${item.name}</strong>
          <p class="muted">${item.market} · ${item.action}</p>
        </div>
      </div>
      <p>${item.buy}</p>
      <p class="muted">${item.reason}</p>
      <div class="tag-row">
        ${item.search.map((keyword) => `<span class="tag">${keyword}</span>`).join("")}
      </div>
      <p class="muted">建议上限：${item.maxWeight}；不买条件：${item.avoid}</p>
      ${renderManagerMatches(item)}
    `;
    els.alipayPicks.appendChild(card);
  });
}

function pickBucketName(item) {
  if (/中证A500|沪深300/.test(item.name)) return "A股宽基底仓";
  if (/恒生|港股/.test(item.name)) return "港股弹性仓";
  if (/纳斯达克|标普|QDII/.test(item.name)) return "美股QDII";
  if (/半导体|人工智能|算力/.test(item.name)) return "科技主题";
  if (/中短债|货币/.test(item.name)) return "防守仓";
  return "";
}

function renderManagerMatches(item) {
  const bucketName = pickBucketName(item);
  const bucket = fundManagerData?.buckets?.find((entry) => entry.bucket === bucketName);
  if (!bucket || !bucket.candidates?.length) {
    return `<p class="muted">基金经理数据：待采集。</p>`;
  }
  const rows = bucket.candidates.slice(0, 3).map((fund) => {
    const managers = fund.manager?.managers?.map((manager) => manager.name).filter(Boolean).join("、") || "未识别";
    const reasons = fund.scoreReasons?.slice(0, 2).join("；") || "公开资料已采集";
    return `
      <div class="manager-row">
        <div>
          <strong>${fund.name}</strong>
          <p class="muted">${fund.code} · ${managers}</p>
          <p class="muted">${reasons}</p>
        </div>
        <span class="score small">${fund.managerScore}</span>
      </div>
    `;
  }).join("");
  return `
    <div class="manager-box">
      <div class="section-head compact">
        <strong>基金经理候选</strong>
        <span class="status-pill">${fundManagerData.generatedAt ? formatLiveTime(fundManagerData.generatedAt) : "待采集"}</span>
      </div>
      ${rows}
      <p class="muted">${fundManagerData.disclaimer || ""}</p>
    </div>
  `;
}

function renderReport() {
  const report = data.report;
  const advice = selectedAdvice();
  const score = averageScore();
  const liveTime = liveData?.generatedAt ? formatLiveTime(liveData.generatedAt) : "";
  els.reportDate.textContent = liveTime
    ? `日报刷新 ${liveTime} · 本机采集`
    : `日报日期 ${report.date} · 离线方案版`;
  els.marketMood.textContent = liveData?.items?.length
    ? `已更新 ${liveData.items.length} 条信号`
    : report.marketMood;
  els.summary.textContent = liveData?.summary || report.summary;
  els.totalScore.textContent = score;
  applyScoreColor(score);
  renderScoreStandard(score);
  els.riskSelect.value = state.risk;
  els.riskTitle.textContent = advice.level;
  els.riskAdvice.textContent = advice.text;
  renderAlipayPicks();
  renderLive();
  els.alerts.innerHTML = "";
  report.alerts.forEach((alert) => {
    const li = document.createElement("li");
    li.textContent = alert;
    els.alerts.appendChild(li);
  });

  els.topSignals.innerHTML = "";
  data.sectors
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .forEach((sector) => {
      const item = document.createElement("article");
      item.className = "signal-item";
      item.innerHTML = `
        <span class="score">${sector.score}</span>
        <div>
          <h4>${sector.name}</h4>
          <p>${sector.signals[0]}</p>
          <div class="tag-row">
            <span class="tag">${sector.action}</span>
            <span class="tag">${sector.style}</span>
            <span class="tag">${trendText(sector.trend)}</span>
          </div>
        </div>
      `;
      els.topSignals.appendChild(item);
    });
}

function metric(label, value) {
  return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderMarkets() {
  const filter = els.marketFilter.value;
  const markets = data.markets.filter((item) => filter === "all" || item.market === filter);
  els.marketList.innerHTML = "";
  markets.forEach((market) => {
    const card = document.createElement("article");
    card.className = "market-card";
    card.innerHTML = `
      <div class="sector-head">
        <div>
          <strong>${market.name}</strong>
          <span class="muted">${market.market} · ${market.action}</span>
        </div>
        <span class="score">${market.score}</span>
      </div>
      <p>${market.drivers.join("；")}。</p>
      <div class="tag-row">
        ${market.funds.map((fund) => `<span class="tag">${fund}</span>`).join("")}
      </div>
      <p class="muted">风险：${market.risks.join("；")}。</p>
    `;
    els.marketList.appendChild(card);
  });

  els.globalLinks.innerHTML = "";
  data.globalLinks.forEach((text) => {
    const item = document.createElement("p");
    item.className = "link-item";
    item.textContent = text;
    els.globalLinks.appendChild(item);
  });
}

function renderSectors() {
  const style = els.sectorFilter.value;
  const sectors = data.sectors.filter((sector) => style === "all" || sector.style === style);
  els.sectorList.innerHTML = "";
  sectors
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((sector) => {
      const card = document.createElement("article");
      card.className = "sector-card";
      card.innerHTML = `
        <div class="sector-head">
          <div>
            <strong>${sector.name}</strong>
            <span class="muted">${sector.style} · ${sector.action}</span>
          </div>
          <span class="trend">${trendText(sector.trend)}</span>
        </div>
        <div class="metrics">
          ${metric("总分", sector.score)}
          ${metric("政策", sector.policy)}
          ${metric("资金", sector.money)}
          ${metric("景气", sector.prosperity)}
          ${metric("估值", sector.valuation)}
          ${metric("风险", sector.risk)}
        </div>
        <p>${sector.signals.join("；")}。</p>
        <div class="tag-row">
          ${sector.funds.map((fund) => `<span class="tag">${fund}</span>`).join("")}
        </div>
      `;
      els.sectorList.appendChild(card);
    });
}

function renderSources() {
  if (els.cloudDailyUrlInput) {
    els.cloudDailyUrlInput.value = currentCloudDailyUrl();
    els.cloudUrlStatus.textContent = currentCloudDailyUrl()
      ? "已配置云端日报地址。日报刷新将优先使用云端数据。"
      : "未配置云端日报地址。日报刷新会使用离线包数据。";
  }
  els.sourceList.innerHTML = "";
  data.sources.forEach((source) => {
    const card = document.createElement("article");
    card.className = "source-card";
    card.innerHTML = `
      <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.name}</a>
      <p class="muted">${source.group} · 权重 ${source.weight}</p>
    `;
    els.sourceList.appendChild(card);
  });
}

async function testCloudDailyUrl() {
  const url = saveCloudDailyUrl(els.cloudDailyUrlInput.value);
  if (!url) {
    els.cloudUrlStatus.textContent = "请先填写 daily-news.json 地址。";
    return;
  }
  els.cloudUrlStatus.textContent = "正在测试云端日报。";
  try {
    await loadLiveDataFromCloud();
    renderReport();
    renderMarkets();
    renderSectors();
    const livePanel = els.liveList?.closest("details");
    if (livePanel) livePanel.open = true;
    els.cloudUrlStatus.textContent = `测试成功：${formatLiveTime(liveData.generatedAt)}，${liveData.items.length} 条信号。`;
  } catch (error) {
    els.cloudUrlStatus.textContent = `测试失败：${error.message || "无法读取云端日报"}`;
  }
}

function handleSaveCloudDailyUrl() {
  const url = saveCloudDailyUrl(els.cloudDailyUrlInput.value);
  els.cloudUrlStatus.textContent = url
    ? "已保存。回到日报页点击刷新即可读取云端日报。"
    : "已清空云端地址，日报刷新将回退到离线包数据。";
}

function portfolioWarning(total) {
  if (total > 100) return "仓位超过 100%，请检查输入。";
  if (total > 85) return "权益仓位较高，建议保留现金或债券缓冲。";
  if (total < 40) return "仓位较轻，可等待政策和资金共振时分批提高。";
  return "仓位处于可管理区间，继续按日报分批调整。";
}

function holdingExposure() {
  const total = state.holdings.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const byMarket = {};
  state.holdings.forEach((item) => {
    const market = item.market || inferMarket(item.name);
    byMarket[market] = (byMarket[market] || 0) + Number(item.weight || 0);
  });
  return { total, byMarket };
}

function exposureAdvice(byMarket) {
  const us = byMarket["美股"] || 0;
  const hk = byMarket["港股"] || 0;
  const a = byMarket["A股"] || 0;
  const bond = byMarket["债券/货币"] || 0;
  const notes = [];
  if (us > 30) notes.push("美股/QDII 仓位偏高，注意估值和汇率波动。");
  if (hk > 25) notes.push("港股仓位偏高，适合分批但要接受大波动。");
  if (a > 70) notes.push("A 股集中度高，可用港股、美股或债券做分散。");
  if (bond < 15) notes.push("防守仓偏低，建议保留短债/货币基金作为机动资金。");
  return notes.length ? notes : ["市场分散度尚可，按日报信号做小步调整。"];
}

function renderPortfolio() {
  els.holdingList.innerHTML = "";
  const { total, byMarket } = holdingExposure();
  const summary = document.createElement("article");
  summary.className = "panel";
  summary.innerHTML = `
    <h4>仓位概览</h4>
    <p>${portfolioWarning(total)}</p>
    <p class="muted">当前记录仓位：${total.toFixed(1)}%</p>
    <div class="tag-row">
      ${Object.entries(byMarket).map(([name, value]) => `<span class="tag">${name} ${value.toFixed(1)}%</span>`).join("")}
    </div>
    <ul class="advice-list">${exposureAdvice(byMarket).map((item) => `<li>${item}</li>`).join("")}</ul>
  `;
  els.holdingList.appendChild(summary);

  state.holdings.forEach((holding, index) => {
    const card = document.createElement("article");
    card.className = "holding-card";
    card.innerHTML = `
      <div>
        <strong>${holding.name}</strong>
        <p class="muted">${holding.weight}% · ${holding.market || inferMarket(holding.name)} · ${holding.type || inferType(holding.name)}</p>
      </div>
      <button type="button" data-index="${index}">删除</button>
    `;
    els.holdingList.appendChild(card);
  });

  els.holdingList.querySelectorAll("button[data-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.holdings.splice(Number(button.dataset.index), 1);
      saveState();
      renderPortfolio();
    });
  });
}

function switchView(view) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(els.views).forEach(([key, node]) => node.classList.toggle("active", key === view));
}

function addHolding() {
  const name = els.holdingName.value.trim();
  const weight = Number(els.holdingWeight.value);
  if (!name || Number.isNaN(weight) || weight <= 0) return;
  state.holdings.push({
    name,
    weight: Math.min(weight, 100),
    market: els.holdingMarket.value,
    type: els.holdingType.value,
    createdAt: new Date().toISOString()
  });
  els.holdingName.value = "";
  els.holdingWeight.value = "";
  saveState();
  renderPortfolio();
}

function inferMarket(name) {
  if (/纳斯达克|标普|美股|美元|QDII|全球/i.test(name)) return "美股";
  if (/恒生|港股|香港|中概|互联网/i.test(name)) return "港股";
  if (/债|货币|现金|同业存单/i.test(name)) return "债券/货币";
  return "A股";
}

function inferType(name) {
  if (/QDII|纳斯达克|标普|全球/i.test(name)) return "QDII";
  if (/债|货币|现金|同业存单/i.test(name)) return /货币|现金/.test(name) ? "货币基金" : "债券基金";
  if (/ETF|指数|沪深|中证|创业板|恒生|纳斯达克|标普/i.test(name)) return "指数基金";
  return "权益基金";
}

function parseImportLine(line) {
  const cleaned = line
    .replace(/[，,]/g, "")
    .replace(/[｜|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  const percentMatch = cleaned.match(/(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s*%$/);
  if (percentMatch) {
    const name = canonicalFundName(percentMatch[1].trim());
    if (isOcrNoiseLine(name)) return null;
    const weight = Number(percentMatch[2]);
    return { name, weight, market: inferMarket(name), type: inferType(name), source: "支付宝文本" };
  }
  const alipayAmountMatch = cleaned.match(/^(.+?(?:基金|混合|股票|债券|指数|ETF|联接|QDII|LOF|A\/B|A|C|I))\s+([0-9]+(?:\.[0-9]+)?)(?:\s|$)/i);
  if (alipayAmountMatch) {
    const name = canonicalFundName(alipayAmountMatch[1].trim());
    if (isOcrNoiseLine(name)) return null;
    const amount = Number(alipayAmountMatch[2]);
    if (name.length >= 3 && amount > 0) {
      return { name, amount, market: inferMarket(name), type: inferType(name), source: "支付宝截图" };
    }
  }
  const amountMatch = cleaned.match(/(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s*(元|份)?$/);
  if (amountMatch) {
    const name = canonicalFundName(amountMatch[1].trim());
    if (isOcrNoiseLine(name)) return null;
    const amount = Number(amountMatch[2]);
    return { name, amount, market: inferMarket(name), type: inferType(name), source: "支付宝文本" };
  }
  return null;
}

function canonicalFundName(rawName) {
  const name = normalizeOcrChars(rawName || "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/言国/g, "富国")
    .replace(/話|文的|英|田指敬|疆/g, "")
    .replace(/纳期/g, "纳斯")
    .replace(/纳斯达克1?00/g, "纳斯达克100")
    .replace(/斯达克100/g, "纳斯达克100")
    .replace(/中证細分/g, "中证细分")
    .replace(/接QDII/g, "联接QDII");
  const candidates = [
    ["富国天瑞精选成长混合LOF", /富国.*天瑞|天瑞.*LOF/],
    ["富国中证细分化工产业主题ETF联接C", /富国.*化工|中证细分化工|化工产业.*联接/],
    ["富国电子信息产业混合C", /富国.*电子|电子信息.*混合/],
    ["国泰国证航天军工指数(LOF)", /国泰.*航天|航天军工.*LOF/],
    ["国泰中证煤炭ETF联接E", /国泰.*煤炭|煤炭ETF.*联接/],
    ["华夏人工智能ETF联接A", /华夏.*人工智能|人工智能ETF.*联接/],
    ["华夏中证电网设备主题ETF联接C", /华夏.*电网|电网设备.*联接/],
    ["中欧医疗健康混合A", /中欧.*医疗|医疗健康.*混合/],
    ["融通创业板指数A/B", /融通.*创业板|创业板指数.*A\/?B/],
    ["景顺长城新兴成长混合A", /景顺.*新兴|新兴成长.*混合/],
    ["银华集成电路混合C", /银华.*集成|集成电路.*混合/],
    ["南方中证电池主题ETF联接C", /南方.*电池|电池主题.*联接/],
    ["大摩数字经济混合A", /大摩.*数字|数字经济.*混合/],
    ["财通价值动量混合C", /财通.*价值|价值动量.*混合/],
    ["广发纳斯达克100ETF联接(QDII)A", /广发.*纳斯达克100.*A$/],
    ["广发纳斯达克100ETF联接(QDII)C", /广发.*纳斯达克100.*C$|广发.*纳斯达克100(?!.*A$)/],
    ["华安纳斯达克100ETF联接(QDII)A", /华安.*纳斯达克100.*A$/],
    ["华安纳斯达克100ETF联接(QDII)C", /华安.*纳斯达克100.*C$|华安.*纳斯达克100(?!.*A$)/],
    ["大成纳斯达克100ETF联接(QDII)A", /大成.*纳斯达克100/],
    ["长城半导体产业混合A", /长城.*半导体|半导体产业.*混合/],
    ["易方达机器人ETF联接A", /易方达.*机器人|机器人ETF.*联接/]
  ];
  const match = candidates.find(([, pattern]) => pattern.test(name));
  return match ? match[0] : rawName;
}

const alipayFundCandidates = [
  { name: "富国天瑞精选成长混合(LOF)", patterns: [/富国.*天瑞|天瑞.*LOF|天瑞精选/] },
  { name: "富国中证细分化工产业主题ETF联接C", patterns: [/富国.*化工|言国.*化工|中证细分化工|化工产业/] },
  { name: "富国电子信息产业混合C", patterns: [/富国.*电子|电子信息.*混合/] },
  { name: "国泰国证航天军工指数(LOF)", patterns: [/国泰.*航天|航天军工/] },
  { name: "国泰中证煤炭ETF联接E", patterns: [/国泰.*煤炭|煤炭ETF/] },
  { name: "华夏人工智能ETF联接A", patterns: [/华夏.*人工智能|人工智能ETF/] },
  { name: "华夏中证电网设备主题ETF联接C", patterns: [/华夏.*电网|电网设备/] },
  { name: "中欧医疗健康混合A", patterns: [/中欧.*医疗|医疗健康/] },
  { name: "融通创业板指数A/B", patterns: [/融通.*创业板|创业板指数/] },
  { name: "景顺长城新兴成长混合A", patterns: [/景顺.*新兴|景顺长城|新兴成长/] },
  { name: "银华集成电路混合C", patterns: [/银华.*集成|集成电路/] },
  { name: "南方中证电池主题ETF联接C", patterns: [/南方.*电池|电池主题/] },
  { name: "大摩数字经济混合A", patterns: [/大摩.*数字|数字经济/] },
  { name: "财通价值动量混合C", patterns: [/财通.*价值|价值动量|财通基金/] },
  { name: "广发纳斯达克100ETF联接(QDII)A", patterns: [/广发.*纳斯达克100.*A/] },
  { name: "广发纳斯达克100ETF联接(QDII)C", patterns: [/广发.*纳斯达克100.*C|广发.*纳斯达克100(?!.*A)/] },
  { name: "华安纳斯达克100ETF联接(QDII)A", patterns: [/华安.*纳斯达克100.*A|华安.*纳期达克.*A/] },
  { name: "华安纳斯达克100ETF联接(QDII)C", patterns: [/华安.*纳斯达克100.*C|华安.*纳期达克.*C|华安.*纳斯达克100(?!.*A)/] },
  { name: "大成纳斯达克100ETF联接(QDII)A", patterns: [/大成.*纳斯达克100|大成.*斯达克100/] },
  { name: "长城半导体产业混合A", patterns: [/长城.*半导体|半导体产业/] },
  { name: "易方达机器人ETF联接A", patterns: [/易方达.*机器人|机器人ETF/] }
];

function findAlipayCandidate(text) {
  const normalized = normalizeOcrChars(text || "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/言国/g, "富国")
    .replace(/納/g, "纳")
    .replace(/納期/g, "纳斯")
    .replace(/纳期/g, "纳斯")
    .replace(/斯达克/g, "纳斯达克")
    .replace(/1?00ETF/g, "100ETF");
  return alipayFundCandidates.find((candidate) => (
    candidate.patterns.some((pattern) => pattern.test(normalized))
  ));
}

function extractNumbers(line) {
  return [...line.matchAll(/[+-]?[0-9]+(?:\.[0-9]+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function pickHoldingAmount(lines, start, end) {
  const windowLines = lines.slice(start, end + 1);
  const joined = windowLines.join(" ");
  const cleanLines = windowLines.filter((line) => !/财富号|基金经理|销售服务|有限公司|市场短期|小非农|数据不及预期|收益率|日收益/.test(line));
  const sourceLines = cleanLines.length ? cleanLines : windowLines;
  const numbers = sourceLines.flatMap(extractNumbers)
    .filter((num) => ![0.01, 0.35, 100, 2030].includes(num));
  if (numbers.length) return numbers[0];
  if (/财富号|基金经理|销售服务|有限公司/.test(joined)) return 0;
  return sourceLines.flatMap(extractNumbers).find((num) => num > 0) || 0;
}

function cleanOcrToUsefulRows(rawText) {
  const lines = (rawText || "")
    .split(/\n+/)
    .map((line) => normalizeOcrChars(line
      .replace(/[｜|]/g, " ")
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9.%+\-()（）/ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()))
    .filter(Boolean);

  const rows = [];
  const usedNames = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    if (isOcrNoiseLine(current)) continue;
    const currentLooksLikeFund = findAlipayCandidate(current)
      || /纳斯达克|中证|化工|数字|半导体|人工智能|电网|电池|医疗|创业板|集成|电子|天瑞|煤炭|军工|机器人/.test(current);
    if (!currentLooksLikeFund) continue;
    const forward = Math.min(lines.length, i + 3);
    const windowText = lines.slice(i, forward).join(" ");
    const candidate = findAlipayCandidate(windowText);
    if (!candidate || usedNames.has(candidate.name)) continue;
    const end = Math.min(lines.length - 1, i + 2);
    const amount = pickHoldingAmount(lines, i, end);
    if (!amount) continue;
    rows.push({ name: candidate.name, amount });
    usedNames.add(candidate.name);
  }
  return rows;
}

function parseImportText(text) {
  const usefulRows = cleanOcrToUsefulRows(text);
  const rows = usefulRows.length
    ? usefulRows.map((item) => ({
      name: item.name,
      amount: item.amount,
      market: inferMarket(item.name),
      type: inferType(item.name),
      source: "支付宝OCR清洗"
    }))
    : text.split(/\n+/).map(parseImportLine).filter(Boolean);
  const totalAmount = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return rows.map((item) => {
    if (item.weight) return item;
    const weight = totalAmount ? (Number(item.amount || 0) / totalAmount) * 100 : 0;
    return { ...item, weight: Number(weight.toFixed(1)) };
  }).filter((item) => item.name && item.weight > 0);
}

function importHoldings() {
  const cleanedText = normalizeOcrText(els.importText.value);
  if (cleanedText) {
    els.importText.value = cleanedText;
  }
  const parsed = parseImportText(els.importText.value);
  els.importPreview.innerHTML = "";
  if (!parsed.length) {
    els.importPreview.textContent = "没有识别到有效持仓。建议每行写：基金名称 金额，或 基金名称 仓位%。";
    return;
  }
  state.holdings = parsed.map((item) => ({
    name: item.name,
    weight: Math.min(Number(item.weight), 100),
    market: item.market,
    type: item.type,
    source: item.source,
    createdAt: new Date().toISOString()
  }));
  saveState();
  els.importPreview.innerHTML = `已导入 ${parsed.length} 只基金。`;
  renderPortfolio();
}

function fillImportSample() {
  els.importText.value = [
    "易方达沪深300ETF联接 12000",
    "华夏恒生科技ETF联接 8000",
    "广发纳斯达克100指数(QDII) 6000",
    "招商中短债基金 4000",
    "天弘余额宝货币 2000"
  ].join("\n");
}

function selectedScreenshotFile() {
  return els.screenshotInput.files && els.screenshotInput.files[0];
}

function previewScreenshot() {
  const file = selectedScreenshotFile();
  if (!file) return;
  const url = URL.createObjectURL(file);
  els.screenshotPreview.src = url;
  els.screenshotPreview.hidden = false;
  els.ocrStatus.textContent = "截图已载入，可点击“识别截图”。如果 OCR 不稳定，可用小米相册识别文字后粘贴。";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    img.src = url;
  });
}

function makeOcrCanvas(source, sx, sy, sw, sh, scale = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.7 + 128));
    pixels[i] = boosted;
    pixels[i + 1] = boosted;
    pixels[i + 2] = boosted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function makeOcrTargets(file) {
  const img = await loadImageFromFile(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const targets = [];
  const topCrop = Math.min(Math.round(height * 0.16), 360);
  const bottomCrop = Math.min(Math.round(height * 0.08), 240);
  const usableTop = Math.max(0, topCrop);
  const usableBottom = Math.max(usableTop + 1, height - bottomCrop);
  const usableHeight = usableBottom - usableTop;
  const chunkHeight = Math.min(1200, Math.max(650, Math.round(width * 2.7)));
  const overlap = 90;

  for (let y = usableTop; y < usableBottom; y += chunkHeight - overlap) {
    const h = Math.min(chunkHeight, usableBottom - y);
    if (h < 180) break;
    targets.push(makeOcrCanvas(img, 0, y, width, h, width < 900 ? 2.2 : 1.7));
  }

  if (!targets.length) {
    targets.push(makeOcrCanvas(img, 0, 0, width, height, width < 900 ? 2 : 1.5));
  }
  return targets;
}

function normalizeOcrChars(line) {
  return line
    .replace(/納/g, "纳")
    .replace(/細/g, "细")
    .replace(/數/g, "数")
    .replace(/聯/g, "联")
    .replace(/達/g, "达")
    .replace(/克1 00/g, "克100")
    .replace(/1 00ETF/g, "100ETF")
    .replace(/\s+/g, " ")
    .trim();
}

function isOcrNoiseLine(line) {
  const text = normalizeOcrChars(line);
  if (!text) return true;
  if (/财富号|基金经理|销售服务|杭州|有限公司|市场短期|小非农|数据不及预期|为何|收跌|发展逻辑|还稳固|基金画定|指数基金$|更多产品|去市场看看|收益明细|交易记录|投资计划|调仓分析/.test(text)) return true;
  if (/^基金\s+[0-9.]+$/.test(text)) return true;
  if (/^[A-Za-z\u4e00-\u9fa5]{0,6}\s*[0-9.]+$/.test(text) && !/ETF|QDII|LOF|混合|联接|指数|债|股票/.test(text)) return true;
  return false;
}

function hasFundKeyword(line) {
  return /基金|混合|股票|债券|指数|ETF|联接|QDII|LOF|天瑞|化工|电子|恒生|中证|纳斯达克|医疗|创业板|人工智能|软件|消费|新能源|电池|半导体|机器人|电网|煤炭|军工/.test(line);
}

function isFundContinuation(line) {
  return /^(接|联接|\(?QDII\)?|[ACIE]$|A\/B$|主题|产业|混合|指数|ETF|LOF|100ETF|克100ETF|纳斯达克100ETF)/i.test(line);
}

function mergeBrokenOcrLines(lines) {
  const merged = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (!hasFundKeyword(line)) {
      continue;
    }

    let lookahead = i + 1;
    while (!/[0-9]+(?:\.[0-9]+)?/.test(line) && lookahead < Math.min(lines.length, i + 5)) {
      const next = lines[lookahead];
      if (isOcrNoiseLine(next)) {
        lookahead += 1;
        continue;
      }
      if (hasFundKeyword(next) && !isFundContinuation(next)) break;
      if (isFundContinuation(next) || /[0-9]+(?:\.[0-9]+)?/.test(next)) {
        line = `${line} ${next}`;
        lookahead += 1;
        continue;
      }
      break;
    }
    merged.push(line);
    i = Math.max(i, lookahead - 1);
  }
  return merged;
}

function compactAlipayOcrText(text) {
  const lines = mergeBrokenOcrLines(text
    .split(/\n+/)
    .map((line) => line
      .replace(/[｜|]/g, " ")
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9.%+\-()（）/ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .map(normalizeOcrChars)
    .filter((line) => !isOcrNoiseLine(line))
    .filter(Boolean));
  const merged = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasFundName = hasFundKeyword(line);
    if (!hasFundName) continue;
    const hasNumber = /[0-9]+(?:\.[0-9]+)?/.test(line);
    if (hasNumber) {
      merged.push(line);
      continue;
    }
    const nextNumbers = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      const number = lines[j].match(/[0-9]+(?:\.[0-9]+)?/);
      if (number) nextNumbers.push(number[0]);
      if (nextNumbers.length >= 1) break;
    }
    if (nextNumbers.length) merged.push(`${line} ${nextNumbers[0]}`);
  }
  return [...new Set(merged)].join("\n");
}

function normalizeOcrText(text) {
  const usefulRows = cleanOcrToUsefulRows(text);
  if (usefulRows.length) {
    return usefulRows.map((row) => `${row.name} ${row.amount}`).join("\n");
  }
  const compacted = compactAlipayOcrText(text);
  const source = compacted || text;
  return source
    .split(/\n+/)
    .map((line) => normalizeOcrChars(line.replace(/[|｜]/g, " ").replace(/\s{2,}/g, " ").trim()))
    .filter((line) => !isOcrNoiseLine(line))
    .filter((line) => /基金|混合|股票|ETF|指数|债|货币|QDII|LOF|沪深|恒生|纳斯达克|中证|华夏|易方达|广发|天弘|招商|富国|国泰|华宝|中欧|融通|鹏华|银河|南方|大成|长城|景顺长城|嘉实|易方达/.test(line))
    .join("\n");
}

function applyRecognizedText(rawText, sourceName) {
  const text = normalizeOcrText(rawText || "");
  if (!text) {
    els.ocrStatus.textContent = `${sourceName} 未识别到清晰基金持仓文字。建议在支付宝持有页重新截取列表区域，或用系统相册 OCR 后粘贴。`;
    return;
  }
  els.importText.value = text;
  const parsedCount = parseImportText(text).length;
  if (!parsedCount) {
    els.ocrStatus.textContent = `${sourceName} 完成，但金额可能未识别准。请检查文本后再导入。`;
    return;
  }
  els.ocrStatus.textContent = parsedCount < 20
    ? `${sourceName} 完成，初步识别 ${parsedCount} 只基金，疑似仍有漏项。请检查文本，可手动补齐后再导入。`
    : `${sourceName} 完成，初步识别 ${parsedCount} 只基金。请检查文本，再点“识别导入”。`;
}

window.receiveNativeOcrStatus = function receiveNativeOcrStatus(status) {
  els.ocrStatus.textContent = status || "正在使用手机原生 OCR。";
};

window.receiveNativeOcr = function receiveNativeOcr(text, error) {
  if (error) {
    els.ocrStatus.textContent = `${error} 可尝试重新选择截图，或用小米相册 OCR 后粘贴。`;
    return;
  }
  applyRecognizedText(text, "原生 OCR");
};

async function recognizeScreenshot() {
  const file = selectedScreenshotFile();
  if (!file) {
    els.ocrStatus.textContent = "请先选择支付宝基金持有页面截图。";
    return;
  }
  if (window.AndroidOCR && typeof window.AndroidOCR.recognizeSelectedImage === "function") {
    els.ocrStatus.textContent = "正在调用手机原生 OCR。若首次使用，可能需要等待模型初始化。";
    window.AndroidOCR.recognizeSelectedImage();
    return;
  }
  els.ocrStatus.textContent = "正在加载 OCR 引擎，首次会下载中文识别模型，可能需要几十秒。";
  try {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    if (!window.Tesseract) throw new Error("OCR 引擎加载失败");
    els.ocrStatus.textContent = "正在优化长截图，裁掉顶部资产卡片并分段识别。";
    const targets = await makeOcrTargets(file);
    const worker = await window.Tesseract.createWorker("chi_sim+eng", 1, {
      logger: (message) => {
        if (!message.status) return;
        const pct = message.progress ? ` ${Math.round(message.progress * 100)}%` : "";
        els.ocrStatus.textContent = `OCR：${message.status}${pct}`;
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1"
    });
    const pieces = [];
    for (let i = 0; i < targets.length; i += 1) {
      els.ocrStatus.textContent = `OCR：正在识别长截图第 ${i + 1}/${targets.length} 段`;
      const result = await worker.recognize(targets[i]);
      pieces.push(result.data.text || "");
    }
    await worker.terminate();
    applyRecognizedText(pieces.join("\n"), "OCR");
  } catch (error) {
    els.ocrStatus.textContent = "当前环境无法完成 App 内 OCR。请用小米相册/支付宝截图识别文字后，复制到文本框导入。";
  }
}

function exportState() {
  els.exportBox.hidden = false;
  els.exportBox.value = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      state,
      report: data.report,
      sectors: data.sectors,
      live: liveData
    },
    null,
    2
  );
  els.exportBox.focus();
  els.exportBox.select();
}

function init() {
  els.riskSelect.value = state.risk;
  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  els.riskSelect.addEventListener("change", () => {
    state.risk = els.riskSelect.value;
    saveState();
    renderReport();
  });
  els.sectorFilter.addEventListener("change", renderSectors);
  els.marketFilter.addEventListener("change", renderMarkets);
  els.saveCloudUrl?.addEventListener("click", handleSaveCloudDailyUrl);
  els.testCloudUrl?.addEventListener("click", testCloudDailyUrl);
  els.addHolding.addEventListener("click", addHolding);
  els.parseImport.addEventListener("click", importHoldings);
  els.screenshotInput.addEventListener("change", previewScreenshot);
  els.ocrBtn.addEventListener("click", recognizeScreenshot);
  els.clearImport.addEventListener("click", () => {
    els.importText.value = "";
    els.importPreview.textContent = "";
  });
  els.sampleImport.addEventListener("click", fillImportSample);
  els.exportBtn.addEventListener("click", exportState);
  els.clearBtn.addEventListener("click", () => {
    state = { risk: "均衡型", holdings: [] };
    saveState();
    renderReport();
    renderPortfolio();
  });
  els.refresh.addEventListener("click", refreshDailyReport);

  renderReport();
  renderMarkets();
  renderSectors();
  renderSources();
  renderPortfolio();
}

init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
