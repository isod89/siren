// SPDX-License-Identifier: GPL-3.0-only
// SIREN on the web (0.5): the brain and the sound in the audio thread (brain.js, worklet.js); here the deck: the table
// (each layer's strip: its sound, its motif, volume, filter, space, mute; the one in the hands), the DJ's knobs, the
// composition pads (the FM-1's black keys), the DJ's effects (held), the style and the seed; the palette workshop, the
// set's log, and the sea behind it all.
const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else if (v != null && v !== false) e.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c); return e; };
const LAYERS = ['DRUMS', 'BASS', 'ARP', 'HOOK', 'PAD', 'STAB', 'FX'];
const LAYER_NAME = { DRUMS: 'DRUMS', BASS: 'BASS', ARP: 'ARP', HOOK: 'HOOK', PAD: 'PAD', STAB: 'STABS', FX: 'FX' };
const COL = { DRUMS: '#F2F2F2', BASS: '#287CFF', ARP: '#19E3D3', HOOK: '#FF621A', PAD: '#8B5CFF', STAB: '#FFC618', FX: '#1ECC70' };
const STYLES = ['TECHNO', 'TRANCE', 'PSY', 'ACID', 'RAVE', 'HARD', 'DNB', 'HOUSE'];
const STYLE_LABEL = { DNB: 'DRUM & BASS' };
const SEC_FR = { INTRO: 'INTRO', GROOVE: 'GROOVE', BUILD: 'BUILD', DROP: 'DROP', BREAK: 'BREAK', PEAK: 'PEAK', OUTRO: 'OUTRO' };
const NOTE = 'C C# D D# E F F# G G# A A# B'.split(' ');
const ROLES = ['BASS', 'ACID', 'LEAD', 'ARP', 'STAB', 'PAD', 'PIANO', 'FX', 'VOX'];
// the DJ's effects (as worklet.js): 1-12 in every style, 13-16 the style's own
const PX_COMMON = ['ROLL 1/4', 'ROLL 1/8', 'ROLL 1/16', 'ROLL 1/32', 'LOW PASS', 'HIGH PASS', 'ECHO OUT', 'WASH OUT', 'KILL LOW', 'KILL MID', 'KILL HIGH', 'GATE'];
const PX_STYLE = { TECHNO: ['DUB ECHO', 'CRUSH', 'KICK+BASS', 'CUT'], TRANCE: ['RISER', 'PITCH ROLL', 'DUB ECHO', 'CUT'], PSY: ['DUB ECHO', 'SQUELCH', 'PITCH ROLL', 'CRUSH'], ACID: ['SQUELCH', 'DUB ECHO', 'CRUSH', 'CUT'], RAVE: ['PITCH ROLL', 'BRAKE', 'CRUSH', 'RISER'], HARD: ['CRUSH', 'KICK+BASS', 'PITCH ROLL', 'CUT'], DNB: ['REWIND', 'HALF TIME', 'DRUM ROLL', 'CRUSH'], HOUSE: ['KICK+BASS', 'DUB ECHO', 'DRUM ROLL', 'CUT'] };
const PX_HINT = { 'ROLL 1/4': 'loops the beat', 'ROLL 1/8': 'loops the eighth', 'ROLL 1/16': 'loops the sixteenth', 'ROLL 1/32': 'a tight roll', 'LOW PASS': 'everything goes muffled', 'HIGH PASS': 'everything goes thin', 'ECHO OUT': 'fades out in echoes', 'WASH OUT': 'fades out in reverb', 'KILL LOW': 'no lows', 'KILL MID': 'no mids', 'KILL HIGH': 'no highs', GATE: 'chopped in sixteenths', 'DUB ECHO': 'dub echo on the leads', CRUSH: 'dirty, digital', 'KICK+BASS': 'just kick and bass', CUT: 'silence', RISER: 'rising noise', 'PITCH ROLL': 'a rising roll', SQUELCH: 'squelching filters', BRAKE: 'the turntable stops', 'HALF TIME': 'half speed', REWIND: 'rewinds, restarts the section', 'DRUM ROLL': 'a drum roll' };
// the composition pads (the FM-1's black keys)
const PADS = [
  { k: 'drop', b: 'DROP', s: 'on the next bar', c: '#FF621A', big: true, ic: '▼' },
  { k: 'dive4', b: 'BUILD 4', s: '4 bars, then the drop', c: '#FFC618', ic: '↗' },
  { k: 'dive16', b: 'BUILD 16', s: 'a long build, then the drop', c: '#FFC618', ic: '⇗' },
  { k: 'break', b: 'BREAK', s: 'the music breathes', c: '#8B5CFF', ic: '∿' },
  { k: 'fill', b: 'FILL', s: 'snare and tom fill', c: '#F2F2F2', ic: '⁂' },
  { k: 'melody', b: 'NEW MELODY', s: 'hook and arp', c: '#19E3D3', ic: '♪' },
  { k: 'bass', b: 'NEW BASS', s: 'another bass line', c: '#287CFF', ic: '♩' },
  { k: 'groove', b: 'NEW GROOVE', s: 'another drum beat', c: '#F2F2F2', ic: '⋮' },
  { k: 'keyup', b: 'KEY UP', s: 'a tone up at the next drop', c: '#FF2E8C', ic: '♯' },
  { k: 'stay', b: 'STAY', s: 'loop this section', c: '#19E3D3', ic: '⟲' },
  { k: 'next', b: 'NEXT TRACK', s: 'on the phrase · twice: now', c: '#1ECC70', ic: '⏭' },
];

let ctx = null, node = null, mods = {}, cats = {}, palData = null, curData = {}, kitData = {}, levData = {}, packIndex = [];
let flash = 0, info = null, pend = {}, waiting = [], pxOn = -1, playing = false, scope = new Float32Array(512), peaks = {}, kicks = [], sparks = [], soundsMsg = null, playStart = 0;
const store = (() => { try { return JSON.parse(localStorage.getItem('siren.v1') || '{}'); } catch (_) { return {}; } })();
store.out ||= []; store.community ||= false;
const save = () => { try { localStorage.setItem('siren.v1', JSON.stringify(store)); } catch (_) { /* (private mode) */ } };
const post = (m) => node?.port.postMessage(m);
const dj = Object.assign({ filter: 0, energy: 0.5, space: 1, density: 0.5 }, store.dj || {});
const strip = Object.fromEntries(LAYERS.map((L) => [L, { vol: 0, flt: 0, space: 1, mute: false }]));
let focus = 'HOOK';

