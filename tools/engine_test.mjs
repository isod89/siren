// SPDX-License-Identifier: GPL-3.0-only
// SIREN web: the sound engine (js/brain.js + js/worklet.js) run outside the browser, every style: it plays, nothing
// NaN or stuck, the black keys do what they say (drop at the next bar, fill, key up, next track, stay), the mixer moves
// the sound, every DJ effect plays and lets the set come back, never more than three melodic layers at once.
//   node tools/engine_test.mjs [OUT_DIR]   (OUT_DIR: a WAV of each style's test)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2];
const SR = 44100;
let Proc = null;
const ctx = { sampleRate: SR, console, Math, Float32Array, Uint8Array, Set, Map, WebAssembly, Object, Array, JSON, Number, String };
ctx.globalThis = ctx;
ctx.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => ctx.onmsg?.(m), onmessage: null }; } };
ctx.registerProcessor = (_, c) => { Proc = c; };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/brain.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/worklet.js'), 'utf8'), ctx);

const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const mods = {}, cats = {};
for (const id of ['clipper', 'sloop']) {
  mods[id] = await WebAssembly.compile(fs.readFileSync(path.join(ROOT, `engines/${id}.wasm`)));
  const w = new WebAssembly.Instance(mods[id], {}).exports; w._initialize?.(); w.k_init(0);
  const n = w.k_catalog(); cats[id] = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.k_buffer(), n).slice()));
}
cats.siren = { e0: 0, engines: [{ name: 'WOB', presets: ['CLASSIC', 'GROWL', 'RIDDIM', 'YOI', 'TEAR', 'REESE'], edit: [] }] };
const cur = J('data/curation.json'), kits = J('data/kits.json'), lev = J('data/levels.json');
// (as js/app.js)
const WOB = { ANALOG: ['CUT', 'DTN'], HYBRID: ['CUT', 'M1'], FMX: ['MOD', 'FB'], VOICE: ['VOWL', 'TALK'], DIGITAL: ['IDX', 'FB'], TRIO: ['CUT', 'PW'], JUNO: ['CUT', 'PW'], ACID: ['CUT', 'ENV'], WSEQ: ['CUT', 'RES'], PHASE: ['DCW', 'WAVE2'] };
function resolve(s) {
  const c = cats[s.bank]; if (!c) return null;
  const e = c.engines.findIndex((x) => x.name === s.engine); if (e < 0) return null;
  const p = Math.max(0, c.engines[e].presets.indexOf(s.preset)), ed = c.engines[e].edit;
  const k = ed.findIndex((d) => /^(CUT|CUTOFF|FREQ|TONE|FILTER|BRITE|COLR)$/i.test(d.l)), d = k >= 0 ? ed[k] : null;
  const want = WOB[s.engine] || ['CUT', 'CUTOFF', 'FILTER', 'FREQ'];
  const wob = want.map((l) => ed.findIndex((x) => x.l === l)).filter((i) => i >= 0).slice(0, 2).map((i) => ({ id: c.e0 + i, min: ed[i].min, max: ed[i].max }));
  return { bank: s.bank, e, p, name: s.preset, engine: s.engine, cut: d ? { id: c.e0 + k, min: d.min, max: d.max } : null, wob };
}
const parse = (k) => { const [bank, rest] = k.includes('/') ? [k.split('/')[0], k.slice(k.indexOf('/') + 1)] : ['clipper', k]; const i = rest.indexOf(':'); return { bank, engine: rest.slice(0, i), preset: rest.slice(i + 1) }; };
const CUR = {};
for (const [st, ls] of Object.entries(cur)) { CUR[st] = {}; for (const [L, arr] of Object.entries(ls)) CUR[st][L] = arr.map(parse).map((s) => { const x = resolve(s); if (!x) return null; const c = lev[`${L}|${s.bank}/${s.engine}/${s.preset}`] || {}; return { ...x, trim: c.trim || 0, tone: c.tone || 0 }; }).filter(Boolean); }
const palette = { CUR, DKITS: kits, SYN1: (cats.sloop.kits || []).indexOf('SYN1') };

