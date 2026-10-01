'use strict';

const state = {
    data: null,
    sections: [],
    sentences: [],
    activeSentenceId: null,
    activeSection: -1,
    dynamic: null,
    visualToken: 0,
};

const $ = (id) => document.getElementById(id);
const audio = $('master-audio');
const mount = $('visual-mount');
const placeholder = $('visual-placeholder');
const scriptCache = {};

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function showPlaceholder(text) {
    placeholder.textContent = text;
    placeholder.style.display = text ? 'block' : 'none';
}

function hidePlaceholder() {
    placeholder.style.display = 'none';
}

/* ---------- script loading for dynamic sections ---------- */

function loadScript(src) {
    if (!scriptCache[src]) {
        scriptCache[src] = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = () => resolve();
            el.onerror = () => {
                delete scriptCache[src];
                reject(new Error('failed to load ' + src));
            };
            document.head.appendChild(el);
        });
    }
    return scriptCache[src];
}

function resolveDynamic(scriptId) {
    const registry = window.DynamicScripts || {};
    if (registry[scriptId]) return registry[scriptId];
    const loose = Object.keys(registry)
        .find((k) => k.toLowerCase() === scriptId.toLowerCase());
    if (loose) return registry[loose];
    try {
        // top level `class Foo {}` is not a window property, so resolve the binding
        const ctor = (0, eval)(`typeof ${scriptId} === 'undefined' ? null : ${scriptId}`);
        if (ctor) return ctor;
    } catch (e) {
        console.warn('resolveDynamic', e);
    }
    if (typeof window[scriptId] !== 'undefined') return window[scriptId];
    return null;
}

/* ---------- timeline lookup ---------- */

function sentenceAt(ms) {
    const arr = state.sentences;
    let lo = 0;
    let hi = arr.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].startMs <= ms) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (found < 0) return null;
    const s = arr[found];
    return ms < s.endMs ? s : null;
}

function sectionAt(ms) {
    let found = -1;
    for (let i = 0; i < state.sections.length; i++) {
        if (state.sections[i].startMs <= ms) found = i;
    }
    return found;
}

/* ---------- transcript / nav UI ---------- */

function buildUI() {
    const content = $('transcript-content');
    const nav = $('section-nav');
    content.innerHTML = '';
    nav.innerHTML = '';

    state.sections.forEach((sec, i) => {
        const secEl = document.createElement('div');
        secEl.className = 'section';
        secEl.dataset.index = String(i);

        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = `${i + 1}. ${sec.id} (${sec.type})`;
        secEl.appendChild(title);

        (sec.transcript || []).forEach((t) => {
            const p = document.createElement('p');
            p.className = 'sentence';
            p.id = t.id;
            p.textContent = t.text;
            p.addEventListener('click', () => seekMs(t.startMs));
            secEl.appendChild(p);
            state.sentences.push({
                id: t.id,
                startMs: t.startMs,
                endMs: t.endMs,
                sectionIndex: i,
                el: p,
            });
        });
        content.appendChild(secEl);

        const chip = document.createElement('button');
        chip.className = 'nav-chip';
        chip.textContent = String(i + 1);
        chip.title = sec.id;
        chip.addEventListener('click', () => seekMs(sec.startMs));
        nav.appendChild(chip);
    });
}

