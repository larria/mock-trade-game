const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../stock-universe.js');
const E = require('../engine.js');
global.window = {}; global.TradingEngine = E; require('../market-chart.js');
const Chart = window.MarketChart;
test('all four complete stock pools have unique exchange identifiers and provenance', () => {
    assert.deepEqual(U.markets.map(m => m.id), ['hs300', 'csi500', 'star', 'chinext']);
    assert.equal(U.pool(['hs300']).length, 300); assert.equal(U.pool(['csi500']).length, 500);
    for (const market of U.markets) {
        const pool = U.pool([market.id]); assert.equal(pool.length, market.count); assert.ok(market.source.startsWith('https://')); assert.match(market.asOf, /^\d{8}$/);
        assert.ok(pool.every(s => /^(sh|sz)\d{6}$/.test(s.fullCode) && s.code === s.fullCode.slice(2) && s.name.length > 0));
        if (market.id === 'star') assert.ok(pool.every(s => /^sh68[89]\d{3}$/.test(s.fullCode)));
        if (market.id === 'chinext') assert.ok(pool.every(s => /^sz30\d{4}$/.test(s.fullCode)));
    }
    assert.ok(U.pool(['star']).length > 500); assert.ok(U.pool(['chinext']).length > 1300);
    assert.equal(U.stocks.length, new Set(U.stocks.map(s => s.fullCode)).size);
});
test('overlapping pools deduplicate stocks and excluded markets do not contribute', () => {
    const union = U.pool(['hs300', 'csi500', 'star', 'chinext']);
    assert.equal(union.length, U.stocks.length);
    const sum = U.markets.reduce((s, m) => s + m.count, 0); assert.ok(union.length < sum);
    assert.ok(U.pool(['star', 'chinext']).every(s => s.markets.includes('star') || s.markets.includes('chinext')));
    assert.equal(U.pool([]).length, 0); assert.deepEqual(U.pool(['hs300', 'hs300']), U.pool(['hs300']));
});
test('settings support 500 days, market selection and detailed readout preferences', () => {
    assert.equal(E.settings({ days: 500 }).days, 500); assert.equal(E.settings({ days: 900 }).days, 500);
    assert.equal(E.settings({ days: 6 }).days, 7);
    assert.deepEqual(E.settings({ markets: ['star', 'bogus', 'star'] }).markets, ['star']);
    assert.deepEqual(E.settings({ markets: [] }).markets, E.DEFAULTS.markets);
    assert.equal(E.settings({ indicatorPrecision: 6 }).indicatorPrecision, 6);
    assert.equal(E.settings({ indicatorPrecision: 10 }).indicatorPrecision, 6);
    assert.equal(E.settings({ macdReadout: false, kdjReadout: false, indicatorDirections: false }).macdReadout, false);
});
test('MACD footer compares raw values, supports precision and direction toggles', () => {
    const m = { macd: { dif: [0.0071, 0.0072], dea: [0.006, 0.006], histogram: [.004, .003], prior: { dif: .007, dea: .005, histogram: .005 } } };
    const values = Chart.indicatorReadout(m, 1, E.settings(), 'macd');
    assert.equal(values[0].formatted, '0.007'); assert.equal(values[0].arrow, '↑'); assert.equal(values[1].arrow, '→'); assert.equal(values[2].arrow, '↓');
    const first = Chart.indicatorReadout(m, 0, E.settings({ indicatorPrecision: 4 }), 'macd'); assert.equal(first[0].formatted, '0.0071'); assert.equal(first[0].arrow, '↑');
    const noArrows = Chart.indicatorReadout(m, 1, E.settings({ indicatorDirections: false }), 'macd'); assert.ok(noArrows.every(v => v.arrow === ''));
});
test('KDJ footer treats insufficient history as unknown rather than zero', () => {
    const m = { kdj: { k: [null, 60], d: [null, 53], j: [null, 74], prior: { k: null, d: null, j: null } } };
    const before = Chart.indicatorReadout(m, 0, E.settings(), 'kdj'); assert.ok(before.every(v => v.formatted === '—' && v.arrow === '' && v.direction === 'unknown'));
    const first = Chart.indicatorReadout(m, 1, E.settings(), 'kdj'); assert.equal(first[0].formatted, '60.000'); assert.ok(first.every(v => v.arrow === ''));
});
