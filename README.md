# Piano Rebellion Apps

Original music games by [Clarendon Hills Music Academy](https://clarendonhillsmusicacademy.com/), served on GitHub Pages.

- `note-sprint/` — Note Sprint (source of truth: piano_rebellion_curriculum- `apps/note-sprint.html`)
- `drum-machine/` — Modal Metronome (drum machine + bass, from the Notion embed on the Evan dashboard; recorded-sample credits are in the app footer)
- `song-player/` — Song Player (Capo-style play-along: speed 40–130% without changing pitch, key ±6 half steps, A-B loop, speed-up trainer). One player for every song: `?s=<song id>`; add a song = MP3 in `song-player/audio/` + one line in `SONGS`.
- `rhythm-trainer/` — Rhythm Trainer (tap or clap rhythms, timing graded against the written notes; 8 levels incl. 3 syncopation levels)

## Versions

Every app shows its version at the bottom of the page: `Version YYYY-MM-DD.N` (date of the change, N = that day's release number). Bump it in the same commit as any change to that app, then publish `main` to `gh-pages` (GitHub Pages builds from `gh-pages`).

| App | Version |
|---|---|
| Note Sprint | 2026-11-10.3 |
| Key Finder | 2026-11-05.1 |
| Rhythm Trainer | 2026-11-11.5 |
| Modal Metronome | 2026-11-11.2 |
| Hanon Speed Trainer | 2026-11-11.1 |
| Major 7th Play-Along | 2026-11-05.1 |
| Song Player | 2026-11-10.1 |
| Music Games (home) | 2026-11-11.1 |
