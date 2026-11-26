/* PWA installation, release checks and player-controlled updates. */
(() => {
'use strict';

const release = window.APP_RELEASE;
const base = new URL('./', location.href);
const receiptKey = 'trade_update_receipt';
const state = { status: 'idle', target: null, message: '', progress: null };
const serviceWorker = navigator.serviceWorker;
const supported = serviceWorker && window.isSecureContext && /^https?:$/.test(location.protocol);
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const updateIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/></svg>';
const installIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
const labels = {
    idle: '检查更新', checking: '检查中…', downloading: '下载中…', latest: '已是最新', ready: '查看更新',
    updating: '更新中…', offline: '离线可用', error: '重试检查', unsupported: '更新需 HTTPS'
};
let registration, registrationPromise, installPrompt, installing = false, checking = false, applying = false, lastCheck = 0;
let confirmedTarget;

function notify(message) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    root.append(toast);
    setTimeout(() => toast.remove(), 4500);
}

function markup(placement = 'side') {
    return `<div class="app-release app-release-${placement}"><button type="button" class="app-install" data-pwa-install aria-label="安装应用" hidden>${installIcon}<span>安装应用</span></button><button type="button" class="app-version" data-pwa-update><span class="version-label">v${release.version}</span><span class="version-status">检查更新</span>${updateIcon}<span class="version-progress" aria-hidden="true"></span></button></div>`;
}

function sync() {
    const busy = ['checking', 'downloading', 'updating'].includes(state.status);
    const pct = state.progress ? Math.floor(100 * state.progress.completed / state.progress.total) : null;
    const label = pct === null ? labels[state.status] : `下载 ${pct}%`;
    const description = state.status === 'ready' ? `查看 v${state.target.version} 更新说明` : state.message || label;
    document.querySelectorAll('[data-pwa-update]').forEach(button => {
        button.dataset.state = state.status;
        button.disabled = busy;
        button.querySelector('.version-status').textContent = label;
        button.title = `当前版本 v${release.version} · ${description}`;
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-busy', String(busy));
        button.style.setProperty('--update-progress', `${pct ?? 0}%`);
    });
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    document.querySelectorAll('[data-pwa-install]').forEach(button => {
        button.hidden = standalone || (!installPrompt && !(supported && ios));
        button.disabled = installing;
    });
}

function set(status, message = '') {
    state.status = status;
    state.message = message;
    if (status !== 'ready' && status !== 'updating') state.target = null;
    if (status !== 'downloading') state.progress = null;
    sync();
}

function readRelease(value) {
    if (!/^\d+\.\d+\.\d+$/.test(value?.version) || !/^[a-f\d]{16}$/.test(value?.build)) return null;
    const notes = Array.isArray(value.notes)
        ? value.notes.filter(note => typeof note === 'string' && note.length > 0 && note.length <= 240).slice(0, 12)
        : [];
    return { version: value.version, build: value.build, notes };
}

async function publishedRelease() {
    const url = new URL('version.json', base);
    url.searchParams.set('check', Date.now());
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('无法读取线上版本，请稍后重试。');
    const current = readRelease(await response.json());
    if (!current) throw new Error('线上版本信息暂不可用，请稍后重试。');
    return current;
}

function workerRelease(worker) {
    return new Promise((resolve, reject) => {
        if (!worker) { resolve(null); return; }
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
            channel.port1.close();
            reject(new Error('版本检查超时，请重试。'));
        }, 4000);
        channel.port1.onmessage = event => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(readRelease(event.data));
        };
        try {
            worker.postMessage({ type: 'GET_RELEASE' }, [channel.port2]);
        } catch (error) {
            clearTimeout(timeout);
            channel.port1.close();
            channel.port2.close();
            reject(error);
        }
    });
}

async function discover() {
    const current = await workerRelease(registration?.waiting || registration?.active);
    if (current && current.build !== release.build) {
        state.target = current;
        set('ready');
        return true;
    }
    return false;
}

function refreshPrepared() {
    if (!checking && !applying) discover().catch(() => {});
}

function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
        if (['installed', 'activated'].includes(worker.state)) refreshPrepared();
    });
    if (worker.state === 'installing') worker.postMessage({ type: 'GET_INSTALL_PROGRESS' });
}

async function register() {
    if (!registrationPromise) {
        registrationPromise = (async () => {
            registration = await serviceWorker.register(new URL('sw.js', base), { scope: './', updateViaCache: 'none' });
            watch(registration.installing);
            registration.addEventListener('updatefound', () => watch(registration.installing));
        })();
    }
    try { await registrationPromise; } catch (error) { registrationPromise = null; throw error; }
}

function waitForWorker(worker, states, timeoutMs, failure, timedOut, start) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error(timedOut)); }, timeoutMs);
        function cleanup() {
            clearTimeout(timer);
            worker.removeEventListener('statechange', changed);
        }
        function changed() {
            if (worker.state === 'redundant') { cleanup(); reject(new Error(failure)); }
            else if (states.includes(worker.state)) { cleanup(); resolve(); }
        }
        worker.addEventListener('statechange', changed);
        try {
            start?.();
            changed();
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}

