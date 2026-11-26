/* Settings scoped to the live chart, including full-screen mode. */
(() => {
'use strict';
const C = ChartStudies;
const checked = value => value ? 'checked' : '';
const options = (items, value) => items.map(([key, label]) => `<option value="${key}"${String(key) === String(value) ? ' selected' : ''}>${label}</option>`).join('');
const select = (name, label, items, value) => `<label class="setting-field"><span class="setting-label">${label}</span><select name="${name}">${options(items, value)}</select></label>`;
const check = (name, label, value) => `<label class="chart-check"><input type="checkbox" name="${name}" ${checked(value)}> ${label}</label>`;
const numberField = ({ key, label, min, max, step }, value) => `<label class="setting-field"><span class="setting-label">${label}</span><input type="number" name="${key}" required min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

function dialog(title, body, submit, icon, trigger) {
    const card = document.getElementById('chart-card');
    if (!card || document.querySelector('dialog[open]')) return;
    const el = document.createElement('dialog');
    el.className = 'chart-dialog';
    el.setAttribute('aria-labelledby', 'chart-dialog-title');
    el.innerHTML = `<form><header class="dialog-header"><h2 id="chart-dialog-title">${title}</h2><button type="button" class="icon-btn" data-chart-close aria-label="关闭">${icon('close')}</button></header><div class="chart-dialog-body">${body}</div>${submit ? '<footer class="chart-dialog-footer"><button type="button" class="btn" data-chart-close>取消</button><button type="submit" class="btn primary">应用</button></footer>' : ''}</form>`;
    const form = el.querySelector('form');
    el.querySelectorAll('[data-chart-close]').forEach(button => button.onclick = () => el.close());
    el.addEventListener('close', () => {
        el.remove();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    }, { once: true });
    el.addEventListener('click', event => {
        if (event.target !== el) return;
        const r = el.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) el.close();
    });
    form.addEventListener('invalid', event => {
        const details = event.target.closest('details');
        if (details) details.open = true;
    }, true);
    form.onsubmit = event => {
        event.preventDefault();
        if (submit && submit(form.elements) !== false) el.close();
    };
    card.append(el);
    el.showModal();
    return el;
}

function open(action, trigger, context) {
    const { settings, update, icon, g } = context, chart = C.prefs(settings);
    if (action === 'chart-panes') {
        const body = `<p class="chart-dialog-note">已添加 ${chart.panes.length} / ${C.maxPanes}。参数、读数与信号可在各副图内设置。</p><div class="chart-picker">${Object.entries(C.studies).map(([id, def]) => {
            const added = chart.panes.some(pane => pane.id === id);
            return `<button class="btn" type="button" data-study="${id}" ${added || chart.panes.length >= C.maxPanes ? 'disabled' : ''}><b>${def.name}</b><span>${def.label}</span>${added ? '<small>已添加</small>' : ''}</button>`;
        }).join('')}</div>`;
        const el = dialog('添加副图', body, null, icon, trigger);
        el?.querySelectorAll('[data-study]').forEach(button => button.onclick = () => {
            chart.panes.push(C.pane(button.dataset.study));
            el.close();
            update(chart);
        });
    } else if (action === 'pane-settings') {
        const index = chart.panes.findIndex(pane => pane.id === trigger.dataset.pane);
        if (index < 0) return;
        const spec = chart.panes[index], def = C.studies[spec.id];
        const body = `<p class="chart-dialog-note">${def.label}</p>
            <div class="settings-grid">${def.fields.map(f => numberField(f, spec.params[f.key])).join('')}</div>
            ${select('height', '副图高度', [['compact', '紧凑'], ['normal', '标准'], ['large', '加高']], spec.height)}
            ${check('readout', '显示数值', spec.readout)}
            ${check('cross', '标记金叉与死叉', spec.cross)}
            ${select('pair', '交叉比较', def.pairs.map((pair, i) => [i, pair[2]]), spec.pair)}
            <div class="chart-pane-actions">
                <button type="button" class="btn" data-move="-1" ${index === 0 ? 'disabled' : ''}>上移</button>
                <button type="button" class="btn" data-move="1" ${index === chart.panes.length - 1 ? 'disabled' : ''}>下移</button>
                <button type="button" class="btn danger" data-remove-pane>移除副图</button>
            </div>`;
        const el = dialog(`${def.name} 设置`, body, fields => {
            const params = Object.fromEntries(def.fields.map(f => [f.key, fields[f.key].valueAsNumber]));
            if (spec.id === 'volume' && params.slow === 1) return invalid(fields.slow, '周期请输入 0 或 2–250');
            if ('slow' in params && params.slow > 0 && params.fast >= params.slow) return invalid(fields.fast, '快线周期必须小于慢线周期');
            if ('lower' in params && params.lower >= params.upper) return invalid(fields.lower, '下阈值必须小于上阈值');
            chart.panes[index] = C.pane(spec.id, { params, height: fields.height.value, readout: fields.readout.checked, cross: fields.cross.checked, pair: fields.pair.value });
            update(chart);
        }, icon, trigger);
        el?.querySelectorAll('[data-move]').forEach(button => button.onclick = () => {
            const target = index + Number(button.dataset.move);
            [chart.panes[index], chart.panes[target]] = [chart.panes[target], chart.panes[index]];
            el.close();
            update(chart, spec.id);
        });
        el?.querySelector('[data-remove-pane]').addEventListener('click', () => {
            chart.panes.splice(index, 1);
            el.close();
            update(chart, 'add');
        });
    } else if (action === 'chart-adjustment') {
        const available = C.hasRawPrices(g);
        const body = `<p class="chart-dialog-note">${available ? '复权以已揭示行情计算，交易和结算沿用对局的原定执行口径。' : '当前数据仅有已准备好的价格，真实新对局可切换三种口径。'}</p>
            <div class="chart-picker">${Object.entries(C.adjustments).map(([key, label]) => `<button type="button" class="btn" data-adjustment="${key}" ${!available && key !== 'forward' ? 'disabled' : ''} aria-pressed="${key === (available ? chart.adjustment : 'forward')}">${label}</button>`).join('')}</div>`;
        const el = dialog('价格复权', body, null, icon, trigger);
        el?.querySelectorAll('[data-adjustment]').forEach(button => button.onclick = () => {
            el.close();
            chart.adjustment = button.dataset.adjustment;
            update(chart);
        });
    } else if (action === 'chart-display') {
        const body = `<div class="settings-grid">
            ${select('type', '主图样式', Object.entries(C.chartTypes), chart.type)}
            ${select('scale', '价格轴', [['value', '线性'], ['log', '对数']], chart.scale)}
            </div><div class="chart-range" aria-label="回看区间">${[[30, '30 根'], [90, '90 根'], [180, '180 根'], [100000, '全部'], [0, '重置']].map(([count, label]) => `<button type="button" class="btn" data-chart-range="${count}">${label}</button>`).join('')}</div>
            ${Object.entries(C.overlays).map(([id, def]) => {
                const p = chart.overlays[id];
                return `<details class="chart-overlay"><summary><b>${def.name}</b> · ${def.label}${p.enabled ? ' · 已开启' : ''}</summary>
                    ${check(id + '-enabled', '显示此叠加', p.enabled)}
                    ${check(id + '-cross', def.crossLabel || (id === 'ma' || id === 'ema' ? '标记前两条均线交叉' : id === 'vwap' ? '标记收盘价穿越 VWAP' : '标记收盘价穿越中轨'), p.cross)}
                    ${p.periods ? `<label class="setting-field"><span class="setting-label">周期，最多 6 个</span><input name="${id}-periods" inputmode="text" value="${p.periods.join(', ')}"></label>` : ''}
                    ${def.fields ? `<div class="settings-grid">${def.fields.map(f => numberField({ ...f, key: id + '-' + f.key }, p.params[f.key])).join('')}</div>` : ''}
                    ${id === 'vwap' ? '<p class="chart-dialog-note">默认从回看窗口起点累计，可用绘图菜单指定锚点。</p>' : ''}
                    ${id === 'ichimoku' ? '<p class="chart-dialog-note">云层只展示到已揭示的最后一根 K 线。</p>' : ''}
                    </details>`;
            }).join('')}`;
        const el = dialog('主图与区间', body, fields => {
            chart.type = fields.type.value;
            chart.scale = fields.scale.value;
            for (const [id, def] of Object.entries(C.overlays)) {
                const spec = chart.overlays[id];
                spec.enabled = fields[id + '-enabled'].checked;
                spec.cross = fields[id + '-cross'].checked;
                if (spec.periods) {
                    const input = fields[id + '-periods'];
                    const list = input.value.split(/[,，、\s]+/).filter(Boolean).map(Number);
                    if (!list.length || list.length > 6 || new Set(list).size !== list.length || list.some(n => !Number.isInteger(n) || n < 2 || n > 250)) {
                        input.closest('details').open = true;
                        return invalid(input, '请输入 1–6 个不重复的整数周期（2–250）');
                    }
                    spec.periods = list;
                }
                if (def.fields) spec.params = Object.fromEntries(def.fields.map(f => [f.key, fields[id + '-' + f.key].valueAsNumber]));
            }
            update(chart);
        }, icon, trigger);
        el?.querySelectorAll('[data-chart-range]').forEach(button => button.onclick = () => {
            el.close();
            MarketChart.range(Number(button.dataset.chartRange));
        });
    } else if (action === 'chart-drawing') {
        const D = MarketDrawing;
        const items = D.list(), anchor = D.anchor(g.id);
        const body = `<div class="chart-picker chart-drawing-picker">${Object.entries(D.tools).map(([id, def]) => `<button class="btn" type="button" data-tool="${id}">${def.label}</button>`).join('')}</div>
            <div class="chart-range">${items.length ? '<button type="button" class="btn" data-drawing-command="undo">撤销最后一项</button>' : ''}${anchor != null ? '<button type="button" class="btn" data-drawing-command="remove-anchor">重置 VWAP 锚点</button>' : ''}</div>
            <div class="chart-drawing-list">${items.map((label, i) => `<div><span>${label} ${i + 1}</span><button type="button" class="btn danger" data-drawing-index="${i}" aria-label="删除 ${label} ${i + 1}">删除</button></div>`).join('')}</div>`;
        const el = dialog('绘图工具', body, null, icon, trigger);
        el?.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => {
            el.close();
            const tool = button.dataset.tool;
            if (tool === 'anchor' && !chart.overlays.vwap.enabled) {
                chart.overlays.vwap.enabled = true;
                update(chart);
            }
            D.setTool(tool);
        });
        el?.querySelector('[data-drawing-command="undo"]')?.addEventListener('click', () => { D.undo(); el.close(); });
        el?.querySelector('[data-drawing-command="remove-anchor"]')?.addEventListener('click', () => { D.remove('anchor'); el.close(); });
        el?.querySelectorAll('[data-drawing-index]').forEach(button => button.onclick = () => { D.remove(Number(button.dataset.drawingIndex)); el.close(); });
    }
}
function invalid(input, message) {
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity('');
    return false;
}
window.ChartControls = { open };
})();
