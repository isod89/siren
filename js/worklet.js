// SPDX-License-Identifier: GPL-3.0-only
// SIREN, the sound: the brain (brain.js, loaded first) asked for each sixteenth, its notes played on the real
// engines of the FM-1's firmwares (WebAssembly: Clipper, SLOOP, the community's), one instance a layer, then the
// mix as SIREN's will be on the machine: the kick's duck on the rest, a tempo delay, a reverb, the master's sweep.
//
// The drums are SIREN's own kits on SLOOP's drum synth, played in three parts (the kick, the body: snares, claps,
// toms; the tops: hats, ride, percussion) so each has its place in the mix: the kick its rumble (techno), the body
// its reverb (the trance clap, the dubstep snare), the tops their pump. The bass can wobble (a tempo-synced LFO on
// its filter and its timbre, its rate switching hit by hit: dubstep, drum & bass), growl (a vowel filter moving with
// the wobble, then drive), and has a sine sub under it.
//
// (web 0.5, as SIREN 0.5 on the FM-1) the hands: the black keys (break, builds, drop, fill, new motifs, key up, next
// track, stay), the DJ's knobs (the master's filter, the energy, the space, the melody), each layer's strip (volume,
// filter, space, its sound, its motif), the DJ's effects (rolls, filters, echo and wash outs, kills, gate, crush, cut,
// brake, half time, rewind, riser, squelch); the mix: each sound calibrated to its layer's loudness and its hard highs
// softened (data/levels.json, tools/level_web.mjs), at most three melodic layers at once (the arrangement).
const BLOCK = 32;
const LAYERS = ['DRUMS', 'BASS', 'ARP', 'HOOK', 'PAD', 'STAB', 'FX'];
const MIX = { DRUMS: [1.0, 0, 0.06, 0], BASS: [0.85, 0, 0, 1], ARP: [0.42, 0.32, 0.25, 1], HOOK: [0.55, 0.28, 0.3, 0.8], PAD: [0.42, 0.05, 0.55, 1], STAB: [0.5, 0.2, 0.3, 0.7], FX: [0.38, 0, 0.45, 0.3] };   // level, delay, reverb, duck
const PAN = { DRUMS: 0, BASS: 0, ARP: -0.25, HOOK: 0.15, PAD: 0, STAB: 0.25, FX: 0 };
const PART_OF = (n) => (n === 36 || n === 35 ? 'KICK' : [38, 39, 40, 37, 43, 48].includes(n) ? 'BODY' : 'TOPS');
const PARTS = ['KICK', 'BODY', 'TOPS'];
// each style's drum mix: the body (snares, claps, toms) and the tops (hats, ride, percussion): level, delay, reverb (, duck)
const DMIX = { TECHNO: { body: [0.9, 0.05, 0.12], tops: [0.8, 0.12, 0.1, 0.25] }, TRANCE: { body: [0.95, 0.06, 0.35], tops: [0.85, 0.1, 0.12, 0.35] }, PSY: { body: [0.8, 0.1, 0.15], tops: [0.85, 0.18, 0.08, 0.2] }, ACID: { body: [0.95, 0.04, 0.1], tops: [0.85, 0.06, 0.06, 0.2] }, RAVE: { body: [1, 0.04, 0.18], tops: [0.85, 0.08, 0.1, 0.15] }, HARD: { body: [0.95, 0.04, 0.2], tops: [0.8, 0.08, 0.1, 0.3] }, DNB: { body: [1, 0.05, 0.16], tops: [0.85, 0.08, 0.08, 0.2] }, HOUSE: { body: [1, 0.05, 0.22], tops: [0.85, 0.08, 0.1, 0.3] } };
const RATE_SHAPES = ['sine', 'saw', 'square', 'tri'];

// a small Freeverb: 4 combs and 2 all-passes a side
class Verb {
  constructor(room = 0.84, damp = 0.3) { const c = [1116, 1188, 1277, 1356], a = [556, 441]; this.c = [c, c.map((x) => x + 23)].map((s) => s.map((n) => ({ b: new Float32Array(n), i: 0, f: 0 }))); this.a = [a, a.map((x) => x + 23)].map((s) => s.map((n) => ({ b: new Float32Array(n), i: 0 }))); this.room = room; this.damp = damp; }
  run(x, ch) { let o = 0; for (const c of this.c[ch]) { const y = c.b[c.i]; c.f = y * (1 - this.damp) + c.f * this.damp; c.b[c.i] = x + c.f * this.room; c.i = (c.i + 1) % c.b.length; o += y; } for (const a of this.a[ch]) { const y = a.b[a.i]; a.b[a.i] = o + y * 0.5; a.i = (a.i + 1) % a.b.length; o = y - o * 0.5; } return o * 0.25; }
}
// a state-variable band-pass (Chamberlin), for the growl's two formants
class BP { constructor() { this.l = 0; this.b = 0; this.f = 0.1; this.q = 0.25; } set(hz) { this.f = 2 * Math.sin(Math.PI * Math.min(hz, 6000) / sampleRate); } run(x) { const h = x - this.l - this.q * this.b; this.b += this.f * h; this.l += this.f * this.b; return this.b; } }
// the wobble's shapes, 0..1 over a cycle
const SHAPE = { sine: (p) => 0.5 - 0.5 * Math.cos(2 * Math.PI * p), saw: (p) => 1 - p, square: (p) => (p < 0.5 ? 1 : 0.08), tri: (p) => (p < 0.5 ? 2 * p : 2 - 2 * p) };

