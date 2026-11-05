/* Pure trading and indicator calculations. Browser + Node, no future data access. */
(function (root) {
'use strict';
const DEFAULTS = Object.freeze({ days: 30, markets: ['hs300', 'csi500', 'star', 'chinext'], initialCash: 1000000, history: 200, commission: 0, slippage: 0, lotSize: 1, period: 'day', ma: true, maPeriods: [5, 10, 20, 60], volume: true, volumePeriods: [5, 10], macd: true, macdFast: 12, macdSlow: 26, macdSignal: 9, macdReadout: true, kdj: false, kdjPeriod: 9, kdjK: 3, kdjD: 3, kdjReadout: true, indicatorPrecision: 3, indicatorDirections: true, costLine: true, tradeMarkers: true, colorScheme: 'red-up', theme: 'light', confirmOrders: true, shortcuts: true, coach: true, defaultSize: 0.25 });
const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
function settings(input = {}) {
    const s = { ...DEFAULTS, ...input };
    for (const [key, min, max] of [['days', 7, 500], ['initialCash', 10000, 100000000], ['history', 120, 2000], ['macdFast', 2, 100], ['macdSlow', 3, 200], ['macdSignal', 2, 100], ['kdjPeriod', 2, 100], ['kdjK', 1, 50], ['kdjD', 1, 50], ['indicatorPrecision', 2, 6]]) s[key] = Math.round(clamp(s[key], min, max, DEFAULTS[key]));
    s.markets = [...new Set((Array.isArray(s.markets) ? s.markets : DEFAULTS.markets).filter(id => DEFAULTS.markets.includes(id)))];
    if (!s.markets.length) s.markets = [...DEFAULTS.markets];
    if (s.macdFast >= s.macdSlow) { s.macdFast = 12; s.macdSlow = 26; }
    for (const key of ['commission', 'slippage']) s[key] = clamp(s[key], 0, 1, 0);
    s.defaultSize = clamp(s.defaultSize, 0.01, 1, 0.25);
    s.lotSize = Number(s.lotSize) === 100 ? 100 : 1;
    for (const key of ['ma', 'volume', 'macd', 'kdj', 'macdReadout', 'kdjReadout', 'indicatorDirections', 'costLine', 'tradeMarkers', 'confirmOrders', 'shortcuts', 'coach']) s[key] = typeof s[key] === 'boolean' ? s[key] : DEFAULTS[key];
    for (const [key, fallback] of [['maPeriods', DEFAULTS.maPeriods], ['volumePeriods', DEFAULTS.volumePeriods]]) {
        const periods = Array.isArray(s[key]) ? s[key].map(Number) : [];
        s[key] = [...new Set(periods.filter(p => Number.isInteger(p) && p >= 2 && p <= 250))].slice(0, key === 'maPeriods' ? 6 : 2);
        if (!s[key].length) s[key] = [...fallback];
    }
    s.period = ['day', 'week', 'month'].includes(s.period) ? s.period : 'day';
    s.theme = s.theme === 'dark' ? 'dark' : 'light';
    s.colorScheme = s.colorScheme === 'green-up' ? 'green-up' : 'red-up';
    return s;
}
function dateString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function periodKey(date, period) {
    const d = new Date(date);
    if (period === 'month') return `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (period === 'week') {
        const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        utc.setUTCDate(utc.getUTCDate() - (utc.getUTCDay() + 6) % 7);
        return utc.toISOString().slice(0, 10);
    }
    return dateString(d);
}
function aggregate(bars, period = 'day', offset = 0) {
    const result = [];
    bars.forEach((bar, i) => {
        const key = periodKey(bar.date, period), last = result[result.length - 1];
        if (last && last.key === key) {
            last.close = bar.close; last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low);
            last.volume += bar.volume || 0; last.amount += bar.amount || 0;
            last.date = new Date(bar.date); last.endIndex = i + offset; last.count++;
        } else result.push({ ...bar, date: new Date(bar.date), firstDate: new Date(bar.date), key, startIndex: i + offset, endIndex: i + offset, count: 1, volume: bar.volume || 0, amount: bar.amount || 0 });
    });
    return result;
}
function sma(values, period) {
    let sum = 0;
    return values.map((v, i) => { sum += v; if (i >= period) sum -= values[i - period]; return i < period - 1 ? null : sum / period; });
}
function ema(values, period) {
    let prev;
    return values.map(v => { prev = prev === undefined ? v : (2 * v + (period - 1) * prev) / (period + 1); return prev; });
}
function macd(values, fast = 12, slow = 26, signal = 9) {
    const f = ema(values, fast), s = ema(values, slow), dif = f.map((v, i) => v - s[i]), dea = ema(dif, signal);
    return { dif, dea, histogram: dif.map((v, i) => 2 * (v - dea[i])) };
}
function kdj(bars, period = 9, smoothK = 3, smoothD = 3) {
    let k = 50, d = 50;
    const K = [], D = [], J = [];
    bars.forEach((bar, i) => {
        if (i < period - 1) { K.push(null); D.push(null); J.push(null); return; }
        const window = bars.slice(i - period + 1, i + 1), high = Math.max(...window.map(b => b.high)), low = Math.min(...window.map(b => b.low));
        const rsv = high === low ? 50 : (bar.close - low) / (high - low) * 100;
        k = (k * (smoothK - 1) + rsv) / smoothK; d = (d * (smoothD - 1) + k) / smoothD;
        K.push(k); D.push(d); J.push(3 * k - 2 * d);
    });
    return { k: K, d: D, j: J };
}
function createGame(kList, stock, input, random = Math.random) {
    const config = settings(input), gap = 30, min = config.history;
    const max = kList.length - gap - config.days;
    if (max < min) throw new Error('历史行情不足，正在尝试其他标的');
    const gameStart = min + Math.floor(random() * (max - min + 1));
    return { id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`, stock, kList, config, histStart: gameStart - config.history, gameStart, endIdx: gameStart + config.days - 1, day: 0, cash: config.initialCash, shares: 0, costBasis: 0, initCash: config.initialCash, actions: [], dailyRows: [], revealed: false, totalFees: 0 };
}
const currentBar = g => g.kList[g.gameStart + g.day - 1];
const asset = g => g.cash + g.shares * currentBar(g).close;
function drawdown(g) {
    let peak = g.initCash, max = 0;
    for (const row of g.dailyRows) { peak = Math.max(peak, row.asset); max = Math.max(max, (peak - row.asset) / peak); }
    return max;
}
function advance(g, action, size = 0, note = '') {
    if (g.revealed || g.day >= g.config.days) throw new Error('本局已结束');
    if (!['buy', 'sell', 'hold'].includes(action)) throw new Error('无效的交易操作');
    if (action !== 'hold' && !(Number.isFinite(size) && size > 0 && size <= 1)) throw new Error('仓位比例应在 1%–100% 之间');
    const day = g.day + 1, bar = g.kList[g.gameStart + day - 1], prev = currentBar(g);
    const rate = g.config.commission / 100, slip = g.config.slippage / 100;
    let quantity = 0, fee = 0, price = bar.close;
    if (action === 'buy') {
        price *= 1 + slip;
        quantity = Math.floor((g.cash * size / (price * (1 + rate))) / g.config.lotSize) * g.config.lotSize;
        if (quantity <= 0) throw new Error('该比例资金不足，无法买入。请提高比例或选择观望');
        fee = quantity * price * rate;
        const cost = quantity * price + fee;
        g.cash = Math.max(0, g.cash - cost); g.shares += quantity; g.costBasis += cost;
    } else if (action === 'sell') {
        if (g.shares <= 0) throw new Error('当前没有可卖出的持仓');
        price *= 1 - slip;
        quantity = size === 1 ? g.shares : Math.floor(g.shares * size / g.config.lotSize) * g.config.lotSize;
        if (quantity <= 0) throw new Error('该比例不足一个交易单位，请提高卖出比例');
        fee = quantity * price * rate;
        g.costBasis -= g.costBasis / g.shares * quantity; g.shares -= quantity; g.cash += quantity * price - fee;
        if (!g.shares) g.costBasis = 0;
    }
    g.totalFees = (g.totalFees || 0) + fee;
    g.actions.push({ day, action, size, quantity, price, fee, note: String(note).slice(0, 160) });
    g.day = day;
    g.dailyRows.push({ day, date: bar.date, close: bar.close, chg: (bar.close - prev.close) / prev.close, act: action === 'hold' ? (g.shares ? '持仓观望' : '空仓观望') : `${action === 'buy' ? '买入' : '卖出'} ${quantity.toLocaleString('zh-CN')} 股`, asset: asset(g) });
    if (day === g.config.days) g.revealed = true;
    return g.actions[g.actions.length - 1];
}
function serialize(g) {
    // Include older, already known bars for long-period indicator warmup.
    const from = Math.max(0, g.histStart - 1500);
    return { ...g, histStart: g.histStart - from, gameStart: g.gameStart - from, endIdx: g.endIdx - from, kList: g.kList.slice(from, g.endIdx + 1).map(k => ({ ...k, date: new Date(k.date).getTime() })) };
}
function hydrate(s) {
    if (!s || !Array.isArray(s.kList)) return null;
    const g = { ...s, config: settings(s.config), kList: s.kList.map(k => ({ ...k, date: new Date(k.date) })), dailyRows: (s.dailyRows || []).map(r => ({ ...r, date: new Date(r.date) })), actions: s.actions || [], totalFees: s.totalFees || 0 };
    if (!Number.isInteger(g.day) || g.day < 0 || g.day > g.config.days || !g.kList[g.endIdx] || !g.kList[g.gameStart - 1] || !Number.isFinite(g.cash) || !Number.isFinite(g.shares)) return null;
    return g;
}
function migrate(s) {
    if (!s || !s.kSlice) return null;
    const history = s.gameStart - s.histStart;
    return hydrate({ ...s, id: `legacy-${s.stock.fullCode}-${s.kSlice[0].d}`, config: { ...DEFAULTS, days: 30, initialCash: s.initCash, history }, histStart: 0, gameStart: history, endIdx: history + 29, kList: s.kSlice.map(k => ({ date: k.d, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v, amount: k.a })) });
}
function record(g) {
    const ret = asset(g) / g.initCash - 1, base = g.kList[g.gameStart - 1].close, benchmark = currentBar(g).close / base - 1;
    return { id: g.id, time: new Date().toLocaleString('zh-CN'), name: g.stock.name, code: g.stock.fullCode, range: `${dateString(g.kList[g.gameStart].date)} ~ ${dateString(currentBar(g).date)}`, days: g.config.days, asset: asset(g), return: ret, benchmark, beatBenchmark: ret >= benchmark, trades: g.actions.filter(a => a.action !== 'hold').length, drawdown: drawdown(g), fees: g.totalFees };
}
const api = { DEFAULTS, settings, dateString, aggregate, sma, ema, macd, kdj, createGame, currentBar, asset, drawdown, advance, serialize, hydrate, migrate, record };
root.TradingEngine = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
