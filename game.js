/* A股简单 · 面向所有玩家的盲图交易训练工作台 */
(() => {
'use strict';
const E = TradingEngine, $ = id => document.getElementById(id);
const KEYS = { settings: 'trade_settings_v2', game: 'trade_game_current_v2', records: 'trade_game_records_v1', legacy: 'trade_game_current_v1', draft: 'trade_order_draft_v1' };
// Read previous browser saves once; new writes use neutral app namespaces.
const PREVIOUS = { settings: 'deva_settings_v2', game: 'deva_game_current_v2', records: 'deva_game_records_v1', legacy: 'deva_game_current_v1' };
const iconPaths = {
    trend: '<path d="m3 16 6-7 5 4 7-10M15 3h6v6"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chart: '<path d="M4 3v18h17M8 16V9m5 7V5m5 11v-5"/>', settings: '<path d="m9 3-.7 2.3-2.2 1-2.2-.5-1.4 2.4 1.5 1.7-.2 2.5-1.5 1.7 1.4 2.4 2.2-.5 2.2 1L9 21h3l.7-2.3 2.2-1 2.2.5 1.4-2.4-1.5-1.7.2-2.5 1.5-1.7-1.4-2.4-2.2.5-2.2-1L12 3Z"/><circle cx="10.5" cy="12" r="3"/>',
    book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>', wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15V8ZM3 7h17M16 12h5v5h-5Z"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9ZM15 3v6h6a8 8 0 0 0-6-6Z"/>', cash: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9v6m14-6v6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>', bulb: '<path d="M8 15a6 6 0 1 1 8 0v3H8ZM9 21h6M12 3V1"/>',
    expand: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>', reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pause: '<path d="M9 5v14m6-14v14"/>', leaf: '<path d="M19 3C8 3 3 6 3 13a7 7 0 0 0 7 7c7 0 9-7 9-17ZM5 18l9-9"/>', edit: '<path d="m16 3 5 5-12 12H4v-5ZM13 6l5 5"/>', sliders: '<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>', play: '<path d="m8 4 12 8-12 8Z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.chart}</svg>`;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const pct = n => `${n > 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
const sign = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
let storageWarned = false;
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); return true; } catch { if (!storageWarned) { storageWarned = true; toast('本地存储不可用或空间不足，请导出战绩备份；刷新可能丢失进度'); } return false; } }
for (const key of Object.keys(PREVIOUS)) {
    const value = read(PREVIOUS[key], null);
    if (value !== null && (read(KEYS[key], null) !== null || write(KEYS[key], value))) write(PREVIOUS[key], null);
}
let S = E.settings(read(KEYS.settings, {})), records = read(KEYS.records, []);
if (!Array.isArray(records)) records = [];
records = records.filter(r => r && Number.isFinite(r.return) && Number.isFinite(r.asset));
let G = E.hydrate(read(KEYS.game, null)) || E.migrate(read(KEYS.legacy, null));
if (G?.revealed && !records.some(r => r.id === G.id)) {
    records.push(E.record(G));
    if (write(KEYS.records, records)) write(KEYS.game, null);
}
let view = 'workspace', orderType = 'buy', size = S.defaultSize, note = '', loading = false, fetchToken = 0, equity = null;
const coachLines = ['先看趋势，再定仓位。把交易理由写下来，让复盘有迹可循。', '一次判断无需完美，仓位和纪律决定你能走多远。', '价格是事实，预测是观点。让行情验证你的假设。', '看大周期定方向，用小周期找节奏。耐心也是交易的一部分。', '浮盈并不等于胜利。每一次加减仓，都应有自己的理由。'];
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('toasts').append(el); setTimeout(() => el.remove(), 3600); }
function save() { if (!G || G.revealed) return true; const saved = write(KEYS.game, E.serialize(G)); if (saved) write(KEYS.legacy, null); return saved; }
function preferences() { document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.colors = S.colorScheme; }
function demoBars() {
    let seed = 7345, price = 43;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const bars = [], date = new Date(2018, 0, 1);
    for (let i = 0; i < 800; i++) {
        while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
        const trend = i > 690 ? .0016 : i > 655 ? -.0018 : i > 610 ? .0022 : .0002;
        const open = price * (1 + (rand() - .5) * .012), close = open * (1 + (rand() - .48) * .028 + trend);
        bars.push({ date: new Date(date), open, close, high: Math.max(open, close) * (1 + rand() * .015), low: Math.min(open, close) * (1 - rand() * .014), volume: Math.floor(15000000 * (.5 + rand())), amount: close * 15000000 });
        price = close; date.setDate(date.getDate() + 1);
    }
    return bars;
}
const previewData = demoBars();
function preview() { return { stock: { name: '演示行情', fullCode: 'DEMO' }, kList: previewData, config: S, histStart: Math.max(0, 760 - S.history), gameStart: 760, endIdx: 759 + S.days, day: 0, cash: S.initialCash, shares: 0, costBasis: 0, initCash: S.initialCash, actions: [], dailyRows: [], revealed: false }; }
function shell(body) {
    const active = G && !G.revealed, nav = (name, label, i) => `<button data-action="nav" data-view="${name}" class="${view === name ? 'active' : ''}" ${view === name ? 'aria-current="page"' : ''}>${icon(i)}<span>${label}</span>${name === 'records' && records.length ? `<span class="nav-count">${records.length}</span>` : ''}</button>`;
    $('app').innerHTML = `<aside class="sidebar"><a class="brand" href="#" data-action="home" aria-label="A股简单首页"><div class="brand-symbol">${icon('trend')}</div><div><div class="brand-title">A股简单</div><div class="brand-sub">THE TRADING PRACTICE</div></div></a><div class="side-label">YOUR WORKSPACE</div><nav class="side-nav" aria-label="主导航">${nav('workspace', '交易工作台', 'grid')}${nav('records', '复盘战绩', 'chart')}<button data-action="settings">${icon('settings')}<span>偏好设置</span></button>${nav('guide', '实战指南', 'book')}</nav><div class="side-challenge"><div class="eyebrow">DAILY PRACTICE</div><h3>${active ? `${G.config.days} 日交易挑战` : '把判断，练成直觉。'}</h3><p>${active ? `已完成 ${G.day} 个交易日<br>市场正在等待你的下一步。` : '真实市场，独立判断。<br>建立属于自己的交易系统。'}</p><div class="mini-bars" aria-hidden="true">${[10, 17, 14, 25, 19, 29, 25, 35, 31, 40].map(h => `<i style="height:${h}px"></i>`).join('')}</div></div><div class="side-spacer"></div><div class="market-status"><span class="live-dot"></span>沪深 300 · 历史行情</div><div class="side-user"><div class="avatar">${icon('user')}</div><div><b>交易练习生</b><small>保持独立 · 持续精进</small></div>${icon('leaf')}</div>${AppPWA.markup('side')}</aside><div class="workspace"><header class="topbar"><div class="breadcrumb">${icon('grid')}<span>工作空间</span><span>/</span><b>${{ workspace: '交易工作台', records: '复盘战绩', guide: '实战指南' }[view]}</b></div><div class="mobile-brand"><div class="brand-symbol">${icon('trend')}</div>A股简单</div><div class="top-actions">${AppPWA.markup('mobile')}<span class="session-badge"><span class="live-dot"></span>${active ? '对局进行中 · 自动保存' : '专注每一次决策'}</span><span class="top-divider"></span><button class="icon-btn" data-action="guide" aria-label="实战指南" title="实战指南">${icon('book')}</button><button class="icon-btn" data-action="settings" aria-label="设置" title="偏好设置">${icon('settings')}</button></div></header><main class="content">${body}<footer class="footer"><span>A股简单 · 交易修行场　/　模拟训练，磨炼交易纪律</span><span>LESS NOISE. BETTER DECISIONS.</span></footer></main></div><nav class="mobile-nav" aria-label="手机导航">${nav('workspace', '工作台', 'grid')}${nav('records', '战绩', 'chart')}<button data-action="settings">${icon('settings')}<span>设置</span></button>${nav('guide', '指南', 'book')}</nav>`;
    AppPWA.sync();
}
function heading(title, subtitle, actions = '', eyebrow = 'MARKET SIMULATOR / 01') { return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`; }
function stat(label, value, description, i, valueClass = '', spark = false) { return `<div class="stat-card"><div class="stat-label">${label}${icon(i)}</div><div class="stat-value num ${valueClass}">${value}</div><div class="stat-note">${description}</div>${spark ? '<svg class="stat-spark" viewBox="0 0 70 30" aria-hidden="true"><path d="m0 25 9-5 8 3 8-11 7 5 9-9 8 4 12-10"/></svg>' : ''}</div>`; }
function render() {
    preferences(); MarketChart.dispose(); if (equity) { equity.dispose(); equity = null; }
    if (view === 'records') return renderRecords();
    if (view === 'guide') return renderGuide();
    if (loading) return renderLoading();
    renderWorkspace();
}
function renderWorkspace() {
    const g = G || preview(), current = E.currentBar(g), asset = E.asset(g), ret = asset / g.initCash - 1, position = g.shares * current.close / asset;
    const done = !!G?.revealed;
    const prior = g.kList[Math.max(0, g.gameStart + g.day - 2)], change = current.close / prior.close - 1;
    const h = heading(done ? '每一笔交易，都值得复盘。' : '交易修行场', done ? '回看进场理由、仓位与离场时机，让每一次实战成为下一次的经验。' : '屏蔽名字与日期，让趋势、仓位和纪律成为你的答案。', `${G && !done && !G.actions.length ? `<button class="btn" data-action="abandon">${icon('reset')}<span>重新抽题</span></button>` : ''}<button class="btn" data-action="settings">${icon('sliders')}<span>调整设置</span></button>${done ? `<button class="btn primary" data-action="start">${icon('play')}<span>新一局</span></button>` : ''}`);
    shell(`${h}${done ? reveal(g) : ''}<div class="stats">${stat('账户总资产', `<span class="currency">¥</span>${money(asset)}`, G ? `初始资金 ¥${money(g.initCash)}` : '准备好你的第一笔交易', 'wallet', '', true)}${stat('累计收益', pct(ret), G ? `${ret >= 0 ? '盈利' : '亏损'} ¥${money(Math.abs(asset - g.initCash))}` : '让每次决策都有依据', 'trend', sign(ret))}${stat('可用资金', `<span class="currency">¥</span>${money(g.cash)}`, `${(g.cash / asset * 100).toFixed(1)}% 现金占比`, 'cash')}${stat('当前仓位', `${(position * 100).toFixed(1)}<span style="font-size:16px;margin-left:3px">%</span>`, g.shares ? `${money(g.shares)} 股 · 市值 ¥${money(g.shares * current.close)}` : '空仓 · 耐心等待机会', 'pie')}</div><div class="workspace-grid"><div class="analysis-column">${chartCard(g, change)}${journal(g)}</div><aside class="decision-column">${G ? (done ? resultPanel(g) : orderPanel(g)) : launchPanel()}${S.coach ? `<div class="coach-card"><div class="coach-heading">${icon('bulb')}交易手记</div><p>${coachLines[g.day % coachLines.length]}</p><small>YOUR TRADING NOTE</small></div>` : ''}${!G ? `<div class="practice-intro">${icon('leaf')}<h3>不猜股票，<br>只交易趋势。</h3><p>沪深 300 真实历史行情。<br>每次推进一天，练习自己的判断。</p><div class="deco" aria-hidden="true"></div></div>` : ''}</aside></div>`);
    MarketChart.render(g, S);
    if (G && !done) bindOrder();
}
function chartCard(g, change) {
    return `<section class="card chart-card" id="chart-card" aria-label="行情分析"><div class="chart-heading"><div><h2 class="chart-title"><span class="stock-symbol">${icon(G?.revealed ? 'chart' : 'lock')}</span>${G?.revealed ? escape(g.stock.name) : G ? '神秘标的' : '行情分析'}<span class="tag ${G?.revealed ? 'green' : ''}">${icon(G?.revealed ? 'check' : 'lock')}${G?.revealed ? escape(g.stock.fullCode.toUpperCase()) : G ? '盲图模式' : '演示行情'}</span></h2><div class="eyebrow">${G ? 'HS300 / TECHNICAL ANALYSIS' : 'DEMO / EXPLORE YOUR WORKSPACE'}</div></div><div class="stock-quote"><div class="price num">${E.currentBar(g).close.toFixed(2)}</div><div class="change num ${sign(change)}">${pct(change)} <span class="muted">${S.period === 'day' ? '最新日涨跌' : '日涨跌'}</span></div></div></div><div class="chart-toolbar"><div class="segmented" role="group" aria-label="K线周期">${[['day', '日 K'], ['week', '周 K'], ['month', '月 K']].map(([p, label]) => `<button data-action="period" data-period="${p}" class="${S.period === p ? 'active' : ''}" aria-pressed="${S.period === p}">${label}</button>`).join('')}</div><div class="indicator-controls" role="group" aria-label="技术指标">${[['ma', 'MA'], ['volume', 'VOL'], ['macd', 'MACD'], ['kdj', 'KDJ']].map(([key, label]) => `<button class="indicator-btn ${S[key] ? 'active' : ''}" data-action="indicator" data-indicator="${key}" aria-pressed="${S[key]}" title="${key === 'ma' ? '主图均线' : key === 'volume' ? '成交量副图' : `${label} 副图`}"><i class="indicator-dot"></i>${label}</button>`).join('')}<span class="toolbar-divider"></span><button class="icon-btn" data-action="chart-reset" aria-label="重置图表缩放" title="重置缩放">${icon('reset')}</button><button class="icon-btn" data-action="chart-settings" aria-label="技术指标设置" title="技术指标设置">${icon('sliders')}</button><button class="icon-btn" data-action="fullscreen" aria-label="全屏行情图" title="全屏行情图">${icon('expand')}</button></div></div><div id="ohlc" class="ohlc" aria-live="off"></div><div id="ma-legend" class="ma-legend"></div><div id="chart"></div><div class="chart-foot"><span>${icon('info')}${!G ? '演示数据 · 开始挑战后使用真实历史行情' : S.period !== 'day' && !g.revealed ? '末根为形成中的周期 K 线 · 仅包含已揭示交易日' : '滚轮缩放 · 拖动平移 · 十字光标联动'}</span><span id="bar-count"></span></div></section>`;
}
function launchPanel() {
    return `<section class="card order-panel"><div class="panel-kicker">YOUR NEXT CHALLENGE ${icon('target')}</div><h2>市场出题，你来作答。</h2><p class="order-sub">一次完整的交易训练，从这里开始。</p><div class="launch-big num">${S.days}<small>个交易日</small></div><div class="launch-info"><div><span>初始资金</span><b class="num">¥ ${money(S.initialCash)}</b></div><div><span>历史窗口</span><b>${S.history} 根日 K</b></div><div><span>双向佣金</span><b>${S.commission}%</b></div><div><span>股票池</span><b>沪深 300 <span class="tag green">随机抽取</span></b></div></div><div class="mini-rule">${icon('lock')}隐藏股票与日期，专注价格走势。</div><div class="mini-rule">${icon('calendar')}每次决策推进一个交易日，结束后揭晓。</div><button class="submit-order" data-action="start">开始盲图挑战 ${icon('arrow')}</button><div class="order-rule">按下一交易日收盘价成交 · 本地自动保存</div><button class="btn" style="width:100%;margin-top:15px" data-action="settings">${icon('sliders')}自定义训练</button></section>`;
}
function orderPanel(g) {
    if (orderType === 'sell' && !g.shares) orderType = 'buy';
    return `<section class="card order-panel"><div class="panel-kicker">MAKE YOUR DECISION ${icon('edit')}</div><h2>下一步，由你决定。</h2><p class="order-sub">第 <b class="num">${g.day + 1}</b> / ${g.config.days} 个交易日</p><div class="progress-label"><span>训练进度</span><span class="num">${Math.round(g.day / g.config.days * 100)}%</span></div><div class="progress-track"><i style="width:${g.day / g.config.days * 100}%"></i></div><div class="order-tabs" role="group" aria-label="交易方向">${[['buy', '买入'], ['sell', '卖出'], ['hold', '观望']].map(([type, label]) => `<button data-action="order" data-order="${type}" class="${orderType === type ? 'active' : ''}" aria-pressed="${orderType === type}" ${type === 'sell' && !g.shares ? 'disabled title="当前没有持仓"' : ''}>${label}</button>`).join('')}</div>${orderType === 'hold' ? `<div class="hold-state">${icon('pause')}<h3>${g.shares ? '持仓，等待市场验证。' : '空仓，也是一个决定。'}</h3><p>不进行交易，揭开下一根日 K。<br>保持耐心，让机会来到你这边。</p></div>` : `<div class="field-heading"><span>${orderType === 'buy' ? '使用可用资金' : '卖出现有持仓'}</span><small>自定义比例</small></div><div class="size-options">${[[.25, '1/4'], [1 / 3, '1/3'], [.5, '1/2'], [1, orderType === 'buy' ? '全仓' : '清仓']].map(([v, label]) => `<button data-action="size" data-size="${v}" class="${Math.abs(size - v) < .0001 ? 'active' : ''}">${label}</button>`).join('')}</div><div class="size-field"><input id="order-size" aria-label="仓位百分比" type="number" min="1" max="100" step="0.01" value="${+(size * 100).toFixed(2)}"><span>%</span></div><input id="size-range" type="range" aria-label="调整仓位比例" min="1" max="100" step="1" value="${Math.round(size * 100)}"><div class="range-labels"><span>1%</span><span>50%</span><span>100%</span></div><div class="estimate"><span>参考${orderType === 'buy' ? '投入' : '卖出'}</span><b id="estimate-value" class="num"></b></div><div class="field-help">按已知价格估算，实际数量以明日成交为准。</div>`}<div class="order-note"><textarea id="trade-note" aria-label="交易理由" maxlength="160" placeholder="写下这次决策的理由（选填）…">${escape(note)}</textarea></div><button class="submit-order" data-action="submit-order">${orderType === 'hold' ? '保持观望' : orderType === 'buy' ? '确认买入' : '确认卖出'}，推进一天 ${icon('arrow')}</button><div class="order-rule">下一交易日收盘成交 · 佣金 ${g.config.commission}%<br>${g.config.slippage ? `滑点 ${g.config.slippage}% · ` : ''}${g.config.lotSize === 100 ? '100 股一手' : '按整股交易'}</div><div class="position-details"><div><span>持仓成本</span><b class="num">${g.shares ? '¥ ' + (g.costBasis / g.shares).toFixed(3) : '—'}</b></div><div><span>持仓股数</span><b class="num">${money(g.shares)} 股</b></div><div><span>累计手续费</span><b class="num">¥ ${money(g.totalFees || 0)}</b></div></div></section>`;
}
function bindOrder() {
    $('trade-note').addEventListener('input', e => { note = e.target.value; });
    const input = $('order-size'), range = $('size-range');
    if (!input) return;
    const change = (v, source) => {
        if (!Number.isFinite(v) || v < 1 || v > 100) return;
        size = v / 100;
        if (source !== input) input.value = v;
        if (source !== range) range.value = Math.round(v);
        document.querySelectorAll('[data-action=size]').forEach(b => b.classList.toggle('active', Math.abs(size - Number(b.dataset.size)) < .0001));
        updateEstimate();
    };
    input.addEventListener('input', () => change(Number(input.value), input));
    range.addEventListener('input', () => change(Number(range.value), range));
    updateEstimate();
}
function updateEstimate() { const el = $('estimate-value'); if (el && G) el.textContent = orderType === 'buy' ? `¥ ${money(G.cash * size)}` : `${money(size === 1 ? G.shares : Math.floor(G.shares * size / G.config.lotSize) * G.config.lotSize)} 股`; }
function journal(g) {
    return `<section class="card journal"><div class="card-head"><h2>${icon('book')}交易日志 <span class="tag">${g.dailyRows.length} 条记录</span></h2><span class="muted" style="font-size:9px">${g.revealed ? '完整交易区间' : '记录行动，也记录理由'}</span></div>${!g.dailyRows.length ? `<div class="empty-state"><div class="empty-icon">${icon('edit')}</div><h3>你的第一笔决策，等待落笔。</h3><p>买入、卖出或观望之后，交易记录会出现在这里。</p></div>` : `<div class="table-wrap"><table><thead><tr><th>交易日</th><th>收盘价</th><th>涨跌幅</th><th>操作 / 理由</th><th>手续费</th><th>总资产</th></tr></thead><tbody>${[...g.dailyRows].reverse().map(r => {
        const action = g.actions.find(a => a.day === r.day);
        return `<tr><td>${g.revealed ? E.dateString(r.date) : `D+${r.day}`}</td><td class="num">${r.close.toFixed(2)}</td><td class="num ${sign(r.chg)}">${pct(r.chg)}</td><td><span class="${action?.action === 'buy' ? 'up' : action?.action === 'sell' ? 'down' : ''}">${escape(r.act)}</span>${action?.note ? `<div class="journal-note">${escape(action.note)}</div>` : ''}</td><td class="num">${money(action?.fee || 0)}</td><td class="num">${money(r.asset)}</td></tr>`;
    }).join('')}</tbody></table></div>`}</section>`;
}
function reveal(g) {
    const r = E.record(g);
    return `<section class="results-banner"><div><div class="eyebrow">CHALLENGE COMPLETE / 标的揭晓</div><h2>${escape(g.stock.name)} <span class="tag green">${escape(g.stock.fullCode.toUpperCase())}</span></h2><p>${E.dateString(g.kList[g.gameStart].date)} — ${E.dateString(E.currentBar(g).date)} · ${g.config.days} 个交易日<br>${r.beatBenchmark ? '你的策略跑赢了同期买入持有。' : '同期买入持有表现更好，回看每一次进出场的理由。'} 超额收益 <span class="num ${sign(r.return - r.benchmark)}">${pct(r.return - r.benchmark)}</span></p></div><div class="results-return"><small>你的最终收益</small><strong class="num ${sign(r.return)}">${pct(r.return)}</strong><small>买入持有 ${pct(r.benchmark)}</small></div></section>`;
}
function resultPanel(g) {
    const r = E.record(g);
    return `<section class="card order-panel"><div class="panel-kicker">YOUR TRADING REVIEW ${icon('check')}</div><h2>把经验留给下一局。</h2><p class="order-sub">这次训练已保存到复盘战绩。</p><div class="result-metrics"><div><span>训练周期</span><b>${g.config.days} 个交易日</b></div><div><span>买卖次数</span><b>${r.trades} 次</b></div><div><span>最大回撤</span><b class="num">${(r.drawdown * 100).toFixed(2)}%</b></div><div><span>累计手续费</span><b class="num">¥ ${money(r.fees)}</b></div><div><span>超额收益</span><b class="num ${sign(r.return - r.benchmark)}">${pct(r.return - r.benchmark)}</b></div></div><button class="submit-order" data-action="start">再练一局 ${icon('arrow')}</button><button class="btn" style="width:100%;margin-top:10px" data-action="nav" data-view="records">${icon('chart')}查看复盘战绩</button><p class="order-rule">切换周期与指标，回看这段完整行情。</p></section>`;
}
function renderRecords() {
    const n = records.length, avg = n ? records.reduce((sum, r) => sum + r.return, 0) / n : 0, wins = records.filter(r => r.return > 0).length, best = n ? Math.max(...records.map(r => r.return)) : 0;
    shell(`${heading('好交易，来自持续复盘。', '记录每一局的收益、交易成本与执行表现，把偶然的盈利变成可重复的系统。', `<button class="btn" data-action="export" ${!n ? 'disabled' : ''}>${icon('download')}<span>导出战绩</span></button><button class="btn primary" data-action="nav" data-view="workspace">${icon('arrow')}<span>${G && !G.revealed ? '回到对局' : '进入工作台'}</span></button>`, 'TRADING JOURNAL / 02')}<div class="stats">${stat('完成训练', `${n}<span style="font-size:14px;margin-left:5px">局</span>`, '日积月累，让经验看得见', 'book', '', true)}${stat('平均收益', pct(avg), '按单局收益率计算', 'trend', sign(avg))}${stat('盈利胜率', n ? `${(wins / n * 100).toFixed(1)}%` : '—', `${wins} 局盈利 / ${n} 局训练`, 'target')}${stat('最佳战绩', n ? pct(best) : '—', n ? `跑赢持有 ${records.filter(r => r.beatBenchmark).length} 局` : '下一局，开始建立记录', 'chart', sign(best))}</div>${n > 1 ? '<section class="card record-chart"><div class="card-head" style="padding:0 0 15px;margin-bottom:7px"><h2>策略表现</h2><span class="muted" style="font-size:9px">单局收益 · 与买入持有对照</span></div><div id="equity-chart" class="equity-chart"></div></section>' : ''}<section class="card record-card"><div class="card-head"><h2>${icon('book')}训练档案 <span class="tag">${n} 局</span></h2>${n ? '<button class="btn danger" data-action="clear-records" style="padding:5px 9px;font-size:9px">清空战绩</button>' : ''}</div>${n ? `<div class="table-wrap"><table><thead><tr><th>股票 / 训练时间</th><th>交易区间</th><th>周期</th><th>收益率</th><th>买入持有</th><th>最大回撤</th><th>手续费</th><th>交易</th></tr></thead><tbody>${[...records].reverse().map(r => `<tr><td><b style="font-weight:500;color:var(--ink)">${escape(r.name)}</b> <small class="muted">${escape(String(r.code || '').toUpperCase())}</small><div style="font-size:8px;margin-top:4px" class="muted">${escape(r.time)}</div></td><td style="font-size:9px">${escape(r.range)}</td><td>${r.days || 30} 日</td><td class="num ${sign(r.return)}">${pct(r.return)}</td><td class="num ${sign(r.benchmark)}">${pct(r.benchmark)}</td><td class="num">${r.drawdown == null ? '—' : (r.drawdown * 100).toFixed(2) + '%'}</td><td class="num">${r.fees == null ? '—' : money(r.fees)}</td><td>${r.trades} 次</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state" style="padding:70px 20px"><div class="empty-icon">${icon('book')}</div><h3>你的交易故事，从第一局开始。</h3><p>完成训练后，真实标的、收益与交易成本将在这里汇总。</p><button class="btn primary" data-action="nav" data-view="workspace">进入交易工作台 ${icon('arrow')}</button></div>`}</section>`);
    if (n > 1 && typeof echarts !== 'undefined') {
        equity = echarts.init($('equity-chart'));
        const colors = getComputedStyle(document.documentElement), text = colors.getPropertyValue('--muted').trim(), line = colors.getPropertyValue('--line').trim();
        equity.setOption({ animation: false, grid: { top: 20, left: 48, right: 10, bottom: 25 }, tooltip: { trigger: 'axis', valueFormatter: v => Number(v).toFixed(2) + '%' }, legend: { show: true, top: 0, right: 10, textStyle: { color: text, fontSize: 9 }, itemWidth: 14, itemHeight: 5 }, xAxis: { type: 'category', data: records.map((_, i) => `第${i + 1}局`), axisLabel: { color: text, fontSize: 9 }, axisTick: { show: false }, axisLine: { lineStyle: { color: line } } }, yAxis: { type: 'value', axisLabel: { color: text, fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: line, type: 'dashed' } } }, series: [{ name: '你的策略', type: 'line', symbolSize: 5, data: records.map(r => +(r.return * 100).toFixed(2)), lineStyle: { width: 2, color: '#70955b' }, itemStyle: { color: '#70955b' } }, { name: '买入持有', type: 'line', showSymbol: false, data: records.map(r => +(r.benchmark * 100).toFixed(2)), lineStyle: { color: '#aab4a0', width: 1, type: 'dashed' }, itemStyle: { color: '#aab4a0' } }] });
    }
}
function renderGuide() {
    shell(`${heading('给你的判断，一套清晰的规则。', '了解训练机制与分析工具，之后把注意力留给市场。', '<button class="btn primary" data-action="nav" data-view="workspace">回到工作台 ' + icon('arrow') + '</button>', 'THE FIELD GUIDE / 03')}<div class="guide-grid">${[
        ['01 / THE CHALLENGE', '真实行情，盲图训练', '系统随机抽取一只沪深 300 列表中的股票和历史区间，隐藏名称与日期。每局可设 7–200 个交易日，默认 30 日。前复权 K 线显示历史窗口，每次决策只揭示下一个交易日。完成后揭晓真实标的与日期，并保存战绩。'],
        ['02 / EXECUTION', '决策先于行情', '买卖指令以<strong>下一交易日收盘价</strong>成交。参考投入使用当前已知信息估算，实际股数随成交价格变化。每个交易日只能执行一次买入、卖出或观望；买入比例相对于可用现金，卖出比例相对于现有持仓。'],
        ['03 / TECHNICAL ANALYSIS', '主图均线，副图联动', '主图可叠加最多 6 条自定义均线。成交量、MACD、KDJ 各占一个副图，十字光标与缩放联动。周 K 按自然周、月 K 按自然月聚合，末根形成中的 K 线仅使用已知交易日。切换周期后，指标参数以该周期 K 线根数计算。'],
        ['04 / TRADING COSTS', '把交易成本计入决策', '设置中可以调整双向佣金费率和成交滑点，默认均为 0。佣金按成交金额计算，买入时计入持仓成本，卖出时从回款扣除。滑点在买入时提高、卖出时降低成交价格。选择按整股或 100 股一手交易；清仓可卖出全部剩余持仓。'],
        ['05 / YOUR WORKSPACE', '设置与记录，随时可用', '图表设置即时应用；周期、资金、历史窗口和费率等训练设置在新一局生效，当前对局遵循开局时的规则。进度自动保存在当前浏览器，刷新后恢复。开局尚未决策时可以重新抽题，开始决策后需完成本局。战绩可导出 CSV 备份。'],
        ['06 / KEYBOARD', '专注图表，快捷操作', '启用快捷键后：<kbd>B</kbd> 选择买入，<kbd>S</kbd> 选择卖出，<kbd>H</kbd> 选择观望，<kbd>Enter</kbd> 提交当前决策。<kbd>1</kbd> 日 K、<kbd>2</kbd> 周 K、<kbd>3</kbd> 月 K；<kbd>,</kbd> 打开设置。输入文字或打开弹窗时暂停交易快捷键。']
    ].map(([n, title, body]) => `<section class="card guide-card"><div class="guide-number">${n}</div><h2>${title}</h2><p>${body}</p></section>`).join('')}</div>`);
}
function renderLoading() { shell(`${heading('抽取下一道市场考题。', '加载真实历史行情，准备盲图训练。')}<section class="card loading-panel"><div class="loader"></div><h2>正在连接历史行情…</h2><p id="loading-status">从沪深 300 中随机抽取标的，准备 ${S.days} 个交易日。</p><button class="btn" data-action="cancel-load">取消加载</button></section>`); }
async function start() {
    if (loading) return;
    if (G && !G.revealed) { view = 'workspace'; render(); toast('已回到当前对局'); return; }
    const config = E.settings(S), pool = [...HS300_LIST], token = ++fetchToken;
    loading = true; view = 'workspace'; render();
    let error = '';
    for (let attempt = 0; attempt < 8 && pool.length; attempt++) {
        if (token !== fetchToken) return;
        const stock = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        if ($('loading-status')) $('loading-status').textContent = `正在校验行情 · 第 ${attempt + 1} 次尝试（训练 ${config.days} 日）`;
        try {
            const raw = await Util.loadDayKList(stock.fullCode);
            if (token !== fetchToken) return;
            const bars = Util.applyQfq(raw.map(k => ({ ...k, date: new Date(k.date) })).filter(k => Number.isFinite(k.date.getTime()) && [k.open, k.close, k.high, k.low].every(v => Number.isFinite(v) && v > 0)).sort((a, b) => a.date - b.date));
            const next = E.createGame(bars, stock, config);
            if (token !== fetchToken) return;
            G = next; orderType = 'buy'; size = S.defaultSize; note = ''; loading = false; MarketChart.reset(); save(); render(); toast('考题已就绪。先看趋势，再做决定。'); return;
        } catch (e) { error = e.message; }
    }
    if (token !== fetchToken) return;
    loading = false; render(); toast('暂时无法获取足量真实行情，请检查网络后重试'); console.warn('行情加载未完成', error);
}
function confirmDialog({ title, body, detail = '', confirm = '确认', danger = false, onConfirm, symbol = 'info' }) {
    if (document.querySelector('dialog[open]')) return;
    const d = document.createElement('dialog'); d.className = 'confirm-dialog'; d.setAttribute('aria-label', title);
    d.innerHTML = `<div class="confirm-symbol">${icon(symbol)}</div><h2>${escape(title)}</h2><p>${body}</p>${detail ? `<div class="confirm-detail">${detail}</div>` : ''}<div class="dialog-buttons"><button class="btn" data-cancel>取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-confirm>${confirm}</button></div>`;
    d.querySelector('[data-cancel]').onclick = () => d.close();
    d.querySelector('[data-confirm]').onclick = () => { d.close(); onConfirm(); };
    d.addEventListener('close', () => d.remove(), { once: true });
    d.addEventListener('click', e => { if (e.target === d) { const rect = d.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) d.close(); } });
    document.body.append(d); d.showModal(); d.querySelector('[data-cancel]').focus();
}
function submit() {
    if (!G || G.revealed || loading) return;
    if (orderType !== 'hold') { const input = $('order-size'); if (!input.reportValidity() || !input.value) return; size = Number(input.value) / 100; }
    const action = orderType, ratio = size, rationale = note, gameId = G.id;
    const perform = () => {
        if (!G || G.id !== gameId || G.revealed) return;
        try {
            const result = E.advance(G, action, ratio, rationale); note = '';
            if (G.revealed) {
                const r = E.record(G);
                if (!records.some(existing => existing.id === r.id)) records.push(r);
                // Keep completed save if record persistence fails, so a refresh can recover it.
                if (write(KEYS.records, records)) { write(KEYS.game, null); write(KEYS.legacy, null); } else write(KEYS.game, E.serialize(G));
            } else save();
            render();
            toast(G.revealed ? `训练完成 · 最终收益 ${pct(E.asset(G) / G.initCash - 1)}` : result.action === 'hold' ? `第 ${G.day} 日已揭示 · ${pct(G.dailyRows.at(-1).chg)}` : `${result.action === 'buy' ? '买入' : '卖出'} ${money(result.quantity)} 股 · 成交 ¥${result.price.toFixed(3)}${result.fee ? ` · 佣金 ¥${result.fee.toFixed(2)}` : ''}`);
        } catch (e) { toast(e.message); }
    };
    if (!S.confirmOrders || action === 'hold') return perform();
    confirmDialog({ title: `${action === 'buy' ? '买入' : '卖出'}并推进到第 ${G.day + 1} 日？`, body: `使用${action === 'buy' ? '可用现金' : '现有持仓'}的 <b>${(ratio * 100).toFixed(2)}%</b>，按下一交易日收盘价成交。${G.config.slippage ? `成交滑点为 ${G.config.slippage}%。` : ''}`, detail: `<span>双向佣金费率</span><b>${G.config.commission}%</b>`, confirm: '确认并推进', symbol: 'arrow', onConfirm: perform });
}
function exportRecords() {
    if (!records.length) return;
    const cell = v => { const str = String(v ?? ''); return '"' + (/^[=+@\-]/.test(str) ? "'" : '') + str.replace(/"/g, '""') + '"'; };
    const rows = [['训练时间', '股票', '代码', '区间', '交易日数', '期末资产', '收益率', '买入持有收益', '最大回撤', '手续费', '买卖次数'], ...records.map(r => [r.time, r.name, r.code, r.range, r.days || 30, r.asset.toFixed(2), pct(r.return), pct(r.benchmark), r.drawdown == null ? '' : (r.drawdown * 100).toFixed(2) + '%', r.fees ?? '', r.trades])];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }), link = document.createElement('a');
    const url = URL.createObjectURL(blob); link.href = url; link.download = `A股简单-战绩-${E.dateString(new Date())}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('战绩已导出');
}
const field = (name, label, type = 'number', attrs = '', help = '', value = S[name]) => `<label class="setting-field"><span class="setting-label">${label}</span><input name="${name}" type="${type}" value="${escape(value)}" ${attrs}>${help ? `<div class="field-help">${help}</div>` : ''}</label>`;
const selectField = (name, label, options) => `<label class="setting-field"><span class="setting-label">${label}</span><select name="${name}">${options.map(([value, text]) => `<option value="${value}" ${String(S[name]) === String(value) ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
const toggle = (name, title, help) => `<label class="switch-row"><span><strong>${title}</strong><small>${help}</small></span><input class="switch" type="checkbox" name="${name}" ${S[name] ? 'checked' : ''} aria-label="${title}"></label>`;
function settingsDialog(page = 'game') {
    if (document.querySelector('dialog[open]')) return;
    const d = document.createElement('dialog'); d.className = 'settings-dialog'; d.setAttribute('aria-labelledby', 'settings-title');
    d.innerHTML = `<form class="settings-form" id="settings-form" novalidate><header class="dialog-header"><div><h2 id="settings-title">让工作台，适合你的节奏。</h2><p>训练规则、分析工具与使用偏好，统一设置。</p></div><button type="button" class="icon-btn" data-close aria-label="关闭设置">${icon('close')}</button></header><div class="settings-body"><nav class="settings-nav" aria-label="设置分类">${[['game', '训练规则', 'target'], ['chart', '图表与指标', 'chart'], ['preferences', '使用偏好', 'sliders']].map(([p, title, i]) => `<button type="button" data-settings-tab="${p}" class="${p === page ? 'active' : ''}">${icon(i)}${title}</button>`).join('')}</nav><div class="settings-pages"><section class="settings-page ${page === 'game' ? 'active' : ''}" data-settings-page="game">${G && !G.revealed ? `<div class="settings-notice">${icon('info')}<span>本局使用 ${G.config.days} 日、佣金 ${G.config.commission}% 的开局规则。下方训练设置将在<strong>新一局</strong>生效；图表与偏好设置立即应用。</span></div>` : ''}<div class="settings-section"><h3>游戏日期跨度</h3><p>以交易日计数，不含周末与休市日。短周期练节奏，长周期看趋势。</p><label class="setting-field"><span class="setting-label">每局交易日数 <small>7–200 个交易日</small></span><div class="days-input"><input name="days" id="settings-days" type="number" min="7" max="200" step="1" required value="${S.days}"><span>个交易日</span></div><input id="days-range" type="range" min="7" max="200" step="1" aria-label="调整游戏跨度" value="${S.days}"><div class="range-labels"><span>7 日</span><span>200 日</span></div></label><div class="presets">${[7, 14, 30, 60, 100, 200].map(v => `<button type="button" data-days="${v}" class="${S.days === v ? 'active' : ''}">${v} 日${v === 30 ? ' · 默认' : ''}</button>`).join('')}</div></div><div class="settings-divider"></div><div class="settings-section"><h3>资金与交易成本</h3><p>费率按成交金额双向收取，买入手续费计入持仓成本。</p><div class="settings-grid">${field('initialCash', '初始资金（元）', 'number', 'min="10000" max="100000000" step="10000" required')}${selectField('lotSize', '交易单位', [[1, '按整股交易'], [100, '100 股一手']])}${field('commission', '双向佣金费率（%）', 'number', 'min="0" max="1" step="0.0001" required', '例如 0.03 = 万分之三；0 为免手续费。')}${field('slippage', '成交滑点（%）', 'number', 'min="0" max="1" step="0.0001" required', '买入价格上浮、卖出价格下调。')}</div></div><div class="settings-section"><h3>历史观察窗口</h3><p>更多历史 K 线帮助判断长期趋势。指标预热使用已经发生的历史数据。</p>${selectField('history', '开局前展示日 K 根数', [[120, '120 根 · 短线观察'], [200, '200 根 · 默认'], [500, '500 根 · 中期趋势'], [1000, '1,000 根 · 长期分析'], [2000, '2,000 根 · 多周期研究']])}</div></section><section class="settings-page ${page === 'chart' ? 'active' : ''}" data-settings-page="chart"><div class="settings-section"><h3>主图与周期</h3><p>均线叠加在 K 线主图，副图共享时间轴、十字光标与缩放。</p>${selectField('period', '默认 K 线周期', [['day', '日 K'], ['week', '周 K · 自然周聚合'], ['month', '月 K · 自然月聚合']])}${toggle('ma', '主图均线 MA', '最多 6 条均线，参数以当前周期 K 线根数计算。')}${field('maPeriods', '均线周期', 'text', 'required placeholder="5, 10, 20, 60"', '用逗号分隔，支持 2–250。历史不足完整周期时显示 —。', S.maPeriods.join(', '))}${toggle('costLine', '持仓成本线', '在主图以虚线显示包含买入手续费的平均持仓成本。')}${toggle('tradeMarkers', '买卖标记', '在主图标注 B 买入、S 卖出的位置。')}</div><div class="settings-divider"></div><div class="settings-section"><h3>成交量副图</h3>${toggle('volume', '成交量 VOL', '与 K 线涨跌同步着色，并叠加成交量均线。')}${field('volumePeriods', '成交量均线周期', 'text', 'required', '用逗号分隔，最多 2 条，支持 2–250。', S.volumePeriods.join(', '))}</div><div class="settings-divider"></div><div class="settings-section"><h3>MACD 副图</h3>${toggle('macd', 'MACD', 'DIF、DEA 曲线与双倍差值柱状图。')}<div class="settings-grid triple">${field('macdFast', '快线 EMA', 'number', 'min="2" max="100" step="1" required')}${field('macdSlow', '慢线 EMA', 'number', 'min="3" max="200" step="1" required')}${field('macdSignal', '信号周期', 'number', 'min="2" max="100" step="1" required')}</div></div><div class="settings-divider"></div><div class="settings-section"><h3>KDJ 副图</h3>${toggle('kdj', 'KDJ', 'K、D、J 三线与 20 / 80 参考线。')}<div class="settings-grid triple">${field('kdjPeriod', 'RSV 周期', 'number', 'min="2" max="100" step="1" required')}${field('kdjK', 'K 平滑周期', 'number', 'min="1" max="50" step="1" required')}${field('kdjD', 'D 平滑周期', 'number', 'min="1" max="50" step="1" required')}</div></div></section><section class="settings-page ${page === 'preferences' ? 'active' : ''}" data-settings-page="preferences"><div class="settings-section"><h3>显示偏好</h3><p>选择舒适的工作环境，保持注意力集中。</p>${selectField('theme', '界面主题', [['light', '米白 · 日间工作台'], ['dark', '松绿 · 夜间工作台']])}${selectField('colorScheme', '涨跌颜色', [['red-up', '红涨绿跌 · A 股习惯'], ['green-up', '绿涨红跌 · 国际习惯']])}${toggle('coach', '交易手记', '在决策旁显示关于纪律和独立判断的提示。')}</div><div class="settings-divider"></div><div class="settings-section"><h3>交易交互</h3>${selectField('defaultSize', '默认下单比例', [[.25, '1/4 仓 · 25%'], [1 / 3, '1/3 仓 · 33.33%'], [.5, '1/2 仓 · 50%'], [1, '全仓 · 100%']])}${toggle('confirmOrders', '买卖前确认', '提交买卖时确认比例和费率；观望直接推进一天。')}${toggle('shortcuts', '键盘快捷操作', '输入文字或打开弹窗时，交易快捷键自动暂停。')}<div class="shortcut-row"><span>买入 / 卖出 / 观望</span><span><kbd>B</kbd> <kbd>S</kbd> <kbd>H</kbd></span></div><div class="shortcut-row"><span>提交当前决策</span><kbd>Enter</kbd></div><div class="shortcut-row"><span>日 K / 周 K / 月 K</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></div><div class="shortcut-row"><span>打开设置</span><kbd>,</kbd></div></div><div class="settings-notice">${icon('check')}<span>设置与对局自动保存在当前浏览器，支持刷新后继续。战绩可在复盘页导出备份。</span></div></section><p class="form-error" id="settings-error" role="alert"></p></div></div><footer class="settings-footer"><button type="button" class="btn" data-reset-settings>${icon('reset')}恢复默认设置</button><div><button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary">保存设置 ${icon('check')}</button></div></footer></form>`;
    const form = d.querySelector('form');
    const tab = p => { d.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.toggle('active', b.dataset.settingsTab === p)); d.querySelectorAll('[data-settings-page]').forEach(el => el.classList.toggle('active', el.dataset.settingsPage === p)); d.querySelector('.settings-pages').scrollTop = 0; };
    d.querySelectorAll('[data-settings-tab]').forEach(b => b.onclick = () => tab(b.dataset.settingsTab));
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
    const days = form.elements.days, range = d.querySelector('#days-range');
    function syncDays(value) { if (Number.isFinite(value)) range.value = value; d.querySelectorAll('[data-days]').forEach(b => b.classList.toggle('active', Number(b.dataset.days) === value)); }
    days.addEventListener('input', () => syncDays(Number(days.value)));
    range.addEventListener('input', () => { days.value = range.value; syncDays(Number(range.value)); });
    d.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { days.value = b.dataset.days; syncDays(Number(days.value)); });
    d.querySelector('[data-reset-settings]').onclick = () => {
        for (const [name, value] of Object.entries(E.DEFAULTS)) {
            const input = form.elements[name]; if (!input) continue;
            if (input.type === 'checkbox') input.checked = value; else input.value = Array.isArray(value) ? value.join(', ') : value;
        }
        syncDays(30); $('settings-error').textContent = '默认设置已填入，点击保存后应用。';
    };
    form.onsubmit = event => {
        event.preventDefault();
        const invalid = [...form.elements].find(input => input.willValidate && !input.checkValidity());
        if (invalid) { tab(invalid.closest('[data-settings-page]').dataset.settingsPage); invalid.reportValidity(); return; }
        const draft = { ...S };
        for (const key of Object.keys(E.DEFAULTS)) {
            const input = form.elements[key];
            if (!input) continue;
            draft[key] = input.type === 'checkbox' ? input.checked : typeof E.DEFAULTS[key] === 'number' ? Number(input.value) : input.value;
        }
        for (const key of ['maPeriods', 'volumePeriods']) {
            const parts = draft[key].split(/[,，、\s]+/).filter(Boolean).map(Number), limit = key === 'maPeriods' ? 6 : 2;
            if (!parts.length || parts.length > limit || parts.some(p => !Number.isInteger(p) || p < 2 || p > 250) || new Set(parts).size !== parts.length) { tab('chart'); $('settings-error').textContent = `${key === 'maPeriods' ? '主图' : '成交量'}均线请输入 1–${limit} 个不重复的整数周期（2–250）。`; form.elements[key].focus(); return; }
            draft[key] = parts;
        }
        if (draft.macdFast >= draft.macdSlow) { tab('chart'); $('settings-error').textContent = 'MACD 快线周期必须小于慢线周期。'; form.elements.macdFast.focus(); return; }
        const newSettings = E.settings(draft), changedPeriod = S.period !== newSettings.period;
        S = newSettings; size = S.defaultSize; write(KEYS.settings, S); d.close(); if (changedPeriod) MarketChart.reset(); render(); toast(G && !G.revealed ? '已保存。图表即时更新，训练规则在新一局生效。' : '设置已保存');
    };
    d.addEventListener('close', () => d.remove(), { once: true });
    d.addEventListener('click', event => { if (event.target === d) { const rect = d.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) d.close(); } });
    document.body.append(d); d.showModal();
}
function refreshChart() {
    if (!$('chart')) return;
    document.querySelectorAll('[data-action=period]').forEach(b => { const active = b.dataset.period === S.period; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
    document.querySelectorAll('[data-action=indicator]').forEach(b => { const active = S[b.dataset.indicator]; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
    const foot = document.querySelector('.chart-foot span:first-child');
    if (foot) foot.innerHTML = icon('info') + (!G ? '演示数据 · 开始挑战后使用真实历史行情' : S.period !== 'day' && !G.revealed ? '末根为形成中的周期 K 线 · 仅包含已揭示交易日' : '滚轮缩放 · 拖动平移 · 十字光标联动');
    MarketChart.render(G || preview(), S);
}
function setPeriod(period) { S.period = period; write(KEYS.settings, S); MarketChart.reset(); refreshChart(); }
function fullscreen() {
    const el = $('chart-card'); if (!el) return;
    if (el.classList.contains('fullscreen-fallback')) { el.classList.remove('fullscreen-fallback'); MarketChart.resize(); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => { el.classList.add('fullscreen-fallback'); MarketChart.resize(); });
    else { el.classList.add('fullscreen-fallback'); MarketChart.resize(); }
}
document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'home') event.preventDefault();
    switch (action) {
        case 'nav': view = button.dataset.view; render(); window.scrollTo({ top: 0 }); break;
        case 'home': view = 'workspace'; render(); break;
        case 'settings': settingsDialog(); break;
        case 'chart-settings': settingsDialog('chart'); break;
        case 'guide': view = 'guide'; render(); break;
        case 'start': start(); break;
        case 'cancel-load': fetchToken++; loading = false; render(); break;
        case 'period': setPeriod(button.dataset.period); break;
        case 'indicator': S[button.dataset.indicator] = !S[button.dataset.indicator]; write(KEYS.settings, S); refreshChart(); break;
        case 'chart-reset': MarketChart.reset(); MarketChart.render(G || preview(), S, true); break;
        case 'fullscreen': fullscreen(); break;
        case 'order': orderType = button.dataset.order; render(); break;
        case 'size': size = Number(button.dataset.size); render(); break;
        case 'submit-order': submit(); break;
        case 'export': exportRecords(); break;
        case 'clear-records': confirmDialog({ title: '清空全部战绩？', body: '训练档案清空后无法恢复。需要留存时，可以先导出 CSV。当前进行中的对局会保留。', confirm: '清空战绩', danger: true, onConfirm: () => { records = []; write(KEYS.records, []); render(); toast('战绩已清空'); } }); break;
        case 'abandon':
            if (!G || G.actions.length) return;
            confirmDialog({ title: '重新抽取一道考题？', body: '本局尚未进行决策，重新抽题不会计入战绩。', confirm: '重新抽题', symbol: 'reset', onConfirm: () => { G = null; write(KEYS.game, null); write(KEYS.legacy, null); start(); } }); break;
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('chart-card')?.classList.contains('fullscreen-fallback')) { $('chart-card').classList.remove('fullscreen-fallback'); MarketChart.resize(); }
    if (!S.shortcuts || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('dialog[open]') || view !== 'workspace' || loading) return;
    const key = event.key.toLowerCase();
    if (key === ',') { event.preventDefault(); settingsDialog(); }
    else if (['1', '2', '3'].includes(key)) { event.preventDefault(); setPeriod({ 1: 'day', 2: 'week', 3: 'month' }[key]); }
    else if (G && !G.revealed && ['b', 's', 'h'].includes(key)) { event.preventDefault(); if (key === 's' && !G.shares) { toast('当前没有可卖出持仓'); return; } orderType = { b: 'buy', s: 'sell', h: 'hold' }[key]; render(); }
    else if (key === 'enter' && G && !G.revealed && !event.target.closest('button, a')) { event.preventDefault(); submit(); }
});
window.addEventListener('resize', () => equity?.resize());
document.addEventListener('fullscreenchange', () => MarketChart.resize());
window.addEventListener('app:before-update', event => {
    if (loading || document.querySelector('dialog[open]')) { event.preventDefault(); toast('请先完成或关闭当前操作，再点击更新。'); return; }
    if (!save()) { event.preventDefault(); return; }
    try { sessionStorage.setItem(KEYS.draft, JSON.stringify({ gameId: G?.id, orderType, size, note, view })); }
    catch { if (note) { event.preventDefault(); toast('无法保存交易备注，请先记录备注后再更新。'); } }
});
try {
    const draft = JSON.parse(sessionStorage.getItem(KEYS.draft));
    if (draft && draft.gameId === G?.id) { orderType = ['buy', 'sell', 'hold'].includes(draft.orderType) ? draft.orderType : 'buy'; size = Number.isFinite(draft.size) ? draft.size : S.defaultSize; note = String(draft.note || '').slice(0, 160); view = ['workspace', 'records', 'guide'].includes(draft.view) ? draft.view : 'workspace'; }
    sessionStorage.removeItem(KEYS.draft);
} catch {}
render();
if (G && !G.revealed) { save(); toast(`已恢复对局 · 第 ${G.day + 1} / ${G.config.days} 个交易日`); }
})();
