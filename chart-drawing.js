/* Chart annotations use trading-day offsets and unadjusted anchor prices. */
(() => {
'use strict';

const tools = {
    trend: { label: '趋势线', points: 2 },
    horizontal: { label: '水平线', points: 1 },
    vertical: { label: '垂直线', points: 1 },
    rectangle: { label: '矩形区间', points: 2 },
    fib: { label: '斐波那契回撤', points: 2 },
    measure: { label: '量距', points: 2 },
    anchor: { label: 'VWAP 锚点', points: 1 }
};
const storageKey = 'trade_chart_drawings_v1';
const limit = 50;
let saved = {};
try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
} catch {}
let current, tool, first, hover;
const state = id => Object.hasOwn(saved, id) ? saved[id] : { items: [], anchor: null };
const gridFinder = { gridIndex: 0 };
const colorRatios = [0, .236, .382, .5, .618, .786, 1];

function commit(next) {
    const { id, onAnchorChange } = current;
    const previous = state(id);
    const updated = Object.fromEntries([...Object.entries(saved).filter(([key]) => key !== id).slice(-39), [id, next]]);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); }
    catch { status('本地存储不可用，画线仅保留至本次页面关闭'); }
    saved = updated;
    if (previous.anchor !== next.anchor) onAnchorChange();
    else paint();
}
function status(message) {
    const el = current?.dom.parentElement.querySelector('.chart-drawing-status');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
}
function setTool(name) {
    if (!current) return false;
    tool = Object.hasOwn(tools, name) ? name : null;
    first = hover = null;
    syncTool();
    paint();
    return !!tool;
}
function syncTool() {
    const { canvas, dom } = current;
    canvas.classList.toggle('is-drawing', !!tool);
    dom.parentElement.querySelector('[data-action=chart-drawing]')?.setAttribute('aria-pressed', String(!!tool));
    status(tool ? `${tools[tool].label} · ${first ? '点选终点' : tools[tool].points === 2 ? '点选起点' : '点选位置'}` : '');
}
function attach(dom, instance, m, g, color, grid, onAnchorChange) {
    const id = g.id ?? 'demo';
    if (current?.dom !== dom || current.id !== id) {
        detach();
        const canvas = document.createElement('canvas');
        canvas.className = 'chart-drawing-layer';
        canvas.setAttribute('aria-hidden', 'true');
        dom.append(canvas);
        canvas.addEventListener('pointerup', event => {
            if (!tool || event.button !== 0) return;
            const p = fromPointer(event);
            if (!p) return;
            const previous = state(id);
            if (tools[tool].points === 2 && !first) {
                first = p;
                hover = null;
                syncTool();
                paint();
                return;
            }
            const name = tool, points = first ? [first, p] : [p];
            setTool(null);
            if (name === 'anchor') commit({ ...previous, anchor: p.day });
            else if (previous.items.length >= limit) status('已达 50 个绘图，请先删除一项');
            else commit({ ...previous, items: [...previous.items, { name, points }] });
        });
        canvas.addEventListener('pointermove', event => {
            if (!first || event.pointerType !== 'mouse') return;
            hover = fromPointer(event);
            paint();
        });
        canvas.addEventListener('pointerleave', () => { hover = null; paint(); });
        current = { dom, id, canvas };
    }
    Object.assign(current, { instance, m, g, color, grid, onAnchorChange });
    const ratio = window.devicePixelRatio || 1, { canvas } = current;
    const width = Math.round(instance.getWidth() * ratio), height = Math.round(instance.getHeight() * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    current.ratio = ratio;
    canvas.style.height = `${instance.getHeight()}px`;
    syncTool();
    paint();
}
function detach() {
    if (current) {
        tool = first = hover = null;
        syncTool();
        current.canvas.remove();
    }
    current = null;
}
function fromPointer(event) {
    const { instance, m, g, canvas } = current;
    const box = canvas.getBoundingClientRect(), pixel = [event.clientX - box.left, event.clientY - box.top];
    if (!instance.containPixel(gridFinder, pixel)) return null;
    const [x, price] = instance.convertFromPixel(gridFinder, pixel);
    const index = typeof x === 'string' ? m.labels.indexOf(x) : Math.round(x);
    const day = m.bars[index]?.endIndex;
    return Number.isFinite(price) && price > 0 && day !== undefined ? { day: day - g.gameStart, price: price / (m.factors[day - m.from] || 1) } : null;
}
function toPixel(point) {
    const { m, g, instance } = current;
    const day = point.day + g.gameStart;
    const index = m.bars.findIndex(b => b.startIndex <= day && b.endIndex >= day);
    if (index < 0) return null;
    const price = point.price * (m.factors[day - m.from] || 1);
    const [x, y] = instance.convertToPixel(gridFinder, [index, price]);
    return [x, y].every(Number.isFinite) ? { x, y, price } : null;
}
function paint() {
    if (!current) return;
    const { canvas, grid, ratio, color, instance } = current;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, instance.getWidth(), instance.getHeight());
    const { left, top, height } = grid, right = instance.getWidth() - grid.right, bottom = top + height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, height);
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 1.25;
    ctx.font = '11px system-ui, sans-serif';
    const line = (x, y, x2, y2) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); };
    const label = (text, x, y) => ctx.fillText(text, Math.max(left + 3, Math.min(x + 4, right - ctx.measureText(text).width - 3)), Math.max(top + 12, Math.min(y - 4, bottom - 3)));
    function draw({ name, points }) {
        const [a, b] = points.map(toPixel);
        if (!a || (points.length === 2 && !b)) return;
        if (name === 'horizontal') {
            line(left, a.y, right, a.y);
            label(a.price.toFixed(2), right, a.y);
        } else if (name === 'vertical' || name === 'anchor') {
            line(a.x, top, a.x, bottom);
            if (name === 'anchor') label('VWAP', a.x, top + 16);
        } else if (b && name === 'fib') {
            for (const r of colorRatios) {
                const price = b.price + (a.price - b.price) * r;
                const y = instance.convertToPixel({ yAxisIndex: 0 }, price);
                line(Math.min(a.x, b.x), y, Math.max(a.x, b.x), y);
                label(`${+(r * 100).toFixed(1)}% · ${price.toFixed(2)}`, Math.min(a.x, b.x), y);
            }
        } else if (b && (name === 'rectangle' || name === 'measure')) {
            ctx.globalAlpha *= 0.11;
            ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
            ctx.globalAlpha /= 0.11;
            ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
            if (name === 'measure') label(`${(b.price - a.price).toFixed(2)} · ${((b.price / a.price - 1) * 100).toFixed(2)}% · ${Math.abs(points[1].day - points[0].day)} 日`, Math.min(a.x, b.x), Math.min(a.y, b.y));
        } else if (b) line(a.x, a.y, b.x, b.y);
    }
    const { items, anchor } = state(current.id);
    items.forEach(draw);
    if (anchor != null && current.m.prefs.overlays.vwap.enabled) {
        const { m, g } = current, day = g.gameStart + anchor;
        const bar = m.bars.find(b => b.startIndex <= day && b.endIndex >= day);
        if (bar) {
            ctx.setLineDash([4, 3]);
            draw({ name: 'anchor', points: [{ day: anchor, price: bar.close / (m.factors[day - m.from] || 1) }] });
        }
    }
    if (first) {
        ctx.setLineDash([4, 3]);
        if (hover) draw({ name: tool, points: [first, hover] });
        const pos = toPixel(first);
        if (pos) { ctx.beginPath(); ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
}
function remove(index) {
    if (!current) return;
    const previous = state(current.id);
    if (index === 'anchor') commit({ ...previous, anchor: null });
    else commit({ ...previous, items: previous.items.filter((_, i) => i !== index) });
}
window.MarketDrawing = {
    tools, attach, detach, paint, setTool, remove,
    anchor: id => state(id ?? 'demo').anchor,
    list: () => current ? state(current.id).items.map(item => tools[item.name].label) : [],
    undo() { const items = this.list(); if (items.length) remove(items.length - 1); },
    cancel() { if (!tool) return false; setTool(null); return true; }
};
})();