function setActiveSentence(sentence) {
    if (!sentence || sentence.id === state.activeSentenceId) return;
    if (state.activeSentenceId) {
        const old = document.getElementById(state.activeSentenceId);
        if (old) old.classList.remove('active');
    }
    state.activeSentenceId = sentence.id;
    sentence.el.classList.add('active');
    sentence.el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

/* ---------- visual stage ---------- */

function teardownDynamic() {
    if (state.dynamic && typeof state.dynamic.instance.unmount === 'function') {
        try {
            state.dynamic.instance.unmount(mount);
        } catch (e) {
            console.warn('unmount failed', e);
        }
    }
    state.dynamic = null;
    mount.innerHTML = '';
}

async function activateSection(index) {
    if (index === state.activeSection || index < 0) return;
    state.activeSection = index;
    const token = ++state.visualToken;

    teardownDynamic();
    mount.innerHTML = '';

    const sec = state.sections[index];
    if (!sec) {
        showPlaceholder('');
        return;
    }

    const chip = document.querySelectorAll('.nav-chip')[index];
    document.querySelectorAll('.nav-chip').forEach((c) => c.classList.remove('active'));
    if (chip) chip.classList.add('active');

    if (sec.type === 'dynamic' && (sec.scriptUrl || sec.scriptId)) {
        showPlaceholder('Loading visual...');
        const src = sec.scriptUrl || `${sec.scriptId}.js`;
        try {
            await loadScript(src);
        } catch (e) {
            console.error(e);
            if (token === state.visualToken) showPlaceholder(`Missing script: ${src}`);
            return;
        }
        if (token !== state.visualToken) return;

        const resolved = resolveDynamic(sec.scriptId);
        if (!resolved) {
            showPlaceholder(`No visual registered for ${sec.scriptId}`);
            return;
        }
        let instance;
        try {
            instance = typeof resolved === 'object' ? resolved : new resolved();
        } catch (e) {
            console.error(e);
            showPlaceholder(`Could not start ${sec.scriptId}`);
            return;
        }
        hidePlaceholder();
        state.dynamic = { id: sec.scriptId, instance };
        if (typeof instance.mount === 'function') instance.mount(mount);
        renderDynamic();
        return;
    }

    if (sec.visual && sec.visual.type === 'image' && sec.visual.url) {
        hidePlaceholder();
        const img = document.createElement('img');
        img.src = sec.visual.url;
        img.alt = sec.id;
        mount.appendChild(img);
        return;
    }

    showPlaceholder(sec.id);
}

function renderDynamic(nowMs) {
    if (!state.dynamic || typeof state.dynamic.instance.render !== 'function') return;
    const sec = state.sections[state.activeSection];
    if (!sec) return;
    const now = typeof nowMs === 'number' ? nowMs : audio.currentTime * 1000;
    const local = Math.max(0, Math.min(now - sec.startMs, sec.endMs - sec.startMs));
    try {
        state.dynamic.instance.render(local);
    } catch (e) {
        console.warn('render failed', e);
        state.dynamic.instance.render = () => {};
    }
}

/* ---------- player ---------- */

function seekMs(ms) {
    audio.currentTime = ms / 1000;
    tick();
}

function updateProgress(ms) {
    const total = (state.data && state.data.metadata && state.data.metadata.totalDuration)
        || audio.duration || 0;
    const seconds = ms / 1000;
    $('time-current').textContent = formatTime(seconds);
    if (total > 0 && !seeking) {
        $('progress-bar').value = String((seconds / total) * 100);
    }
}

function tick() {
    const ms = audio.currentTime * 1000;
    const sentence = sentenceAt(ms);
    if (sentence) setActiveSentence(sentence);
    // before the lead-in (or inside a pause) keep the last/first section visible
    activateSection(Math.max(0, sectionAt(ms)));
    renderDynamic(ms);
    updateProgress(ms);
    requestAnimationFrame(tick);
}

let seeking = false;

function setPlaying(playing) {
    $('icon-play').style.display = playing ? 'none' : 'block';
    $('icon-pause').style.display = playing ? 'block' : 'none';
    $('play-pause-btn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

async function init() {
    let data;
    try {
        const response = await fetch('driving-data.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
    } catch (e) {
        console.error(e);
        showPlaceholder('driving-data.json not found - run stitch_audio.py first');
        return;
    }

    state.data = data;
    state.sections = data.sections || [];
    buildUI();
    showPlaceholder(state.sections.length ? '' : 'No sections in driving-data.json');

    const meta = data.metadata || {};
    audio.src = meta.audioUrl || 'master-audio.mp3';
    $('time-total').textContent = formatTime(meta.totalDuration || 0);

    // deep link: index.html?t=12.5 starts (or seeks) at 12.5 seconds
    const startParam = new URLSearchParams(location.search).get('t');
    audio.addEventListener('loadedmetadata', () => {
        $('time-total').textContent = formatTime(audio.duration);
        const start = parseFloat(startParam);
        if (startParam !== null && !isNaN(start)) {
            audio.currentTime = Math.min(Math.max(start, 0), audio.duration || 0);
        }
    }, { once: true });

    $('play-pause-btn').addEventListener('click', () => {
        if (audio.paused) audio.play().catch((e) => console.error(e));
        else audio.pause();
    });
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => setPlaying(false));
    audio.addEventListener('error', () => {
        if (audio.src) showPlaceholder(`Could not load ${meta.audioUrl || 'master-audio.mp3'}`);
    });

    const bar = $('progress-bar');
    bar.addEventListener('input', () => {
        seeking = true;
        const total = meta.totalDuration || audio.duration || 0;
        const seconds = (Number(bar.value) / 100) * total;
        $('time-current').textContent = formatTime(seconds);
    });
    const commitSeek = () => {
        const total = meta.totalDuration || audio.duration || 0;
        audio.currentTime = (Number(bar.value) / 100) * total;
        seeking = false;
    };
    bar.addEventListener('change', commitSeek);

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault();
            $('play-pause-btn').click();
        } else if (e.code === 'ArrowRight' && e.target === document.body) {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
        } else if (e.code === 'ArrowLeft' && e.target === document.body) {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
        }
    });

    requestAnimationFrame(tick);
}

init();