// ---- WOB: SIREN's own bass engine, for dubstep (and the reese of drum & bass). The firmwares' wobble sounds wobble
// on their own clock; a dubstep riff needs its wobble locked to the tempo and changing rate hit by hit, and a growl.
// One voice: two detuned saws, a square, an FM pair (its index on the LFO: the tear), a 24 dB low-pass (its cutoff on
// the LFO: the wobble), two formants moving with it (the vowel: the growl, the 'yoi'), a wavefolder and drive. The
// LFO is the brain's: rate, shape and depth for each hit. Written plainly (no allocation, float math) for the C port.
const WOB_PRESETS = {
  CLASSIC: { saw: 1, det: 8, sq: 0.35, fm: 0, ratio: 1, iLo: 0, iHi: 0, lo: 110, hi: 3600, res: 0.6, form: 0, vA: [450, 800], vB: [800, 1150], fold: 0, drive: 1.6 },
  GROWL: { saw: 0.6, det: 6, sq: 0, fm: 1, ratio: 1, iLo: 0.4, iHi: 4, lo: 280, hi: 4200, res: 0.35, form: 0.85, vA: [450, 800], vB: [800, 1150], fold: 0.2, drive: 3 },
  RIDDIM: { saw: 0.3, det: 4, sq: 1, fm: 0, ratio: 1, iLo: 0, iHi: 0, lo: 140, hi: 2400, res: 0.72, form: 0.3, vA: [400, 700], vB: [700, 1100], fold: 0, drive: 4 },
  YOI: { saw: 1, det: 14, sq: 0, fm: 0.6, ratio: 2, iLo: 0.2, iHi: 1.6, lo: 380, hi: 5200, res: 0.3, form: 1, vA: [325, 700], vB: [270, 2300], fold: 0.1, drive: 2 },
  TEAR: { saw: 0.4, det: 10, sq: 0, fm: 1, ratio: 1.5, iLo: 1, iHi: 8, lo: 700, hi: 7000, res: 0.25, form: 0.4, vA: [500, 1000], vB: [700, 1800], fold: 0.6, drive: 3 },
  REESE: { saw: 1, det: 24, sq: 0, fm: 0, ratio: 1, iLo: 0, iHi: 0, lo: 180, hi: 1900, res: 0.2, form: 0, vA: [450, 800], vB: [800, 1150], fold: 0, drive: 1.5 },
};
const WOB_NAMES = Object.keys(WOB_PRESETS);
class Wob {
  constructor() { this.buf = new Float32Array(BLOCK * 2); this.memory = { buffer: this.buf.buffer }; this.P = WOB_PRESETS.CLASSIC; this.k_panic(); }
  k_panic() { this.ph = [0, 0, 0, 0]; this.f = 55; this.ft = 55; this.env = 0; this.gate = 0; this.n = -1; this.vel = 1; this.s = [0, 0, 0, 0]; this.fo = [0, 0, 0, 0]; this.t = 0; this.lfo = null; }
  k_preset(_, p) { this.P = WOB_PRESETS[WOB_NAMES[p]] || WOB_PRESETS.CLASSIC; }
  k_note(n, v, on) {
    if (on && v > 0) { const f = 440 * Math.pow(2, (n - 69) / 12); if (this.gate > 0 && this.env > 0.05) this.ft = f; else { this.f = this.ft = f; } this.n = n; this.gate = 1; this.vel = v / 127; }
    else if (n === this.n) this.gate = 0;
  }
  k_render() {
    const P = this.P, out = this.buf, L = this.lfo;
    let v = 0.6;
    if (L) { const p = (L.t / (L.spb * L.rate)) % 1; v = (SHAPE[L.shape] || SHAPE.sine)(p); v = 0.3 + (v - 0.3) * (L.depth ?? 1); L.t += BLOCK; }
    v = Math.max(0, Math.min(1, v));
    const fc = Math.min(7000, P.lo * Math.pow(P.hi / P.lo, v)), g = 2 * Math.sin(Math.PI * fc / sampleRate), q = 2 - 1.85 * P.res;
    const idx = P.iLo + (P.iHi - P.iLo) * v, fa = P.vA[0] + (P.vB[0] - P.vA[0]) * v, fb = P.vA[1] + (P.vB[1] - P.vA[1]) * v;
    const g1 = 2 * Math.sin(Math.PI * fa / sampleRate), g2 = 2 * Math.sin(Math.PI * fb / sampleRate), dt = Math.pow(2, P.det / 1200);
    for (let i = 0; i < BLOCK; i++) {
      this.f += (this.ft - this.f) * 0.004;                                  // (the slide)
      this.env += ((this.gate ? this.vel : 0) - this.env) * (this.gate ? 0.02 : 0.004);
      const w = this.f / sampleRate, ph = this.ph;
      ph[0] = (ph[0] + w * dt) % 1; ph[1] = (ph[1] + w / dt) % 1; ph[2] = (ph[2] + w) % 1; ph[3] = (ph[3] + w * P.ratio) % 1;
      const mod = P.fm ? Math.sin(2 * Math.PI * ph[3]) * idx : 0;
      let x = P.saw * (((ph[0] + mod * 0.08) % 1) * 2 - 1 + (ph[1] * 2 - 1)) * 0.5 + P.sq * (ph[2] < 0.5 ? 0.6 : -0.6);
      if (P.fm) x = x * (1 - 0.5 * P.fm) + Math.sin(2 * Math.PI * ph[2] + mod) * 0.7 * P.fm;
      // the 24 dB low-pass: two state-variable stages
      const s = this.s;
      let h = x - s[0] - q * s[1]; s[1] += g * h; s[0] += g * s[1];
      h = s[0] - s[2] - q * s[3]; s[3] += g * h; s[2] += g * s[3]; x = s[2];
      // the vowel: two band-passes
      if (P.form) { const o = this.fo; let hh = x - o[0] - 0.22 * o[1]; o[1] += g1 * hh; o[0] += g1 * o[1]; hh = x - o[2] - 0.22 * o[3]; o[3] += g2 * hh; o[2] += g2 * o[3]; x = x * (1 - 0.6 * P.form) + (o[1] * 1.4 + o[3] * 1.1) * P.form; }
      if (P.fold) x = Math.sin(x * (1 + 4 * P.fold) * 1.5) * 0.8 + x * 0.2;
      x = Math.tanh(x * P.drive) * 0.34 * this.env;
      out[2 * i] = x; out[2 * i + 1] = x;
    }
    return 0;
  }
}

// ---- (web 0.5) the mixer's filters: a 12 dB state-variable filter (Cytomic's trapezoidal), low-pass or high-pass
class Svf {
  constructor() { this.s = [0, 0, 0, 0]; this.fc = 0; this.hp = false; }
  set(fc, hp) {
    if (fc === this.fc && hp === this.hp) return;
    this.fc = fc; this.hp = hp;
    const g = Math.tan(Math.PI * Math.min(fc, sampleRate * 0.45) / sampleRate), k = 1.4;
    this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; this.k = k;
  }
  run(x, ch) {
    const s = this.s, o = ch * 2, v3 = x - s[o + 1], v1 = this.a1 * s[o] + this.a2 * v3, v2 = s[o + 1] + this.a2 * s[o] + this.a3 * v3;
    s[o] = 2 * v1 - s[o]; s[o + 1] = 2 * v2 - s[o + 1];
    return this.hp ? x - this.k * v1 - v2 : v2;
  }
  reset() { this.s.fill(0); }
}
// a knob's filter value (-1 .. 1: left a low-pass closing, right a high-pass opening, 0 open) -> [low-pass Hz, high-pass Hz]
const LP_OPEN = 19000;
const fv = (v) => (v < -0.01 ? [LP_OPEN * Math.pow(70 / LP_OPEN, -v), 0] : v > 0.01 ? [0, 20 * Math.pow(300, v)] : [0, 0]);

