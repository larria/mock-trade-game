/* Indicator definitions, settings and causal price transformations. */
(function (root) {
'use strict';

const colors = ['#a06a17', '#477ba8', '#8959a1', '#198078', '#bc5676', '#577f38'];
const field = (key, label, value, min = 2, max = 250, step = 1) => ({ key, label, value, min, max, step });
const metric = (key, label, color = 0, kind = 'line') => ({ key, label, color: colors[color], kind });
const bounded = (value, { value: fallback, min, max, step }) => {
    const n = value === '' ? NaN : Number(value ?? NaN);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, step === 1 ? Math.round(n) : n)) : fallback;
};
const periodList = (values, fallback, limit = 6) => {
    const result = Array.isArray(values) ? [...new Set(values.map(Number).filter(v => Number.isInteger(v) && v >= 2 && v <= 250))].slice(0, limit) : [];
    return result.length ? result : [...fallback];
};
const finite = Number.isFinite;
const close = bars => bars.map(b => b.close);
const typical = b => (b.high + b.low + b.close) / 3;
const range = (bars, i) => i ? Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)) : bars[i].high - bars[i].low;
function smooth(values, p, wilder = true) {
    let count = 0, sum = 0, previous = null;
    return values.map(value => {
        if (!finite(value)) { count = sum = 0; previous = null; return null; }
        if (previous == null) {
            sum += value;
            if (++count < p) return null;
            return previous = sum / p;
        }
        return previous += (value - previous) * (wilder ? 1 / p : 2 / (p + 1));
    });
}
function rolling(values, p, calc) {
    return values.map((_, i) => {
        if (i < p - 1) return null;
        const window = values.slice(i - p + 1, i + 1);
        return window.every(finite) ? calc(window, i) : null;
    });
}
const moneyFlow = bars => bars.map(b => b.high === b.low ? 0 : (2 * b.close - b.high - b.low) / (b.high - b.low) * b.volume);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const average = (values, p) => rolling(values, p, mean);
const extremes = (bars, p) => ({
    upper: rolling(bars.map(b => b.high), p, w => Math.max(...w)),
    lower: rolling(bars.map(b => b.low), p, w => Math.min(...w))
});
function rsi(values, p) {
    const change = values.map((v, i) => i ? v - values[i - 1] : null);
    const gains = smooth(change.map(d => d == null ? null : Math.max(0, d)), p);
    const losses = smooth(change.map(d => d == null ? null : Math.max(0, -d)), p);
    return gains.map((gain, i) => gain == null ? null : gain === 0 && losses[i] === 0 ? 50 : losses[i] === 0 ? 100 : 100 - 100 / (1 + gain / losses[i]));
}
function dmi(bars, p, signal) {
    const atr = smooth(bars.map((_, i) => i ? range(bars, i) : null), p);
    const direction = bars.map((b, i) => i ? [b.high - bars[i - 1].high, bars[i - 1].low - b.low] : null);
    const plus = smooth(direction.map(v => v ? (v[0] > Math.max(0, v[1]) ? v[0] : 0) : null), p);
    const minus = smooth(direction.map(v => v ? (v[1] > Math.max(0, v[0]) ? v[1] : 0) : null), p);
    const di = values => values.map((v, i) => atr[i] == null ? null : atr[i] ? 100 * v / atr[i] : 0);
    const pos = di(plus), neg = di(minus);
    const dx = pos.map((v, i) => v == null ? null : v + neg[i] ? 100 * Math.abs(v - neg[i]) / (v + neg[i]) : 0);
    return { pos, neg, adx: smooth(dx, signal) };
}
const studies = {
    volume: { name: 'VOL', label: '成交量', metrics: [metric('volume', 'VOL', 3, 'bar'), metric('fast', 'VMA 快'), metric('slow', 'VMA 慢', 1)],
        fields: [field('fast', '快均线', 5), field('slow', '慢均线（0 为关闭）', 10, 0)], pairs: [['fast', 'slow', '快均线 / 慢均线'], ['fast', 'volume', '快均线 / 成交量']],
        calculate: (bars, p, E) => { const volume = bars.map(b => b.volume); return { volume, fast: E.sma(volume, p.fast), slow: p.slow ? E.sma(volume, p.slow) : volume.map(() => null) }; } },
    macd: { name: 'MACD', label: '指数平滑异同平均线', metrics: [metric('dif', 'DIF'), metric('dea', 'DEA', 2), metric('histogram', 'MACD', 3, 'bar')],
        fields: [field('fast', '快线 EMA', 12, 2, 199), field('slow', '慢线 EMA', 26, 3, 200), field('signal', '信号周期', 9, 2, 100)],
        pairs: [['dif', 'dea', 'DIF / DEA'], ['dif', 0, 'DIF / 零轴']], levels: [0],
        calculate: (bars, p, E) => E.macd(close(bars), p.fast, p.slow, p.signal) },
    kdj: { name: 'KDJ', label: '随机指标', metrics: [metric('k', 'K'), metric('d', 'D', 1), metric('j', 'J', 2)],
        fields: [field('period', 'RSV 周期', 9, 2, 100), field('k', 'K 平滑', 3, 1, 50), field('d', 'D 平滑', 3, 1, 50)],
        pairs: [['k', 'd', 'K / D'], ['j', 80, 'J / 80'], ['j', 20, 'J / 20']], levels: [20, 80],
        calculate: (bars, p, E) => E.kdj(bars, p.period, p.k, p.d) },
    rsi: { name: 'RSI', label: '相对强弱指数', metrics: [metric('rsi', 'RSI'), metric('signal', '均线', 1)],
        fields: [field('period', 'Wilder 周期', 14), field('signal', '信号均线', 9), field('upper', '超买线', 70, 51, 99), field('lower', '超卖线', 30, 1, 49)],
        pairs: [['rsi', 'signal', 'RSI / 信号线'], ['rsi', 'upper', 'RSI / 超买线'], ['rsi', 'lower', 'RSI / 超卖线']], levels: ['lower', 50, 'upper'],
        calculate: (bars, p) => { const values = rsi(close(bars), p.period); return { rsi: values, signal: average(values, p.signal) }; } },
    atr: { name: 'ATR', label: '平均真实波幅', metrics: [metric('atr', 'ATR'), metric('signal', '均线', 1)],
        fields: [field('period', 'Wilder 周期', 14), field('signal', '信号均线', 14)], pairs: [['atr', 'signal', 'ATR / 信号线']],
        calculate: (bars, p) => { const atr = smooth(bars.map((_, i) => range(bars, i)), p.period); return { atr, signal: average(atr, p.signal) }; } },
    dmi: { name: 'DMI', label: '趋向指标 / ADX', metrics: [metric('pos', '+DI', 3), metric('neg', '−DI', 4), metric('adx', 'ADX')],
        fields: [field('period', 'DI 周期', 14), field('signal', 'ADX 平滑', 14), field('threshold', 'ADX 强度线', 25, 1, 99)],
        pairs: [['pos', 'neg', '+DI / −DI'], ['adx', 'threshold', 'ADX / 强度线']], levels: ['threshold'],
        calculate: (bars, p) => dmi(bars, p.period, p.signal) },
    obv: { name: 'OBV', label: '能量潮', metrics: [metric('obv', 'OBV', 3), metric('signal', '均线', 1)],
        fields: [field('signal', '信号均线', 20)], pairs: [['obv', 'signal', 'OBV / 信号线']],
        calculate: (bars, p, E) => { let total = 0; const obv = bars.map((b, i) => i ? total += Math.sign(b.close - bars[i - 1].close) * b.volume : total); return { obv, signal: E.sma(obv, p.signal) }; } },
    mfi: { name: 'MFI', label: '资金流量指标', metrics: [metric('mfi', 'MFI', 3), metric('signal', '均线', 1)],
        fields: [field('period', '计算周期', 14), field('signal', '信号均线', 9), field('upper', '超买线', 80, 51, 99), field('lower', '超卖线', 20, 1, 49)],
        pairs: [['mfi', 'signal', 'MFI / 信号线'], ['mfi', 'upper', 'MFI / 超买线'], ['mfi', 'lower', 'MFI / 超卖线']], levels: ['lower', 'upper'],
        calculate: (bars, p) => {
            const tp = bars.map(typical);
            const flow = tp.map((v, i) => i ? Math.sign(v - tp[i - 1]) * v * bars[i].volume : null);
            const mfi = rolling(flow, p.period, w => {
                const pos = w.reduce((sum, v) => sum + Math.max(v, 0), 0), neg = w.reduce((sum, v) => sum - Math.min(v, 0), 0);
                return pos + neg ? 100 * pos / (pos + neg) : 50;
            });
            return { mfi, signal: average(mfi, p.signal) };
        } },
    cci: { name: 'CCI', label: '商品通道指标', metrics: [metric('cci', 'CCI', 3)],
        fields: [field('period', '计算周期', 20), field('threshold', '阈值 ±', 100, 10, 500)],
        pairs: [['cci', 0, 'CCI / 零轴'], ['cci', 'threshold', 'CCI / 上阈值'], ['cci', '-threshold', 'CCI / 下阈值']], levels: ['-threshold', 0, 'threshold'],
        calculate: (bars, p) => ({ cci: rolling(bars.map(typical), p.period, w => {
            const avg = mean(w), deviation = mean(w.map(v => Math.abs(v - avg)));
            return deviation ? (w.at(-1) - avg) / (0.015 * deviation) : 0;
        }) }) },
    wr: { name: 'WR', label: '威廉指标 %R', metrics: [metric('wr', '%R', 2)],
        fields: [field('period', '计算周期', 14)], pairs: [['wr', -20, '%R / −20'], ['wr', -80, '%R / −80']], levels: [-80, -20],
        calculate: (bars, p) => { const { upper, lower } = extremes(bars, p.period); return { wr: close(bars).map((v, i) => upper[i] == null ? null : upper[i] === lower[i] ? -50 : 100 * (v - upper[i]) / (upper[i] - lower[i])) }; } },
    roc: { name: 'ROC', label: '变动率', metrics: [metric('roc', 'ROC', 3), metric('signal', '均线', 1)],
        fields: [field('period', '回看周期', 12), field('signal', '信号均线', 6)], pairs: [['roc', 'signal', 'ROC / 信号线'], ['roc', 0, 'ROC / 零轴']], levels: [0],
        calculate: (bars, p) => { const values = close(bars); const roc = values.map((v, i) => i < p.period ? null : 100 * (v / values[i - p.period] - 1)); return { roc, signal: average(roc, p.signal) }; } },
    stoch: { name: 'STOCH', label: '慢速随机指标', metrics: [metric('k', '%K'), metric('d', '%D', 1)],
        fields: [field('period', '回看周期', 14), field('k', '%K 平滑', 3, 1, 50), field('d', '%D 平滑', 3, 1, 50)],
        pairs: [['k', 'd', '%K / %D'], ['k', 80, '%K / 80'], ['k', 20, '%K / 20']], levels: [20, 80],
        calculate: (bars, p) => {
            const { upper, lower } = extremes(bars, p.period);
            const raw = close(bars).map((v, i) => upper[i] == null ? null : upper[i] === lower[i] ? 50 : 100 * (v - lower[i]) / (upper[i] - lower[i]));
            const k = average(raw, p.k);
            return { k, d: average(k, p.d) };
        } },
    cmf: { name: 'CMF', label: '蔡金资金流', metrics: [metric('cmf', 'CMF', 3)],
        fields: [field('period', '计算周期', 20)], pairs: [['cmf', 0, 'CMF / 零轴']], levels: [0],
        calculate: (bars, p) => ({ cmf: rolling(moneyFlow(bars), p.period, (flow, i) => {
            const volume = mean(bars.slice(i - p.period + 1, i + 1).map(b => b.volume));
            return volume ? mean(flow) / volume : 0;
        }) }) },
    adl: { name: 'A/D', label: '累积派发线', metrics: [metric('adl', 'A/D', 3), metric('signal', '均线', 1)],
        fields: [field('signal', '信号均线', 20)], pairs: [['adl', 'signal', 'A/D / 信号线']],
        calculate: (bars, p, E) => {
            let cumulative = 0;
            const adl = moneyFlow(bars).map(flow => cumulative += flow);
            return { adl, signal: E.sma(adl, p.signal) };
        } },
    trix: { name: 'TRIX', label: '三重指数平滑变动率', metrics: [metric('trix', 'TRIX', 2), metric('signal', '均线', 1)],
        fields: [field('period', 'EMA 周期', 15), field('signal', '信号均线', 9)], pairs: [['trix', 'signal', 'TRIX / 信号线'], ['trix', 0, 'TRIX / 零轴']], levels: [0],
        calculate: (bars, p) => {
            const ema = values => smooth(values, p.period, false);
            const triple = ema(ema(ema(close(bars))));
            const trix = triple.map((v, i) => v == null || !triple[i - 1] ? null : 100 * (v / triple[i - 1] - 1));
            return { trix, signal: average(trix, p.signal) };
        } }

};
const overlays = {
    ma: { name: 'MA', label: '简单均线' },
    ema: { name: 'EMA', label: '指数均线' },
    boll: { name: 'BOLL', label: '布林带', fields: [field('period', '周期', 20), field('width', '标准差倍数', 2, 0.5, 5, 0.1)] },
    donchian: { name: 'DC', label: '唐奇安通道', fields: [field('period', '周期', 20)] },
    vwap: { name: 'VWAP', label: '锚定成交量加权均价' },
    keltner: { name: 'KC', label: '肯特纳通道', fields: [field('period', 'EMA 周期', 20), field('atr', 'ATR 周期', 10), field('width', 'ATR 倍数', 2, 0.5, 8, 0.1)] },
    ichimoku: { name: 'ICHIMOKU', label: '一目均衡云', crossLabel: '标记转换线与基准线交叉',
        fields: [field('fast', '转换线周期', 9), field('base', '基准线周期', 26), field('span', '先行 B 周期', 52), field('shift', '云层位移', 26, 1, 100)] },
    supertrend: { name: 'ST', label: '超级趋势', crossLabel: '标记趋势翻转',
        fields: [field('period', 'ATR 周期', 10), field('width', 'ATR 倍数', 3, 0.5, 10, 0.1)] },
    sar: { name: 'SAR', label: '抛物线转向', crossLabel: '标记收盘价穿越 SAR',
        fields: [field('step', '加速步长', 0.02, 0.01, 0.2, 0.01), field('max', '最大加速因子', 0.2, 0.02, 1, 0.01)] }
};
const adjustments = { forward: '前复权', backward: '后复权', raw: '不复权' };
const chartTypes = { candle: '蜡烛图', ohlc: '美式线', line: '收盘线', area: '面积图', heikin: '平均 K 线' };
const maxPanes = 5;
const choice = (options, value, fallback) => Object.hasOwn(options, value) ? value : fallback;

