# Percussion Playbook for the Modal Metronome engine
Version 1.0.0 · Date 2026-11-27 · Kit: `drum-machine/kits/perc-2026/` (branch `perc-2026-11-27`)

Audience: the engine builder. This file says how each hand-percussion instrument is really played, as rules the scheduler can follow, and which staged samples to use for each stroke.

Source tags:
- **[S: …]** = a published source backs the pattern (named in the line).
- **[P]** = practice knowledge with no source checked in this session. Every velocity number in this file is [P]: a starting point to tune by ear.
- **[UNVERIFIED]** = I could not confirm the grid. Do not ship it without checking the named book.
- Read in this session: the Wikipedia pages "Tumbao" and "Bell pattern", the notes of the conga sample pack, and the x8drums martillo page. The books (Mauleón, Uribe, Salloum) are cited from memory and were not opened in this session: treat a book tag as "this is where to check", not as a quote.

Notation: grids are steps inside one 4/4 bar. `16ths` = steps 0–15 (per beat: `1 e & a`). `8ths` = steps 0–7. Velocity is 0–1, the same scale as the groove data in `index.html`. `A` means "use the accent articulation".

---

## 0. What the engine does today, and what has to change

Today (audit of `drum-machine/index.html` on main):
- Shaker (row 82) with the "Recorded" setting is ONE LinnDrum cabasa sample (`l_cabasa`, 0.13 s, mono, 80 kbps) repeated for every stroke. With "Synth" it is one noise burst (18 ms rise, 85 ms long, 7.5 kHz band-pass). No forward/back difference, no accent sample, no round robin. Only the gain changes.
- Shaker patterns are the same hand-typed bar in four grooves (`popshaker`, `popsnap`, `percjam`, `shakeronly`): `[1.0, .45, .70, .45]` per beat, every beat identical.
- Tambourine (54) is one LinnDrum hit. It plays only on quarter notes or on 2 and 4. There is no shake.
- Cowbell (56), claves (75), woodblock (76) and finger snap (99) are always synthesized (two square waves; a 2.5 kHz sine; a triangle wave). The "Recorded" switch does not touch them.
- Congas (63, 64) are one LinnDrum hit each; bongos (60, 61) and güiro (73) are one CR-78 drum-machine sample each. "Conga High" doubles as slap and ghost note by gain only, so there is no heel, tip, slap or muted tone.
- No triangle, agogô, cabasa, timbale, pandeiro, surdo or maracas voice exists.

What changes with this kit: every stroke type is its own sample set, strokes alternate takes, and shaken instruments are scheduled by their loudest point instead of their first sample.

---

## 1. Engine rules that apply to every instrument

1. **Pick the layer by velocity, then trim gain inside the layer only.** MIDI velocity = `round(127 * v)`. Use the layer whose `vel_lo..vel_hi` contains it. Scale gain by at most about ±2 dB inside the layer. Do not put a full velocity-to-gain curve on top: the soft layers are already quieter and darker in the files (`stored_rel_db`).
2. **Never play the same file twice in a row.** Random choice without repeat among the round robins of the layer. Where a layer has one take (bells, agogô, some tambourine hits), vary playback rate by ±0.4% and gain by ±0.7 dB instead.
3. **Timing anchor.** Each articulation has `anchor` and `lead_ms` in the manifest.
   - `anchor: "onset"` (struck sounds): start the file at the grid time, as with the drum kits (`lead_ms` is 1.5).
   - `anchor: "peak"` (shakers, maracas, cabasa rub, tambourine shake): the stroke swells before it speaks. Start the file `lead_ms` BEFORE the grid time: `src.start(t - lead/1000)`. If that moment is already in the past, start now and skip into the file: `src.start(now, lead/1000 - (t - now))`.
   - Leads run from 20 ms (tambourine forward shake) to 110 ms (large shaker back stroke). Schedule with at least 120 ms of look-ahead for these voices.