// ---- (web 0.5) the DJ's effects (hold an effect pad): the firmware's (siren.c SIREN_PX), keys 1-12 the same in every
// style, 13-16 the style's own
const PX_COMMON = [['ROLL', 4, 'ROLL 1/4'], ['ROLL', 2, 'ROLL 1/8'], ['ROLL', 1, 'ROLL 1/16'], ['ROLL', 0, 'ROLL 1/32'], ['LOW', 0, 'LOW PASS'], ['HIGH', 0, 'HIGH PASS'], ['ECHO', 0, 'ECHO OUT'], ['WASH', 0, 'WASH OUT'], ['KLOW', 0, 'KILL LOW'], ['KMID', 0, 'KILL MID'], ['KHIGH', 0, 'KILL HIGH'], ['GATE', 0, 'GATE']];
const PX_STYLE = {
  TECHNO: [['DUB', 0, 'DUB ECHO'], ['CRUSH', 0, 'CRUSH'], ['STRIP', 0, 'KICK+BASS'], ['CUT', 0, 'CUT']],
  TRANCE: [['RISER', 0, 'RISER'], ['PROLL', 1, 'PITCH ROLL'], ['DUB', 0, 'DUB ECHO'], ['CUT', 0, 'CUT']],
  PSY: [['DUB', 0, 'DUB ECHO'], ['SQUELCH', 0, 'SQUELCH'], ['PROLL', 1, 'PITCH ROLL'], ['CRUSH', 0, 'CRUSH']],
  ACID: [['SQUELCH', 0, 'SQUELCH'], ['DUB', 0, 'DUB ECHO'], ['CRUSH', 0, 'CRUSH'], ['CUT', 0, 'CUT']],
  RAVE: [['PROLL', 1, 'PITCH ROLL'], ['BRAKE', 0, 'BRAKE'], ['CRUSH', 0, 'CRUSH'], ['RISER', 0, 'RISER']],
  HARD: [['CRUSH', 0, 'CRUSH'], ['STRIP', 0, 'KICK+BASS'], ['PROLL', 1, 'PITCH ROLL'], ['CUT', 0, 'CUT']],
  DNB: [['REWIND', 0, 'REWIND'], ['HALF', 0, 'HALF TIME'], ['DROLL', 1, 'DRUM ROLL'], ['CRUSH', 0, 'CRUSH']],
  HOUSE: [['STRIP', 0, 'KICK+BASS'], ['DUB', 0, 'DUB ECHO'], ['DROLL', 1, 'DRUM ROLL'], ['CUT', 0, 'CUT']],
};
const pxOf = (style, k) => (k < 12 ? PX_COMMON[k] : (PX_STYLE[style] || PX_STYLE.TECHNO)[k - 12]);
const MELO = ['ARP', 'HOOK', 'PAD', 'STAB', 'FX'];
const ALL_BUT_DRUMS = ['BASS', 'SUB', ...MELO];
const DRUM_LO = (n) => n === 35 || n === 36;
const DRUM_HI = (n) => [42, 46, 49, 51, 70, 56, 75].includes(n);
// (web 0.5) the arrangement: at most three melodic layers at once, the ones the section needs most (siren.c SIREN_PRI)
const PRI = { INTRO: ['PAD', 'ARP', 'HOOK', 'FX', 'STAB'], GROOVE: ['ARP', 'HOOK', 'STAB', 'PAD', 'FX'], BUILD: ['FX', 'ARP', 'PAD', 'HOOK', 'STAB'], DROP: ['HOOK', 'STAB', 'ARP', 'PAD', 'FX'], BREAK: ['PAD', 'HOOK', 'ARP', 'FX', 'STAB'], PEAK: ['HOOK', 'ARP', 'STAB', 'PAD', 'FX'], OUTRO: ['PAD', 'ARP', 'HOOK', 'STAB', 'FX'] };
const FILL = [38, 48, 38, 43, 38, 45, 38, 41];           // the fill's second half bar: snare, toms (high to low)