// ------------------------------------------------------------------------------------------------ loading ---
async function compile(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ': ' + r.status); return WebAssembly.compile(await r.arrayBuffer()); }
function catalogOf(m, drums) { const w = new WebAssembly.Instance(m, {}).exports; w._initialize?.(); w.k_init(drums ? 1 : 0); const n = w.k_catalog(); return JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.k_buffer(), n).slice())); }
async function loadBank(id) {
  if (mods[id] || id === 'siren') return;
  if (id === 'clipper' || id === 'sloop') { mods[id] = await compile(`engines/${id}.wasm`); cats[id] = catalogOf(mods[id]); return; }
  const e = packIndex.find((x) => x.id === id); if (!e) return;
  mods[id] = await compile(`engines/packs/${e.file}`); cats[id] = e.catalog;
  post({ t: 'module', bank: id, m: mods[id] });
}
// a palette entry -> what the worklet plays: its engine and sound indices, and the knob its filter is on
const WOB = { ANALOG: ['CUT', 'DTN'], HYBRID: ['CUT', 'M1'], FMX: ['MOD', 'FB'], VOICE: ['VOWL', 'TALK'], WAVE: ['CUT', 'POS'], TERRAIN: ['CUT', 'X'], DIGITAL: ['IDX', 'FB'], VPS: ['CUT', 'D'], MACRO: ['CUT', 'TIMB'], TRIO: ['CUT', 'PW'], JUNO: ['CUT', 'PW'], ACID: ['CUT', 'ENV'], WSEQ: ['CUT', 'RES'], PHASE: ['DCW', 'WAVE2'], VECTOR: ['CUT', 'X'], STRINGS: ['CUT'] };
function resolve(s) {
  const c = cats[s.bank]; if (!c) return null;
  const e = c.engines.findIndex((x) => x.name === s.engine); if (e < 0) return null;
  const p = Math.max(0, c.engines[e].presets.indexOf(s.preset));
  const k = c.engines[e].edit.findIndex((d) => /^(CUT|CUTOFF|FREQ|TONE|FILTER|BRITE|COLR)$/i.test(d.l));
  const d = k >= 0 ? c.engines[e].edit[k] : null;
  // what a wobble moves on this engine: its filter, and a timbre (the vowel, the FM index, the wavetable...)
  const want = WOB[s.engine] || ['CUT', 'CUTOFF', 'FILTER', 'FREQ'], ed = c.engines[e].edit;
  const wob = want.map((l) => ed.findIndex((x) => x.l === l)).filter((i) => i >= 0).slice(0, 2).map((i) => ({ id: c.e0 + i, min: ed[i].min, max: ed[i].max }));
  return { bank: s.bank, e, p, name: `${s.preset}`, engine: s.engine, key: `${s.bank}/${s.engine}/${s.preset}`, cut: d ? { id: c.e0 + k, min: d.min, max: d.max } : null, wob };
}
function palette() {
  const out = {};
  for (const r of ROLES) out[r] = (palData[r] || []).filter((s) => (s.fm1 || store.community) && !store.out.includes(`${s.bank}/${s.engine}/${s.preset}`)).map(resolve).filter(Boolean);
  out.DKITS = kitData; out.SYN1 = (cats.sloop.kits || []).indexOf('SYN1');
  out.CUR = curated();
  return out;
}
// the curation: for each style and layer, the sounds SIREN picks from (data/curation.json, edited in the workshop),
// each with its calibration in that layer (data/levels.json: its trim in dB, its tone ceiling in Hz)
const curKey = (k) => (k.includes('/') ? k : 'clipper/' + k.replace(':', '/'));      // "ENGINE:PRESET" -> "clipper/ENGINE/PRESET"
const curParse = (k) => { const [bank, rest] = k.includes('/') ? [k.split('/')[0], k.slice(k.indexOf('/') + 1)] : ['clipper', k]; const i = rest.indexOf(':'); return { bank, engine: rest.slice(0, i), preset: rest.slice(i + 1), fm1: bank === 'clipper' || bank === 'siren' }; };
const CUR_VER = '0.5';   // (the shipped bank's version: SIREN 0.5's, calibrated)
const curation = () => store.cur || curData;
function curated() {
  const o = {};
  for (const [st, ls] of Object.entries(curation())) {
    o[st] = {};
    for (const [L, arr] of Object.entries(ls)) o[st][L] = arr.map(curParse).filter((s) => (s.fm1 || store.community) && !store.out.includes(`${s.bank}/${s.engine}/${s.preset}`)).map((s) => { const x = resolve(s); if (!x) return null; const c = levData[`${L}|${x.key}`] || {}; return { ...x, trim: c.trim || 0, tone: c.tone || 0 }; }).filter(Boolean);
  }
  return o;
}
async function sendPalette() { if (store.community) for (const id of new Set([...Object.values(palData).flat().filter((s) => s && !s.fm1).map((s) => s.bank), ...Object.values(curation()).flatMap((l) => Object.values(l).flat()).map((k) => curParse(k).bank)])) await loadBank(id); post({ t: 'palette', palette: palette() }); }

