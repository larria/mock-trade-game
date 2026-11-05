/* Linked multi-period price / volume / MACD / KDJ chart. */
(function () {
'use strict';
const E = TradingEngine;
let instance, observer, lastModel, zoom = null, zoomPeriod = null;
const colors = ['#c28c36', '#7896ca', '#9b80b6', '#368b8b', '#cc7896', '#6c945b'];
const number = v => v == null ? '—' : Number(v).toFixed(2);
const compact = v => Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(1) + '万' : Math.round(v).toLocaleString('zh-CN');
function model(g, s) {
    // Slice before aggregation: even a forming week/month has zero access to hidden candles.
    const from = Math.max(0, g.histStart - 1500), knownEnd = g.gameStart + g.day;
    const all = E.aggregate(g.kList.slice(from, knownEnd), s.period, from);
    const first = all.findIndex(k => k.endIndex >= g.histStart), bars = all.slice(Math.max(0, first));
    const closes = all.map(k => k.close), volumes = all.map(k => k.volume);
    const take = values => values.slice(Math.max(0, first));
    const baselineBucket = bars.findIndex(k => k.endIndex >= g.gameStart);
    const prefix = { day: 'D', week: 'W', month: 'M' }[s.period];
    const labels = bars.map((k, i) => g.revealed ? E.dateString(k.date) : (k.endIndex < g.gameStart ? `${prefix}${i - (baselineBucket < 0 ? bars.length : baselineBucket)}` : `${prefix}+${i - baselineBucket + 1}`));
    const m = E.macd(closes, s.macdFast, s.macdSlow, s.macdSignal), k = E.kdj(all, s.kdjPeriod, s.kdjK, s.kdjD);
    return { bars, labels, mas: s.maPeriods.map(p => ({ p, values: take(E.sma(closes, p)) })), vmas: s.volumePeriods.map(p => ({ p, values: take(E.sma(volumes, p)) })), macd: { dif: take(m.dif), dea: take(m.dea), histogram: take(m.histogram) }, kdj: { k: take(k.k), d: take(k.d), j: take(k.j) }, start: baselineBucket };
}
function dispose() { if (observer) observer.disconnect(); if (instance) instance.dispose(); instance = null; }
function render(g, s, reset = false) {
    const dom = document.getElementById('chart');
    if (!dom) return;
    dispose();
    if (typeof echarts === 'undefined') { dom.innerHTML = '<div class="chart-error">行情图组件加载失败，请刷新后重试。</div>'; return; }
    const m = model(g, s); lastModel = m;
    const dark = s.theme === 'dark', up = s.colorScheme === 'red-up' ? '#d7685b' : '#25866a', down = s.colorScheme === 'red-up' ? '#25866a' : '#d7685b';
    const text = dark ? '#94aca3' : '#87918b', line = dark ? '#293c33' : '#edf0eb', accent = dark ? '#b6d9a0' : '#376a51';
    const subs = [s.volume && 'volume', s.macd && 'macd', s.kdj && 'kdj'].filter(Boolean);
    const mainHeight = 285, subHeight = 90, top = 20, gap = 25, slider = 38;
    const height = top + mainHeight + subs.length * (subHeight + gap) + slider + 24;
    dom.style.height = `${height}px`;
    instance = echarts.init(dom, null, { renderer: 'canvas' });
    const grids = [{ left: 58, right: 24, top, height: mainHeight }];
    subs.forEach((_, i) => grids.push({ left: 58, right: 24, top: top + mainHeight + gap + i * (subHeight + gap), height: subHeight }));
    const xAxes = grids.map((_, i) => ({ type: 'category', gridIndex: i, data: m.labels, boundaryGap: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: i === grids.length - 1, color: text, fontSize: 10, hideOverlap: true, margin: 10 }, axisPointer: { label: { show: true, backgroundColor: accent } }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax' }));
    const yAxes = grids.map((_, i) => ({ scale: true, gridIndex: i, splitNumber: i === 0 ? 4 : 2, axisLabel: { color: text, fontSize: 10, formatter: i > 0 && subs[i - 1] === 'volume' ? compact : value => number(value) }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: line, type: 'dashed' } }, axisPointer: { label: { backgroundColor: accent } } }));
    const price = { name: { day: '日K', week: '周K', month: '月K' }[s.period], type: 'candlestick', data: m.bars.map(k => [k.open, k.close, k.low, k.high]), barMaxWidth: 14, itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down }, markLine: s.costLine && g.shares > 0 ? { symbol: 'none', silent: true, lineStyle: { color: '#b99a58', type: 'dashed', width: 1 }, label: { position: 'insideEndTop', formatter: '持仓成本 {c}', color: '#b99a58', fontSize: 10 }, data: [{ yAxis: +(g.costBasis / g.shares).toFixed(3) }] } : undefined };
    if (s.tradeMarkers) {
        price.markPoint = { symbolSize: 23, label: { color: '#fff', fontSize: 9, formatter: p => p.data.name }, data: g.actions.filter(a => a.action === 'buy' || a.action === 'sell').flatMap(a => {
            const idx = m.bars.findIndex(b => b.startIndex <= g.gameStart + a.day - 1 && b.endIndex >= g.gameStart + a.day - 1);
            return idx < 0 ? [] : [{ name: a.action === 'buy' ? 'B' : 'S', coord: [idx, a.action === 'buy' ? m.bars[idx].low : m.bars[idx].high], itemStyle: { color: a.action === 'buy' ? up : down }, symbolRotate: a.action === 'buy' ? 180 : 0, symbolOffset: [0, a.action === 'buy' ? 12 : -12] }];
        }) };
    }
    const series = [price];
    const addLine = (name, data, color, axis = 0, dashed = false) => series.push({ name, type: 'line', data, xAxisIndex: axis, yAxisIndex: axis, showSymbol: false, connectNulls: false, lineStyle: { color, width: 1.25, type: dashed ? 'dashed' : 'solid' }, itemStyle: { color }, emphasis: { focus: 'none' }, animation: false });
    if (s.ma) m.mas.forEach((ma, i) => addLine(`MA${ma.p}`, ma.values, colors[i]));
    const graphic = [];
    subs.forEach((sub, i) => {
        const axis = i + 1, y = grids[axis].top - 17;
        const title = sub === 'volume' ? 'VOL · 成交量' : sub === 'macd' ? `MACD (${s.macdFast}, ${s.macdSlow}, ${s.macdSignal})` : `KDJ (${s.kdjPeriod}, ${s.kdjK}, ${s.kdjD})`;
        graphic.push({ type: 'text', left: 58, top: y, style: { text: title, fill: text, font: '10px sans-serif' } });
        if (sub === 'volume') {
            series.push({ name: 'VOL', type: 'bar', xAxisIndex: axis, yAxisIndex: axis, barMaxWidth: 14, data: m.bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? up : down, opacity: 0.5 } })) });
            m.vmas.forEach((v, j) => addLine(`VMA${v.p}`, v.values, colors[j], axis));
        } else if (sub === 'macd') {
            series.push({ name: 'MACD', type: 'bar', xAxisIndex: axis, yAxisIndex: axis, barMaxWidth: 10, data: m.macd.histogram.map(v => ({ value: v, itemStyle: { color: v >= 0 ? up : down, opacity: 0.7 } })) });
            addLine('DIF', m.macd.dif, colors[0], axis); addLine('DEA', m.macd.dea, colors[2], axis);
        } else {
            addLine('K', m.kdj.k, colors[0], axis); addLine('D', m.kdj.d, colors[1], axis); addLine('J', m.kdj.j, colors[2], axis);
            series[series.length - 1].markLine = { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: text, type: 'dashed', opacity: 0.3 }, data: [{ yAxis: 20 }, { yAxis: 80 }] };
        }
    });
    if (reset || zoomPeriod !== s.period) zoom = null;
    zoomPeriod = s.period;
    const windowBars = zoom ? zoom.count : ({ day: 85, week: 52, month: 36 }[s.period]);
    const endValue = zoom && !zoom.trailing ? Math.min(zoom.end, m.bars.length - 1) : m.bars.length - 1;
    const startValue = Math.max(0, endValue - windowBars + 1);
    instance.setOption({ animation: false, backgroundColor: 'transparent', graphic,
        tooltip: { trigger: 'axis', confine: true, transitionDuration: 0, backgroundColor: dark ? '#1f3028' : '#fff', borderColor: line, padding: [12, 16], textStyle: { color: dark ? '#e2e8de' : '#31443b', fontSize: 11 }, axisPointer: { type: 'cross' }, formatter: params => {
            const idx = params[0]?.dataIndex, b = m.bars[idx]; if (!b) return '';
            let html = `<b>${m.labels[idx]} · ${price.name}${!g.revealed && idx === m.bars.length - 1 && s.period !== 'day' ? ' · 形成中' : ''}</b><div style="margin-top:8px;line-height:1.8">开 ${number(b.open)}　高 ${number(b.high)}<br>收 ${number(b.close)}　低 ${number(b.low)}<br>成交量 ${compact(b.volume)} · ${b.count} 个交易日</div>`;
            if (s.ma) m.mas.forEach((v, i) => { html += `<div style="color:${colors[i]}">MA${v.p}　${number(v.values[idx])}</div>`; });
            if (s.macd) html += `<div style="margin-top:5px">DIF ${number(m.macd.dif[idx])}　DEA ${number(m.macd.dea[idx])}<br>MACD ${number(m.macd.histogram[idx])}</div>`;
            if (s.kdj) html += `<div>K ${number(m.kdj.k[idx])}　D ${number(m.kdj.d[idx])}　J ${number(m.kdj.j[idx])}</div>`;
            return html;
        } },
        axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: text, type: 'dashed' } },
        grid: grids, xAxis: xAxes, yAxis: yAxes,
        dataZoom: [{ type: 'inside', xAxisIndex: grids.map((_, i) => i), startValue, endValue, minValueSpan: Math.min(8, m.bars.length - 1), zoomOnMouseWheel: true, moveOnMouseMove: true, preventDefaultMouseMove: true }, { type: 'slider', xAxisIndex: grids.map((_, i) => i), bottom: 6, left: 58, right: 24, height: 19, startValue, endValue, showDetail: false, brushSelect: false, borderColor: line, backgroundColor: dark ? '#1c2b24' : '#f5f7f2', fillerColor: dark ? '#38533c55' : '#cad7bd55', handleStyle: { color: accent, borderWidth: 0 }, dataBackground: { lineStyle: { color: text, opacity: 0.4 }, areaStyle: { color: text, opacity: 0.07 } }, selectedDataBackground: { lineStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.12 } } }],
        series
    });
    instance.on('datazoom', () => {
        const z = instance.getOption().dataZoom[0], start = Math.round(z.start / 100 * (m.bars.length - 1)), end = Math.round(z.end / 100 * (m.bars.length - 1));
        zoom = { count: end - start + 1, end, trailing: z.end > 99.5 };
    });
    instance.on('updateAxisPointer', event => { const idx = event.axesInfo?.[0]?.value; if (Number.isInteger(idx)) updateReadout(m, idx, s); });
    dom.onmouseleave = () => updateReadout(m, m.bars.length - 1, s);
    observer = new ResizeObserver(() => instance?.resize()); observer.observe(dom);
    updateReadout(m, m.bars.length - 1, s);
    const count = document.getElementById('bar-count'); if (count) count.textContent = `${m.bars.length} 根${price.name}`;
}
function updateReadout(m, idx, s) {
    const b = m.bars[idx]; if (!b) return;
    const el = document.getElementById('ohlc');
    if (el) el.innerHTML = `<span class="readout-label">${m.labels[idx]}</span><span>开 <b>${number(b.open)}</b></span><span>高 <b>${number(b.high)}</b></span><span>低 <b>${number(b.low)}</b></span><span>收 <b>${number(b.close)}</b></span><span>量 <b>${compact(b.volume)}</b></span>`;
    const legend = document.getElementById('ma-legend');
    if (legend) legend.innerHTML = s.ma ? m.mas.map((v, i) => `<span style="color:${colors[i]}">MA${v.p} <b>${number(v.values[idx])}</b></span>`).join('') : '<span>均线已关闭</span>';
}
window.MarketChart = { render, dispose, model, reset() { zoom = null; }, resize() { instance?.resize(); }, getInstance: () => instance, getModel: () => lastModel };
})();
