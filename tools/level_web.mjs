// SPDX-License-Identifier: GPL-3.0-only
// SIREN web: each curated sound's calibration in its layer, as the web player plays it (data/levels.json).
// Each sound on its own engine instance (the same WebAssembly as the player), played as its layer plays it (the bass in
// eighths, the arp in sixteenths, the hook a melody, the pad a chord, the stabs off the beat, an FX hit), at its layer's
// level in the mix. Its loudness as the ear weighs it: the energy, its highs (over ~2.8 kHz) counted four times. Too
// bright for its layer: a low-pass (the "tone", Hz) closed step by step until its highs are back in line; then the trim
// (dB) that brings it to its layer's loudness: each layer's median, the arp and the stabs 3 dB under (the hook on top).
//   node tools/level_web.mjs [check]
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FS = 44100, BLOCK = 32;
const MIX = { BASS: 0.85, ARP: 0.42, HOOK: 0.55, PAD: 0.42, STAB: 0.5, FX: 0.38 };
const HFMAX = { BASS: 1.5, ARP: 3, HOOK: 3, PAD: 2, STAB: 3, FX: 6 };
const OFFSET = { BASS: 0, ARP: -3, HOOK: 0, PAD: 0, STAB: -3, FX: 0 };
const TONES = [0, 9000, 7000, 5500, 4500, 3600, 2800, 2200];
const check = process.argv[2] === 'check';

const mod = await WebAssembly.compile(fs.readFileSync(path.join(ROOT, 'engines/clipper.wasm')));
const inst = () => { const w = new WebAssembly.Instance(mod, {}).exports; w._initialize?.(); w.k_init(0); return w; };
const w0 = inst(); const n = w0.k_catalog();
const cat = JSON.parse(new TextDecoder().decode(new Uint8Array(w0.memory.buffer, w0.k_buffer(), n).slice()));
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/curation.json'), 'utf8'));
const old = check ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels.json'), 'utf8')) : {};

// a 12 dB state-variable low-pass (the player's: worklet.js Svf)
function lp(fc) {
  if (!fc) return null;
  const g = Math.tan(Math.PI * Math.min(fc, FS * 0.45) / FS), k = 1.4, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const s = [0, 0];
  return (x) => { const v3 = x - s[1], v1 = a1 * s[0] + a2 * v3, v2 = s[1] + a2 * s[0] + a3 * v3; s[0] = 2 * v1 - s[0]; s[1] = 2 * v2 - s[1]; return v2; };
}
function meas(e, p, L, tone, gain) {
  const w = inst(); w.k_preset(e, p); w.k_render(); w.k_render();
  const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
  const blocks = Math.floor(6 * FS / BLOCK), s16 = Math.floor(FS * 60 / 128 / 4 / BLOCK), f = lp(tone);
  let e2 = 0, h2 = 0, lpz = 0, cnt = 0;
  for (let b = 0; b < blocks; b++) {
    if (b % s16 === 0) {
      const st = b / s16;
      switch (L) {
        case 'BASS': if (st % 2 === 0) { w.k_note(33, 0, 0); w.k_note(33, 100, 1); } else w.k_note(33, 0, 0); break;
        case 'ARP': w.k_note(60 + (st + 3) % 4 * 3, 0, 0); w.k_note(60 + st % 4 * 3, 100, 1); break;
        case 'HOOK': if (st % 2 === 0) { w.k_note(60 + (st / 2 + 3) % 4 * 2, 0, 0); w.k_note(60 + (st / 2) % 4 * 2, 100, 1); } break;
        case 'PAD': if (st % 32 === 0) { for (const k of CH[(st / 32 + 3) % 4]) w.k_note(k - 12, 0, 0); for (const k of CH[(st / 32) % 4].slice(0, 3)) w.k_note(k - 12, 85, 1); } break;
        case 'STAB': if (st % 4 === 2) for (const k of CH[Math.floor(st / 16) % 4].slice(0, 3)) w.k_note(k, 100, 1); if (st % 4 === 3) for (const k of CH[Math.floor(st / 16) % 4].slice(0, 3)) w.k_note(k, 0, 0); break;
        default: if (st % 16 === 0) { w.k_note(60, 0, 0); w.k_note(60, 110, 1); } if (st % 16 === 12) w.k_note(60, 0, 0); break;
      }
    }
    const buf = new Float32Array(w.memory.buffer, w.k_render(), BLOCK * 2);
    if (b > 200) for (let i = 0; i < BLOCK; i++) {
      let x = (buf[2 * i] + buf[2 * i + 1]) * 0.5 * MIX[L] * gain;
      if (f) x = f(x);
      lpz += (x - lpz) * 26 / 64; const h = x - lpz;
      e2 += x * x; h2 += h * h; cnt++;
    }
  }
  return { db: 10 * Math.log10((e2 + 3 * h2) / cnt + 1e-12), hf: h2 / (e2 + 1e-12) * 100 };
}

