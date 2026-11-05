const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const bar = (date, open, close, high = Math.max(open, close), low = Math.min(open, close), volume = 100) => ({ date: new Date(date + 'T12:00:00'), open, close, high, low, volume, amount: volume * close });
function data(n = 2600) {
    const d = new Date(2006, 0, 2), list = [];
    while (list.length < n) { if (![0, 6].includes(d.getDay())) { const price = 10 + list.length * .01; list.push({ date: new Date(d), open: price, close: price, high: price + 1, low: price - 1, volume: 100, amount: 100 * price }); } d.setDate(d.getDate() + 1); }
    return list;
}
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('7, 30 and 200-day games finish exactly once at their configured end', () => {
    for (const days of [7, 30, 200]) {
        const g = E.createGame(data(), { name: 'Test', fullCode: 'sh000001' }, { days }, () => .5);
        assert.equal(g.endIdx - g.gameStart + 1, days);
        for (let i = 0; i < days; i++) { assert.equal(g.revealed, false); E.advance(g, 'hold'); }
        assert.equal(g.day, days); assert.equal(g.revealed, true); assert.equal(g.dailyRows.length, days);
        assert.throws(() => E.advance(g, 'hold'), /已结束/);
        assert.equal(E.record(g).days, days);
    }
});
test('commission is charged on both trades and included in cash, cost basis and returns', () => {
    const g = E.createGame(data(), { name: 'Test', fullCode: 'sh000001' }, { days: 7, initialCash: 10000, commission: .03 }, () => 0);
    g.kList[g.gameStart].close = 10; g.kList[g.gameStart + 1].close = 10;
    const buy = E.advance(g, 'buy', 1);
    assert.equal(buy.quantity, 999); near(buy.fee, 2.997); near(g.cash, 7.003); near(g.costBasis, 9992.997);
    const sell = E.advance(g, 'sell', 1);
    assert.equal(sell.quantity, 999); near(g.cash, 9994.006); assert.equal(g.shares, 0); assert.equal(g.costBasis, 0);
    near(g.totalFees, 5.994); near(E.asset(g) / g.initCash - 1, -5.994 / 10000);
});
test('slippage raises buy price and lowers sale price, rounding to configured lots', () => {
    const g = E.createGame(data(), { name: 'Test', fullCode: 'sh000001' }, { initialCash: 10000, slippage: 1, commission: .1, lotSize: 100 }, () => 0);
    g.kList[g.gameStart].close = 10; g.kList[g.gameStart + 1].close = 10;
    const buy = E.advance(g, 'buy', 1); near(buy.price, 10.1); assert.equal(buy.quantity, 900);
    const sell = E.advance(g, 'sell', 1); near(sell.price, 9.9); assert.equal(g.shares, 0); near(g.cash, 9802);
});
test('invalid orders do not consume a day or change account state', () => {
    const g = E.createGame(data(), {}, { lotSize: 100 }, () => 0), before = JSON.stringify(g);
    for (const [action, size] of [['sell', 1], ['buy', 0], ['buy', 2], ['buy', NaN], ['other', 1]]) assert.throws(() => E.advance(g, action, size));
    assert.equal(JSON.stringify(g), before);
});
test('weekly aggregation follows calendar weeks across a year boundary', () => {
    const input = [bar('2020-12-31', 10, 11, 12, 9, 100), bar('2021-01-01', 11, 12, 13, 10, 200), bar('2021-01-04', 12, 9, 14, 8, 300)];
    const result = E.aggregate(input, 'week');
    assert.equal(result.length, 2); assert.equal(result[0].open, 10); assert.equal(result[0].close, 12);
    assert.equal(result[0].high, 13); assert.equal(result[0].low, 9); assert.equal(result[0].volume, 300); assert.equal(result[0].count, 2);
    assert.equal(result[1].open, 12);
});
test('monthly aggregation handles holiday gaps, does not invent calendar days', () => {
    const result = E.aggregate([bar('2024-01-30', 10, 12), bar('2024-01-31', 12, 13), bar('2024-02-08', 13, 14), bar('2024-02-19', 14, 12)], 'month');
    assert.equal(result.length, 2); assert.equal(result[0].close, 13); assert.equal(result[1].count, 2); assert.equal(result[1].open, 13); assert.equal(result[1].close, 12);
});
test('SMA, EMA, MACD and KDJ produce standard values without future samples', () => {
    assert.deepEqual(E.sma([1, 2, 3, 4], 3), [null, null, 2, 3]);
    assert.deepEqual(E.ema([1, 2, 3], 3), [1, 1.5, 2.25]);
    const values = [1, 3, 2, 5, 4, 8, 6, 9];
    const full = E.macd(values, 2, 3, 2), prefix = E.macd(values.slice(0, 5), 2, 3, 2);
    for (const key of ['dif', 'dea', 'histogram']) assert.deepEqual(full[key].slice(0, 5), prefix[key]);
    for (let i = 0; i < values.length; i++) near(full.histogram[i], 2 * (full.dif[i] - full.dea[i]));
    const k = E.kdj(Array.from({ length: 20 }, () => bar('2024-01-02', 5, 5, 5, 5)), 9, 3, 3);
    assert.equal(k.k[7], null); assert.equal(k.k[8], 50); assert.equal(k.d[19], 50); assert.equal(k.j[19], 50);
});
test('chart model ignores future values in day, week and month modes', () => {
    global.window = {}; global.TradingEngine = E; require('../market-chart.js');
    const g = E.createGame(data(), {}, { history: 500, days: 200 }, () => .6);
    E.advance(g, 'hold');
    for (const period of ['day', 'week', 'month']) {
        const s = E.settings({ period, kdj: true }), original = window.MarketChart.model(g, s);
        const poisoned = { ...g, kList: g.kList.map((b, i) => i >= g.gameStart + g.day ? { ...b, close: 999999, high: 999999, volume: 999999999 } : b) };
        assert.deepEqual(window.MarketChart.model(poisoned, s), original);
        assert.ok(original.bars.every(b => b.endIndex < g.gameStart + g.day));
        assert.ok(original.labels.every(label => !/\d{4}-\d{2}/.test(label)));
    }
});
test('200-day game save restores dates, progress and frozen fee settings', () => {
    const g = E.createGame(data(), { name: 'Test', fullCode: 'sh000001' }, { days: 200, history: 500, commission: .03 }, () => .7);
    E.advance(g, 'buy', .5, '突破后试仓');
    const restored = E.hydrate(JSON.parse(JSON.stringify(E.serialize(g))));
    assert.equal(restored.config.days, 200); assert.equal(restored.config.commission, .03);
    near(E.asset(restored), E.asset(g)); assert.equal(restored.day, 1); assert.equal(restored.actions[0].note, '突破后试仓');
    assert.equal(E.dateString(restored.kList[restored.gameStart].date), E.dateString(g.kList[g.gameStart].date));
    for (let i = 1; i < 200; i++) E.advance(restored, 'hold');
    assert.equal(restored.revealed, true); assert.equal(E.record(restored).days, 200);
});
test('legacy 30-day save migrates without losing shares or progress', () => {
    const bars = data(230), legacy = { stock: { name: 'Test', fullCode: 'sh000001' }, histStart: 400, gameStart: 600, endIdx: 629, day: 5, cash: 500000, shares: 10000, costBasis: 500000, initCash: 1000000, actions: [], dailyRows: [], revealed: false, kSlice: bars.map(k => ({ d: k.date.getTime(), o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume, a: k.amount })) };
    const g = E.migrate(legacy); assert.equal(g.config.days, 30); assert.equal(g.gameStart, 200); assert.equal(g.endIdx, 229); assert.equal(g.day, 5); assert.equal(g.shares, 10000);
});
test('drawdown compares account assets to their running peak', () => {
    near(E.drawdown({ initCash: 100, dailyRows: [{ asset: 120 }, { asset: 90 }, { asset: 110 }, { asset: 80 }] }), 1 / 3);
});
