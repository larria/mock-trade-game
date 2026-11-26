const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const C = require('../chart-studies.js');
const Chart = require('../market-chart.js');

const bar = (close, i, prevclose) => ({
    date: new Date(2025, 0, 1 + i), open: close, high: close, low: close, close, volume: 10, prevclose
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('the three price bases preserve raw input and use only revealed split factors', () => {
    const raw = [bar(100, 0), bar(110, 1), bar(52, 2, 55), bar(54, 3), bar(30, 4, 27)];
    const kList = C.preparedBars(raw);
    const g = { kList, histStart: 0, gameStart: 2, day: 2 };
    assert.deepEqual(C.prices(g, 0, 4, 'forward').map(k => k.close), [50, 55, 52, 54]);
    assert.deepEqual(C.prices(g, 0, 4, 'backward').map(k => k.close), [100, 110, 104, 108]);
    assert.deepEqual(C.prices(g, 0, 4, 'raw').map(k => k.close), [100, 110, 52, 54]);
    assert.deepEqual(kList.map(k => k.close), [25, 27.5, 26, 27, 30]);
    assert.equal(Chart.model(g, E.settings()).priceRatio, 2);
    assert.equal(Chart.model(g, E.settings()).close, 54);
    const legacy = { ...g, kList: kList.map(({ original, ...k }) => k) };
    const m = Chart.model(legacy, E.settings({ chart: { adjustment: 'raw' } }));
    assert.equal(m.adjustment, 'forward');
    assert.equal(m.close, 27);
});
test('default studies and legacy settings migrate without exceeding five unique panes', () => {
    assert.deepEqual(C.prefs(E.settings()).panes.map(p => p.id), ['volume', 'macd', 'rsi']);
    const migrated = C.prefs(E.settings({ kdj: true, macdReadout: false, volumePeriods: [15] }));
    assert.deepEqual(migrated.panes.map(p => p.id), ['volume', 'macd', 'kdj']);
    assert.deepEqual(migrated.panes[0].params, { fast: 15, slow: 0 });
    assert.equal(migrated.panes[1].readout, false);
    const ids = ['rsi', 'invalid', 'rsi', 'atr', 'macd', 'obv', 'dmi', 'kdj'];
    const s = C.prefs({ chart: { panes: ids.map(id => ({ id })) } });
    assert.deepEqual(s.panes.map(p => p.id), ['rsi', 'atr', 'macd', 'obv', 'dmi']);
});
test('crossings require a confirmed side change and never bridge missing values', () => {
    assert.deepEqual(C.crosses([1, 3, 3, 4, 4, null, 2, 3, 1, 4], 3), [
        { index: 3, value: 4, direction: 'up' },
        { index: 9, value: 4, direction: 'up' }
    ]);
    assert.deepEqual(C.crosses([2, 2, 1], [1, 2, 2]), [{ index: 2, value: 1, direction: 'down' }]);
});
test('Wilder RSI, Bollinger bands, VWAP and shifted cloud match hand-computed examples', () => {
    const bars = [10, 11, 12, 11, 13].map((price, i) => bar(price, i));
    const rsi = C.studies.rsi.calculate(bars, { period: 3, signal: 2 }).rsi;
    assert.deepEqual(rsi.slice(0, 3), [null, null, null]);
    near(rsi[3], 100 * 2 / 3);
    near(rsi[4], 100 * 10 / 12);
    const boll = C.overlayValues('boll', { params: { period: 3, width: 2 } }, bars, E);
    near(boll.lines[0].data[2], 11);
    near(boll.lines[1].data[2], 11 + 2 * Math.sqrt(2 / 3));
    near(boll.lines[2].data[2], 11 - 2 * Math.sqrt(2 / 3));
    const vwap = C.anchoredVwap(bars, [{ endIndex: 2 }, { endIndex: 4 }], 0, 2);
    assert.deepEqual(vwap.lines[0].data, [12, 12]);
    const cloud = C.overlayValues('ichimoku', { params: { fast: 2, base: 3, span: 4, shift: 1 } }, bars, E);
    assert.deepEqual(cloud.band.top, [null, null, null, 11.25, 11.5]);
    assert.deepEqual(cloud.band.bottom, [null, null, null, null, 11]);
});
test('all study series and overlay bands are causal and produce finite values or gaps', () => {
    const bars = Array.from({ length: 160 }, (_, i) => {
        const v = 50 + 4 * Math.sin(i / 5) + i / 20;
        return { ...bar(v, i), high: v + 2, low: v - 2, volume: 100 + i };
    });
    for (const [id, def] of Object.entries(C.studies)) {
        const { params } = C.pane(id);
        const prefix = def.calculate(bars.slice(0, 100), params, E);
        for (const [key, values] of Object.entries(def.calculate(bars, params, E))) {
            assert.equal(values.length, bars.length);
            assert.ok(values.some(Number.isFinite), `${id} / ${key}`);
            assert.ok(values.every(v => v === null || Number.isFinite(v)), `${id} / ${key}`);
            assert.deepEqual(values.slice(0, 100), prefix[key]);
        }
    }
    for (const [id, spec] of Object.entries(C.prefs().overlays)) {
        if (id === 'vwap') continue;
        const prefix = C.overlayValues(id, spec, bars.slice(0, 100), E);
        const all = C.overlayValues(id, spec, bars, E);
        all.lines.forEach((line, i) => {
            assert.ok(line.data.some(Number.isFinite), `${id} / ${line.name}`);
            assert.deepEqual(line.data.slice(0, 100), prefix.lines[i].data);
        });
    }
});
