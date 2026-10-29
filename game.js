/* ============================================================
 * A股简单! — deva 的交易修行场
 * 沪深300成分股盲图 · 逐日推进 · 30个交易日
 * 数据机制移植自 qttest 仓库 (新浪 hisdata_klc2 加密日K)
 * ============================================================ */
(() => {
'use strict';

const HOLD_DAYS = 30;      // 持有期交易日数
const HISTORY_DAYS = 200;  // 揭示的历史日K根数
const GAP_DAYS = 30;       // 距今至少隔过的交易日
const INIT_CASH = 1000000; // 初始资金 100万

const STORE_KEY = 'deva_game_records_v1';
const STORE_KEY_GAME = 'deva_game_current_v1'; // 进行中对局(刷新可恢复)

/* ---------- 市场对 deva 的点评(deva 是本游戏唯一玩家) ---------- */
const DEVA_LINES = {
    start: [
        'deva,上班了。随机一只沪深300,抹掉名字和日期——今天的第一道复盘题。',
        'deva,早盘前的热身:盲图一张,只准看图,不许猜名字。',
        '全职交易大师 deva 的日常:市场出题,你交答卷。',
        'deva,把这题当真实仓位做。模拟盘的态度,就是实盘的下场。',
    ],
    buy: [
        'deva 开仓了。记住此刻的理由,30个交易日后回来对答案。',
        '这仓位配得上"大师"两个字吗?deva,市场记下你这一手了。',
        'deva,进场容易,难的是明天低开3%时你还认不认这个逻辑。',
        '全职选手 deva 的弹药已入场。剩下的交给时间。',
    ],
    sell: [
        'deva 落袋了。会买是徒弟,会卖是师父——这一手,出师了吗?',
        '卖出那一刻,和这只股票的缘分就尽了。deva,别回头。',
        'deva,落袋为安不是认输,是给下一次机会留弹药。',
        '离场也是仓位。deva,空仓是最考验人的持仓。',
    ],
    holdCash: [
        'deva 按住了手。不出手不是怯场,是等赔率。',
        '市场里最难的动作是"什么都不做"——deva 显然懂。',
        '现金在手里,主动权就在手里。deva 继续看。',
    ],
    holdPos: [
        'deva 选择装死。趋势没走坏之前,乱动只会交手续费。',
        '拿住。浮盈浮亏都是纸面的——这是全职选手的定力。',
        'deva,你卖出的那一刻,盈亏才会变成真的。现在,拿住。',
    ],
    dayEnd: [
        'deva,今天收盘了。明天的K线不会考虑你的成本。',
        'K线一根根走出来,deva 的心态也在一根根接受测试。',
        '不管今天涨还是跌,deva,按纪律来。',
    ],
    win: [
        'deva,这局赢麻了。但运气和实力,要很多个30天才能分清。',
        '全职交易大师 deva,今日营业额为正。别飘,市场永远给你下一次犯错的机会。',
        'deva,不错。真正的高手,能把偶然的盈利变成可重复的系统。',
    ],
    lose: [
        'deva,这局亏了。复盘:方向错,仓位错,还是根本没理由?',
        '亏损是学费,deva。交了就学到东西,不然就是白交。',
        'deva,亏不可怕,可怕的是不知道为什么亏。你开仓时的理由,现在还站得住吗?',
    ],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtMoney = (n) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const fmtPct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
const cls = (n) => n > 0 ? 'up' : n < 0 ? 'down' : '';

const ds = (d) => { // Date -> yyyy-mm-dd
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/* ---------- 本地存储 ---------- */
const loadRecords = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
const saveRecords = (r) => localStorage.setItem(STORE_KEY, JSON.stringify(r));

// 序列化当前对局(K线只存游戏用到的部分: 历史200根 + 30根)
const saveGame = (g) => {
    if (!g) { localStorage.removeItem(STORE_KEY_GAME); return; }
    const slim = {
        stock: g.stock,
        histStart: g.histStart, gameStart: g.gameStart, endIdx: g.endIdx,
        day: g.day, cash: g.cash, shares: g.shares, costBasis: g.costBasis,
        initCash: g.initCash, actions: g.actions, revealed: g.revealed, dailyRows: g.dailyRows,
        kSlice: g.kList.slice(g.histStart, g.gameStart + HOLD_DAYS).map(k => ({
            d: k.date.getTime(), o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume, a: k.amount,
        })),
    };
    try { localStorage.setItem(STORE_KEY_GAME, JSON.stringify(slim)); } catch (e) { console.warn('对局存档失败', e); }
};

const loadGame = () => {
    try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY_GAME));
        if (!s || !s.kSlice) return null;
        const kList = s.kSlice.map(k => ({ date: new Date(k.d), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v, amount: k.a }));
        return {
            stock: s.stock, kList,
            histStart: 0, gameStart: HISTORY_DAYS, endIdx: HISTORY_DAYS + HOLD_DAYS - 1,
            day: s.day, cash: s.cash, shares: s.shares, costBasis: s.costBasis,
            initCash: s.initCash, actions: s.actions || [], revealed: s.revealed, dailyRows: s.dailyRows || [],
            resumed: true,
        };
    } catch { return null; }
};

/* ---------- 游戏状态 ---------- */
let G = null;      // 当前对局
let chart = null;  // echarts实例
let view = 'start';

function newGame(kList, stock) {
    // kList: 解码后的完整日K, 收盘时间升序
    const total = kList.length;
    // 游戏区间最后一天(含)至少距今 GAP_DAYS 个交易日
    const maxGameEnd = total - 1 - GAP_DAYS;
    // 游戏第1天的最小索引(前面要留 HISTORY_DAYS 根历史)
    const minGameStart = HISTORY_DAYS;
    if (maxGameEnd - minGameStart + 1 < HOLD_DAYS) throw new Error('数据不足');
    // 随机选游戏起点
    const gameStart = minGameStart + Math.floor(Math.random() * (maxGameEnd - minGameStart + 2 - HOLD_DAYS));
    const histStart = gameStart - HISTORY_DAYS;       // 历史区间200根: [histStart, gameStart)
    const endIdx = gameStart + HOLD_DAYS - 1;         // 游戏最后一天(含)

    return {
        stock,
        kList,
        histStart,
        gameStart,
        endIdx: gameStart + HOLD_DAYS - 1,
        day: 0,               // 已揭示的游戏天数 0..30
        cash: INIT_CASH,
        shares: 0,
        costBasis: 0,         // 持仓成本总额(用于收益率)
        initCash: INIT_CASH,
        actions: [],          // {day, action, size, price}
        revealed: false,
        dailyRows: [],        // 逐日表格
    };
}

// 当日(第 d 天, 1-based)的K线
const dayK = (g, d) => g.kList[g.gameStart + d - 1];

// 总资产
const totalAsset = (g, d) => {
    const k = dayK(g, d);
    return g.cash + g.shares * k.close;
};

/* ---------- 行情图 ---------- */
function renderChart(g) {
    // #app innerHTML 每次重建, 旧实例绑定的DOM已销毁, 必须重新init
    const dom = document.getElementById('chart');
    if (chart) { try { chart.dispose(); } catch {} }
    chart = echarts.init(dom);
    const shown = g.day; // 已揭示的游戏天数
    const cats = [], data = [];
    for (let i = g.histStart; i < g.histStart + HISTORY_DAYS; i++) {
        const k = g.kList[i];
        cats.push(g.revealed ? ds(k.date) : `D${i - g.histStart - HISTORY_DAYS + 1}`);
        data.push([k.open, k.close, k.low, k.high]);
    }
    for (let d = 1; d <= shown; d++) {
        const k = dayK(g, d);
        cats.push(g.revealed ? ds(k.date) : `T+${d}`);
        data.push([k.open, k.close, k.low, k.high]);
    }
    // MA5 / MA20
    const closes = g.kList.slice(g.histStart, g.gameStart + shown).map(k => k.close);
    const ma = (p) => {
        const out = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < p - 1) { out.push('-'); continue; }
            let s = 0; for (let j = i - p + 1; j <= i; j++) s += closes[j];
            out.push(+(s / p).toFixed(2));
        }
        return out;
    };
    chart.setOption({
        animation: false,
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', label: { backgroundColor: '#333' } },
            backgroundColor: '#1d1d20', borderColor: '#2a2a2e',
            textStyle: { color: '#fff', fontSize: 12 },
        },
        grid: [
            { left: '8%', right: '3%', top: '6%', height: '72%' },
            { left: '8%', right: '3%', top: '82%', height: '12%' },
        ],
        xAxis: [
            { type: 'category', data: cats, boundaryGap: true,
              axisLine: { lineStyle: { color: '#2a2a2e' } }, axisLabel: { color: '#61666d', fontSize: 10 } },
            { type: 'category', gridIndex: 1, data: cats, axisLabel: { show: false }, axisTick: { show: false } },
        ],
        yAxis: [
            { scale: true, axisLabel: { color: '#61666d', fontSize: 10 },
              splitLine: { lineStyle: { color: '#1c1c1f' } } },
            { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
        ],
        series: [
            {
                name: '日K', type: 'candlestick', data,
                itemStyle: { color: '#f85a54', color0: '#2ac864', borderColor: '#f85a54', borderColor0: '#2ac864' },
                // 最新揭示的一天: 用背景色带高亮, 不改动蜡烛本身颜色
                markArea: shown > 0 && !g.revealed ? {
                    silent: true,
                    itemStyle: { color: 'rgba(255,176,32,0.18)' },
                    data: [[
                        { xAxis: cats[cats.length - 1], itemStyle: { color: 'rgba(255,176,32,0)' } },
                        { xAxis: cats[cats.length - 1] },
                    ]],
                } : undefined,
                markLine: g.shares > 0 && shown > 0 ? {
                    symbol: 'none', silent: true,
                    lineStyle: { color: '#ffb020', type: 'dashed', width: 1 },
                    label: { show: false },
                    data: [{ yAxis: +(g.costBasis / g.shares).toFixed(2) }],
                } : undefined,
            },
            { name: 'MA5', type: 'line', data: ma(5), showSymbol: false, lineStyle: { color: '#f6c9f6', width: 1 }, },
            { name: 'MA20', type: 'line', data: ma(20), showSymbol: false, lineStyle: { color: '#00aeec', width: 1 }, },
            {
                name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
                data: g.kList.slice(g.histStart, g.gameStart + shown).map(k => k.volume),
                itemStyle: { color: '#4a4a52' },
            },
        ],
    }, true);
}