function pane(id, input = {}) {
    const study = studies[id];
    const params = Object.fromEntries(study.fields.map(f => [f.key, bounded(input.params?.[f.key], f)]));
    if (id === 'volume' && params.slow === 1) params.slow = 0;
    if (['macd', 'volume'].includes(id) && params.slow > 0 && params.fast >= params.slow) {
        for (const f of study.fields.slice(0, 2)) params[f.key] = f.value;
    }
    return { id, params, readout: input.readout !== false, cross: input.cross === true,
        pair: Math.round(bounded(input.pair, { value: 0, min: 0, max: study.pairs.length - 1, step: 1 })),
        height: ['compact', 'normal', 'large'].includes(input.height) ? input.height : 'normal' };
}

function prefs(s = {}) {
    const input = s.chart || {};
    const legacy = [
        s.volume !== false && pane('volume', { params: { fast: s.volumePeriods?.[0], slow: s.volumePeriods?.length === 1 ? 0 : s.volumePeriods?.[1] }, pair: s.volumePeriods?.length === 1 ? 1 : 0 }),
        s.macd !== false && pane('macd', { params: { fast: s.macdFast, slow: s.macdSlow, signal: s.macdSignal }, readout: s.macdReadout }),
        s.kdj === true && pane('kdj', { params: { period: s.kdjPeriod, k: s.kdjK, d: s.kdjD }, readout: s.kdjReadout }),
        s.kdj !== true && pane('rsi')
    ].filter(Boolean);
    const seen = new Set();
    const panes = (Array.isArray(input.panes) ? input.panes : legacy).flatMap(spec => {
        if (!Object.hasOwn(studies, spec?.id) || seen.has(spec.id) || seen.size >= maxPanes) return [];
        seen.add(spec.id);
        return [pane(spec.id, spec)];
    });
    const main = Object.fromEntries(Object.keys(overlays).map(id => {
        const v = input.overlays?.[id] || {};
        const settings = { enabled: v.enabled === true || (v.enabled !== false && id === 'ma' && s.ma !== false), cross: v.cross === true };
        if (id === 'ma' || id === 'ema') settings.periods = periodList(v.periods || (id === 'ma' ? s.maPeriods : null), id === 'ma' ? [5, 10, 20, 60] : [12, 26, 60]);
        else if (overlays[id].fields) settings.params = Object.fromEntries(overlays[id].fields.map(f => [f.key, bounded(v.params?.[f.key], f)]));
        return [id, settings];
    }));
    return { panes, overlays: main, adjustment: choice(adjustments, input.adjustment, 'forward'),
        type: choice(chartTypes, input.type, 'candle'), scale: input.scale === 'log' ? 'log' : 'value' };
}

