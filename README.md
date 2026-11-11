# Piano Rebellion Apps

Original music games by [Clarendon Hills Music Academy](https://clarendonhillsmusicacademy.com/), served on GitHub Pages.

- `note-sprint/` — Note Sprint (source of truth: piano_rebellion_curriculum- `apps/note-sprint.html`)
- `drum-machine/` — Modal Metronome (drum machine + bass, from the Notion embed on the Evan dashboard; recorded-sample credits are in the app footer)
- `guitar-tuner/` — Guitar Revolution Strobe Tuner (true strobe: heterodyne phase vs exact reference at f, 2f, 4f in an AudioWorklet; YIN note finder; tunings, A4 430–450, reference tone; vintage design).
- `song-player/` — Song Player (Capo-style play-along: studio-grade speed 40–130% and key ±6 via Signalsmith Stretch (MIT, `song-player/vendor/`, patched to mix parts in the worklet), A-B loop, speed-up trainer, PARTS mixer with mute/solo). One player for every song: `?s=<song id>`. Parts: split offline with Demucs htdemucs_6s, residual redistributed so parts sum to the record; ship `audio/<id>/mix.mp3` (320k) + parts at half volume (`boost:2`), `rest` = record minus parts. Songs without parts: one MP3 + one line in `SONGS`.
- `rhythm-trainer/` — Rhythm Trainer (tap or clap rhythms, timing graded against the written notes; 8 levels incl. 3 syncopation levels)

## Versions

Every app shows its version at the bottom of the page: `Version YYYY-MM-DD.N` (date of the change, N = that day's release number). Bump it in the same commit as any change to that app, then publish `main` to `gh-pages` (GitHub Pages builds from `gh-pages`).

| App | Version |
|---|---|
| Note Sprint | 2026-11-11.6 |
| Key Finder | 2026-11-11.6 |
| Rhythm Trainer | 2026-11-11.15 |
| Modal Metronome | 2026-11-11.8 |
| Hanon Speed Trainer | 2026-11-11.7 |
| Major 7th Play-Along | 2026-11-11.7 |
| Song Player | 2026-11-11.10 |
| Strobe Tuner (Guitar Revolution) | 2026-11-11.5 |
| Music Games (home) | 2026-11-11.6 |