/* ---------- 渲染 ---------- */
const $app = () => document.getElementById('app');

function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

function devaBar(text) {
    return `<div class="deva-bar">
        <div class="deva-avatar">deva</div>
        <div class="deva-say"><div class="who">deva <span style="color:var(--text3);font-weight:400">· 第${G && G.day > 0 ? G.day : 1}个交易日</span></div><div class="txt">${text}</div></div>
    </div>`;
}

function render() {
    if (view === 'start') return renderStart();
    if (view === 'records') return renderRecords();
    if (view === 'game') return renderGame();
}

function renderStart() {
    $app().innerHTML = `
    <div class="topbar">
        <div class="brand"><h1>A股<span class="accent">简单</span>!</h1><span class="sub">deva 的交易修行场</span></div>
        <div class="nav-btns">
            <button class="nav-btn active" onclick="Game.go('start')">开局</button>
            <button class="nav-btn" onclick="Game.go('records')">战绩 ${loadRecords().length}</button>
        </div>
    </div>
    <div class="start-hero">
        <h2><span class="accent">deva</span>,今天还交易吗?</h2>
        <p>全职交易大师的每日一练 · 随机一只沪深300成分股 · 抹去代码与日期</p>
        <p>200根K线盲图 · 逐日决策 · 30个交易日 · 揭晓真相</p>
        <div class="rules-list">
            <b>给 deva 的游戏规则</b><br>
            ① 从沪深300成分股中随机抽取一只,隐藏名称与日期<br>
            ② 展示其任意时段(距今30个交易日前)的200根日K<br>
            ③ 每个交易日开盘前,你来决定:<b>买入 / 持仓 / 卖出</b><br>
            ④ 买入、卖出可选 <b>全仓 / 1/3仓 / 1/4仓 / 自定义</b> 比例<br>
            ⑤ 30个交易日后揭晓股票与日期,统计收益,记入本地战绩<br>
            <b>初始资金:100万 · 按当日收盘价成交 · 免手续费</b>
        </div>
        <button class="start-btn" onclick="Game.start()">deva 开 局</button>
    </div>`;
}