// -------------------------------------------------------------------------------------------- the sound ---
async function start() {
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return; }
  ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'playback' });
  await ctx.audioWorklet.addModule('js/brain.js');
  await ctx.audioWorklet.addModule('js/worklet.js');
  node = new AudioWorkletNode(ctx, 'siren', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { modules: mods } });
  node.connect(ctx.destination);
  node.port.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'step') onStep(m);
    else if (m.t === 'scope') { scope = m.s; peaks = m.peaks; }
    else if (m.t === 'sounds') { soundsMsg = m; updateStrips(); }
  };
  await sendPalette();
  post({ t: 'knob', k: 'energy', v: dj.energy }); post({ t: 'knob', k: 'density', v: dj.density }); post({ t: 'knob', k: 'tension', v: 0.5 }); post({ t: 'knob', k: 'mutation', v: 0.35 });
  post({ t: 'mix', what: 'filter', v: dj.filter }); post({ t: 'mix', what: 'space', v: dj.space });
  for (const L of LAYERS) { const s = strip[L]; post({ t: 'strip', L, what: 'vol', v: s.vol }); post({ t: 'strip', L, what: 'flt', v: s.flt }); post({ t: 'strip', L, what: 'space', v: s.space }); if (s.mute) post({ t: 'mute', L, on: true }); }
  post({ t: 'focus', L: focus }); post({ t: 'stylelock', on: $('#stylelock').checked });
  post({ t: 'seed', code: $('#seed').value, style: store.style || 'TRANCE' });
}
let lastLabel = '';
function onStep(m) {
  const i = info = m.info; pend = m.pend; waiting = m.waiting; pxOn = m.px;
  for (const [L, n, v] of m.notes) {
    if (L === 'DRUMS' && n === 36) kicks.push({ t: performance.now(), e: i.e / 1000 });
    else if (L !== 'DRUMS') sparks.push({ L, n, v, t: performance.now(), a: (n * 0.47 + performance.now() / 3000) % (Math.PI * 2) });
  }
  if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  document.querySelectorAll('#beats i').forEach((b, k) => b.classList.toggle('on', k === (i.step >> 2)));
  $('#play').classList.toggle('beat', i.step % 4 === 0);
  if (i.step % 4 === 0 || i.step === 15) renderPlan(i);
  if (i.step === 0) {
    const [st, code] = i.label.split(' · ');
    $('#label').textContent = `${STYLE_LABEL[st] || st} · ${code}`; $('#bpm').textContent = i.bpm.toFixed(0);
    $('#key').textContent = NOTE[i.key]; $('#scale').textContent = String(i.scale || '').toUpperCase();
    if (st !== store.style) { store.style = st; save(); renderStyles(); renderFx(); }
    if (i.label !== lastLabel) { lastLabel = i.label; $('#seed').value = code; $('#setlog').prepend(h('li', {}, h('b', {}, i.label), ` · ${i.bpm.toFixed(0)} BPM · ${new Date().toLocaleTimeString()}`)); }
    if (i.sec === 'DROP' && i.secBar === 0) flash = 1;
    $('#s-sec').textContent = SEC_FR[i.sec] || i.sec; $('#s-label').textContent = `${i.label} · ${i.bpm.toFixed(0)} BPM`;
  }
  renderPads(); renderStylesPending(); renderFxOn();
}
// the plan: the sections, the playhead; the section, and what comes next and when
function renderPlan(i) {
  const tot = i.planLen.reduce((a, b) => a + b, 0) || 1;
  $('#plan').replaceChildren(...i.plan.map((s, k) => { const el = h('i', { class: s + (k === i.planAt ? ' now' : k < i.planAt ? ' past' : ''), title: `${SEC_FR[s] || s} · ${i.planLen[k]} bars`, style: { flex: `${i.planLen[k] / tot}` } }); if (k === i.planAt) el.append(h('b', { style: { width: `${((i.secBar + i.step / 16) / i.secLen) * 100}%` } })); return el; }));
  $('#sec').textContent = SEC_FR[i.sec] || i.sec;
  $('#secinfo').textContent = `bar ${i.secBar + 1}/${i.secLen} · phrase ${i.phraseBar + 1}/8`;
  const e = $('#next'); let txt = '', hot = false;
  const toPhrase = 8 - (i.phraseBar % 8), bars = (n) => `${n} ${n > 1 ? 'BARS' : 'BAR'}`;
  if (pend.next) txt = pend.next === 2 ? 'NEXT TRACK NOW' : `NEXT TRACK IN ${bars(toPhrase)}`, hot = true;
  else if (pend.style) txt = `${STYLE_LABEL[pend.style] || pend.style} IN ${bars(toPhrase)}`, hot = true;
  else if (pend.drop) txt = 'DROP ON THE NEXT BAR', hot = true;
  else if (pend.stay) txt = 'STAY: THIS SECTION LOOPS';
  else {
    let j = i.planAt + 1;
    if (i.sec !== 'DROP' && i.sec !== 'PEAK') for (let k = i.planAt + 1; k < i.plan.length; k++) if (i.plan[k] === 'DROP' || i.plan[k] === 'PEAK') { j = k; break; }
    let n = i.secLen - i.secBar; for (let k = i.planAt + 1; k < j && k < i.plan.length; k++) n += i.planLen[k];
    const what = j < i.plan.length ? (SEC_FR[i.plan[j]] || i.plan[j]) : 'NEXT TRACK';
    hot = j < i.plan.length && (i.plan[j] === 'DROP' || i.plan[j] === 'PEAK');
    txt = n <= 1 ? `${what} IN ${4 - (i.step >> 2)} ${4 - (i.step >> 2) > 1 ? 'BEATS' : 'BEAT'}` : `${what} IN ${bars(n)}`;
    if (pend.keyup) txt += ' · KEY UP';
  }
  e.textContent = txt; e.classList.toggle('hot', hot);
  const secs = playing ? Math.floor((performance.now() - playStart) / 1000) : 0;
  $('#where').textContent = `track ${i.track + 1} · set ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · kit ${i.kit}`;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1400); }