4. **One hand, one sound.** Shakers, each conga/bongo head, the pandeiro, the güiro and each tambourine are monophonic: a new stroke fades the previous one of the same instrument (10–25 ms). See `choke_groups` in the manifest. A muted stroke always stops a ringing open tone (conga, bongo, triangle, cowbell).
5. **`art_rel_db` restores the real balance between strokes** of one instrument (files are normalised per articulation). Example: `congax` heel is −29 dB and tip −27 dB against the open tone. Apply it, then apply the pattern velocity. For the peak-normalised sources (FreePats egg shaker, maracas, claps, snaps, Sassaby bells) `art_rel_db` is only a starting balance; the velocities below set the real one.
6. **Human feel, the same for all hand percussion [P]:**
   - Per-stroke velocity jitter ±4%. A slow drift of ±6% over two bars (the arm settles and pushes).
   - Timing jitter with a standard deviation of 2–3 ms, never more. The lean of the part (ahead or behind) is one fixed offset per groove, not random.
   - The first stroke after a rest is 15% softer.
   - The last beat of a four-bar phrase rises about 10%.

---

## 2. Shaker (rows using note 82)

Instruments: `shaker` (egg shaker, 2 dynamics × 4 takes per direction, plus `accent`), `shakersm` (small stereo shaker, snappy, for fast tempos), `shakerlg` (large low shaker, the ganzá voice), `maracas`.

How it is played [P]: the arm never stops. One stroke per subdivision. The forward push (away from the body) is the strong stroke and lands on the counted notes; the pull back is the weak stroke and lands between them. An accent is a longer, faster forward push that stops hard.

Rules:
1. **Direction comes from the grid position, never from the groove data.** In 16ths: steps `1` and `&` of each beat are `fwd`, `e` and `a` are `back`. In 8ths: beats are `fwd`, the `&`s are `back`.
2. **Accents use the `accent` articulation**, not just more gain. One accent per beat at most.
3. **Never two identical strokes.** No-repeat round robin, and `fwd` and `back` never share a file.
4. **Velocity shape per beat `[1, e, &, a]`:**

| Style | 1 | e | & | a | Notes |
|---|---|---|---|---|---|
| Pop/rock, accent on the beat | A .95 | .40 | .62 | .42 | default for `popshaker` |
| Upbeat lift (disco, funk, Latin pop), accent on the & | .62 | .40 | A .92 | .45 | |
| Backbeat, beats 1 and 3 | .70 | .40 | .58 | .42 | |
| Backbeat, beats 2 and 4 | A 1.0 | .42 | .60 | .45 | accent lands with the snare |
| Samba / ganzá (use `shakerlg`) | A .90 | .38 | .45 | .80 | accents on the 1st and 4th sixteenth [S: Ed Uribe, *The Essence of Brazilian Percussion and Drum Set*]; the `a` is a `back` stroke on its top layer |
| Baião / forró | .55 | .35 | A .90 | .40 | same shape as the triangle |
| Bossa nova, soft 16ths | .55 | .32 | .48 | .34 | no accent sample |
| Ballad, 8ths (use `maracas` or `shakerlg`) | .70 | – | .45 | – | |

5. **Lean [P].** Up-tempo pop: the whole shaker part sits 4–8 ms ahead of the grid ("on top"). Laid-back grooves: 5–10 ms behind. Pick one value per groove and keep it.
6. **The lope [P].** At 100 bpm and slower, the back strokes (`e`, `a`) land 3–6 ms late. At 125 bpm and faster, 0. In swung-sixteenth grooves follow the groove's swing value (54–58%) and add nothing.
7. **Tempo picks the instrument.** A 16th lasts `15 / bpm` seconds. Below 110 ms per stroke (faster than 136 bpm in 16ths) use `shakersm`, whose strokes are short. Above 200 ms per stroke (8ths under 150 bpm) use `maracas` or `shakerlg`, whose strokes are long enough to fill the gap.
8. **Rests.** When a groove leaves a hole, do not play the back stroke into it at full level: the stroke before a rest is 20% softer, and the stroke after a rest is a `fwd`.