function renderGame() {
    const g = G;
    if (g.day === 0) {
        // 第0天: 展示盲图, 等待第一笔操作
        $app().innerHTML = `
        <div class="topbar">
            <div class="brand"><h1>A股<span class="accent">简单</span>!</h1><span class="sub">deva 的交易修行场</span></div>
            <div class="nav-btns">
                ${g.actions.length === 0 ? '<button class="nav-btn" onclick="Game.abandon()">放弃本局</button>' : ''}
                <button class="nav-btn" onclick="Game.go('records')">战绩 ${loadRecords().length}</button>
            </div>
        </div>
        ${devaBar(pick(DEVA_LINES.start))}
        <div class="panel">
            <div class="panel-title">神秘标的 · 200日K线<span class="hidden-tag">🔒 已隐藏股票与日期</span></div>
            <div id="chart"></div>
            <div class="chart-mask-note">MA5 / MA20 已叠加 · 后续30个交易日由你逐步揭开</div>
        </div>
        <div class="stat-row">
            <div class="stat"><div class="k">总资产</div><div class="v gold">${fmtMoney(g.cash)}</div></div>
            <div class="stat"><div class="k">持仓</div><div class="v">空仓</div></div>
            <div class="stat"><div class="k">累计收益</div><div class="v">0.00%</div></div>
        </div>
        <div class="dock-space"></div>
        <div class="dock">
            <div class="decide-q">行情即将推进到 <span class="day-no">第 1 / ${HOLD_DAYS}</span> 个交易日,deva,你的操作是?</div>
            <div class="decide-btns">
                <button class="big-btn buy" onclick="Game.decide('buy')">买 入</button>
                <button class="big-btn hold" onclick="Game.decide('hold')">持仓观望</button>
            </div>
            <div class="hint">当前空仓 · "持仓观望" = 继续空仓看盘</div>
        </div>`;
        renderChart(g);
        return;
    }

    const d = g.day;
    const k = dayK(g, d);
    const prev = dayK(g, d - 1);
    const chg = (k.close - prev.close) / prev.close;
    const asset = totalAsset(g, d);
    const ret = (asset - g.initCash) / g.initCash;
    const posValue = g.shares * k.close;
    const lastAct = g.actions[g.actions.length - 1];
    const actTxt = {
        buy: `买入 ${lastAct ? fmtPct(lastAct.size) : ''}`,
        sell: `卖出 ${lastAct ? fmtPct(lastAct.size) : ''}`,
        holdCash: '空仓观望', holdPos: '持仓装死',
    }[g.actions.find(a => a.day === d)?.action || ''] || '持仓装死';

    const done = d >= HOLD_DAYS;

    $app().innerHTML = `
    <div class="topbar">
        <div class="brand"><h1>A股<span class="accent">简单</span>!</h1><span class="sub">deva 的交易修行场</span></div>
        <div class="nav-btns">
            ${done || g.actions.length > 0 ? '<span class="nav-btn" style="cursor:default;color:var(--text3)">对局进行中</span>' : '<button class="nav-btn" onclick="Game.abandon()">放弃本局</button>'}
            <button class="nav-btn" onclick="Game.go('records')">战绩 ${loadRecords().length}</button>
        </div>
    </div>
    ${devaBar(done ? (ret >= 0 ? pick(DEVA_LINES.win) : pick(DEVA_LINES.lose)) : pick(DEVA_LINES.dayEnd))}
    ${done ? renderReveal(g, ret) : ''}
    ${renderDailyTable(g, d)}
    <div class="panel">
        <div class="panel-title">
            ${g.revealed
                ? `${g.stock.name} (${g.stock.fullCode.toUpperCase()}) · ${ds(dayK(g, 1).date)} ~ ${ds(dayK(g, HOLD_DAYS).date)}`
                : `神秘标的 · 日K线<span class="hidden-tag">🔒 第 ${d} / ${HOLD_DAYS} 天</span>`}
        </div>
        <div id="chart"></div>
        <div class="chart-mask-note">${g.revealed
            ? '真相已揭晓 · 完整区间'
            : `今天收盘 ${k.close.toFixed(2)} · ${fmtPct(chg)}${g.shares > 0 ? ' · 黄虚线=deva的成本' : ''}`}</div>
    </div>
    <div class="stat-row">
        <div class="stat"><div class="k">总资产</div><div class="v gold">${fmtMoney(asset)}</div></div>
        <div class="stat"><div class="k">今日涨跌</div><div class="v ${cls(chg)}">${fmtPct(chg)}</div></div>
        <div class="stat"><div class="k">累计收益</div><div class="v ${cls(ret)}">${fmtPct(ret)}</div></div>
        <div class="stat"><div class="k">持仓市值</div><div class="v">${posValue > 0 ? fmtMoney(posValue) : '空仓'}</div></div>
        <div class="stat"><div class="k">现金</div><div class="v">${fmtMoney(g.cash)}</div></div>
    </div>
    ${done ? '' : `
    <div class="dock-space"></div>
    <div class="dock">
        <div class="decide-q"><span class="day-no">第 ${d + 1} / ${HOLD_DAYS}</span> 个交易日,deva,你打算?</div>
        <div class="decide-btns">
            ${g.cash >= dayK(g, d).close * 100 ? '<button class="big-btn buy" onclick="Game.decide(\'buy\')">买 入</button>' : ''}
            ${g.shares > 0 ? '<button class="big-btn sell" onclick="Game.decide(\'sell\')">卖 出</button>' : ''}
            <button class="big-btn hold" onclick="Game.decide('hold')">${g.shares > 0 ? '持仓装死' : '空仓观望'}</button>
        </div>
        <div class="hint">当前${g.shares > 0 ? '持仓 ' + (posValue / asset * 100).toFixed(0) + '%' : '空仓'}${g.shares > 0 && g.cash >= dayK(g, d).close * 100 ? ' + 现金 ' + fmtMoney(g.cash) : ''} · 卖出按比例减仓</div>
    </div>`}`;
    renderChart(g);
}

