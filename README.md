# Piano Rebellion Apps

Original music games by [Clarendon Hills Music Academy](https://clarendonhillsmusicacademy.com/), served on GitHub Pages.

- `note-sprint/` — Note Sprint (source of truth: piano_rebellion_curriculum- `apps/note-sprint.html`)
- `drum-machine/` — Modal Metronome (drum machine + bass, from the Notion embed on the Evan dashboard; recorded-sample credits are in the app footer)
- `guitar-tuner/` — Guitar Revolution Strobe Tuner (true strobe: heterodyne phase vs exact reference at f, 2f, 4f in an AudioWorklet; YIN note finder; tunings, A4 430–450; one screen, starts on its own, always auto; vintage design).
- `song-player/` — Song Dissector (Capo-style play-along: studio-grade speed 40–130% and key ±6 via Signalsmith Stretch (MIT, `song-player/vendor/`, patched to mix parts in the worklet), A-B loop, speed-up trainer, PARTS mixer with mute/solo). One player for every song: `?s=<song id>`. Parts: split offline with Demucs htdemucs_6s, residual redistributed so parts sum to the record; ship `audio/<id>/mix.mp3` (320k) + parts at half volume (`boost:2`), `rest` = record minus parts. Songs without parts: one MP3 + one line in `SONGS`. Any song can also be split on the device: Detailed 6 parts (htdemucs_6s, default) or Classic 4 parts (htdemucs), ONNX Runtime Web, see `song-player/vendor/README.md`.
- `rhythm-trainer/` — Rhythm Trainer (tap or clap rhythms, timing graded against the written notes; 8 levels incl. 3 syncopation levels)
- `shared/hype.js` — round-screen music for every Challenge mode: nine original synthesized songs (lo-fi, funk, pop-punk, house, trap, drum & bass, synthwave, samba, epic), a different one each round (shuffled per session, no repeats until all have played; the bonus round always gets the epic one). Same API and mic-safe timing as before.

## Versions

Every app shows its version at the bottom of the page: `Version YYYY-MM-DD.N` (date of the change, N = that day's release number). Bump it in the same commit as any change to that app, then publish `main` to `gh-pages` (GitHub Pages builds from `gh-pages`).

| App | Version |
|---|---|
| Note Sprint | 2026-11-13.4 |
| Key Finder | 2026-11-13.3 |
| Rhythm Trainer | 2026-11-13.4 |
| Modal Metronome | 2026-11-13.5 |
| Hanon Speed Trainer | 2026-11-13.1 |
| Major 7th Play-Along | 2026-11-11.8 |
| Song Dissector | 2026-11-13.15 |
| Strobe Tuner (Guitar Revolution) | 2026-11-13.1 |
| Fab Fours (find the four groups of four; was Groupies) | 2026-11-13.7 |
| Pop Quiz (music trivia: 18 topics, Daily 10, Party mode) | 2026-11-13.2 |
| Ear Trainer | 2026-11-13.4 |
| Meter Master (internal-clock trainer) | 2026-11-13.4 |
| Symbol Memory (classic Memory: identical pairs, symbol with its name under it; Bravura font, OFL, in `symbol-memory/fonts/`) | 2026-11-13.5 |
| Music Games (home) | 2026-11-13.1 |
| Round music (`shared/hype.js`) | 2026-11-12.1 |
| Share helper (`shared/share.js`: share sheet, clipboard, copy box; is.gd short links + chmusicacademy.com) | 2026-11-13.2 |
| Riff Simon Says | 2026-11-13.5 |