Cabasa (`cabasa`): the beads are twisted against the palm. Play 8ths or 16ths with `rub` (layer 2 on the beats, layer 1 between them: `[.80, .40, .60, .40]`), and `hit` for a dry accent on 2 and 4 [P].

---

## 3. Tambourine (note 54)

Instruments: `tamb` (the default: 8 hits in 2 layers, forward and back shake strokes, a shake roll), `tamb1` and `tamb2` (headed orchestral tambourines with 2 hit dynamics, shakes and 2-dynamic rolls), `tambfp` (dry hand tambourine plus `jingle` ticks).

How it is played [P]: the shaking hand keeps 8ths or 16ths going like a shaker; the backbeat is a strike of the tambourine against the other hand, which replaces the shake stroke on that step.

Rules:
1. **Rock/pop 8ths:** `shakefwd` on the beats (.55), `shakeback` on the `&`s (.38), `hit` on 2 and 4 (.95). The hit replaces the shake on that step.
2. **16ths:** `[fwd .60, back .35, fwd .50, back .38]`, with `hit` on 2 and 4.
3. **Motown:** `hit` on 2 and 4 over 8th-note shakes at medium tempo; straight quarter-note hits (what the app plays today) are right only for the fast stomp feel [P].
4. **Roll into a downbeat:** start `roll` one beat early, ramp its gain from .3 to .9, and cut it with a `hit` on the downbeat (40 ms fade).
5. **Quiet styles (bossa, ballad):** `tambfp jingle` ticks at .4–.6 instead of full shakes.
6. `shakeback` is recorded 14 dB below `shakefwd` (`art_rel_db`). Keep most of that difference: the back stroke of a tambourine is nearly silent.

---

## 4. Congas (notes 62, 63, 64)

Instruments: `congax` (one drum with the full stroke set: `open`, `slap`, `closed`, `muted`, `heel`, `tip`, `tap`), and three VCSL drums with `open` and `muted` only: `quinto`, `conga`, `tumba`.

Measured strongest partials of the open tones: `congax` 339 Hz, `quinto` 215 Hz, `conga` 164 Hz, `tumba` 139 Hz. The VCSL set is tuned low (its "quinto" sounds like a conga). For a two-drum tumbao use `congax` as the high drum and `quinto` as the low drum. They are a minor sixth apart; playing `congax` at rate 0.84 (−3 semitones, 285 Hz) makes the pair a perfect fourth, the usual tuning [P].

Strokes [S: the legend in the sample pack notes by its recordist, and Wikipedia "Tumbao"]: H = heel of the palm, T = fingertips, S = slap, O = open tone. Heel and tip are quiet "transit" notes made by rocking one hand; the slap and the open tones are the notes the listener hears.

**One-drum tumbao (son, salsa, cha-cha-chá), 8ths** [S: Wikipedia "Tumbao": conga row `H T S T H T O O`; hands per the pack notes: "(L)Heel/Tip/(R)Slap/(L)Tip/Heel/Tip/(R)Open/Open"]:

| 8th step | 1 | & | 2 | & | 3 | & | 4 | & |
|---|---|---|---|---|---|---|---|---|
| Stroke | heel | tip | slap | tip | heel | tip | open | open |
| Hand | L | L | R | L | L | L | R | R |
| Velocity [P] | .32 | .26 | .90 | .26 | .32 | .26 | .88 | .80 |

**Two-drum tumbao, two bars, 2-3 clave:** bar 1 (2-side) is the one-drum pattern. Bar 2 (3-side) moves to the low drum on the bombo:

| 8th step | 1 | & | 2 | & | 3 | & | 4 | & |
|---|---|---|---|---|---|---|---|---|
| Stroke | heel | tip | slap | LOW open | LOW open | tip | open | open |
| Velocity [P] | .32 | .26 | .90 | .85 | .80 | .26 | .88 | .80 |

[S: Wikipedia "Tumbao": "Another common variant uses two drums and sounds bombo (1a) on the tumba (3-side of the clave)"; the second low note on beat 3 is [P]. A simpler variant often taught puts the two low notes on 3 and 3& [P].] In 3-2 clave swap the two bars.

Rules:
1. Heel and tip come only from `congax heel` / `congax tip`, at their recorded level (`art_rel_db` −29 / −27 dB). Do not raise them: they are felt more than heard.
2. The slap is dry and short. It stops any ringing open tone on the same drum.
3. The two open tones are not equal: the first is the stronger.
4. Open tones may ring into the next bar's heel stroke; the heel then damps them (choke, 20 ms).
5. For pop, soul and funk conga parts with no clave [P]: keep the heel-tip motion as soft 16ths or 8ths, slap on 2 or on the `&` of 2, two open tones on `4 &`. Go-go leans on open tones on the `a` of 2 and the `&` of 4 with swung 16ths.
6. Mapping today's rows until the data carries stroke names: note 63 at velocity ≥ .6 = `slap`; note 63 below .5 = `heel` on even 8th steps and `tip` on odd ones; note 64 = `open`.

---

## 5. Bongos (notes 60, 61)

Instruments: `bongohi` (macho) and `bongolo` (hembra), each `open` and `muted`, 3 dynamics × 2 takes.

**Martillo, 8ths** [S: Trevor Salloum, *The Bongo Book* (Mel Bay); the stroke order "slap, fingers, open, thumb, slap, fingers, open (hembra), thumb" as given on x8drums "Martillo Bongo Rhythm"]:

| 8th step | 1 | & | 2 | & | 3 | & | 4 | & |
|---|---|---|---|---|---|---|---|---|
| Stroke | macho, closed accent (R fingers, L thumb pressing) | macho, soft fingers (L) | macho open (R) | macho, thumb (L) | macho, closed accent | macho, soft fingers | hembra open (R) | macho, thumb (L) |
| Sample | `bongohi muted` | `bongohi muted` | `bongohi open` | `bongohi muted` | `bongohi muted` | `bongohi muted` | `bongolo open` | `bongohi muted` |
| Velocity [P] | .85 | .30 | .70 | .28 | .80 | .30 | .90 | .28 |

Rules: the right hand plays the four numbered beats, the left fills the `&`s at ghost level. The hembra open tone on 4 is the landmark of the pattern. In the montuno (chorus) section of salsa the bongo player puts the drums down and plays the campana (section 6).

Not staged: bongo slap and rim strokes.

---

## 6. Bells: cowbell, campana, cha-cha bell (note 56)

Instruments: `cowbell` (large: `open` 2 dynamics, `hit` 3 dynamics, `muted` 2), `cowbell2` (small: `open`, `muted`, 2 dynamics each), `mambobell` (`mouth`, `body`, one take each), `chabell` (one take), `agogo` (`hi` 3 dynamics, `lo` 2).

**Campana (bongo bell), salsa montuno, 8ths** [S: Wikipedia "Bell pattern", figure "Cuban bongo bell pattern, with 2-3 son clave above"; Rebeca Mauleón, *Salsa Guidebook* (Sher Music)]. Grid as already used in the app's `salsa` groove:

| 8th step | 1 | & | 2 | & | 3 | & | 4 | & |
|---|---|---|---|---|---|---|---|---|
| Stroke | mouth | – | body | body | mouth | – | body | body |
| Velocity [P] | .95 | | .55 | .50 | .88 | | .55 | .50 |

Use `mambobell mouth` / `mambobell body`, or for dynamics `cowbell open` (mouth) and `cowbell muted` (body). The mouth strokes are low, open and loud; the body strokes are high and dry.