// 逐日行情表
function renderDailyTable(g, d) {
    return `
    <div class="panel">
        <div class="panel-title">逐日行情</div>
        <div class="table-scroll"><table class="day-table">
            <thead><tr><th>交易日</th><th>收盘</th><th>涨跌幅</th><th>操作</th><th>总资产</th></tr></thead>
            <tbody>${g.dailyRows.map(r => `
                <tr class="${r.day === d && !g.revealed ? 'today-row' : ''}">
                <td>${g.revealed ? ds(r.date) : '第' + r.day + '天'}</td>
                <td class="${cls(r.chg)}">${r.close.toFixed(2)}</td>
                <td class="${cls(r.chg)}">${fmtPct(r.chg)}</td>
                <td>${r.act}</td>
                <td>${fmtMoney(r.asset)}</td></tr>`).join('')}
            </tbody>
        </table></div>
    </div>`;
}

function renderReveal(g, ret) {
    const benchmark = (dayK(g, HOLD_DAYS).close - dayK(g, 0).close) / dayK(g, 0).close;
    const beat = ret >= benchmark;
    return `
    <div class="panel" style="border-color:#5c3646">
        <div class="panel-title">🔒 解密时刻</div>
        <div class="reveal-name">${g.stock.name} <span class="code">${g.stock.fullCode.toUpperCase()}</span></div>
        <div class="reveal-range">游戏区间: ${ds(dayK(g, 1).date)} ~ ${ds(dayK(g, HOLD_DAYS).date)} · 区间涨跌 ${fmtPct(benchmark)}</div>
        <div class="verdict" style="color:${ret >= 0 ? 'var(--up)' : 'var(--down)'}">
            deva 的最终收益:${fmtPct(ret)} ${beat ? ' · 跑赢了持有不动!' : ' · 没跑赢持有不动,还不如装死'}
        </div>
        <button class="next-day-btn" onclick="Game.start()">再来一局</button>
        <button class="next-day-btn" style="background:var(--card2);box-shadow:none;border:1px solid var(--line)" onclick="Game.go('records')">查看战绩</button>
    </div>`;
}