// -------------------------------------------------------------------------------------------- the controls ---
// a knob: drag up / down (or the wheel), double-click to its default; bipolar: drawn from the middle
function knob({ label, min = 0, max = 1, value, def = value, bipolar = false, fmt, color, size, title, onchange }) {
  let v = value;
  const ptr = h('div', { class: 'ptr' }), dial = h('div', { class: 'dial' }, ptr), em = h('em'), el = h('div', { class: 'knob', title: title || '' }, dial, h('b', {}, label), em);
  if (color) el.style.setProperty('--kc', color); if (size) el.style.setProperty('--d', size + 'px');
  const draw = () => {
    const x = (v - min) / (max - min);
    dial.style.setProperty('--v', x);
    if (bipolar) { const c = 0.5; dial.style.setProperty('--s', Math.min(x, c) * 270); dial.style.setProperty('--w', Math.abs(x - c) * 270); }
    else { dial.style.setProperty('--s', 0); dial.style.setProperty('--w', x * 270); }
    em.textContent = fmt ? fmt(v) : '';
  };
  const set = (nv, quiet) => {
    nv = Math.max(min, Math.min(max, nv));
    if (bipolar && Math.abs(nv) < (max - min) * 0.025) nv = 0;          // (the middle holds: open)
    if (nv === v && !quiet) return; v = nv; draw(); if (!quiet) onchange(v);
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); const y0 = e.clientY, v0 = v; const mv = (ev) => set(v0 + (y0 - ev.clientY) / 160 * (max - min)); el.addEventListener('pointermove', mv); const up = () => { el.removeEventListener('pointermove', mv); }; el.addEventListener('pointerup', up, { once: true }); el.addEventListener('pointercancel', up, { once: true }); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(v - Math.sign(e.deltaY) * (max - min) / 50); }, { passive: false });
  el.addEventListener('dblclick', () => set(def));
  draw();
  return { el, set, get: () => v };
}
// a fader: the layer's volume (dB), drag up / down, double-click: 0 dB
function fader({ value, onchange, title }) {
  const MIN = -30, MAX = 6; let v = value;
  const fill = h('i', { class: 'fill' }), cap = h('i', { class: 'cap' }), zero = h('i', { class: 'zero' }), el = h('div', { class: 'fader', title }, zero, fill, cap);
  const span = () => (el.clientHeight || 120) - 12, pos = (x) => 6 + (x - MIN) / (MAX - MIN) * span();
  const draw = () => { zero.style.bottom = pos(0) + 'px'; cap.style.bottom = pos(v) + 'px'; fill.style.height = Math.max(0, pos(v) - 6) + 'px'; };
  new ResizeObserver(draw).observe(el);
  const set = (nv) => { nv = Math.round(Math.max(MIN, Math.min(MAX, nv)) * 2) / 2; if (Math.abs(nv) < 0.75) nv = 0; if (nv === v) return; v = nv; draw(); onchange(v); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); const y0 = e.clientY, v0 = v; const mv = (ev) => set(v0 + (y0 - ev.clientY) / span() * (MAX - MIN)); el.addEventListener('pointermove', mv); const up = () => el.removeEventListener('pointermove', mv); el.addEventListener('pointerup', up, { once: true }); el.addEventListener('pointercancel', up, { once: true }); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(v - Math.sign(e.deltaY)); }, { passive: false });
  el.addEventListener('dblclick', () => set(0));
  draw();
  return { el, set: (nv) => { v = nv; draw(); } };
}
const fFilt = (v) => (v === 0 ? 'OPEN' : v < 0 ? `LOW ${Math.round(-v * 100)}` : `HIGH ${Math.round(v * 100)}`);
const fPct = (v) => `${Math.round(v * 100)} %`;
const fDb = (v) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${v} dB`);

// the table: seven strips
const S = {};
function buildStrips() {
  $('#strips').replaceChildren(...LAYERS.map((L) => {
    const st = strip[L], col = COL[L];
    const nm = h('button', { class: 'nm', title: 'Take this layer in hand: it always plays', onclick: () => setFocus(L) }, LAYER_NAME[L], h('small'));
    const name = h('span', {}, '—'), prev = h('button', { title: 'Previous sound (it stays)', onclick: () => soundStep(L, -1) }, '‹'), next = h('button', { title: 'Next sound (it stays)', onclick: () => soundStep(L, 1) }, '›');
    const meter = h('div', { class: 'meter' }, h('i'), h('span', { class: 'badge', title: 'SIREN plays at most 3 melodic layers at once: this one waits its turn (mute another one, or take it in hand)' }, 'WAITING'));
    const flt = knob({ label: 'FILTER', min: -1, max: 1, value: st.flt, def: 0, bipolar: true, fmt: fFilt, color: col, size: 40, title: 'Left: darker · right: thinner', onchange: (v) => { st.flt = v; post({ t: 'strip', L, what: 'flt', v }); } });
    const spc = knob({ label: 'SPACE', min: 0, max: 2, value: st.space, def: 1, fmt: fPct, color: col, size: 40, title: 'Its reverb and echo', onchange: (v) => { st.space = v; post({ t: 'strip', L, what: 'space', v }); } });
    const fv = h('div', { class: 'fval' }, fDb(st.vol));
    const fad = fader({ value: st.vol, title: 'Volume (double-click: 0 dB)', onchange: (v) => { st.vol = v; fv.textContent = fDb(v); post({ t: 'strip', L, what: 'vol', v }); } });
    const lock = h('button', { title: 'Keep this sound and motif in the next tracks', onclick: () => { const on = !lock.classList.contains('on'); lock.classList.toggle('on', on); post({ t: 'lock', L, on }); toast(on ? `${LAYER_NAME[L]} KEPT` : `${LAYER_NAME[L]} FREE`); } }, '◆');
    const vari = h('button', { title: 'Another motif for this layer (same sound)', onclick: () => { post({ t: 'variation', L, d: 1 }); toast(`${LAYER_NAME[L]}: NEW MOTIF`); } }, '↻');
    const mute = h('button', { class: 'm', title: 'Mute / unmute', onclick: () => { st.mute = !st.mute; mute.classList.toggle('on', st.mute); el.classList.toggle('muted', st.mute); post({ t: 'mute', L, on: st.mute }); } }, 'M');
    const nav = h('small', {}, '');
    const el = h('div', { class: 'strip' + (L === focus ? ' focus' : ''), style: { '--c': col } }, nm, h('div', { class: 'snd' }, name, h('div', { class: 'nav' }, prev, nav, next)), meter, h('div', { class: 'minis' }, flt.el), h('div', { class: 'minis' }, spc.el), fad.el, fv, h('div', { class: 'sbtns' }, vari, lock, mute));
    S[L] = { el, nm, name, nav, meter: meter.firstChild, flt, spc, fad, fv, lock, mute };
    return el;
  }));
}
function updateStrips() {
  const m = soundsMsg; if (!m) return;
  for (const L of LAYERS) {
    const s = S[L]; if (!s) continue;
    s.name.textContent = m.sounds[L] || '—'; s.name.title = `${m.sounds[L] || ''}${m.engines[L] && L !== 'DRUMS' ? ' · engine ' + m.engines[L] : ''}`;
    s.nav.textContent = m.n[L] ? `${(m.idx[L] ?? 0) + 1} / ${m.n[L]}` : '';
    s.lock.classList.toggle('on', !!m.locks[L]);
  }
}
function setFocus(L) {
  focus = L; post({ t: 'focus', L });
  for (const x of LAYERS) { S[x].el.classList.toggle('focus', x === L); S[x].nm.lastChild.textContent = x === L ? 'IN HAND' : ''; }
}
async function soundStep(L, d) { await start(); setFocus(L); post({ t: 'sound', L, d }); }
function resetTable() {
  for (const L of LAYERS) { const st = strip[L], s = S[L]; st.vol = 0; st.flt = 0; st.space = 1; s.flt.set(0, true); s.spc.set(1, true); s.fad.set(0); s.fv.textContent = fDb(0); post({ t: 'strip', L, what: 'vol', v: 0 }); post({ t: 'strip', L, what: 'flt', v: 0 }); post({ t: 'strip', L, what: 'space', v: 1 }); if (st.mute) s.mute.click(); }
  toast('MIXER RESET');
}
// the DJ's four knobs
const DK = {};
function buildDj() {
  const mk = (k, o) => { DK[k] = knob({ size: 78, ...o, onchange: (v) => { dj[k] = v; store.dj = dj; save(); o.send(v); } }); return DK[k].el; };
  $('#djknobs').replaceChildren(
    mk('filter', { label: 'FILTER', min: -1, max: 1, value: dj.filter, def: 0, bipolar: true, fmt: fFilt, color: '#FF621A', title: 'The whole mix\'s filter: left goes muffled, right goes thin (double-click: open)', send: (v) => post({ t: 'mix', what: 'filter', v }) }),
    mk('energy', { label: 'INTENSITY', value: dj.energy, def: 0.5, fmt: (v) => `${Math.round(v * 100)}`, color: '#FFC618', title: 'The track\'s energy: more notes, brighter filters, more punch', send: (v) => post({ t: 'knob', k: 'energy', v }) }),
    mk('space', { label: 'SPACE', min: 0, max: 2, value: dj.space, def: 1, fmt: fPct, color: '#8B5CFF', title: 'The reverb and echo of the whole mix', send: (v) => post({ t: 'mix', what: 'space', v }) }),
    mk('density', { label: 'MELODY', value: dj.density, def: 0.5, fmt: (v) => `${Math.round(v * 100)}`, color: '#19E3D3', title: 'How much the leads and the arp play', send: (v) => post({ t: 'knob', k: 'density', v }) }));
}
// the composition pads
const PE = {};
function buildPads() {
  $('#pads').replaceChildren(...PADS.map((p) => {
    const el = h('button', { class: 'pad' + (p.big ? ' big' : ''), style: { '--pc': p.c }, title: `${p.b} : ${p.s}`, onclick: async () => {
      await start(); if (!playing) { toast('PRESS PLAY FIRST (▶)'); return; }
      post({ t: 'black', k: p.k });
      if (p.k === 'melody' || p.k === 'bass' || p.k === 'groove') { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 220); }
      toast(p.k === 'stay' ? (pend.stay ? 'STAY: OFF' : 'STAY: THIS SECTION LOOPS') : p.k === 'next' && pend.next ? 'NEXT TRACK: NOW' : p.b);
    } }, h('span', { class: 'ic' }, p.ic), h('b', {}, p.b), h('small', {}, p.s));
    PE[p.k] = el; return el;
  }));
}
function renderPads() {
  for (const p of PADS) {
    const el = PE[p.k]; if (!el) continue;
    if (p.k === 'stay') { el.classList.toggle('lit', !!pend.stay); continue; }
    el.classList.toggle('pending', !!pend[p.k]);
  }
  for (const L of LAYERS) S[L]?.el.classList.toggle('wait', waiting.includes(L));
}
// the DJ's effects: held (or latched)
let fxHeld = -1;
function renderFx() {
  const st = store.style || 'TRANCE', names = [...PX_COMMON, ...(PX_STYLE[st] || PX_STYLE.TECHNO)];
  $('#fx').replaceChildren(...names.map((n, k) => {
    const el = h('button', { class: 'fxp' + (k >= 12 ? ' style' : ''), title: `${n} : ${PX_HINT[n] || ''}` }, h('small', {}, k >= 12 ? `${k + 1} · ${STYLE_LABEL[st] || st}` : `${k + 1}`), h('b', {}, n));
    const on = async (e) => { e.preventDefault(); await start(); if ($('#latch').checked) { fxSet(fxHeld === k ? -1 : k); return; } el.setPointerCapture?.(e.pointerId); fxSet(k); };
    const off = () => { if (!$('#latch').checked && fxHeld === k) fxSet(-1); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }));
  renderFxOn();
}
function fxSet(k) { fxHeld = k; post({ t: 'fx', k }); renderFxOn(); }
function renderFxOn() { document.querySelectorAll('#fx .fxp').forEach((el, k) => el.classList.toggle('on', k === fxHeld)); }
// the styles
function renderStyles() {
  if (store.style && !STYLES.includes(store.style)) store.style = 'HOUSE';   // (0.3: dubstep became house)
  $('#styles').replaceChildren(...STYLES.map((n) => h('button', { class: 'chip' + ((store.style || 'TRANCE') === n ? ' on' : ''), 'data-s': n, onclick: async () => {
    await start(); post({ t: 'style', style: n });
    if (!playing) { store.style = n; save(); renderStyles(); renderFx(); } else toast(pend.style === n ? `${STYLE_LABEL[n] || n}: NOW` : `${STYLE_LABEL[n] || n} ON THE NEXT PHRASE`);
  } }, STYLE_LABEL[n] || n)));
}
function renderStylesPending() { document.querySelectorAll('#styles .chip').forEach((c) => c.classList.toggle('next', pend.style === c.dataset.s)); }

// ------------------------------------------------------------------------------------------- the sound lab ---
// (web 0.5) build SIREN's sound bank: for each style and layer, the sounds SIREN picks from. Listen, remove, add,
// play it on the deck, then download it or email it (sodwavecontact@gmail.com); load a bank someone sent
const MAIL = 'sodwavecontact@gmail.com';
const LAYER_LAB = { BASS: 'Bass', ARP: 'Arp', HOOK: 'Hook (the lead)', PAD: 'Pad', STAB: 'Stabs', FX: 'FX (risers)' };
const LAYER_ROLES = { BASS: ['BASS', 'ACID'], ARP: ['ARP', 'PIANO'], HOOK: ['LEAD', 'ACID', 'STAB'], PAD: ['PAD', 'VOX'], STAB: ['STAB', 'PIANO'], FX: ['FX'] };
let aStyle = null;
const keyOf = (s) => `${s.bank}/${s.engine}/${s.preset}`;
const curOf = (s) => (s.bank === 'clipper' ? `${s.engine}:${s.preset}` : `${s.bank}/${s.engine}:${s.preset}`);
const bankName = (b) => ({ clipper: 'Clipper', sloop: 'SLOOP', siren: 'SIREN' }[b] || (packIndex.find((x) => x.id === b)?.manifest?.name) || b);
function editCur(fn) { store.cur = JSON.parse(JSON.stringify(curation())); fn(store.cur); save(); renderAtelier(); sendPalette(); }
async function audition(s, L) {
  await start(); await loadBank(s.bank); const x = resolve(s); if (!x) return;
  const base = L === 'BASS' ? 36 : 60;
  post({ t: 'audition', bank: x.bank, e: x.e, p: x.p, notes: L === 'PAD' || L === 'FX' ? [base, null, null, null, null, null, null, null, base + 3, null, null, null, null, null, null, null] : [base, base + 12, base + 7, base + 3, base, null, base + 10, base + 7] });
}
// what changed from SIREN's own bank: per style and layer, the sounds added and removed
function changes() {
  const out = {}, mine = curation();
  for (const st of Object.keys(curData)) for (const L of Object.keys(LAYER_LAB)) {
    const a = new Set((mine[st] || {})[L] || []), b = new Set(curData[st][L] || []);
    const add = [...a].filter((k) => !b.has(k)), rem = [...b].filter((k) => !a.has(k));
    if (add.length || rem.length) ((out[st] ||= {})[L] = { added: add, removed: rem });
  }
  return out;
}
function changesText(max = 1400) {
  const c = changes(), lines = [];
  for (const [st, ls] of Object.entries(c)) for (const [L, d] of Object.entries(ls)) lines.push(`${st} ${L}: ${d.added.map((k) => '+' + k).concat(d.removed.map((k) => '-' + k)).join(', ')}`);
  let t = lines.join('\n') || '(no changes yet)';
  if (t.length > max) t = t.slice(0, max) + '\n... (the rest is in the file)';
  return t;
}
const safeName = () => (($('#lab-name').value || 'anonymous').trim().replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 32) || 'anonymous');
function bankFile() {
  return { siren_bank: 1, name: $('#lab-name').value.trim(), notes: $('#lab-notes').value.trim(), date: new Date().toISOString(), base: CUR_VER, community: !!store.community, changes: changes(), curation: curation() };
}
function downloadBank() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(bankFile(), null, 1)], { type: 'application/json' })), download: `siren-bank-${safeName()}.json` });
  document.body.append(a); a.click(); a.remove();
}
// (web 0.5) send the bank straight to the inbox: FormSubmit (formsubmit.co) relays the form to MAIL, no email app needed
// and no attachment (the bank travels as text). Its first submission ever sends MAIL an activation email to click once.
let sending = false;
async function sendBank() {
  if (sending) return;
  const n = Object.values(changes()).reduce((a, ls) => a + Object.values(ls).reduce((b, d) => b + d.added.length + d.removed.length, 0), 0);
  if (!n && !$('#lab-notes').value.trim()) { toast('CHANGE THE BANK (OR WRITE A NOTE) FIRST'); return; }
  const btn = $('#lab-mail'), name = $('#lab-name').value.trim();
  sending = true; btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await fetch(`https://formsubmit.co/ajax/${MAIL}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: `SIREN sound bank from ${name || 'a SIREN fan'}`, _template: 'box', _captcha: 'false',
        name: name || '-', notes: $('#lab-notes').value.trim() || '-', community_sounds: store.community ? 'yes' : 'no',
        changes: changesText(20000), bank: JSON.stringify(bankFile()) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && String(j.success) === 'true') { setSent('SENT, THANK YOU!'); toast('BANK SENT, THANK YOU!'); }
    else throw new Error(j.message || `HTTP ${r.status}`);
  } catch (e) {
    setSent(''); toast('COULD NOT SEND: DOWNLOAD IT AND EMAIL THE FILE');
    $('#lab-err').hidden = false; $('#lab-err').textContent = `Could not send (${String(e.message || e).slice(0, 120)}). Use Download, then email the file to ${MAIL}.`;
  } finally { sending = false; btn.disabled = false; btn.textContent = 'Send my bank'; }
}
function setSent(t) { const e = $('#lab-sent'); e.textContent = t; e.hidden = !t; if (t) $('#lab-err').hidden = true; }
function pasteBank() {
  const t = prompt('Paste a SIREN bank (the "bank" text from an email, or a .json file\'s content):');
  if (t) loadBankFile(new Blob([t.trim()]));
}
async function copyBank() { try { await navigator.clipboard.writeText(JSON.stringify(bankFile())); toast('BANK COPIED: PASTE IT IN AN EMAIL'); } catch (_) { toast('COULD NOT COPY: USE DOWNLOAD'); } }
function loadBankFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result), cur = j.curation || j;
      if (!cur || typeof cur !== 'object' || !Object.values(cur).every((ls) => ls && typeof ls === 'object')) throw new Error('not a bank');
      store.cur = cur; if (j.community != null) store.community = !!j.community; save();
      $('#community').checked = store.community;
      if (j.name != null) $('#lab-name').value = j.name; if (j.notes != null) $('#lab-notes').value = j.notes;
      renderAtelier(); sendPalette(); toast(`BANK LOADED${j.name ? ': ' + j.name.toUpperCase() : ''}`);
    } catch (_) { toast('THIS FILE IS NOT A SIREN BANK'); }
  };
  r.readAsText(file);
}
function renderAtelier() {
  aStyle ||= store.style || 'TRANCE';
  $('#a-styles').replaceChildren(...Object.keys(curation()).map((n) => h('button', { class: 'chip' + (n === aStyle ? ' on' : ''), onclick: () => { aStyle = n; renderAtelier(); } }, STYLE_LABEL[n] || n)));
  const cur = curation()[aStyle] || {};
  let total = 0;
  const blocks = Object.keys(LAYER_LAB).map((L) => {
    const list = (cur[L] || []).map(curParse).filter((s) => s.fm1 || store.community);
    const have = new Set(list.map(keyOf));
    const cands = LAYER_ROLES[L].flatMap((r) => palData[r] || []).filter((s) => (s.fm1 || store.community) && !have.has(keyOf(s)));
    const seen = new Set(), uniq = cands.filter((s) => !seen.has(keyOf(s)) && seen.add(keyOf(s)));
    total += list.length;
    return h('div', { class: 'lrole' },
      h('h4', { style: { color: COL[L] } }, `${LAYER_LAB[L]} · ${list.length} sound${list.length === 1 ? '' : 's'}`,
        h('select', { title: 'Add a sound to this layer of this style', onchange: (e) => { const s = uniq[+e.target.value]; if (s) editCur((c) => { (c[aStyle][L] ||= []).push(curOf(s)); }); } }, h('option', { value: '' }, `+ add a sound (${uniq.length} more)…`), uniq.map((s, i) => h('option', { value: i }, `${s.preset} · ${s.engine}${s.fm1 ? '' : ' · ' + bankName(s.bank)}`)))),
      h('div', { class: 'sounds' }, list.map((s) => h('div', { class: 'snd-card' },
        h('button', { title: 'Listen (alone)', onclick: () => audition(s, L) }, '▶'),
        h('div', { class: 'nm' }, h('b', {}, s.preset), h('small', {}, `${bankName(s.bank)} · ${s.engine}`), !s.fm1 ? h('span', { class: 'tag' }, 'COMMUNITY') : null),
        h('button', { title: 'Remove from this style', onclick: () => editCur((c) => { c[aStyle][L] = c[aStyle][L].filter((k) => k !== curOf(s)); }) }, '×')))));
  });
  $('#atelier').replaceChildren(...blocks);
  const n = Object.values(changes()).reduce((a, ls) => a + Object.values(ls).reduce((b, d) => b + d.added.length + d.removed.length, 0), 0);
  $('#count').textContent = `${STYLE_LABEL[aStyle] || aStyle}: ${total} sounds · ${n ? `${n} change${n > 1 ? 's' : ''} from SIREN's bank` : 'SIREN\'s own bank'}`;
  $('#lab-changes').textContent = changesText(4000);
}

// ------------------------------------------------------------------------------------------------- the sea ---
// the siren's song: rings from the kick, the mix as a circle that breathes, the notes as sparks on a spiral, the
// whole turning faster as the energy climbs; a build pulls it in, a drop bursts it open
const sea = $('#sea'), g = sea.getContext('2d');
function frame(now) {
  const W = sea.width = innerWidth * devicePixelRatio, H = sea.height = innerHeight * devicePixelRatio;
  const show = document.body.classList.contains('show'), cx = W * 0.5, cy = H * (show ? 0.5 : 0.56), R = Math.min(W, H) * (show ? 0.36 : 0.32), e = info ? info.e / 1000 : 0.2, sec = info ? info.sec : 'INTRO';
  const build = sec === 'BUILD' ? (info.secBar + info.step / 16) / info.secLen : 0;
  g.fillStyle = `rgba(2,5,11,${0.22 + 0.2 * (1 - e)})`; g.fillRect(0, 0, W, H);
  const tide = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.6);
  tide.addColorStop(0, sec === 'BREAK' ? 'rgba(40,124,255,0.10)' : `rgba(25,227,211,${0.05 + 0.08 * e})`); tide.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = tide; g.fillRect(0, 0, W, H);
  for (let i = kicks.length - 1; i >= 0; i--) { const k = kicks[i], t = (now - k.t) / 1400; if (t > 1) { kicks.splice(i, 1); continue; } g.beginPath(); g.arc(cx, cy, R * (0.35 + t * 1.9 * (1 - build * 0.6)), 0, Math.PI * 2); g.strokeStyle = `rgba(242,242,242,${(1 - t) * 0.5 * (0.4 + k.e)})`; g.lineWidth = (1 - t) * 6 * devicePixelRatio; g.stroke(); }
  const spin = now / (4000 - 2800 * e) + build * 6;
  for (let c = 0; c < 4; c++) {
    g.beginPath();
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2 + spin * (c % 2 ? -1 : 1) * (0.3 + 0.2 * c), v = scope[(i * 2) % 512] || 0, rr = R * (0.55 + 0.12 * c) * (1 - build * 0.35) + v * R * (0.35 + 0.25 * e); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = ['#287CFF', '#1ECC70', '#FFC618', '#FF621A'].at(c); g.globalAlpha = 0.35 + 0.4 * e; g.lineWidth = (2 + 2 * e) * devicePixelRatio; g.stroke(); g.globalAlpha = 1;
  }
  for (const s of sparks) { const t = (now - s.t) / 2200; if (t > 1) continue; const a = s.a + t * 2.4 + spin * 0.4, rr = R * (0.4 + t * 1.7); g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (1 - t) * (2 + s.v / 30) * devicePixelRatio, 0, Math.PI * 2); g.fillStyle = COL[s.L]; g.globalAlpha = 1 - t; g.fill(); g.globalAlpha = 1; }
  g.beginPath(); g.arc(cx, cy, R * (0.12 + 0.05 * Math.sin(now / 500)) * (1 + (kicks.length ? 0.15 : 0)), 0, Math.PI * 2); g.fillStyle = sec === 'DROP' && info && info.secBar === 0 ? '#fff' : 'rgba(234,242,255,0.85)'; g.fill();
  if (flash > 0.01) { g.fillStyle = `rgba(234,242,255,${flash * 0.45})`; g.fillRect(0, 0, W, H); flash *= 0.9; }
  // the strips' meters
  for (const L of LAYERS) { const s = S[L]; if (!s) continue; const p = Math.max(peaks[L] || 0, L === 'BASS' ? peaks.SUB || 0 : 0); s.meter.style.width = `${Math.min(100, p * 160)}%`; }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------------------------------------- the start ---
async function main() {
  $('#loadbar').value = 10;
  try { packIndex = await (await fetch('engines/packs/index.json')).json(); } catch (_) { packIndex = []; }
  palData = await (await fetch('data/palette.json')).json();
  curData = await (await fetch('data/curation.json')).json();
  try { levData = await (await fetch('data/levels.json')).json(); } catch (_) { levData = {}; }
  if (store.cur && store.curVer !== CUR_VER) { delete store.cur; store.out = []; }   // (a new selection: an old edit of the old one goes)
  store.curVer = CUR_VER; save();
  kitData = await (await fetch('data/kits.json')).json();
  cats.siren = { e0: 0, engines: [{ name: 'WOB', presets: ['CLASSIC', 'GROWL', 'RIDDIM', 'YOI', 'TEAR', 'REESE'], edit: [] }] };   // (SIREN's own bass engine, worklet.js)
  await loadBank('clipper'); $('#loadbar').value = 60; await loadBank('sloop'); $('#loadbar').value = 90;
  $('#seed').value = store.seed || randomCode();
  buildStrips(); buildDj(); buildPads(); renderStyles(); renderFx(); renderAtelier(); setFocus(focus);
  $('#community').checked = store.community;
  $('#community').addEventListener('change', async (e) => { store.community = e.target.checked; save(); renderAtelier(); if (node) await sendPalette(); });
  $('#export').addEventListener('click', downloadBank);
  $('#lab-mail').addEventListener('click', sendBank); $('#lab-copy').addEventListener('click', copyBank); $('#lab-paste').addEventListener('click', pasteBank);
  $('#lab-load').addEventListener('click', () => $('#lab-file').click()); $('#lab-file').addEventListener('change', (e) => { if (e.target.files[0]) loadBankFile(e.target.files[0]); e.target.value = ''; });
  $('#lab-name').value = store.labName || ''; $('#lab-notes').value = store.labNotes || '';
  $('#lab-name').addEventListener('input', (e) => { store.labName = e.target.value; save(); }); $('#lab-notes').addEventListener('input', (e) => { store.labNotes = e.target.value; save(); });
  for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(`.tabs button[data-tab="${b.dataset.go}"]`).click(); scrollTo(0, 0); });
  $('#resetcur').addEventListener('click', () => { delete store.cur; store.out = []; save(); renderAtelier(); sendPalette(); });
  $('.mixer h3').append(h('button', { class: 'btn ghost', style: { marginLeft: 'auto', padding: '5px 10px' }, title: 'Volumes at 0 dB, filters open, space at 100 %, everything unmuted', onclick: resetTable }, 'Reset mixer'));
  const showOff = () => { document.body.classList.remove('show'); if (document.fullscreenElement) document.exitFullscreen?.(); };
  $('#show').addEventListener('click', () => { document.body.classList.add('show'); document.documentElement.requestFullscreen?.().catch(() => {}); });
  $('#sea').addEventListener('click', showOff); $('#showinfo').addEventListener('click', showOff);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('show'); });
  let starting = false;
  $('#play').addEventListener('click', async () => {
    if (starting) return;                                  // (the first start loads the engines: one click is enough)
    if (!ctx) { starting = true; $('#play').classList.add('wait'); $('#play').firstChild.textContent = '…'; toast('STARTING THE SOUND ENGINES…'); }
    try { await start(); } finally { starting = false; $('#play').classList.remove('wait'); }
    playing = !playing; post({ t: 'play', on: playing });
    $('#play').classList.toggle('on', playing); $('#play').firstChild.textContent = playing ? '■' : '▶';
    if (playing) playStart = performance.now(); else { fxSet(-1); document.querySelectorAll('#beats i').forEach((b) => b.classList.remove('on')); }
  });
  $('#newseed').addEventListener('click', async () => { const c = randomCode(); $('#seed').value = c; store.seed = c; save(); await start(); post({ t: 'seed', code: c, style: store.style || 'TRANCE' }); toast('NEW RAVE'); });
  $('#seed').addEventListener('change', async (e) => { store.seed = e.target.value.toUpperCase(); save(); await start(); post({ t: 'seed', code: store.seed, style: store.style || 'TRANCE' }); });
  $('#copyseed').addEventListener('click', () => { navigator.clipboard?.writeText(`${store.style || 'TRANCE'} · ${$('#seed').value}`); toast('COPIED'); });
  $('#stylelock').checked = !!store.stylelock;
  $('#stylelock').addEventListener('change', (e) => { store.stylelock = e.target.checked; save(); post({ t: 'stylelock', on: e.target.checked }); });
  $('#latch').addEventListener('change', (e) => { $('#fxhint').textContent = e.target.checked ? 'one click turns an effect on, another turns it off' : 'hold it down: the effect lasts as long as you hold'; fxSet(-1); });
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => { for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b); for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab); });
  const help = (on) => { $('#helpbox').hidden = !on; if (!on) { store.helped = true; save(); } };
  $('#help').addEventListener('click', () => help(true)); $('#helpok').addEventListener('click', () => help(false)); $('#helpbox').addEventListener('click', (e) => { if (e.target.id === 'helpbox') help(false); });
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (e.code === 'Space') { e.preventDefault(); $('#play').click(); } if (e.key === 'f') $('#show').click(); if (e.key === 'Escape') { showOff(); help(false); } });
  $('#loading').remove();
  if (!store.helped) help(true);
  requestAnimationFrame(frame);
}
function randomCode() { const B = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let s = crypto.getRandomValues(new Uint32Array(1))[0], o = ''; for (let i = 0; i < 7; i++) { o = B[s & 31] + o; s >>>= 5; } return o.slice(0, 3) + '-' + o.slice(3); }
window.SirenCode = () => randomCode();
main();