let fails = 0;
const CHECK = (c, msg) => { if (!c) { console.log('  FAIL: ' + msg); fails++; } };
const STY = ['TECHNO', 'TRANCE', 'PSY', 'ACID', 'RAVE', 'HARD', 'DNB', 'HOUSE'];
for (const style of STY.filter((s) => !process.env.STYLE || s === process.env.STYLE)) {
  let last = null, sounds = null;
  ctx.onmsg = (m) => { if (m.t === 'step') last = m; else if (m.t === 'sounds') sounds = m; };
  const S = new Proc({ processorOptions: { modules: { ...mods } } });
  const send = (m) => S.msg(m);
  send({ t: 'palette', palette }); send({ t: 'stylelock', on: true }); send({ t: 'seed', code: 'W3B-0' + STY.indexOf(style) + 'X5', style });
  send({ t: 'knob', k: 'energy', v: 0.7 }); send({ t: 'play', on: true });
  const L = new Float32Array(128), R = new Float32Array(128), wav = [];
  let peak = 0, worst = 0, sq = 0, cnt = 0, sqh = 0, prev = 0;
  const run = (sec) => {
    const nb = Math.round(sec * SR / 128);
    for (let b = 0; b < nb; b++) {
      S.process([], [[L, R]]);
      let melo = 0; for (const Ly of ['ARP', 'HOOK', 'PAD', 'STAB', 'FX']) { const it = S.inst[Ly]; if (it && S.allowed.has(Ly) && S.offs.some((o) => o.w === it.w)) melo++; }
      worst = Math.max(worst, [...S.allowed].filter((x) => ['ARP', 'HOOK', 'PAD', 'STAB', 'FX'].includes(x)).length);
      for (let i = 0; i < 128; i++) { const a = L[i], c = R[i]; if (!Number.isFinite(a) || !Number.isFinite(c)) { console.log('NaN'); process.exit(1); } peak = Math.max(peak, Math.abs(a)); sq += a * a; sqh += (a - prev) ** 2; prev = a; cnt++; if (OUT) wav.push(a, c); }
    }
  };
  const rms = (sec) => { sq = 0; sqh = 0; cnt = 0; run(sec); return Math.sqrt(sq / cnt); };
  const hfr = (sec) => { rms(sec); return Math.sqrt(sqh / cnt); };
  const bar = () => 60 / S.brain.bpm * 4;
  const toStep = (k) => { let g = 0; do run(128 / SR); while ((!last || last.info.step !== k) && ++g < 2000); };
  const t00 = Date.now(); run(bar() * 12); console.log('12 bars in', Date.now() - t00, 'ms');
  console.log(`web: ${style} (${S.brain.bpm} BPM) ${Object.values(sounds.sounds).join(' / ')}`);
  // DROP
  toStep(5); send({ t: 'black', k: 'drop' }); toStep(0); run(0.01);
  CHECK(last.info.sec === 'DROP', `${style} DROP: ${last.info.sec}`);
  run(bar() * 2);
  // FILL
  send({ t: 'black', k: 'fill' }); let fillSeen = false; for (let i = 0; i < 400 && !(S.fillOn && last.info.step >= 8); i++) run(128 / SR); fillSeen = S.fillOn;
  toStep(1); CHECK(fillSeen && !S.fillOn, `${style} FILL`);
  // KEY UP at the drop
  send({ t: 'black', k: 'break' }); run(bar() * 2); const k0 = S.brain.key; send({ t: 'black', k: 'keyup' }); toStep(5); send({ t: 'black', k: 'drop' }); toStep(0); run(0.01);
  CHECK(S.brain.key === (k0 + 2) % 12, `${style} KEY UP ${k0} -> ${S.brain.key}`);
  // the mixer: the master's low-pass darkens, the space at 0 dries
  const before = hfr(bar() * 2); send({ t: 'mix', what: 'filter', v: -0.6 }); run(0.3); const dark = hfr(bar() * 2); send({ t: 'mix', what: 'filter', v: 0 });
  CHECK(dark < before * 0.5, `${style} K1 FILTER (the highs): ${before.toFixed(3)} -> ${dark.toFixed(3)}`);
  send({ t: 'strip', L: 'HOOK', what: 'vol', v: -12 }); send({ t: 'strip', L: 'ARP', what: 'flt', v: 0.5 }); send({ t: 'mix', what: 'space', v: 0 }); run(bar());
  send({ t: 'strip', L: 'HOOK', what: 'vol', v: 0 }); send({ t: 'strip', L: 'ARP', what: 'flt', v: 0 }); send({ t: 'mix', what: 'space', v: 1 });
  // PRESET, VARIATION
  const was = sounds.sounds.HOOK; send({ t: 'sound', L: 'HOOK', d: 1 }); CHECK(sounds.sounds.HOOK !== was || sounds.n.HOOK < 2, `${style} PRESET hook`);
  send({ t: 'sound', L: 'DRUMS', d: 1 }); send({ t: 'variation', L: 'BASS', d: 1 }); run(bar() * 2);
  // every DJ effect: two bars held, the set back after
  for (let k = 0; k < 16; k++) {
    const pre = rms(bar());
    send({ t: 'fx', k }); const held = rms(bar() * 2); send({ t: 'fx', k: -1 }); run(bar() / 2); const after = rms(bar());
    const name = S.px ? '?' : ctx.SirenBrain && k;
    CHECK(!S.px && S.spd === 1 && S.gate === 1 && !S.crush && !S.held.size && !S.hDall && S.kill.every((x) => x === 1), `${style} fx ${k}: state left`);
    CHECK(after > 0.01 || pre < 0.02, `${style} fx ${k}: the set did not come back (${pre.toFixed(3)} -> ${after.toFixed(3)})`);
    void name; void held;
  }
  // STAY, NEXT
  const at = S.brain.planAt; send({ t: 'black', k: 'stay' }); run(bar() * 40); CHECK(S.brain.planAt === at || S.brain.plan[at][0] === 'BUILD', `${style} STAY`); send({ t: 'black', k: 'stay' });
  const t0 = S.brain.trackNo; send({ t: 'black', k: 'next' }); run(bar() * 9); CHECK(S.brain.trackNo === t0 + 1, `${style} NEXT ${t0} -> ${S.brain.trackNo}`);
  send({ t: 'black', k: 'next' }); send({ t: 'black', k: 'next' }); run(0.3); CHECK(S.brain.trackNo === t0 + 2, `${style} NEXT twice`);
  send({ t: 'focus', L: 'PAD' }); run(bar() * 24);
  CHECK(worst <= 3, `${style}: ${worst} melodic layers at once`);
  console.log(`  peak ${peak.toFixed(2)}, at most ${worst} melodic layers, track ${S.brain.trackNo + 1}`);
  if (OUT) {
    const n = wav.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(wav[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(path.join(OUT, `web-${style}.wav`), buf);
  }
}
console.log(fails ? `web engine: ${fails} FAILED` : 'web engine: ok');
process.exit(fails ? 1 : 0);
