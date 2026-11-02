# SIREN · a rave that writes itself
https://isod89.github.io/siren/
SIREN composes an endless rave in real time, and you play it like a DJ.

**Play it in your browser:** open this repository's GitHub Pages site (Chrome or Edge on a computer works best).

SIREN is being made for the **FM-1**. This page is the web version: the same brain that writes the music, the
real sound engines of the FM-1 firmwares compiled for the browser, and the controls of the FM-1 version as big
buttons, knobs and faders.

## What it does

- **8 styles:** TECHNO, TRANCE, PSY, ACID, RAVE, HARD, DRUM & BASS, HOUSE
- **Endless tracks:** drums, bass, arp, hook, pads, stabs and risers, arranged like a real track (intro, groove,
  build, drop, break...). When a track ends, the next one is born from it, in a nearby key and tempo.
- **The composition pads:** DROP, BUILD 4, BUILD 16, BREAK, FILL, NEW MELODY, NEW BASS, NEW GROOVE, KEY UP,
  NEXT TRACK, STAY (loop the section)
- **The DJ knobs:** FILTER, INTENSITY, SPACE, MELODY
- **The mixer:** for every layer, its sound (‹ ›), another motif (↻), volume, filter, space, mute; take a layer
  in hand and it always plays
- **16 DJ effects** (hold them down): rolls, filter sweeps, echo out, wash out, kills, gate, crush, brake,
  rewind, half time and more, 4 of them depending on the style
- **Seeds:** the same seed plays the same rave again (about 4.3 billion seeds per style)
- **A clean mix on its own:** every sound of SIREN's bank balanced in its layer, harsh highs softened, at most
  3 melodic layers at once

## Help build the sound bank

SIREN picks each track's sounds from its **sound bank**: for every style, a short list of sounds per layer.
Choosing that bank is the biggest job left before SIREN ships on the FM-1.

1. Open the **Sound lab** tab, pick a style, listen, remove what doesn't fit, add what's missing.
2. Go back to **Play** and listen to SIREN with your bank.
3. Press **Send my bank**: your bank, your name and your notes go straight to **sodwavecontact@gmail.com**
   (through the FormSubmit form service: no email app, no attachment needed). Or download it and email the file.

Everything you do stays in your browser until you press Send. No account, no tracking.

## Run it on your own computer

It is a static site: serve the folder with any web server, for example

```
python -m http.server 8779
```

then open http://localhost:8779/ (opening `index.html` directly from the disk does not work: browsers only load
the sound engines from a web server).

## Inside

- `js/brain.js` SIREN's brain (the same as the FM-1 firmware's, event for event)
- `js/worklet.js` the sound: the engines, the mix, the DJ effects (an AudioWorklet)
- `js/app.js` the page
- `data/curation.json` SIREN's sound bank · `data/levels.json` its calibration (`tools/level_web.mjs`)
- `data/kits.json` SIREN's drum kits · `data/palette.json` every sound the lab can add
- `engines/clipper.wasm`, `engines/sloop.wasm` the sound engines of the Clipper and SLOOP firmwares for the FM-1
  (sources: https://github.com/isod89/clipper-fm1 and https://github.com/isod89/sloop-fm1)
- `engines/packs/` community sound modules (only used with "include community sound packs")
- `tools/engine_test.mjs` runs the sound engine outside the browser and checks every control (Node.js)

## License

SIREN is free software under the GNU General Public License v3.0 only (`LICENSE`), by Sodwave.
Parts of the FM synthesis code come from Music Synthesizer for Android (Apache-2.0, `LICENSES/`).

The community sound modules in `engines/packs/` are the work of their authors, under their own licenses
(each module's source code is published by its author):

| Module | Author | Version | License | File |
|---|---|---|---|---|
| JIANT FM | juanjiant-bit | 0.9.9-beta4a+c5bd351 | GPL-3.0-only | `engines/packs/jiant-e971b3d9d8.wasm` |
| X0X | charlesvestal | 1.1.0+54194c5 | GPL-3.0-only | `engines/packs/x0x-6c336ca558.wasm` |
| Melodee | keremimo | 1.4.5+c14912b | GPL-3.0-only | `engines/packs/melodee-16709e3819.wasm` |
| OberVave | zvenson | 3.0.1 | GPL-3.0-only | `engines/packs/obervave-b09865eb8f.wasm` |
| Mutable Dreams | Kid Bunka | v1.2 | GPL-3.0-only | `engines/packs/mutable-3cb6b0997c.wasm` |
| Frodhes | Leonardo Mirabal | 0.9.4+bf859e4 | GPL-3.0-only | `engines/packs/frodhes-080c35a735.wasm` |
| FiMba-1 | jadamsowers | v0.6.1 | GPL-3.0-only | `engines/packs/fimba-e6df86b9c5.wasm` |
| OPN-1 | putchdev | 2.0.0+3319da4 | GPL-3.0-only | `engines/packs/opn1-a7a7257346.wasm` |
| Chipbox | Pasquale Barilla | 1.2.4+2cf4936 | GPL-3.0-only | `engines/packs/chipbox-a981f637b0.wasm` |
| FOMAJAM | konsumer | 0.1.6+138c5d9 | GPL-3.0-only | `engines/packs/fomajam-0d6660efdf.wasm` |
| Tonitor | Nuno Zimas | build 68+0dccfca | GPL-3.0-only | `engines/packs/tonitor-5c03a09f1e.wasm` |
| Bigorna | Nuno Zimas | build 71+2ae17c5 | GPL-3.0-only | `engines/packs/bigorna-466422e01a.wasm` |
| GHOULBOX | Jason Persinger | 2.4 | GPL-3.0-only | `engines/packs/ghoulbox-3b656b14c4.wasm` |