**Cha-cha-chá bell (timbale player), 8ths** [S: Mauleón, *Salsa Guidebook*]: strong open stroke on every quarter note, light tick between. `[open .90, tick .35]` × 4. Use `chabell open` on the beats and `cowbell2 muted` layer 1 for the ticks.

**Rock, funk, disco cowbell [P]:** quarter notes on `cowbell open` at .85, beat 1 at .95. Funk 8ths: `open` on the beats, `muted` on the `&`s (the hand closes: choke the ring).

**Mambo bell (timbales) and cáscara:** see section 7.

**Agogô (samba) [UNVERIFIED]:** no grid given here. Take the pattern from Uribe before programming; the samples are staged.

---

## 7. Timbales and cáscara (notes 65, 66)

Instruments: `timbalehi` (`open`, `rim`), `timbalelo` (`open`) — one take each. No shell (cáscara) samples are staged.

**Cáscara, two bars, 8ths, 2-3 clave** [S: Mauleón, *Salsa Guidebook*; Ed Uribe, *The Essence of Afro-Cuban Percussion and Drum Set*; grid written from memory, mark as UNVERIFIED until checked against either book]:

```
2-side:  x . x . x x . x
3-side:  x . x x . x . x
```
In 3-2 clave swap the bars. Velocity [P]: single strokes .85, the second stroke of each pair .60. Played with a stick on the shell of the timbale in verses; the player moves to the mambo bell in the montuno.

Because no shell sample exists in this kit, do not fake cáscara on a drum head. Keep it on the drum-kit voices used today, or leave it out.

Timbale accents [P]: `timbalelo open` on beat 4 (or `4 &`) of the 2-side bar is the classic low-drum punctuation; `timbalehi rim` is the fill and abanico voice.

---

## 8. Güiro (notes 73, 74)

Instrument: `guiro` — `long` (3 takes), `short` (2 dynamics), `slow` (long stereo scrapes for slow tempos), `tap`.