function renderRecords() {
    const recs = loadRecords();
    const n = recs.length;
    const avg = n ? recs.reduce((s, r) => s + r.return, 0) / n : 0;
    const winN = recs.filter(r => r.return > 0).length;
    const best = n ? Math.max(...recs.map(r => r.return)) : 0;
    const worst = n ? Math.min(...recs.map(r => r.return)) : 0;
    const avgBeat = n ? recs.filter(r => r.beatBenchmark).length / n : 0;

    $app().innerHTML = `
    <div class="topbar">
        <div class="brand"><h1>A股<span class="accent">简单</span>!</h1><span class="sub">deva 的交易修行场</span></div>
        <div class="nav-btns">
            ${(() => {
                const saved = G && !G.revealed ? G : loadGame();
                return (saved && !saved.revealed)
                    ? `<button class="nav-btn back-game-btn" onclick="Game.go('game')">↩ 回到对局 · 第${Math.max(saved.day, 1)}天</button>`
                    : '<button class="nav-btn" onclick="Game.go(\'start\')">开局</button>';
            })()}
            <button class="nav-btn active" onclick="Game.go('records')">战绩 ${n}</button>
        </div>
    </div>
    ${devaBar(n === 0
        ? 'deva,战绩一片空白。空白的账户比亏损的账户干净,但也说明你还什么都没证明。去开一局。'
        : `deva 的平均收益 ${fmtPct(avg)}。${avg > 0 ? '样本还小,别急着自信;但至少目前为止,市场认你这一套。' : '负收益。模拟盘都跑不赢,凭什么觉得实盘能赢?回去复盘。'}`)}
    <div class="rec-summary">
        <div class="stat"><div class="k">deva 总局数</div><div class="v">${n}</div></div>
        <div class="stat"><div class="k">全局平均收益</div><div class="v ${cls(avg)}">${fmtPct(avg)}</div></div>
        <div class="stat"><div class="k">胜率</div><div class="v">${n ? (winN / n * 100).toFixed(0) + '%' : '—'}</div></div>
        <div class="stat"><div class="k">最佳战绩</div><div class="v ${cls(best)}">${n ? fmtPct(best) : '—'}</div></div>
        <div class="stat"><div class="k">最差战绩</div><div class="v ${cls(worst)}">${n ? fmtPct(worst) : '—'}</div></div>
        <div class="stat"><div class="k">跑赢装死比例</div><div class="v gold">${n ? (avgBeat * 100).toFixed(0) + '%' : '—'}</div></div>
    </div>
    <div class="panel">
        <div class="panel-title">对局明细</div>
        ${n === 0 ? '<div class="empty-tip">还没有对局记录 · 去开一局吧</div>' : `
        <div class="table-scroll"><table class="rec-table">
            <thead><tr><th>时间</th><th>股票</th><th>区间</th><th>期末资产</th><th>收益</th><th>操作数</th><th>vs装死</th></tr></thead>
            <tbody>${recs.map(r => `
                <tr>
                <td>${r.time}</td>
                <td style="text-align:left">${r.name} <span style="color:var(--text3)">${r.code.toUpperCase()}</span></td>
                <td>${r.range}</td>
                <td>${fmtMoney(r.asset)}</td>
                <td class="${cls(r.return)}">${fmtPct(r.return)}</td>
                <td>${r.trades}</td>
                <td style="color:${r.beatBenchmark ? 'var(--gold)' : 'var(--text3)'}">${r.beatBenchmark ? '赢' : '输'} ${fmtPct(r.benchmark)}</td>
                </tr>`).join('')}
            </tbody>
        </table></div>
        <button class="danger-btn" onclick="Game.clearRecords()">清空全部战绩</button>`}
    </div>`;
}