class Siren extends AudioWorkletProcessor {
  constructor(opt) {
    super();
    this.mods = opt.processorOptions.modules;
    this.brain = new globalThis.SirenBrain.Brain();
    this.inst = {};                                    // layer -> { w, bank, e, p, cut }
    this.dr = null; this.drSound = null;               // the drums: { KICK, BODY, TOPS } instances
    this.offs = [];                                    // { L, n, at, w } note-offs (samples left)
    this.playing = false; this.until = 0;
    this.dl = [new Float32Array(sampleRate * 2), new Float32Array(sampleRate * 2)]; this.dw = 0;
    this.verb = new Verb(); this.rum = new Verb(0.93, 0.55); this.rumZ = [0, 0, 0, 0];
    this.duckEnv = 0; this.hp = 0; this.verbAmt = 0.25; this.duckAmt = 0.7; this.gain = 0.8; this.gainT = 0.8;
    this.wob = null; this.f1 = new BP(); this.f2 = new BP(); this.subV = { f: 55, ph: 0, env: 0, gate: 0, n: -1 };
    this.peaks = {}; this.scope = new Float32Array(1024); this.sw = 0; this.sinceScope = 0;
    this.mute = {};
    // (web 0.5) the hands on the mix: the master's filter and space; each layer's strip; the layer in the hands
    this.mFilt = 0; this.mSpace = 1; this.vol = {}; this.flt = {}; this.space = {}; this.focus = 'HOOK';
    this.fl = {}; for (const L of [...LAYERS, 'BODY', 'TOPS']) this.fl[L] = { lp: new Svf(), hp: new Svf(), v: 0 };
    this.mlp = new Svf(); this.mhp = new Svf(); this.mfv = 0;
    // the arrangement, the fill, the next track and the style to come (on the phrase), the clock's sixteenths
    this.allowed = new Set(['DRUMS', 'BASS', 'SUB']); this.lastNote = {}; this.n16 = 0;
    this.fillReq = false; this.fillOn = false; this.qNext = 0; this.qStyle = null; this.qNow = false;
    // the DJ's effects: the one held, the notes as written (the rolls), what is held back, the master's effects
    this.px = null; this.hist = []; this.loop = null;
    this.held = new Set(); this.hDlo = false; this.hDhi = false; this.hDall = false;
    this.kill = [1, 1, 1]; this.klp = new Svf(); this.khp = new Svf(); this.klp.set(250, false); this.khp.set(3000, true);
    this.spd = 1; this.gate = 1; this.crush = 0; this.chold = [0, 0]; this.cn = 0;
    this.nz = 0; this.nzLvl = 0; this.nzA = 0; this.nzB = 0;
    this.ring = [new Float32Array(sampleRate * 4), new Float32Array(sampleRate * 4)]; this.rw = 0; this.vs = null; this.vsMix = 0;
    this.port.onmessage = (e) => this.msg(e.data);
  }
  msg(m) {
    const b = this.brain;
    switch (m.t) {
      case 'module': this.mods[m.bank] = m.m; break;
      case 'palette': this.syn1 = m.palette.SYN1; this.pal = m.palette; b.setPalette(m.palette); this.syncSounds(); break;
      case 'play': this.playing = !!m.on; if (!this.playing) { this.pxEnd(); this.allOff(); } else this.until = 0; break;
      case 'knob': b.knobs[m.k] = Math.round(m.v * 1000); if (m.k === 'density') b.motifs(); break;
      case 'seed': this.pxEnd(); this.allOff(); this.qStyle = null; b.setSeed(m.code, m.style); this.syncSounds(); break;
      case 'stylelock': b.styleLock = !!m.on; break;
      case 'style':                                    // playing: on the next phrase, as a DJ mixes (the same again: now)
        if (!this.playing) { this.allOff(); b.setSeed(b.seed, m.style); this.syncSounds(); this.qStyle = null; }
        else if (this.qStyle === m.style) this.qNow = true;
        else { this.qStyle = m.style; this.qNow = false; }
        break;
      case 'black': this.black(m.k); break;
      case 'mix': if (m.what === 'filter') this.mFilt = m.v; else this.mSpace = m.v; break;
      case 'strip': (m.what === 'vol' ? this.vol : m.what === 'flt' ? this.flt : this.space)[m.L] = m.v; break;
      case 'variation': b.remotif(m.L, m.d || 1); break;
      case 'sound': this.soundStep(m.L, m.d); break;
      case 'focus': this.focus = m.L; this.arrange(); break;
      case 'lock': b.lock(m.L, m.on); break;
      case 'reroll': b.reroll(m.L); this.syncSounds(); break;
      case 'mute': this.mute[m.L] = !!m.on; if (m.on) this.partsOff([m.L]); this.arrange(); break;
      case 'fx': if (m.k < 0) this.pxEnd(); else this.pxStart(m.k); break;
      case 'audition': this.audition(m); break;
    }
  }
  // (web 0.5) the black keys: the composition
  black(k) {
    const b = this.brain;
    switch (k) {
      case 'break': b.breakReq = true; break;
      case 'dive4': b.dive = 4; break;
      case 'dive16': b.dive = 16; break;
      case 'drop': b.dropReq = true; break;
      case 'fill': this.fillReq = true; break;
      case 'melody': b.remotif('HOOK', 1); b.remotif('ARP', 1); break;
      case 'bass': b.remotif('BASS', 1); break;
      case 'groove': b.remotif('DRUMS', 1); break;
      case 'keyup': b.keyReq = true; break;
      case 'next': this.qNext = this.qNext ? 2 : 1; break;
      case 'stay': b.stay = !b.stay; break;
    }
  }
  // (web 0.5) PRESET: a layer's next or previous sound in the style's selection (the drums: the kit), kept from then on
  soundStep(L, d) {
    const b = this.brain, p = this.pal; if (!p || !b.sounds) return;
    if (L === 'DRUMS') {
      const kits = (p.DKITS && p.DKITS[b.style]) || []; if (!kits.length) return;
      b.kitPick = ((b.soundIdx.DRUMS || 0) + d + kits.length * 4) % kits.length; b.pickSounds(); this.syncSounds(); return;
    }
    const pool = (p.CUR && p.CUR[b.style] && p.CUR[b.style][L]) || []; if (!pool.length) return;
    const i = ((b.soundIdx[L] || 0) + d + pool.length * 4) % pool.length;
    b.sounds[L] = pool[i]; b.soundIdx[L] = i; b.locks[L] = true; b.soundsChanged = true; this.syncSounds();
  }
  make(bank, drums) { if (bank === 'siren') return new Wob(); const w = new WebAssembly.Instance(this.mods[bank], {}).exports; w._initialize?.(); w.k_init(drums ? 1 : 0); return w; }
  // the drums: the kit's 16 sounds written into SLOOP's first user kit (SYN1) of each part, the kick at its pitch
  setDrums(s) {
    if (!this.mods.sloop || !s.kitData) return;
    if (!this.dr) this.dr = Object.fromEntries(PARTS.map((P) => [P, { w: this.make('sloop', 1) }]));
    const K = s.kitData, retune = (v, n16) => { if (!n16) return v; v = v.slice(); v[2] = n16 >> 4; v[3] = n16 & 15; return v; };
    const lanes = K.lanes.map((v, i) => (i === 0 ? retune(v, s.kickN16) : i === 14 ? retune(v, s.kick2N16) : v));
    for (const P of PARTS) {
      const w = this.dr[P].w; w.k_panic();
      const base = w.k_dsu(), mem = new Uint8Array(w.memory.buffer), o = base + 8;
      mem.fill(0, o, o + 364); for (let i = 0; i < Math.min(8, K.name.length); i++) mem[o + i] = K.name.charCodeAt(i);
      mem[o + 8] = K.crush; lanes.forEach((v, i) => mem.set(v, o + 12 + i * 22)); w.k_dsu_fix();
      w.k_kit(this.syn1 ?? 42);
    }
    this.drSound = s; this.drMix = DMIX[this.brain.style] || DMIX.TECHNO;
  }
  // the instance a sound plays on: a new one when its bank changes
  setSound(L, s) {
    if (L === 'DRUMS') { this.setDrums(s); return; }
    let it = this.inst[L];
    const bank = s && s.bank;
    if (!bank || (!this.mods[bank] && bank !== 'siren')) return;
    if (!it || it.bank !== bank) it = this.inst[L] = { w: this.make(bank, 0), bank };
    else it.w.k_panic();
    it.w.k_preset(s.e, s.p); it.w.k_render(); it.w.k_render();
    it.cut = bank === 'siren' ? null : s.cut; it.cutBase = it.cut ? it.w.k_get(s.cut.id) : 0;
    it.wobT = bank === 'siren' ? [] : (s.wob || []).map((d) => ({ ...d, base: it.w.k_get(d.id) }));
    it.trim = Math.pow(10, (s.trim || 0) / 20); it.tone = s.tone || 0;     // (web 0.5) its calibration in its layer
    it.sound = s;
  }
  syncSounds() {
    const b = this.brain; if (!b.sounds) return;
    for (const L of LAYERS) { const s = b.sounds[L]; if (s && (L === 'DRUMS' ? this.drSound !== s : (!this.inst[L] || this.inst[L].sound !== s))) this.setSound(L, s); }
    b.soundsChanged = false;
    const p = this.pal, cur = (p && p.CUR && p.CUR[b.style]) || {};
    this.port.postMessage({ t: 'sounds', sounds: Object.fromEntries(LAYERS.map((L) => [L, b.sounds[L] ? (b.sounds[L].name || b.sounds[L].kit) : '-'])),
      engines: Object.fromEntries(LAYERS.map((L) => [L, b.sounds[L] ? (b.sounds[L].engine || 'KIT') : ''])),
      idx: { ...b.soundIdx }, n: Object.fromEntries(LAYERS.map((L) => [L, L === 'DRUMS' ? ((p && p.DKITS && p.DKITS[b.style]) || []).length : (cur[L] || []).length])), locks: { ...b.locks } });
  }
  audition(m) {                                        // the palette workshop: one sound, alone, a phrase
    const it = this.aud || (this.aud = {});
    if (!this.mods[m.bank] && m.bank !== 'siren') return;
    if (it.bank !== m.bank) { it.w = this.make(m.bank, 0); it.bank = m.bank; }
    it.w.k_panic(); it.w.k_preset(m.e, m.p); it.w.k_render(); it.w.k_render();
    it.seq = m.notes; it.t = 0; it.on = true; it.k = 0;
  }
  allOff() { for (const o of this.offs) if (o.w) o.w.k_note(o.n, 0, 0); this.offs = []; for (const L in this.inst) this.inst[L].w.k_panic(); if (this.dr) for (const P of PARTS) this.dr[P].w.k_panic(); this.subV.gate = 0; this.wob = null; }
  partsOff(layers) {
    for (const L of layers) {
      if (L === 'SUB') this.subV.gate = 0;
      else if (L === 'DRUMS') { if (this.dr) for (const P of PARTS) this.dr[P].w.k_panic(); }
      else if (this.inst[L]) { this.inst[L].w.k_panic(); this.offs = this.offs.filter((o) => o.w !== this.inst[L].w); }
      if (L === 'BASS') this.subV.gate = 0;
    }
  }
  // (web 0.5) the arrangement: the section's priorities among the layers the brain wrote for in the last eight bars
  arrange() {
    const sec = this.sec || 'GROOVE', a = new Set(['DRUMS', 'BASS', 'SUB']);
    let n = 0;
    if (MELO.includes(this.focus) && !this.mute[this.focus]) { a.add(this.focus); n++; }
    for (const L of PRI[sec] || PRI.GROOVE) {
      if (n >= 3) break;
      if (a.has(L) || this.mute[L] || !this.wrote(L)) continue;
      a.add(L); n++;
    }
    const gone = MELO.filter((L) => this.allowed.has(L) && !a.has(L));
    if (gone.length) this.partsOff(gone);
    this.allowed = a;
  }
  wrote(L) { return this.lastNote[L] != null && this.n16 - this.lastNote[L] <= 128; }
  heldBack(L, n) { if (this.held.has(L)) return true; return L === 'DRUMS' && (this.hDall || (this.hDlo && DRUM_LO(n)) || (this.hDhi && DRUM_HI(n))); }
  play(L, n, v, len, tr) {
    if (this.mute[L === 'SUB' ? 'BASS' : L]) return;
    if (MELO.includes(L) && !this.allowed.has(L)) return;
    const spb = sampleRate * 60 / this.brain.bpm / 4;
    if (L === 'SUB') { this.subV.f = 440 * Math.pow(2, (n + tr - 69) / 12); this.subV.gate = v / 110; this.subV.n = n; this.offs.push({ sub: true, n, at: Math.max(1, len * spb * 0.92) }); return; }
    const w = L === 'DRUMS' ? this.dr && this.dr[PART_OF(n)].w : this.inst[L] && this.inst[L].w;
    if (!w) return;
    if (L !== 'DRUMS') n = Math.max(0, Math.min(127, n + tr));
    if (L === 'DRUMS' && n === 36) this.duckEnv = 1;
    if (L !== 'DRUMS') for (const o of this.offs) if (o.w === w && o.n === n) { w.k_note(n, 0, 0); o.at = -1e9; }   // (a note again: the last one ends)
    w.k_note(n, v, 1);
    this.offs.push({ w, n, at: Math.max(1, len * spb * (L === 'DRUMS' ? 0.5 : 0.92)) });
  }
  // ---- (web 0.5) the DJ's effects
  pxStart(k) {
    this.pxEnd();
    const [fx, arg, name] = pxOf(this.brain.style, k);
    const P = this.px = { fx, arg, name, k, n16: 0, u: 0 };
    switch (fx) {
      case 'ROLL': case 'PROLL': case 'DROLL': {
        const L = arg || 1, cur = this.n16 ? this.n16 - 1 : 0;
        P.len = L; P.r32 = arg === 0; P.d0 = cur - (cur % 4); P.on = false; P.rep = 0; P.mask = fx === 'DROLL' ? new Set(['DRUMS']) : null;
        if (P.d0 >= 4 && P.d0 + L <= this.n16) {          // (nothing in it as written: the beat before, if it had)
          let here = 0, before = 0;
          for (let j = 0; j < L; j++) { here += (this.hist[(P.d0 + j) % 8] || []).length; before += (this.hist[(P.d0 - 4 + j) % 8] || []).length; }
          if (!here && before) P.d0 -= 4;
        }
        break;
      }
      case 'KLOW': this.kill[0] = 0; this.hold(['BASS', 'SUB']); this.hDlo = true; break;
      case 'KMID': this.kill[1] = 0.1; this.hold(MELO); break;
      case 'KHIGH': this.kill[2] = 0; this.hDhi = true; break;
      case 'CRUSH': this.crush = 1; break;
      case 'STRIP': this.hold(MELO); this.hDhi = true; break;
      case 'CUT': this.hold(ALL_BUT_DRUMS); this.hDall = true; this.allOff(); break;
      case 'HALF': this.spd = 0.5; break;
      case 'BRAKE': this.vs = { rp: this.rw - 1, rate: 1, mode: 'brake' }; break;
      case 'REWIND': this.vs = { rp: this.rw - 1, rate: -2.6, mode: 'rewind' }; break;
    }
  }
  hold(layers) { for (const L of layers) this.held.add(L); this.partsOff(layers.filter((L) => L !== 'DRUMS')); }
  pxEnd() {
    const P = this.px; if (!P) return;
    this.px = null;
    this.held.clear(); this.hDlo = this.hDhi = this.hDall = false;
    this.kill = [1, 1, 1]; this.spd = 1; this.gate = 1; this.crush = 0; this.nzLvl = 0; this.loop = null;
    this.vs = null;                                      // (back to the live mix: a short crossfade from where the tape was)
    if (P.fx === 'SQUELCH') for (const L of ['BASS', 'ARP', 'HOOK']) { const it = this.inst[L]; if (it && it.cut) it.w.k_param(it.cut.id, it.cutBase); }
    if (P.fx === 'REWIND') { const b = this.brain; this.allOff(); b.secBar = 0; b.phraseBar = 0; b.step = 0; this.until = 0; }
  }
  // the effects that move, each block (u: samples since it began)
  pxBlock(m) {
    const P = this.px; if (!P) return;
    P.u += m;
    const spb = sampleRate * 60 / this.brain.bpm / 4, t16 = P.u / spb, bar = t16 / 16;
    switch (P.fx) {
      case 'LOW': P.f = -(0.2 + 0.75 * Math.min(1, bar / 2)); break;
      case 'HIGH': P.f = 0.2 + 0.65 * Math.min(1, bar / 2); break;
      case 'PROLL': P.f = Math.min(0.7, (P.rep || 0) * 0.05); break;
      case 'RISER': this.nzLvl = Math.min(1, bar / 4); P.f = Math.min(0.5, bar / 8); break;
      case 'WASH': P.f = 0.3; break;
      case 'GATE': { const into = spb - Math.max(0, this.until); this.gate = into < spb / 2 ? 1 : 0.08; break; }
      case 'SQUELCH': {
        const w = (P.u % (spb * 8)) / (spb * 8), tri = w < 0.5 ? w * 2 : 2 - w * 2;
        for (const L of ['BASS', 'ARP', 'HOOK']) { const it = this.inst[L]; if (it && it.cut) it.w.k_param(it.cut.id, Math.round(it.cut.min + (it.cut.max - it.cut.min) * (0.12 + 0.7 * tri))); }
        break;
      }
      case 'BRAKE': this.vs.rate = Math.max(0, 1 - t16 / 4); this.spd = this.vs.rate; if (this.vs.rate <= 0 && !this.hDall) { this.hold(ALL_BUT_DRUMS); this.hDall = true; this.allOff(); } break;
      case 'REWIND': { const left = Math.max(0, 1 - t16 / 2); this.vs.rate = -2.6 * left; this.nzLvl = left * 0.7; this.spd = 0; if (!left && !this.hDall) { this.hold(ALL_BUT_DRUMS); this.hDall = true; this.allOff(); } break; }
    }
  }
  // a roll's sixteenth: the loop's notes again (the layers it holds)
  replay(k) {
    const P = this.px, tr = P.fx === 'PROLL' ? Math.min(12, P.rep) : 0;
    for (const [L, n, v, len] of this.loop[k] || []) if (!P.mask || P.mask.has(L)) this.play(L, n, v, P.r32 ? 0.45 : Math.min(len, P.len), tr);
    P.rep++;
  }
  fire() {
    const b = this.brain;
    if (b.step === 0 && b.phraseBar === 0 || this.qNow || this.qNext === 2) {   // on the phrase: the style asked for, the next track
      if (this.qStyle && (this.qNow || (b.step === 0 && b.phraseBar === 0))) { const st = this.qStyle; this.qStyle = null; this.qNow = false; this.pxEnd(); this.allOff(); b.setSeed(b.seed, st); this.syncSounds(); }
      else if (this.qNext && (this.qNext === 2 || (b.step === 0 && b.phraseBar === 0))) { this.qNext = 0; this.fillOn = false; this.pxEnd(); this.allOff(); b.nextTrack(); this.syncSounds(); }
    }
    const s = this.n16++, ev = b.step16(), spb = sampleRate * 60 / b.bpm / 4, step = ev.info.step, P = this.px;
    if (b.soundsChanged) this.syncSounds();
    this.sec = ev.info.sec;
    for (const [L] of ev.notes) this.lastNote[L] = s;
    if (step === 0 || s === 0) this.arrange();
    if (this.fillReq && step === 8) { this.fillReq = false; this.fillOn = true; }
    const roll = P && (P.fx === 'ROLL' || P.fx === 'PROLL' || P.fx === 'DROLL');
    if (!(P && P.on)) this.hist[s % 8] = ev.notes.slice(0, 12);
    if (roll && !P.on && s >= P.d0 + P.len) {             // the loop closes: from here, its notes again
      this.loop = []; let any = 0;
      for (let k = 0; k < P.len; k++) { this.loop[k] = this.hist[(P.d0 + k) % 8] || []; any += this.loop[k].length; }
      if (!any) P.mask = new Set();                      // (an empty loop: the set plays through it)
      P.on = true;
    }
    for (const [L, n, v, len] of ev.notes) {
      if ((P && P.on && (!P.mask || P.mask.has(L))) || this.heldBack(L, n)) continue;
      if (this.fillOn && L === 'DRUMS' && (step >= 8 ? n >= 37 && n <= 40 : n === 49)) continue;   // (the fill's snare, its crash)
      this.play(L, n, v, len, 0);
    }
    if (P && P.on) { this.replay((s - P.d0) % P.len); if (P.r32) this.rHalf = spb / 2; }
    if (this.fillOn) {
      if (step >= 8) {
        const k = step - 8; if (!this.heldBack('DRUMS', 38)) { this.play('DRUMS', FILL[k], 62 + k * 8, 1, 0); if (k >= 4 && k & 1) this.play('DRUMS', 38, 70 + k * 6, 1, 0); }
      } else { this.fillOn = false; if (!this.heldBack('DRUMS', 49)) this.play('DRUMS', 49, 112, 1, 0); }
    }
    if (P) P.n16++;
    if (P && (P.fx === 'ECHO' || P.fx === 'WASH') && P.n16 >= 4 && !this.hDall) { this.hold(ALL_BUT_DRUMS); this.hDall = true; }
    for (const [L, what, v] of ev.params) {
      if (what === 'wob') { this.wob = { rate: v.rate3 / 3, shape: RATE_SHAPES[v.shape], depth: v.depth / 1000, growl: v.growl / 1000, t: 0, spb }; const it = this.inst[L]; if (it && it.bank === 'siren') it.w.lfo = this.wob; continue; }
      const it = this.inst[L]; if (!it || !it.cut || what !== 'cut' || (P && P.fx === 'SQUELCH' && L !== 'PAD' && L !== 'FX')) continue;
      // around the sound's own cutoff (its character kept): the energy opens it, a break or an intro closes it
      const span = it.cut.max - it.cut.min, x = it.cutBase + (v / 1000 - 0.7) * span * 0.45;
      it.w.k_param(it.cut.id, Math.round(Math.max(it.cut.min, Math.min(it.cut.max, x))));
    }
    this.gainT = ev.master.gain / 1000; this.hp = ev.master.hp / 1000; this.duckAmt = ev.master.duck / 1000; this.verbAmt = ev.master.verb / 1000;
    const waiting = MELO.filter((L) => !this.allowed.has(L) && !this.mute[L] && this.wrote(L));
    this.port.postMessage({ t: 'step', info: { ...ev.info, phraseBar: b.phraseBar, track: b.trackNo },
      notes: ev.notes.filter(([L]) => !MELO.includes(L) || this.allowed.has(L)).map((x) => [x[0], x[1], x[2]]),
      pend: { break: b.breakReq, dive4: b.dive === 4, dive16: b.dive === 16, drop: b.dropReq, fill: this.fillReq || this.fillOn, keyup: b.keyReq, next: this.qNext, stay: b.stay, style: this.qStyle },
      waiting, motif: { ...b.motifVer }, px: this.px ? this.px.k : -1 });
    const swing = (b.step % 2 ? b.swing : -b.swing) / 1000;
    return spb * (1 + swing);
  }
  // the bass's wobble: its LFO, this block, on its filter and its timbre (around the sound's own values)
  wobble(m) {
    const W = this.wob, it = this.inst.BASS; if (it && it.bank === 'siren') return -1; if (!W || !it || !it.wobT || !it.wobT.length) return 0.5;
    const p = (W.t / (W.spb * W.rate)) % 1, v = (SHAPE[W.shape] || SHAPE.sine)(p); W.t += m;
    it.wobT.forEach((d, k) => { const span = d.max - d.min, x = d.base + span * W.depth * (v - 0.45) * (k ? 0.6 : 0.9); it.w.k_param(d.id, Math.round(Math.max(d.min, Math.min(d.max, x)))); });
    return v;
  }
  // (web 0.5) a strip's filters this block: the sound's tone ceiling and the hand's knob (low-pass deeper, or a high-pass)
  stripFilt(key, tone) {
    const F = this.fl[key], target = this.flt[key] || 0;
    F.v += (target - F.v) * 0.25; if (Math.abs(target - F.v) < 0.002) F.v = target;
    let [lp, hp] = fv(F.v);
    if (tone && (!lp || tone < lp)) lp = lp ? Math.min(lp, tone * Math.pow(70 / LP_OPEN, -F.v)) : tone;
    if (lp) F.lp.set(lp, false); if (hp) F.hp.set(hp, true);
    return [lp ? F.lp : null, hp ? F.hp : null];
  }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    L.fill(0); R.fill(0);
    const dB = (x) => Math.pow(10, (x || 0) / 20);
    for (let off = 0; off < n; off += BLOCK) {
      const m = Math.min(BLOCK, n - off);
      if (this.playing) { this.until -= m * this.spd; while (this.until <= 0) this.until += this.fire(); }
      if (this.rHalf > 0 && (this.rHalf -= m) <= 0) { this.rHalf = 0; if (this.px && this.px.on && this.loop) this.replay(0); }   // (ROLL 1/32)
      this.pxBlock(m);
      for (let i = this.offs.length - 1; i >= 0; i--) { const o = this.offs[i]; o.at -= m * Math.max(this.spd, 0.05); if (o.at <= 0) { if (o.sub) { if (this.subV.n === o.n) this.subV.gate = 0; } else if (o.at > -1e8) o.w.k_note(o.n, 0, 0); this.offs.splice(i, 1); } }
      const P = this.px, echo = P && P.fx === 'ECHO', dub = P && P.fx === 'DUB', wash = P && P.fx === 'WASH';
      const dt = this.brain.bpm ? sampleRate * 60 / this.brain.bpm * 0.75 : 15000;     // the delay: a dotted eighth
      const S = this.sends || (this.sends = { dl: new Float32Array(BLOCK), dr: new Float32Array(BLOCK), rl: new Float32Array(BLOCK), rr: new Float32Array(BLOCK), kick: new Float32Array(BLOCK) });
      S.dl.fill(0); S.dr.fill(0); S.rl.fill(0); S.rr.fill(0); S.kick.fill(0);
      const duckAt = (i, dk) => 1 - dk * this.duckAmt * this.duckEnv * Math.exp(-i / 2000);
      // the drums, in three parts (their strip: volume, filter, space)
      if (this.dr && this.drSound) {
        const mix = this.drMix || {}, body = mix.body || [1, 0, 0.1], tops = mix.tops || [0.85, 0.1, 0.1, 0.2], lv = MIX.DRUMS[0] * dB(this.vol.DRUMS);
        const sp = (this.space.DRUMS ?? 1) * this.mSpace;
        let pk = 0;
        for (const Pt of PARTS) {
          const buf = new Float32Array(this.dr[Pt].w.memory.buffer, this.dr[Pt].w.k_render(), BLOCK * 2);
          let [g, ds, rs, dk] = Pt === 'KICK' ? [1, 0, 0, 0] : Pt === 'BODY' ? [body[0], body[1], body[2], 0] : tops;
          ds *= sp; rs *= sp; if (echo) ds = 1; if (dub && Pt === 'BODY') ds = 0.6; if (wash) rs = 1.2;
          if (Pt !== 'KICK') this.flt[Pt] = this.flt.DRUMS;
          const [fl, fh] = this.stripFilt(Pt === 'KICK' ? 'DRUMS' : Pt, 0);
          for (let i = 0; i < m; i++) {
            const d = dk ? duckAt(i, dk) : 1;
            let a = buf[2 * i] * g * d * lv, b = buf[2 * i + 1] * g * d * lv;
            if (fl) { a = fl.run(a, 0); b = fl.run(b, 1); } if (fh) { a = fh.run(a, 0); b = fh.run(b, 1); }
            L[off + i] += a; R[off + i] += b; S.dl[i] += a * ds; S.dr[i] += b * ds; S.rl[i] += a * rs; S.rr[i] += b * rs;
            if (Pt === 'KICK') S.kick[i] = (a + b) * 0.5;
            pk = Math.max(pk, Math.abs(a));
          }
        }
        this.peaks.DRUMS = Math.max(pk, (this.peaks.DRUMS || 0) * 0.92);
        // the rumble: the kick into a long dark room, low-passed, ducked by the kick itself (techno, hard)
        const ru = (this.drSound.rumble || 0) / 1000;
        if (ru > 0) {
          const a = 1 - Math.exp(-2 * Math.PI * 170 / sampleRate), z = this.rumZ;
          for (let i = 0; i < m; i++) {
            let y = this.rum.run(S.kick[i] * 0.9, 0) + this.rum.run(S.kick[i] * 0.9, 1);
            z[0] += a * (y - z[0]); z[1] += a * (z[0] - z[1]); y = Math.tanh(z[1] * 3) * ru * 0.9 * (1 - 0.95 * this.duckEnv * Math.exp(-i / 2000)) * lv;
            L[off + i] += y; R[off + i] += y;
          }
        }
      }
      // the synths: each through its strip (its calibration, its tone, the hand's filter, volume, space)
      for (const Ly of LAYERS) {
        if (Ly === 'DRUMS') continue;
        const it = this.inst[Ly]; if (!it) continue;
        const wv = Ly === 'BASS' ? this.wobble(m) : 0;
        const buf = new Float32Array(it.w.memory.buffer, it.w.k_render(), BLOCK * 2);
        const [lvl0, dsend0, rsend0, dk] = MIX[Ly], pan = PAN[Ly], lvl = lvl0 * (it.trim || 1) * dB(this.vol[Ly]), gl = lvl * (1 - pan * 0.5), gr = lvl * (1 + pan * 0.5);
        const sp = (this.space[Ly] ?? 1) * this.mSpace, sg = (it.trim || 1) * dB(this.vol[Ly]);   // (the sends: as before, with the sound's trim and the hand's volume)
        let dsend = dsend0 * sp, rsend = rsend0 * sp;
        if (echo) dsend = 1; if (dub && (Ly === 'ARP' || Ly === 'HOOK' || Ly === 'STAB')) dsend = 0.95; if (wash) rsend = 1.3;
        const [fl, fh] = this.stripFilt(Ly, it.tone);
        const gw = Ly === 'BASS' && this.wob && wv >= 0 ? this.wob.growl || 0 : 0;   // (the growl FX: on the firmwares' basses; WOB has its own)
        if (gw) { this.f1.set(320 + 520 * wv); this.f2.set(720 + 600 * wv); }
        let pk = 0;
        for (let i = 0; i < m; i++) {
          const duck = duckAt(i, dk);
          let a = buf[2 * i], b = buf[2 * i + 1];
          if (gw) {                                     // the growl: two formants moving with the wobble ('u' to 'a'), then drive
            const x = (a + b) * 0.5, f = this.f1.run(x) * 1.8 + this.f2.run(x) * 1.3, y = Math.tanh((x * (1 - 0.7 * gw) + f * gw) * (1 + 2.5 * gw)) * 0.8;
            a = y; b = y;
          }
          if (fl) { a = fl.run(a, 0); b = fl.run(b, 1); } if (fh) { a = fh.run(a, 0); b = fh.run(b, 1); }
          a *= duck; b *= duck;
          L[off + i] += a * gl; R[off + i] += b * gr;
          S.rl[i] += a * rsend * sg; S.rr[i] += b * rsend * sg; S.dl[i] += a * dsend * sg; S.dr[i] += b * dsend * sg;
          pk = Math.max(pk, Math.abs(a));
        }
        this.peaks[Ly] = Math.max(pk * lvl, (this.peaks[Ly] || 0) * 0.92);
      }
      // the sub: a sine under the bass (drum & bass), ducked by the kick, with the bass's volume
      { const v = this.subV, inc = 2 * Math.PI * v.f / sampleRate, g = dB(this.vol.BASS); let pk = 0;
        if (v.gate > 0 || v.env > 1e-4) for (let i = 0; i < m; i++) {
          v.env += ((v.gate > 0 ? v.gate : 0) - v.env) * (v.gate > 0 ? 0.01 : 0.0015);
          v.ph += inc; if (v.ph > 6.2831853) v.ph -= 6.2831853;
          const y = Math.tanh(Math.sin(v.ph) * 1.6) * 0.42 * v.env * duckAt(i, 1) * g;
          L[off + i] += y; R[off + i] += y; pk = Math.max(pk, Math.abs(y));
        }
        this.peaks.SUB = Math.max(pk, (this.peaks.SUB || 0) * 0.92); }
      if (this.aud && this.aud.on) {                    // the audition
        const a = this.aud, spb = sampleRate * 60 / 128 / 4;
        a.t -= m; if (a.t <= 0) { const s = a.seq[a.k % a.seq.length]; if (a.last != null) a.w.k_note(a.last, 0, 0); if (s) { a.w.k_note(s, 100, 1); a.last = s; } else a.last = null; a.k++; a.t += spb; if (a.k > a.seq.length * 2) { a.on = false; if (a.last != null) a.w.k_note(a.last, 0, 0); } }
        const buf = new Float32Array(a.w.memory.buffer, a.w.k_render(), BLOCK * 2);
        for (let i = 0; i < m; i++) { L[off + i] += buf[2 * i] * 0.6; R[off + i] += buf[2 * i + 1] * 0.6; }
      }
      // the master: the delay (ping-pong), the reverb, the isolator (the kills), the DJ filter (the hand's, the build's
      // high-pass, an effect's), the gate, the crush, the riser's noise, the limiter; the brake and the rewind (the tape)
      const D = this.dl, len = D[0].length, fb = echo ? 0.82 : dub ? 0.86 : 0.42;
      const hpv = this.hp * 0.807, um = this.mFilt, tgt = P && P.f != null ? P.f : um < -0.01 ? um : Math.max(um, hpv);
      this.mfv += (tgt - this.mfv) * 0.2; if (Math.abs(tgt - this.mfv) < 0.002) this.mfv = tgt;
      const [mlp, mhp] = fv(this.mfv); if (mlp) this.mlp.set(mlp, false); if (mhp) this.mhp.set(mhp, true);
      const kills = this.kill[0] < 1 || this.kill[1] < 1 || this.kill[2] < 1, room = wash ? 0.95 : 0.84;
      this.verb.room += (room - this.verb.room) * 0.05;
      const R4 = this.ring, rl = R4[0].length;
      for (let i = 0; i < m; i++) {
        const rd = (this.dw - Math.floor(dt) + len) % len, yl = D[0][rd], yr = D[1][rd];
        D[0][this.dw] = S.dl[i] + yr * fb; D[1][this.dw] = S.dr[i] + yl * fb;
        this.dw = (this.dw + 1) % len;
        const vs = 0.45 + 0.5 * this.verbAmt, vl = this.verb.run(S.rl[i] * vs, 0), vr = this.verb.run(S.rr[i] * vs, 1);
        let l = L[off + i] + yl * 0.55 + vl * 1.4, r = R[off + i] + yr * 0.55 + vr * 1.4;
        if (kills) {
          const lo0 = this.klp.run(l, 0), lo1 = this.klp.run(r, 1), hi0 = this.khp.run(l, 0), hi1 = this.khp.run(r, 1);
          l = lo0 * this.kill[0] + (l - lo0 - hi0) * this.kill[1] + hi0 * this.kill[2]; r = lo1 * this.kill[0] + (r - lo1 - hi1) * this.kill[1] + hi1 * this.kill[2];
        }
        if (mlp) { l = this.mlp.run(l, 0); r = this.mlp.run(r, 1); }
        if (mhp) { l = this.mhp.run(l, 0); r = this.mhp.run(r, 1); }
        if (this.nzLvl > 0) {                           // the riser, the rewind: noise, its colour rising with it
          this.nz = (this.nz * 1664525 + 1013904223) >>> 0; const w = this.nz / 2147483648 - 1, k = 0.05 + 0.6 * this.nzLvl;
          this.nzA += k * (w - this.nzA); this.nzB += 0.03 * (this.nzA - this.nzB); const y = (this.nzA - this.nzB) * this.nzLvl * 0.5; l += y; r += y;
        }
        if (this.crush) { if (this.cn++ % 4 === 0) { this.chold[0] = Math.round(l * 24) / 24; this.chold[1] = Math.round(r * 24) / 24; } l = this.chold[0]; r = this.chold[1]; }
        this.gain += (this.gainT - this.gain) * 0.00005;
        l = Math.tanh(l * this.gain * 1.1) * this.gate; r = Math.tanh(r * this.gain * 1.1) * this.gate;
        R4[0][this.rw] = l; R4[1][this.rw] = r; this.rw = (this.rw + 1) % rl;
        if (this.vs || this.vsMix > 0) {                 // the tape: read back at its own speed
          let tl = 0, tr = 0;
          if (this.vs) {
            const V = this.vs; V.rp += V.rate; const p = ((V.rp % rl) + rl) % rl, i0 = Math.floor(p), f = p - i0, i1 = (i0 + 1) % rl;
            tl = R4[0][i0] + (R4[0][i1] - R4[0][i0]) * f; tr = R4[1][i0] + (R4[1][i1] - R4[1][i0]) * f;
            const amp = V.mode === 'brake' ? Math.min(1, V.rate * 4) : Math.min(1, Math.abs(V.rate));
            tl *= amp; tr *= amp; this.vsMix = Math.min(1, this.vsMix + 0.01); this.vsHold = [tl, tr];
            l = l * (1 - this.vsMix) + tl * this.vsMix; r = r * (1 - this.vsMix) + tr * this.vsMix;
          } else { this.vsMix = Math.max(0, this.vsMix - 0.004); const [hl, hr] = this.vsHold || [0, 0]; l = l * (1 - this.vsMix) + hl * this.vsMix; r = r * (1 - this.vsMix) + hr * this.vsMix; }
        }
        L[off + i] = l; R[off + i] = r;
        this.scope[this.sw] = (l + r) * 0.5; this.sw = (this.sw + 1) % 1024;
      }
      this.duckEnv *= Math.exp(-m / (sampleRate * 0.12));
    }
    this.sinceScope += n;
    if (this.sinceScope > 1600) { this.sinceScope = 0; const s = new Float32Array(512); for (let i = 0; i < 512; i++) s[i] = this.scope[(this.sw + i * 2) % 1024]; this.port.postMessage({ t: 'scope', s, peaks: this.peaks }); }
    return true;
  }
}
registerProcessor('siren', Siren);