function preparedBars(raw, precision = 3) {
    const execution = adjustedBars(raw, 0, raw.length, 'forward');
    return execution.map((b, i) => {
        const { open, high, low, close, prevclose } = raw[i];
        const rounded = b.close === close ? b : { ...b, ...Object.fromEntries(['open', 'high', 'low', 'close'].map(key => [key, +b[key].toFixed(precision) || b[key]])) };
        return { ...rounded, prevclose: undefined, original: { open, high, low, close, prevclose } };
    });
}
const hasRawPrices = g => g.kList[0]?.original != null;
function adjustedBars(raw, from, end, mode) {
    const bars = raw.slice(from, end);
    if (mode === 'raw' || !bars.length) return bars;
    const factors = bars.map((bar, i) => {
        const previous = raw[i + from - 1]?.close;
        const factor = bar.prevclose / previous;
        return finite(factor) && factor > 0 && Math.abs(factor - 1) > 1e-6 ? factor : 1;
    });
    let scale = 1;
    const apply = i => {
        const bar = bars[i];
        if (scale !== 1) bars[i] = { ...bar, open: bar.open * scale, high: bar.high * scale, low: bar.low * scale, close: bar.close * scale };
    };
    if (mode === 'forward') {
        for (let i = bars.length - 1; i >= 0; i--) { apply(i); scale *= factors[i]; }
    } else {
        for (let i = 0; i < bars.length; i++) { if (i) scale /= factors[i]; apply(i); }
    }
    return bars;
}
function prices(g, from, end, mode) {
    if (!hasRawPrices(g)) return g.kList.slice(from, end);
    const raw = g.kList.slice(0, end).map(bar => ({ ...bar, ...bar.original }));
    return adjustedBars(raw, from, end, mode);
}
function crosses(values, reference) {
    let side = 0;
    return values.flatMap((value, index) => {
        const target = Array.isArray(reference) ? reference[index] : reference;
        if (!finite(value) || !finite(target)) { side = 0; return []; }
        const next = Math.sign(value - target);
        if (next === 0) return [];
        const changed = side !== 0 && side !== next;
        side = next;
        return changed ? [{ index, value, direction: next > 0 ? 'up' : 'down' }] : [];
    });
}
const level = (ref, params) => typeof ref === 'number' ? ref : ref[0] === '-' ? -params[ref.slice(1)] : params[ref];
function channelMidpoint(bars, period) {
    const { upper, lower } = extremes(bars, period);
    return upper.map((high, i) => high == null ? null : (high + lower[i]) / 2);
}
function parabolicSar(bars, { step, max }) {
    let rising, extreme, sar, acceleration;
    return bars.map((bar, i) => {
        if (!i) return null;
        const prior = bars[i - 1], earlier = bars[i - 2] ?? prior;
        if (i === 1) {
            rising = bar.close >= prior.close;
            sar = rising ? prior.low : prior.high;
            extreme = rising ? prior.high : prior.low;
            acceleration = Math.min(step, max);
        }
        const next = sar + acceleration * (extreme - sar);
        sar = rising ? Math.min(next, prior.low, earlier.low) : Math.max(next, prior.high, earlier.high);
        const value = rising ? bar.high : bar.low;
        if (rising ? bar.low < sar : bar.high > sar) {
            sar = rising ? Math.max(extreme, bar.high) : Math.min(extreme, bar.low);
            rising = !rising;
            extreme = rising ? bar.high : bar.low;
            acceleration = Math.min(step, max);
        } else if (rising ? value > extreme : value < extreme) {
            extreme = value;
            acceleration = Math.min(max, acceleration + step);
        }
        return sar;
    });
}
function supertrend(bars, { period, width }) {
    const atr = smooth(bars.map((_, i) => range(bars, i)), period);
    let upper, lower, rising = false;
    const side = [];
    const data = bars.map((b, i) => {
        if (atr[i] == null) { side.push(null); return null; }
        const midpoint = (b.high + b.low) / 2, u = midpoint + width * atr[i], l = midpoint - width * atr[i];
        const previous = bars[i - 1]?.close;
        upper = upper == null || u < upper || previous > upper ? u : upper;
        lower = lower == null || l > lower || previous < lower ? l : lower;
        rising = rising ? b.close >= lower : b.close > upper;
        side.push(rising ? 1 : -1);
        return rising ? lower : upper;
    });
    return { data, side };
}
function overlayValues(id, spec, bars, E) {
    const values = close(bars);
    const name = overlays[id].name;
    if (id === 'ma' || id === 'ema') {
        const lines = spec.periods.map(p => ({ name: name + p, data: id === 'ma' ? E.sma(values, p) : smooth(values, p, false) }));
        return { lines, pair: lines.length > 1 && [lines[0].data, lines[1].data] };
    }
    if (id === 'sar') {
        const data = parabolicSar(bars, spec.params);
        return { lines: [{ name, data, dots: true }], pair: [values, data] };
    }
    if (id === 'supertrend') {
        const { data, side } = supertrend(bars, spec.params);
        return { lines: [{ name, data }], pair: [side, 0], markValues: data };
    }
    if (id === 'ichimoku') {
        const { fast, base, span, shift } = spec.params;
        const tenkan = channelMidpoint(bars, fast), kijun = channelMidpoint(bars, base), b = channelMidpoint(bars, span);
        const cloudA = values.map((_, i) => Number.isFinite(kijun[i - shift]) && Number.isFinite(tenkan[i - shift]) ? (kijun[i - shift] + tenkan[i - shift]) / 2 : null);
        const cloudB = values.map((_, i) => b[i - shift] ?? null);
        return { lines: [{ name: '转换线', data: tenkan }, { name: '基准线', data: kijun }, { name: '先行 A', data: cloudA }, { name: '先行 B', data: cloudB }],
            pair: [tenkan, kijun], band: { top: cloudA, bottom: cloudB, directional: true } };
    }
    const period = spec.params.period;
    let upper, lower, middle;
    if (id === 'boll' || id === 'keltner') {
        middle = id === 'boll' ? E.sma(values, period) : smooth(values, period, false);
        const band = id === 'boll'
            ? rolling(values, period, (w, i) => Math.sqrt(mean(w.map(v => (v - middle[i]) ** 2))))
            : smooth(bars.map((_, i) => range(bars, i)), spec.params.atr);
        upper = middle.map((v, i) => v == null || band[i] == null ? null : v + band[i] * spec.params.width);
        lower = middle.map((v, i) => v == null || band[i] == null ? null : v - band[i] * spec.params.width);
    } else {
        ({ upper, lower } = extremes(bars, period));
        middle = upper.map((v, i) => v == null ? null : (v + lower[i]) / 2);
    }
    return { lines: [{ name: name + ' 中', data: middle }, { name: name + ' 上', data: upper }, { name: name + ' 下', data: lower }],
        pair: [values, middle], band: { top: upper, bottom: lower } };
}
function anchoredVwap(daily, bars, from, anchor) {
    let weight = 0, sum = 0;
    const cumulative = daily.map((b, index) => {
        if (index + from < anchor) return null;
        const volume = finite(b.volume) && b.volume > 0 ? b.volume : 0;
        weight += volume;
        sum += typical(b) * volume;
        return weight > 0 ? sum / weight : null;
    });
    const data = bars.map(b => cumulative[b.endIndex - from]);
    return { lines: [{ name: 'VWAP', data }], pair: [close(bars), data] };
}
function heikin(bars) {
    let prior;
    return bars.map(b => {
        const close = (b.open + b.high + b.low + b.close) / 4;
        const open = prior ? (prior.open + prior.close) / 2 : (b.open + b.close) / 2;
        return prior = { open, close, low: Math.min(b.low, open, close), high: Math.max(b.high, open, close) };
    });
}
const api = { studies, overlays, adjustments, chartTypes, maxPanes, colors, pane, prefs, level, crosses, prices, hasRawPrices, preparedBars, overlayValues, anchoredVwap, heikin, periodList };
root.ChartStudies = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