/* ---------- 交互 ---------- */
window.Game = {
    go(v) {
        const active = (G && !G.revealed && G.actions.length > 0) || (!G && loadGame() && !loadGame().revealed);
        if (v === 'start' && active) {
            toast('对局进行中,必须完成本局才能开新局');
            return;
        }
        if (v === 'game') {
            // 回到对局: 优先内存G, 否则从存档恢复
            if (!G || G.revealed) {
                const saved = loadGame();
                if (!saved || saved.revealed) { toast('没有进行中的对局'); return; }
                G = saved;
            }
        }
        view = v; render();
    },

    async start() {
        // 有进行中的对局必须继续, 不允许开新局
        const saved = loadGame();
        if (saved && !saved.revealed) {
            G = saved;
            view = 'game';
            render();
            toast('检测到进行中的对局, 已恢复');
            return;
        }
        if (saved && saved.revealed) saveGame(null);
        $app().innerHTML = `<div class="loading-tip"><div class="spin"></div><br>deva,正在从沪深300中抽取今日考题…</div>`;
        // 随机选股, 逐个尝试直到成功取到足量数据
        const pool = [...HS300_LIST];
        while (pool.length) {
            const i = Math.floor(Math.random() * pool.length);
            const stock = pool.splice(i, 1)[0];
            try {
                const raw = await Util.loadDayKList(stock.fullCode);
                const kList = raw.map(k => ({ date: new Date(k.date), open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume, amount: k.amount }))
                    .sort((a, b) => a.date - b.date);
                if (kList.length < HISTORY_DAYS + GAP_DAYS + HOLD_DAYS + 10) continue; // 数据不足换下一只
                G = newGame(kList, stock);
                view = 'game';
                render();
                return;
            } catch (e) { /* 下一只 */ }
        }
        toast('成分股数据全部加载失败,请检查网络');
        view = 'start'; render();
    },

    decide(action) {
        const g = G;
        if (!g) return;
        if (action === 'buy' || action === 'sell') return showSizePicker(action);
        this.confirmAction(action, 0);
    },

    confirmAction(action, size) {
        const g = G;
        const d = g.day + 1; // 明天(即将揭示的日子)
        const k = dayK(g, d); // 按当日收盘价成交
        let actName;

        if (action === 'buy') {
            const useCash = g.cash * size;
            const shares = Math.floor(useCash / k.close);
            if (shares <= 0) { toast('资金不足,买不起一手'); return; }
            g.costBasis += shares * k.close;
            g.shares += shares;
            g.cash -= shares * k.close;
            actName = `买入${fmtPct(size)} ${(shares / 100).toFixed(0)}手`;
        } else if (action === 'sell') {
            const sellShares = Math.floor(g.shares * size);
            if (sellShares <= 0) { toast('持仓不足,卖不出一手'); return; }
            const avgCost = g.costBasis / g.shares;
            g.costBasis -= avgCost * sellShares;
            g.shares -= sellShares;
            g.cash += sellShares * k.close;
            actName = `卖出${fmtPct(size)} ${(sellShares / 100).toFixed(0)}手`;
        } else {
            actName = g.shares > 0 ? '持仓装死' : '空仓观望';
        }

        g.actions.push({ day: d, action, size });
        g.day = d;
        // 揭示当日
        const prev = dayK(g, d - 1);
        g.dailyRows.push({
            day: d, date: k.date, close: k.close,
            chg: (k.close - prev.close) / prev.close,
            act: actName, asset: totalAsset(g, d),
        });

        // 结束?
        if (d >= HOLD_DAYS) {
            g.revealed = true;
            const ret = (totalAsset(g, d) - g.initCash) / g.initCash;
            const benchmark = (dayK(g, HOLD_DAYS).close - dayK(g, 0).close) / dayK(g, 0).close;
            const recs = loadRecords();
            recs.push({
                time: new Date().toLocaleString('zh-CN'),
                name: g.stock.name, code: g.stock.fullCode,
                range: `${ds(dayK(g, 1).date)}~${ds(dayK(g, HOLD_DAYS).date)}`,
                asset: totalAsset(g, d), return: ret,
                benchmark, beatBenchmark: ret >= benchmark,
                trades: g.actions.filter(a => a.action === 'buy' || a.action === 'sell').length,
            });
            saveRecords(recs);
            saveGame(null); // 已完局, 清除进行中存档
        } else {
            saveGame(g); // 存档: 刷新可恢复
        }
        render();
    },

    abandon() {
        if (G && G.actions.length > 0) { toast('已操作过,本局必须走完'); return; }
        if (!confirm('放弃本局?不会计入战绩。')) return;
        saveGame(null);
        G = null; view = 'start'; render();
    },

    clearRecords() {
        if (!confirm('清空全部战绩?不可恢复。')) return;
        saveRecords([]); render();
    },
};