const todo = new Map();
for (const [st, ls] of Object.entries(cur)) for (const [L, arr] of Object.entries(ls)) for (const k of arr) {
  if (k.includes('/')) continue;                                   // (SIREN's WOB: its own level)
  const i = k.indexOf(':'), engine = k.slice(0, i), preset = k.slice(i + 1);
  const e = cat.engines.findIndex((x) => x.name === engine); if (e < 0) { console.error('no engine', k); continue; }
  const p = cat.engines[e].presets.indexOf(preset); if (p < 0) { console.error('no preset', k); continue; }
  todo.set(`${L}|clipper/${engine}/${preset}`, { L, e, p });
}
const res = {};
for (const [key, { L, e, p }] of todo) {
  if (check) { const c = old[key] || { trim: 0, tone: 0 }; res[key] = { ...meas(e, p, L, c.tone, Math.pow(10, c.trim / 20)), L }; continue; }
  let tone = 0, m = meas(e, p, L, 0, 1);
  const raw = m;
  for (let t = 1; t < TONES.length && m.hf > HFMAX[L]; t++) { tone = TONES[t]; m = meas(e, p, L, tone, 1); }
  res[key] = { L, db: m.db, raw: raw.db, hf: raw.hf, tone };
}
const by = {};
for (const r of Object.values(res)) (by[r.L] ||= []).push(r.db);
const med = Object.fromEntries(Object.entries(by).map(([L, a]) => { a.sort((x, y) => x - y); return [L, a[Math.floor(a.length / 2)]]; }));
if (check) {
  let bad = 0;
  for (const [L, a] of Object.entries(by)) {
    const mean = a.reduce((s, x) => s + x, 0) / a.length, sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length);
    console.log(`${L.padEnd(5)} ${String(a.length).padStart(2)} sounds  mean ${mean.toFixed(1)} dB  spread ${sd.toFixed(1)} dB  (${Math.min(...a).toFixed(1)} .. ${Math.max(...a).toFixed(1)})`);
    for (const x of a) if (Math.abs(x - mean) > 2.5) bad++;
  }
  console.log(bad ? `levels: ${bad} sounds over 2.5 dB from their layer` : 'levels: ok');
  process.exit(bad ? 1 : 0);
}
const out = {};
for (const [key, r] of [...Object.entries(res)].sort()) {
  const trim = Math.max(-14, Math.min(8, med[r.L] + OFFSET[r.L] - r.db));
  out[key] = { trim: Math.round(trim * 10) / 10, tone: r.tone, db: Math.round(r.raw * 10) / 10, hf: Math.round(r.hf * 10) / 10 };
}
fs.writeFileSync(path.join(ROOT, 'data/levels.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`levels: ${Object.keys(out).length} sounds -> data/levels.json; medians`, Object.fromEntries(Object.entries(med).map(([L, v]) => [L, v.toFixed(1)])));