async function check(interactive = false) {
    if (checking || applying) return;
    if (!supported) { set('unsupported'); return; }
    checking = true;
    set('checking');
    lastCheck = Date.now();
    try {
        await register();
        if (!navigator.onLine) {
            if (!await discover()) set('offline');
            if (interactive) notify('当前处于离线状态，联网后可检查更新。');
            return;
        }

        const published = await publishedRelease();
        if (published.build !== release.build) set('downloading');
        // A waiting worker can already contain the published release.
        const waiting = await workerRelease(registration.waiting);
        if (waiting?.build !== published.build) await registration.update();
        if (registration.installing) {
            await waitForWorker(registration.installing, ['installed', 'activating', 'activated'], 60000,
                '更新下载失败，请重试。', '更新下载超时，请重试。');
        }

        if (await discover()) {
            if (interactive) notify('新版本已准备好，点击版本入口查看更新说明。');
        } else if (published.build !== release.build) {
            throw new Error('更新资源还在发布，请稍后重试。');
        } else {
            if (!registration.active && !registration.waiting) throw new Error('离线资源暂未准备好，请重试。');
            set('latest');
            if (interactive) notify(`当前 v${release.version} 已是最新版本。`);
        }
    } catch (error) {
        if (await discover().catch(() => false)) {
            if (interactive) notify('已下载的更新可用，点击版本入口查看更新说明。');
        } else {
            const message = /[\u4e00-\u9fff]/.test(error.message || '') ? error.message : '暂时无法检查更新，请稍后重试。';
            set(navigator.onLine ? 'error' : 'offline', message);
            if (interactive) notify(message);
        }
    } finally {
        checking = false;
    }
}

function reviewUpdate() {
    if (document.querySelector('dialog[open]')) return;
    const dialog = document.getElementById('pwa-update-dialog');
    const list = document.getElementById('pwa-update-notes');
    confirmedTarget = state.target;
    document.getElementById('pwa-update-title').textContent = `更新至 v${confirmedTarget.version}`;
    list.replaceChildren(...confirmedTarget.notes.map(note => {
        const item = document.createElement('li');
        item.textContent = note;
        return item;
    }));
    list.hidden = confirmedTarget.notes.length === 0;
    dialog.returnValue = '';
    dialog.showModal();
}

async function update(target) {
    if (applying || !target) return;
    applying = true;
    try {
        const next = registration?.waiting || registration?.active;
        if ((await workerRelease(next))?.build !== target.build) {
            applying = false;
            await check(true);
            return;
        }
        const event = new CustomEvent('app:before-update', { cancelable: true });
        if (!window.dispatchEvent(event)) return;
        set('updating');
        await waitForWorker(next, ['activated'], 15000, '版本切换失败，请重试。', '版本切换超时，请重试。', () => {
            if (next.state === 'installed') next.postMessage({ type: 'SKIP_WAITING' });
        });
        try { sessionStorage.setItem(receiptKey, target.build); } catch {}
        location.reload();
    } catch (error) {
        state.target = target;
        set('ready', error.message);
        notify(error.message || '更新失败，请重试。');
    } finally {
        applying = false;
    }
}

async function install() {
    if (installing) return;
    if (!installPrompt) {
        if (ios) notify('在浏览器打开分享菜单，选择「添加到主屏幕」。');
        return;
    }
    const prompt = installPrompt;
    installing = true;
    sync();
    try { await prompt.prompt(); await prompt.userChoice; }
    finally { installPrompt = null; installing = false; sync(); }
}

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; sync(); });
window.addEventListener('appinstalled', () => {
    installPrompt = null;
    sync();
    notify('安装完成，可从桌面或主屏幕打开。');
});
window.addEventListener('offline', () => {
    if (!checking && !['ready', 'updating'].includes(state.status)) set('offline');
});
window.addEventListener('online', () => check(false));
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastCheck > 15 * 60 * 1000) check(false);
});
document.addEventListener('click', event => {
    if (event.target.closest('[data-pwa-install]')) {
        install().catch(() => notify('安装未完成，请使用浏览器的安装菜单。'));
    } else if (event.target.closest('[data-pwa-update]')) {
        if (state.status === 'ready') reviewUpdate();
        else check(true);
    }
});

if (supported) {
    serviceWorker.addEventListener('controllerchange', refreshPrepared);
    serviceWorker.addEventListener('message', ({ source, data }) => {
        if (!checking || source !== registration?.installing || data?.type !== 'INSTALL_PROGRESS' || data.build === release.build) return;
        state.progress = { completed: data.completed, total: data.total };
        set('downloading');
    });
}
document.getElementById('pwa-update-dialog').addEventListener('close', event => {
    if (event.target.returnValue === 'apply') update(confirmedTarget);
});
window.AppPWA = { markup, sync, check, release, getState: () => ({ ...state }) };
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (sessionStorage.getItem(receiptKey) === release.build) notify(`已更新至 v${release.version}。`);
        sessionStorage.removeItem(receiptKey);
    } catch {}
    check(false);
}, { once: true });
})();