/* ---------- 仓位选择弹层 ---------- */
function showSizePicker(action) {
    const g = G;
    const isBuy = action === 'buy';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000a;z-index:50;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
    <div class="panel" style="width:min(480px,92vw);margin:0;text-align:center">
        <div class="decide-q">${isBuy ? '买入' : '卖出'}多少仓位?</div>
        <div class="size-btns">
            <button class="size-btn" data-s="1">${isBuy ? '全仓梭哈' : '清仓走人'}</button>
            <button class="size-btn" data-s="0.5">半仓 1/2</button>
            <button class="size-btn" data-s="${1 / 3}">1/3 仓</button>
            <button class="size-btn" data-s="${1 / 4}">1/4 仓</button>
        </div>
        <div class="size-btns" style="margin-top:12px">
            <span class="custom-input">
                <input id="cust-pct" type="number" min="1" max="100" placeholder="1-100"> <span class="pct">%</span>
                <button id="cust-ok">自定义</button>
            </span>
        </div>
        <div class="hint">${isBuy ? '按明日收盘价成交 · 免手续费' : '按持仓股数比例卖出'}</div>
        <div class="hint"><a href="javascript:;" onclick="this.closest('[data-ov]').remove()" style="color:var(--text3)">取消</a></div>
    </div>`;
    overlay.setAttribute('data-ov', '1');
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelectorAll('.size-btn').forEach(b => {
        b.onclick = () => {
            const s = parseFloat(b.dataset.s);
            overlay.remove();
            Game.confirmAction(action, s);
        };
    });
    overlay.querySelector('#cust-ok').onclick = () => {
        const v = parseFloat(overlay.querySelector('#cust-pct').value);
        if (!(v > 0 && v <= 100)) { toast('请输入 1-100 的百分比'); return; }
        overlay.remove();
        Game.confirmAction(action, v / 100);
    };
    document.body.appendChild(overlay);
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });

render();
})();