**Cha-cha-chá / son, 8ths** [S: Mauleón, *Salsa Guidebook*; same grid as the app's `chacha` groove]: one long down-scrape on the beat, then two short strokes (down, up).

| 8th step | 1 | & | 2 | & | 3 | & | 4 | & |
|---|---|---|---|---|---|---|---|---|
| Stroke | long | – | short | short | long | – | short | short |
| Velocity [P] | .90 | | .58 | .50 | .85 | | .58 | .50 |

Rules: the long scrape lasts one quarter note; stop it when the first short stroke starts (the güiro is monophonic). Under 100 bpm use `slow` for the long stroke. The two shorts are not equal: the up-stroke is the weaker.

---

## 9. Claves (note 75)

Instruments: `claves` (4 dynamics, 3 takes on the main one), `claves2` (`hit`, `hi`).

Grids over two bars of 8ths (steps 0–15) [S: Wikipedia "Clave (rhythm)"; the 2-3 son grid is the one already in the app's `salsa` groove]:

| Clave | Steps |
|---|---|
| Son 3-2 | 0, 3, 6, 10, 12 |
| Son 2-3 | 2, 4, 8, 11, 14 |
| Rumba 3-2 | 0, 3, 7, 10, 12 |
| Rumba 2-3 | 2, 4, 8, 11, 15 |
| Bossa nova (3-2) | 0, 3, 6, 10, 13 |

Rules: all five strokes at one level (.88–.95), no ghost notes, no swing. The direction never flips inside a song. Every other Afro-Cuban part in this file is written against 2-3; when a groove is 3-2, swap the two bars of every part together.

---

## 10. Brazilian: pandeiro, surdo, tamborim, triangle

**Pandeiro (`pandeiro`: `bass`, `bassmuted`, `slap`, `tap`), samba, 16ths** [S: Ed Uribe, *The Essence of Brazilian Percussion and Drum Set*: thumb, fingertips, heel, fingertips]:

| Per beat | 1 | e | & | a |
|---|---|---|---|---|
| Stroke | thumb | fingertips | heel | fingertips |
| Sample, beats 1 and 3 | `bassmuted` .70 | `tap` .38 | `tap` .46 | `tap` .40 |
| Sample, beats 2 and 4 | `bass` (open) .95 | `tap` .38 | `tap` .46 | `tap` .40 |

The open bass on 2 and 4 is the surdo's answer inside the pandeiro. Alternate the three `tap` files so heel and fingertips do not sound alike. Velocities [P].

**Surdo:** muted stroke on beat 1, open accented stroke on beat 2 of a 2/4 bar (beats 2 and 4 in the app's 4/4), with a soft hand pickup on the `a` before the open note [S: Uribe]. NOT STAGED: no clean CC0 or CC BY surdo one-shots were found. Keep the current kick-based surdo accent (`samba` groove) until one is sourced.

**Tamborim (`tamborim`, 3 dynamics × 3 takes) [UNVERIFIED]:** samples are staged; take the teleco-teco grid from Uribe before programming. No grid is given here on purpose.

**Triangle (`triangle`: `open`, `muted`, `fmuted`), baião / forró, 16ths** [P; S for the feel: Uribe]: the holding hand closes and opens. `[muted .55, muted .40, open .90, muted .45]` per beat: the open ring is on the `&`. Each muted stroke chokes the ring (20–30 ms).

**Ganzá:** use `shakerlg` with the samba row of section 2.

---

## 11. Claps and snaps (notes 39, 99)

Instruments: `clap` (one person, 2 dynamics × 4 takes), `clapsolo` (4 dynamics), `clapgroup` (6 takes of several people), `snap` (2 layers × 5 takes).

Rules [P]:
1. Backbeat claps: 2 and 4. For a group sound play `clapgroup` plus two `clap` takes spread 6 ms and 14 ms late, each 4–6 dB down, panned left and right.
2. Never the same take on consecutive backbeats.
3. Snaps sit 5–10 ms late (laid-back) at .8, and beat 4 is slightly stronger than beat 2.
4. Gospel/soul double clap: `2`, `2 &` is not a default; only where the groove data asks for it.

---

## 12. Row-to-kit mapping for the grooves that exist today

| Note | Row today | Use |
|---|---|---|
| 82 | Shaker | `shaker` (or by tempo: `shakersm`, `maracas`, `shakerlg`), direction by grid position, accent by the style table |
| 54 | Tambourine | `tamb`: velocity ≥ .8 = `hit`; lower = shake by grid position |
| 56 | Cowbell | rock/funk/disco: `cowbell open`. Latin grooves: velocity ≥ .8 = `mambobell mouth`, lower = `mambobell body`; cha-cha = `chabell` |
| 75 | Claves | `claves hit` |
| 76 | Woodblock | `woodblock hit` |
| 60 / 61 | Bongo High / Low | `bongohi` / `bongolo`: velocity < .5 = `muted`, else `open` |
| 63 | Conga High | `congax`: ≥ .6 `slap`; < .5 `heel`/`tip` alternating |
| 64 | Conga Low | `congax open` (one-drum patterns) or `quinto open` (the low drum of a two-drum pattern) |
| 73 | Güiro | velocity ≥ .8 = `long`, else `short` |
| 39 | Hand Clap | `clap` / `clapgroup` |
| 99 | Finger Snap | `snap` |

New voices with no row yet: `triangle`, `agogo`, `cabasa`, `maracas`, `timbalehi`/`timbalelo`, `pandeiro`, `tamborim`, `shekere`, `cowbell2`, `claves2`.

Better than velocity thresholds: let groove data name the stroke, for example `["congax","slap",step,vel]`. The thresholds above are the bridge until then.
