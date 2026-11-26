/* Linked price and indicator grids. All chart studies receive revealed bars only. */
(function () {
'use strict';
const E = TradingEngine;
const C = globalThis.ChartStudies || (typeof require === 'function' && require('./chart-studies.js'));
const { colors, studies } = C;
let instance, observer, lastModel, current, zoom, zoomPeriod, layoutKey, resizeFrame;
const number = (v, precision = 2) => Number.isFinite(v) ? v.toFixed(precision) : '—';
const compact = v => !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(1) + '万' : Math.round(v).toLocaleString('zh-CN');

function model(g, s) {
    const prefs = C.prefs(s);
    const from = Math.max(0, g.histStart - 1500), knownEnd = g.gameStart + g.day;
    const daily = C.prices(g, from, knownEnd, prefs.adjustment);
    const all = E.aggregate(daily, s.period, from);
    const first = Math.max(0, all.findIndex(k => k.endIndex >= g.histStart));
    const bars = all.slice(first);
    const take = data => data.slice(first);
    const baseline = bars.findIndex(k => k.endIndex >= g.gameStart);
    const prefix = { day: 'D', week: 'W', month: 'M' }[s.period];
    const labels = bars.map((k, i) => g.revealed ? E.dateString(k.date) : (k.endIndex < g.gameStart ? `${prefix}${i - (baseline < 0 ? bars.length : baseline)}` : `${prefix}+${i - baseline + 1}`));
    const studyData = {};
    for (const spec of prefs.panes) {
        const def = studies[spec.id];
        const data = def.calculate(all, spec.params, E);
        const [lhs, rhs] = def.pairs[spec.pair];
        studyData[spec.id] = {
            ...Object.fromEntries(Object.entries(data).map(([key, values]) => [key, take(values)])),
            prior: Object.fromEntries(Object.entries(data).map(([key, values]) => [key, values[first - 1] ?? null])),
            marks: spec.cross ? C.crosses(data[lhs], data[rhs] ?? C.level(rhs, spec.params)).filter(v => v.index >= first).map(v => ({ ...v, index: v.index - first })) : []
        };
    }
    const anchorDay = globalThis.MarketDrawing?.anchor(g.id);
    const overlayData = Object.entries(prefs.overlays).flatMap(([id, spec]) => {
        if (!spec.enabled) return [];
        const { lines, pair, band, markValues } = id === 'vwap' ? C.anchoredVwap(daily, all, from, anchorDay == null ? g.histStart : g.gameStart + anchorDay)
            : C.overlayValues(id, spec, all, E);
        const marks = spec.cross && pair ? C.crosses(...pair).filter(v => v.index >= first).map(v => ({ ...v, index: v.index - first, value: markValues?.[v.index] ?? v.value })) : [];
        return [{ id, marks, band: band && { top: take(band.top), bottom: take(band.bottom), directional: band.directional }, lines: lines.map((line, i) => ({ ...line, data: take(line.data), color: colors[(i + Object.keys(C.overlays).indexOf(id)) % colors.length] })) }];
    });
    const last = bars.at(-1);
    const previous = daily.at(-2);
    const change = previous ? daily.at(-1).close / previous.close - 1 : 0;
    return { bars, labels, prefs, studyData, overlayData, change, close: daily.at(-1)?.close, first, start: baseline,
        adjustment: C.hasRawPrices(g) ? prefs.adjustment : 'forward',
        from, factors: daily.map((bar, i) => bar.close / (g.kList[from + i].original?.close || bar.close)),
        candleData: prefs.type === 'heikin' ? take(C.heikin(all)) : bars,
        priceRatio: last ? daily.at(-1).close / g.kList[knownEnd - 1].close : 1 };
}

function indicatorReadout(m, idx, s, id) {
    const values = m.studyData[id];
    return studies[id].metrics.map(({ key, label, color }) => {
        const value = values[key][idx], previous = idx > 0 ? values[key][idx - 1] : values.prior?.[key];
        const comparable = Number.isFinite(value) && Number.isFinite(previous);
        const direction = !comparable ? 'unknown' : value > previous ? 'up' : value < previous ? 'down' : 'flat';
        return { label, color, value, previous, formatted: number(value, s.indicatorPrecision), direction,
            arrow: s.indicatorDirections && comparable ? { up: '↑', down: '↓', flat: '→' }[direction] : '' };
    });
}
function metrics(m, index, s, id) {
    return indicatorReadout(m, index, s, id).map(v => {
        const direction = { up: '高于上一根', down: '低于上一根', flat: '与上一根持平', unknown: '无可比数据' }[v.direction];
        const formatted = ['volume', 'obv', 'adl'].includes(id) && Math.abs(v.value) >= 10000 ? compact(v.value) : v.formatted;
        return `<span class="indicator-metric" style="--study-color:${v.color}" title="${v.label} ${v.formatted} · ${direction}">${v.label} <b>${formatted}</b>${v.arrow ? `<i aria-label="${direction}">${v.arrow}</i>` : ''}</span>`;
    }).join('');
}
const compactMedia = '(max-width: 780px), (max-height: 550px)';
const isCompact = () => matchMedia(compactMedia).matches;
function layout(dom, specs) {
    const compactLayout = isCompact(), viewport = Math.min(window.innerHeight, window.visualViewport?.height || Infinity);
    const dock = document.querySelector('.quick-trade-active #quick-trade:not([hidden])')?.getBoundingClientRect().height || 0;
    const fullscreen = document.fullscreenElement || dom.closest('.fullscreen-fallback');
    const card = dom.closest('.chart-card');
    const nav = fullscreen ? 0 : document.querySelector('.mobile-nav')?.getBoundingClientRect().height || 0;
    const above = dom.getBoundingClientRect().top - card.getBoundingClientRect().top;
    const top = fullscreen ? 0 : card.getBoundingClientRect().top + window.scrollY;
    const budget = Math.floor(viewport - top - dock - nav - above - 4);
    const veryShort = compactLayout && budget < 248;
    const headerSize = compactLayout ? (veryShort ? 22 : budget < 290 ? 25 : 30) : 33;
    const axisSpace = compactLayout ? 31 : 46;
    const heights = specs.map(spec => {
        const factor = { compact: 0.76, normal: 1, large: 1.32 }[spec.height];
        const base = compactLayout ? Math.min(58, Math.max(veryShort ? 17 : 20, Math.floor((budget - 192) / 4))) : 105;
        return Math.round(base * factor);
    });
    const minMain = veryShort ? 58 : 76;
    const firstCount = Math.min(3, specs.length);
    const headersHeight = firstCount * (headerSize + 3);
    const firstPanesHeight = heights.slice(0, firstCount).reduce((sum, h) => sum + h, 0);
    const roomForPanes = budget - axisSpace - 12 - minMain - headersHeight;
    if (compactLayout && firstPanesHeight > roomForPanes) {
        const scale = roomForPanes / firstPanesHeight;
        for (let i = 0; i < firstCount; i++) heights[i] = Math.max(14, Math.floor(heights[i] * scale));
    }
    const firstThree = heights.slice(0, firstCount).reduce((sum, h) => sum + h, headersHeight);
    const mainHeight = compactLayout ? Math.max(minMain, Math.min(340, budget - firstThree - axisSpace - 12)) : 315;
    const left = compactLayout ? 44 : 61, right = compactLayout ? 13 : 25;
    const grids = [{ left, right, top: 5, height: mainHeight }];
    const headers = [];
    const sliderIndex = compactLayout ? Math.min(3, specs.length) : specs.length;
    let y = mainHeight + 10, sliderTop = y + 15;
    for (let i = 0; i < specs.length; i++) {
        if (i === sliderIndex) y += axisSpace;
        headers.push(y);
        y += headerSize;
        grids.push({ left, right, top: y, height: heights[i] });
        y += heights[i] + 3;
        if (i + 1 === sliderIndex) sliderTop = y + 15;
    }
    return { grids, headers, height: y + (specs.length > sliderIndex ? 20 : axisSpace), compactLayout, sliderIndex, sliderTop, headerSize };
}

function dispose() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    observer?.disconnect();
    observer = null;
    globalThis.MarketDrawing?.detach();
    instance?.dispose();
    instance = null;
    current = null;
    layoutKey = null;
}
function render(g, s, reset = false) {
    const dom = document.getElementById('chart');
    if (!dom) return;
    if (typeof echarts === 'undefined') { dom.textContent = '行情图组件加载失败，请刷新后重试。'; return; }
    const m = model(g, s);
    lastModel = m;
    if (reset || zoomPeriod !== s.period) zoom = null;
    zoomPeriod = s.period;
    if (current?.dom !== dom) {
        dispose();
        const canvas = document.createElement('div');
        canvas.className = 'chart-surface';
        const controls = document.createElement('div');
        controls.className = 'chart-pane-controls';
        dom.replaceChildren(canvas, controls);
        instance = echarts.init(canvas, null, { renderer: 'canvas' });
        current = { dom, controls, canvas };
        instance.on('datazoom', () => {
            const z = instance.getOption().dataZoom[0], max = current.m.bars.length - 1;
            const start = Math.round(z.start / 100 * max), end = Math.round(z.end / 100 * max);
            zoom = { count: end - start + 1, end, trailing: z.end > 99.5 };
            MarketDrawing.paint();
        });
        instance.on('updateAxisPointer', event => {
            const index = event.axesInfo?.[0]?.value;
            if (Number.isInteger(index)) updateReadout(current.m, index, current.s);
        });
        canvas.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') updateReadout(current.m, current.m.bars.length - 1, current.s); });
        let width = dom.clientWidth;
        observer = new ResizeObserver(() => {
            if (width === dom.clientWidth) return;
            width = dom.clientWidth;
            resize();
        });
        observer.observe(dom);
        if (isCompact()) resize();
    }
    Object.assign(current, { g, s, m });
    draw();
}
function resize() {
    if (!current || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (!current?.dom.isConnected) return;
        instance.resize();
        draw();
    });
}
function range(count) {
    if (!current) return;
    const end = current.m.bars.length - 1;
    zoom = count ? { count, end, trailing: true } : null;
    draw();
}
function draw() {
    const { dom, canvas, controls, m, s, g } = current;
    const dark = s.theme === 'dark';
    const up = s.colorScheme === 'red-up' ? '#d7685b' : '#25866a', down = s.colorScheme === 'red-up' ? '#25866a' : '#d7685b';
    const text = dark ? '#a1b4a8' : '#5d7064', line = dark ? '#334438' : '#e7ebe1', accent = dark ? '#b6d9a0' : '#376a51';
    const specs = m.prefs.panes;
    const key = specs.map(v => `${v.id}:${v.readout}:${Object.values(v.params).join('/')}`).join(',');
    if (layoutKey !== key) {
        controls.innerHTML = specs.map(({ id, readout, params }) => `<div class="chart-pane-header" data-pane="${id}"><b title="${studies[id].fields.map(field => field.label + ' ' + params[field.key]).join(' · ')}">${studies[id].name}<small> (${Object.values(params).join(',')})</small></b>${readout ? `<div class="chart-pane-values" id="${id}-readout" aria-label="${studies[id].name} 数值"></div>` : '<span class="chart-pane-values"></span>'}<button type="button" data-action="pane-settings" data-pane="${id}" aria-label="${studies[id].name} 设置" title="${studies[id].name} 设置"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg></button></div>`).join('');
        layoutKey = key;
    }
    updateReadout(m, m.bars.length - 1, s);
    const { grids, headers, height, compactLayout, sliderIndex, sliderTop, headerSize } = layout(dom, specs);
    dom.style.setProperty('--chart-grid-left', grids[0].left + 'px');
    dom.style.setProperty('--chart-grid-right', grids[0].right + 'px');
    dom.style.setProperty('--chart-pane-header-height', headerSize + 'px');
    [...controls.children].forEach((el, i) => { el.style.top = headers[i] + 'px'; });
    if (canvas.style.height !== `${height}px`) { canvas.style.height = height + 'px'; instance.resize(); }
    const xAxes = grids.map((_, i) => ({ type: 'category', gridIndex: i, data: m.labels, boundaryGap: true,
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: i === sliderIndex || i === grids.length - 1, color: text, fontSize: 9, hideOverlap: true, margin: 6 },
        axisPointer: { label: { show: i === 0 || i === sliderIndex || i === grids.length - 1, backgroundColor: accent } },
        splitLine: { show: false }, min: 'dataMin', max: 'dataMax' }));
    const yAxes = grids.map((_, i) => {
        const id = specs[i - 1]?.id;
        const domain = id === 'wr' ? [-100, 0] : ['rsi', 'mfi', 'stoch'].includes(id) ? [0, 100] : [];
        const log = i === 0 && m.prefs.scale === 'log';
        const min = log ? ({ min }) => Math.max(Number.MIN_VALUE, min / 1.025) : domain[0];
        const max = log ? ({ max }) => max * 1.025 : domain[1];
        return { type: i === 0 ? m.prefs.scale : 'value', scale: true, gridIndex: i, splitNumber: i === 0 ? (compactLayout ? 3 : 5) : 2,
            min, max, logBase: log ? 2 : undefined, axisLabel: { color: text, fontSize: 9, hideOverlap: true,
                formatter: ['volume', 'obv', 'adl'].includes(id) ? compact : v => number(v, domain.length || Math.abs(v) >= 100 ? 0 : 2) },
            axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: line, type: 'dashed' } },
            axisPointer: { label: { backgroundColor: accent } } };
    });
    const priceName = { day: '日 K', week: '周 K', month: '月 K' }[s.period];
    const asLine = ['line', 'area'].includes(m.prefs.type);
    const price = { name: priceName, type: asLine ? 'line' : 'candlestick',
        data: asLine ? m.bars.map(k => k.close) : m.candleData.map(k => [k.open, k.close, k.low, k.high]),
        barMaxWidth: 14, showSymbol: false, lineStyle: { width: 1.6, color: accent },
        itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
        areaStyle: m.prefs.type === 'area' ? { color: accent, opacity: 0.16 } : undefined };
    if (m.prefs.type === 'ohlc') {
        price.type = 'custom';
        price.data = m.bars.map((k, i) => [i, k.open, k.close, k.low, k.high]);
        price.encode = { x: 0, y: [1, 2, 3, 4] };
        price.renderItem = (_, api) => {
            const x = api.value(0), o = api.coord([x, api.value(1)]), c = api.coord([x, api.value(2)]);
            const low = api.coord([x, api.value(3)]), high = api.coord([x, api.value(4)]);
            const w = Math.min(5, Math.max(1, Math.abs(api.size([1, 0])[0]) * 0.3));
            return { type: 'group', children: [[high[0], high[1], low[0], low[1]], [o[0] - w, o[1], o[0], o[1]], [c[0], c[1], c[0] + w, c[1]]].map(([x1, y1, x2, y2]) => ({
                type: 'line', shape: { x1, y1, x2, y2 }, style: { stroke: api.value(2) >= api.value(1) ? up : down, lineWidth: 1.2 }
            })) };
        };
    }
    const trades = s.tradeMarkers ? g.actions.filter(a => ['buy', 'sell'].includes(a.action)).flatMap(a => {
        const idx = m.bars.findIndex(b => b.startIndex <= g.gameStart + a.day - 1 && b.endIndex >= g.gameStart + a.day - 1);
        return idx < 0 ? [] : [{ name: a.action === 'buy' ? '买入' : '卖出', value: a.action === 'buy' ? 'B' : 'S',
            coord: [idx, a.action === 'buy' ? m.bars[idx].low : m.bars[idx].high], symbol: 'circle', symbolSize: 15,
            symbolOffset: [0, a.action === 'buy' ? 9 : -9], itemStyle: { color: a.action === 'buy' ? up : down }, label: { show: true, color: '#fff', fontSize: 8 } }];
    }) : [];
    price.markPoint = { silent: true, data: trades };
    const rules = s.costLine && g.shares > 0 ? [{ name: '折算持仓成本', yAxis: +(g.costBasis / g.shares * m.priceRatio).toFixed(4), lineStyle: { color: '#a77c38' }, label: { show: !compactLayout, formatter: '{b} {c}', position: 'insideEndTop' } }] : [];
    price.markLine = { silent: true, symbol: 'none', lineStyle: { type: 'dashed' }, data: rules };
    const series = [price];
    const isLog = m.prefs.scale === 'log';
    const addLine = (name, data, color, axis, marks = [], levels = []) => series.push({
        name, type: 'line', data: !axis && isLog ? data.map(value => value > 0 ? value : null) : data, xAxisIndex: axis, yAxisIndex: axis, showSymbol: false, connectNulls: false, clip: true,
        lineStyle: { color, width: 1.3 }, itemStyle: { color },
        markPoint: { silent: true, label: { show: false }, symbolSize: 9, data: marks.filter(p => axis || !isLog || p.value > 0).map(p => ({ name: p.direction === 'up' ? '金叉 / 上穿' : '死叉 / 下穿',
            coord: [p.index, p.value], symbol: 'triangle', symbolRotate: p.direction === 'up' ? 0 : 180,
            symbolOffset: [0, p.direction === 'up' ? -4 : 4], itemStyle: { color: p.direction === 'up' ? up : down } })) },
        markLine: { silent: true, symbol: 'none', label: { show: !compactLayout, position: 'insideEndTop', color: text, fontSize: 8 }, lineStyle: { color: text, opacity: 0.42, type: 'dashed' },
            data: levels.filter(Number.isFinite).map(yAxis => ({ yAxis })) }
    });
    for (const overlay of m.overlayData) {
        const { band } = overlay;
        if (band) series.push({
            type: 'custom', name: C.overlays[overlay.id].label, silent: true, clip: true, z: 0,
            data: band.top.flatMap((v, i) => i && [v, band.bottom[i], band.top[i - 1], band.bottom[i - 1]].every(y => Number.isFinite(y) && (!isLog || y > 0))
                ? [[i, v, band.bottom[i], band.top[i - 1], band.bottom[i - 1]]] : []),
            encode: { x: 0, tooltip: [] },
            renderItem: (_, api) => {
                const x = api.value(0), a = api.value(1), b = api.value(2), c = api.value(3), d = api.value(4);
                return { type: 'polygon', shape: { points: [api.coord([x - 1, c]), api.coord([x, a]), api.coord([x, b]), api.coord([x - 1, d])] },
                    style: { fill: band.directional ? (a + c >= b + d ? up : down) : overlay.lines[0].color, opacity: 0.12 } };
            }
        });
        overlay.lines.forEach((l, index) => {
            addLine(l.name, l.data, l.color, 0, index ? [] : overlay.marks);
            if (l.dots) Object.assign(series.at(-1), { showSymbol: true, symbol: 'circle', symbolSize: 4, lineStyle: { opacity: 0 } });
        });
    }
    specs.forEach((spec, index) => {
        const axis = index + 1, def = studies[spec.id], data = m.studyData[spec.id];
        const source = def.pairs[spec.pair][0];
        def.metrics.forEach((metric, metricIndex) => {
            if (metric.kind === 'line') {
                addLine(metric.label, data[metric.key], metric.color, axis, metric.key === source ? data.marks : [],
                    metricIndex === def.metrics.findIndex(v => v.kind === 'line') ? (def.levels || []).map(ref => C.level(ref, spec.params)) : []);
                return;
            }
            series.push({ name: metric.label, type: 'bar', xAxisIndex: axis, yAxisIndex: axis, barMaxWidth: 13,
                data: data[metric.key].map((v, i) => ({ value: v, itemStyle: { color: (spec.id === 'volume' ? m.bars[i].close >= m.bars[i].open : v >= 0) ? up : down, opacity: 0.65 } })) });
        });
    });
    const endValue = zoom && !zoom.trailing ? Math.min(zoom.end, m.bars.length - 1) : m.bars.length - 1;
    const startValue = Math.max(0, endValue - (zoom?.count || { day: 85, week: 52, month: 36 }[s.period]) + 1);
    const xAxisIndex = grids.map((_, i) => i);
    instance.setOption({ animation: false, backgroundColor: 'transparent', grid: grids, xAxis: xAxes, yAxis: yAxes,
        tooltip: { trigger: 'axis', confine: true, showContent: !compactLayout, transitionDuration: 0, axisPointer: { type: 'cross' },
            backgroundColor: dark ? '#1f3028' : '#fff', borderColor: line, textStyle: { color: text, fontSize: 11 },
            formatter: params => {
                const i = (params.find(p => p.seriesIndex === 0) || params.find(p => p.seriesType !== 'custom'))?.dataIndex, b = m.bars[i];
                if (!b) return '';
                const marks = signalLabels(m, i);
                const values = specs.filter(spec => spec.readout).map(spec => indicatorReadout(m, i, s, spec.id)
                    .map(v => `${v.label} ${v.formatted}`).join(' · ')).join('<br>');
                return `<b>${m.labels[i]} · ${priceName}${!g.revealed && i === m.bars.length - 1 && s.period !== 'day' ? ' · 形成中' : ''}</b><br>开 ${number(b.open)}　高 ${number(b.high)}<br>收 ${number(b.close)}　低 ${number(b.low)}<br>量 ${compact(b.volume)} · ${b.count} 个交易日${values ? '<br>' + values : ''}${marks.length ? '<br>' + marks.join(' · ') : ''}`;
            } },
        axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: text, type: 'dashed' } },
        dataZoom: [{ type: 'inside', xAxisIndex, startValue, endValue, minValueSpan: Math.min(5, m.bars.length - 1), zoomOnMouseWheel: true, moveOnMouseMove: true, preventDefaultMouseMove: !compactLayout },
            { type: 'slider', xAxisIndex, startValue, endValue, top: sliderTop, left: grids[0].left, right: grids[0].right, height: compactLayout ? 12 : 19,
                showDetail: false, brushSelect: false, borderColor: line, backgroundColor: 'transparent', fillerColor: dark ? '#38533c66' : '#cad7bd66' }],
        series }, { notMerge: true });
    MarketDrawing.attach(dom, instance, m, g, accent, grids[0], () => render(g, s));
    const priceReadout = document.getElementById('chart-price'), changeReadout = document.getElementById('chart-change');
    if (priceReadout) priceReadout.textContent = number(m.close);
    if (changeReadout) {
        changeReadout.textContent = `${m.change > 0 ? '+' : ''}${number(m.change * 100)}%`;
        changeReadout.className = m.change > 0 ? 'up' : m.change < 0 ? 'down' : '';
    }
    const count = document.getElementById('bar-count');
    if (count) count.textContent = `${m.bars.length} 根${priceName}`;
}
function signalLabels(m, index) {
    const describe = (name, marks) => marks.filter(p => p.index === index).map(p => `${name} ${p.direction === 'up' ? '金叉／上穿' : '死叉／下穿'}`);
    return [...m.prefs.panes.flatMap(({ id }) => describe(studies[id].name, m.studyData[id].marks)),
        ...m.overlayData.flatMap(o => describe(C.overlays[o.id].name, o.marks))];
}
function updateReadout(m, idx, s) {
    const b = m.bars[idx];
    if (!b) return;
    const el = document.getElementById('ohlc');
    const previous = m.bars[idx - 1];
    const change = previous ? `<span>涨跌 ${number(100 * (b.close / previous.close - 1))}%</span>` : '';
    const signals = signalLabels(m, idx).map(text => `<span class="chart-signal">${text}</span>`).join('');
    if (el) el.innerHTML = `<b>${m.labels[idx]}</b>${['open', 'high', 'low', 'close'].map((key, i) => `<span>${'开高低收'[i]} ${number(b[key])}</span>`).join('')}<span>量 ${compact(b.volume)}</span><span>额 ${compact(b.amount)}</span>${change}${b.count > 1 ? `<span>${b.count} 个交易日</span>` : ''}${signals}`;
    const legend = document.getElementById('ma-legend');
    if (legend) {
        const lines = m.overlayData.flatMap(p => p.lines);
        legend.hidden = !lines.length;
        legend.innerHTML = lines.map(v => `<span style="--study-color:${v.color}">${v.name} <b>${number(v.data[idx])}</b></span>`).join('');
    }
    for (const { id } of m.prefs.panes) {
        const readout = document.getElementById(`${id}-readout`);
        if (readout) readout.innerHTML = metrics(m, idx, s, id);
    }
}
const api = { render, dispose, model, indicatorReadout, range, reset() { zoom = null; }, resize, getInstance: () => instance, getModel: () => lastModel };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.MarketChart = api;
})();
