/* Installability and deliberate, state-preserving app updates. */
(() => {
'use strict';
const release = window.APP_RELEASE;
const state = { status: 'idle', target: null, message: '', installing: false };
let registration, registrationPromise, installPrompt, applying = false, lastCheck = 0;
const supported = 'serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol);
const updateIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/></svg>';
const installIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
function notify(message) {
    const root = document.getElementById('toasts'); if (!root) return;
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; root.append(el); setTimeout(() => el.remove(), 4500);
}
function markup(placement = 'side') {
    return `<div class="app-release app-release-${placement}"><button type="button" class="app-install" data-pwa-install hidden>${installIcon}<span>安装应用</span></button><button type="button" class="app-version" data-pwa-update aria-label="v${release.version}，点击检查更新"><span class="version-label">v${release.version}</span><span class="version-status">检查更新</span>${updateIcon}</button></div>`;
}
function sync() {
    const labels = { idle: '检查更新', checking: '检查中…', latest: '已是最新', ready: '点击更新', updating: '更新中…', offline: '离线可用', error: '重试检查', unsupported: '更新需 HTTPS' };
    document.querySelectorAll('[data-pwa-update]').forEach(button => {
        button.dataset.state = state.status;
        button.disabled = ['checking', 'updating'].includes(state.status);
        button.querySelector('.version-status').textContent = labels[state.status] || labels.idle;
        const description = state.status === 'ready' ? `发现更新${state.target?.version ? ' v' + state.target.version : ''}，点击保存进度并更新` : state.message || '点击检查更新';
        button.title = `当前版本 v${release.version} · ${description}`;
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-busy', String(button.disabled));
    });
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    document.querySelectorAll('[data-pwa-install]').forEach(button => { button.hidden = !installPrompt || installed; button.disabled = state.installing; });
}
function set(status, message = '') { state.status = status; state.message = message; sync(); }
function workerRelease(worker) {
    return new Promise((resolve, reject) => {
        if (!worker) { resolve(null); return; }
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error('版本检查超时，请重试')); }, 4000);
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
        worker.postMessage({ type: 'GET_RELEASE' }, [channel.port2]);
    });
}
async function discover() {
    const worker = registration?.waiting || registration?.active;
    const remote = await workerRelease(worker);
    if (remote && remote.build !== release.build) { state.target = remote; set('ready'); return true; }
    state.target = null; return false;
}
function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') discover().catch(() => {});
    });
}
async function register() {
    if (registrationPromise) return registrationPromise;
    registrationPromise = (async () => {
        registration = await navigator.serviceWorker.register(new URL('sw.js', new URL('./', location.href)), { scope: './', updateViaCache: 'none' });
        watch(registration.installing);
        registration.addEventListener('updatefound', () => watch(registration.installing));
        await discover();
        return registration;
    })();
    try { return await registrationPromise; } catch (error) { registrationPromise = null; throw error; }
}
function finishInstall(worker) {
    if (!worker || !['installing', 'parsed'].includes(worker.state)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('更新下载超时，请重试')); }, 20000);
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed); };
        const changed = () => {
            if (worker.state === 'redundant') { cleanup(); reject(new Error('新版本下载失败，当前版本仍可使用')); }
            else if (['installed', 'activating', 'activated'].includes(worker.state)) { cleanup(); resolve(); }
        };
        worker.addEventListener('statechange', changed); changed();
    });
}
async function check(interactive = false) {
    if (['checking', 'updating'].includes(state.status)) return;
    if (!supported) { set('unsupported'); if (interactive) notify('PWA 安装与更新需要 HTTPS 或 localhost。'); return; }
    if (!navigator.onLine) { if (state.status !== 'ready') set('offline'); if (interactive) notify('当前处于离线状态，联网后可检查更新。'); return; }
    set('checking'); lastCheck = Date.now();
    try {
        await register(); await registration.update(); await finishInstall(registration.installing);
        if (await discover()) { if (interactive) notify('新版本已准备好，再次点击版本入口即可更新。'); }
        else { set('latest'); if (interactive) notify(`当前 v${release.version} 已是最新版本。`); }
    } catch (error) {
        const message = /[\u4e00-\u9fff]/.test(error.message || '') ? error.message : '无法连接更新服务，请稍后重试。';
        set('error', message); if (interactive) notify(message);
    }
}
function prepareReload() {
    const event = new CustomEvent('app:before-update', { cancelable: true });
    return window.dispatchEvent(event);
}
async function update() {
    if (applying) return;
    if (!navigator.onLine) { notify('请联网后更新，以便确认新版本可用。'); return; }
    if (!prepareReload()) return;
    applying = true; set('updating');
    try {
        if (registration?.waiting) {
            const worker = registration.waiting;
            const next = await workerRelease(worker);
            state.target = next;
            let timer;
            const changed = () => {
                if (!applying) return;
                clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed);
                location.reload();
            };
            navigator.serviceWorker.addEventListener('controllerchange', changed);
            timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); applying = false; set('ready', '切换超时，请再次点击更新'); notify('更新切换超时，进度已保存，请重试。'); }, 15000);
            worker.postMessage({ type: 'SKIP_WAITING' });
        } else if (navigator.serviceWorker.controller && (await workerRelease(navigator.serviceWorker.controller))?.build !== release.build) location.reload();
        else { applying = false; await check(true); }
    } catch (error) { applying = false; set('error', error.message); notify('更新失败，进度已保存，可再次尝试。'); }
}
async function install() {
    if (!installPrompt || state.installing) return;
    const prompt = installPrompt; state.installing = true; sync();
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') notify('应用已添加，可从桌面或主屏幕打开。'); }
    finally { installPrompt = null; state.installing = false; sync(); }
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; sync(); });
window.addEventListener('appinstalled', () => { installPrompt = null; sync(); });
window.addEventListener('offline', () => { if (!['ready', 'updating'].includes(state.status)) set('offline'); });
window.addEventListener('online', () => check(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 15 * 60 * 1000) check(false); });
document.addEventListener('click', event => {
    if (event.target.closest('[data-pwa-install]')) { install().catch(() => notify('安装未完成，请使用浏览器的安装菜单。')); return; }
    if (event.target.closest('[data-pwa-update]')) { if (state.status === 'ready') update(); else check(true); }
});
if (supported) navigator.serviceWorker.addEventListener('controllerchange', () => { if (!applying) discover().catch(() => {}); });
window.AppPWA = { markup, sync, check, release, getState: () => ({ ...state }) };
window.addEventListener('load', () => { if (supported) check(false); else set('unsupported'); }, { once: true });
})();
