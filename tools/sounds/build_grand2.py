#!/usr/bin/env python3
"""Build drum-machine/keys/grand2 from the Salamander Grand Piano V3 source.

Version 1.0.0 (2026-11-27).
Usage: python3 tools/sounds/build_grand2.py <SalamanderGrandPiano checkout> <out folder>
Source: https://github.com/sfzinstruments/SalamanderGrandPiano (48 kHz / 24-bit FLAC)
Licence: CC BY 3.0, Alexander Holm. Credit is required in the app.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sndlib as S

SRC, OUT = sys.argv[1], sys.argv[2]
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTES = list(range(21, 109, 3))                       # A0..C8, every minor third
LAYERS = [2, 4, 6, 8, 10, 12, 14, 16]                 # 8 of the 16 source layers
LITE_LAYERS = [4, 8, 12, 16]
Q = "1"                                               # LAME V1 for the keys
SOFT = {2, 4, 6}                                      # shorter tails (0.8x)
# velocity window of each kept layer (source windows merged downward)
VEL = {2: (1, 34), 4: (35, 43), 6: (44, 50), 8: (51, 64), 10: (65, 80),
       12: (81, 96), 14: (97, 112), 16: (113, 127)}


def nname(m):
    return NAMES[m % 12] + str(m // 12 - 1)


def length_s(m):
    if m >= 96:
        return {96: 0.8, 99: 0.7, 102: 0.6, 105: 0.5, 108: 0.5}[m]
    for top, sec in ((36, 3.6), (48, 3.2), (60, 2.7), (72, 2.2), (84, 1.6), (96, 1.15)):
        if m < top:
            return sec


def target_cents(m):
    """Equal temperament from A2 up; a gentle bass stretch below (0.5 c per
    semitone, -12 c at A0) so the low strings' sharp partials sit in tune."""
    return 0.0 if m >= 45 else -0.5 * (45 - m)


def nat_job(a):
    m, v = a
    return m, v, S.measure_natural(f"{SRC}/Samples/{nname(m)}v{v}.flac", m)


def main():
    os.makedirs(OUT, exist_ok=True)
    pub = [int(l.split()[2]) for l in open(f"{SRC}/Data/tune_ret.txt") if l.startswith("#define")]
    nat = S.run_pool(nat_job, [(m, v) for m in NOTES for v in LAYERS])
    tuning = {}
    for i, m in enumerate(NOTES):
        vals = [c for mm, v, c in nat if mm == m and c is not None]
        med = float(np.median(vals))
        tuning[m] = {"note": nname(m), "source_cents_median": round(med, 1),
                     "source_cents_min": round(min(vals), 1), "source_cents_max": round(max(vals), 1),
                     "published_retune_cents": pub[i],
                     "target_cents": target_cents(m),
                     "applied_cents": round(target_cents(m) - med, 1)}
    own = {(m, v): c for m, v, c in nat}
    jobs = []
    for m in NOTES:
        for li, v in enumerate(LAYERS):
            L = length_s(m) * (0.8 if v in SOFT else 1.0)
            fix = tuning[m]["applied_cents"]
            c = own.get((m, v))
            if c is not None and abs(c - tuning[m]["source_cents_median"]) > 2.0:
                fix = round(target_cents(m) - c, 1)       # this take sits apart from its note
            jobs.append({"src": f"{SRC}/Samples/{nname(m)}v{v}.flac", "out": f"{OUT}/{m}_v{v}.mp3",
                         "length_s": round(L, 3), "cents": fix, "stereo": True, "q": Q,
                         "max_load_s": L + 1.0, "midi": m, "layer": v, "layer_idx": li,
                         "art": "sustain", "target_cents": target_cents(m)})
    sus = S.run_pool(S.make_sample, jobs)
    ref = S.level_gains(sus)

    extra = []
    for m in NOTES:                                   # hammer/damper release noise, mono
        extra.append({"src": f"{SRC}/Samples/rel{m - 20}.flac", "out": f"{OUT}/rel_{m}.mp3",
                      "length_s": 0.4, "stereo": False, "midi": m, "art": "release_hammer",
                      "pitched": False, "find_onset": False, "fade_frac": 0.4,
                      "onset_checked": False, "sfz_volume_db": -37})
    harm = sorted(S.name2midi(f[5:-5]) for f in os.listdir(f"{SRC}/Samples") if f.startswith("harmL"))
    for m in harm:                                    # string resonance after key-up
        extra.append({"src": f"{SRC}/Samples/harmL{nname(m)}.flac", "out": f"{OUT}/harm_{m}.mp3",
                      "length_s": 1.2, "stereo": True, "midi": m, "art": "release_resonance",
                      "cents": tuning[m]["applied_cents"], "pitched": False, "find_onset": False,
                      "fade_frac": 0.5, "onset_checked": False, "sfz_volume_db": -4})
    for nm, L, vol in (("pedalD1", 1.0, -20), ("pedalD2", 1.0, -20), ("pedalU1", 0.7, -19), ("pedalU2", 0.7, -19)):
        extra.append({"src": f"{SRC}/Samples/{nm}.flac", "out": f"{OUT}/{nm.lower().replace('pedal', 'pedal_')}.mp3",
                      "length_s": L, "stereo": True, "art": "pedal_down" if "D" in nm else "pedal_up",
                      "pitched": False, "find_onset": False, "fade_frac": 0.4,
                      "onset_checked": False, "sfz_volume_db": vol})
    ext = S.run_pool(S.make_sample, extra)
    for r in ext:      # restore the source level, on the same reference as the sustains
        r["gain_db"] = round(-r["norm_gain_db"] - ref, 2)

    rows = sus + ext
    qa = S.run_pool(S.qa_job, rows)
    files = {}
    for r in rows:
        f = os.path.basename(r["out"])
        files[f] = {k: r[k] for k in ("art", "midi", "layer", "gain_db", "cents", "target_cents", "pitched",
                                      "onset_checked", "sfz_volume_db") if k in r}
    summ, by = S.summarise(qa, files)
    for f, q in by.items():
        files[f].update(dur_s=q["dur_s"], bytes=q["bytes"], ch=q["ch"])
    checks = S.layer_checks(sus, by)
    nat_dev = max(abs(r["nat_rms_db"] - r["target_rms_db"]) for r in sus)

    def subset(pred):
        qs = [by[f] for f in files if pred(f, files[f])]
        return {"files": len(qs), "download_mb": round(sum(q["bytes"] for q in qs) / 1e6, 2),
                "decoded_mb_44k1": round(sum(S.decoded_mb(q["dur_s"], q["ch"]) for q in qs), 1),
                "decoded_mb_48k": round(sum(S.decoded_mb(q["dur_s"], q["ch"], 48000) for q in qs), 1)}

    def lite_pred(f, e):
        return (e["art"] == "sustain" and e["layer"] in LITE_LAYERS) or e["art"] in ("release_hammer", "pedal_down", "pedal_up")

    click = S.write_click(OUT)
    man = {
        "id": "grand2", "name": "Grand piano v2 (Yamaha C5)", "version": "1.0.0", "date": "2026-11-27",
        "status": "staged, not wired into index.html",
        "source": {
            "library": "Salamander Grand Piano V3", "author": "Alexander Holm",
            "url": "https://github.com/sfzinstruments/SalamanderGrandPiano",
            "original": "https://archive.org/details/SalamanderGrandPianoV3",
            "format": "48 kHz / 24-bit FLAC, stereo AB pair of AKG C414",
            "licence": "CC BY 3.0 Unported", "licence_url": "https://creativecommons.org/licenses/by/3.0/",
            "licence_quote": "Creative Commons Legal Code / Attribution 3.0 Unported (the repository's LICENSE file); README: 'Author: Alexander Holm'",
            "credit": "Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Retuned, trimmed and re-encoded for this app.",
            "changes_made": "retuned per note, 48 kHz to 44.1 kHz, onset trim, tail trim with fade, peak normalisation, MP3 encode"},
        "format": {"codec": "MP3, libmp3lame VBR -q:a " + Q + " (extras -q:a " + S.LAME_Q + ")", "sample_rate": S.SR, "channels": "stereo (release_hammer is mono)",
                   "peak_dbfs": -2.0, "encoder_delay": click,
                   "note": "ffmpeg/Chrome/Firefox trim the 1105-sample MP3 delay from the LAME tag. Decode _click.mp3 once in the app and subtract where the click lands, so a decoder that ignores the tag stays aligned."},
        "file_pattern": {"sustain": "{midi}_v{layer}.mp3", "release_hammer": "rel_{midi}.mp3",
                         "release_resonance": "harm_{midi}.mp3", "pedal": "pedal_d1|d2|u1|u2.mp3"},
        "notes": NOTES, "note_spacing": "minor third (the source is sampled in minor thirds; playback shifts +-1 semitone)",
        "layers": [{"layer": v, "source_layer": v, "lovel": VEL[v][0], "hivel": VEL[v][1],
                    "vel": (VEL[v][0] + VEL[v][1]) // 2} for v in LAYERS],
        "round_robins": 1,
        "articulations": {
            "sustain": "8 layers x 30 notes",
            "release_hammer": "key-up hammer/damper noise, 30 notes, mono, play at key release (source sfz volume -37 dB, veltrack 82 %)",
            "release_resonance": f"string resonance after key-up ('harmL'), {len(harm)} notes, play at key release for velocity 45+ (source sfz volume -4 dB, rt_decay 6-9 dB/s)",
            "pedal_down": "2 takes", "pedal_up": "2 takes"},
        "tail_lengths_s": {str(m): length_s(m) for m in NOTES},
        "tail_note": "layers 2, 4 and 6 use 0.8x these lengths; the last 30 % of every file is a cosine fade to zero",
        "loop_points": None,
        "tuning": {"reference": "A4 = 440 Hz", "method": "fundamental measured per file (zero-padded FFT, parabolic peak); one correction per note = target minus the median of its 8 layers; a take more than 2 cents from that median gets its own correction (files[].cents_applied)",
                   "target": "equal temperament from A2 up; below A2 a bass stretch of 0.5 cent per semitone (-12 cents at A0)",
                   "why_not_the_published_table": "Data/tune_ret.txt matches the measured fundamentals only above C6. From A1 to C3 it leaves the fundamentals 10 to 22 cents flat, so the corrections here are measured, and the published values are kept below for reference.",
                   "per_note": {str(m): tuning[m] for m in NOTES}},
        "gain": {"field": "files[].gain_db", "meaning": "apply at playback to the peak-normalised file. It restores the piano's own dynamics, smoothed across notes inside each layer. 0 dB is the loudest file.",
                 "reference_offset_db": round(ref, 2)},
        "totals": summ, "lite": dict(layers=LITE_LAYERS, articulations=["sustain", "release_hammer", "pedal_down", "pedal_up"],
                                     manifest="manifest.lite.json", **subset(lite_pred)),
        "files": files,
    }
    S.write_json(f"{OUT}/manifest.json", man)
    lite = {k: man[k] for k in ("id", "name", "version", "date", "status", "source", "format", "file_pattern", "notes", "note_spacing", "round_robins", "loop_points", "gain")}
    lite["id"] = "grand2-lite"
    lite["layers"] = [l for l in man["layers"] if l["layer"] in LITE_LAYERS]
    lv = {4: (1, 43), 8: (44, 72), 12: (73, 104), 16: (105, 127)}
    for l in lite["layers"]:
        l["lovel"], l["hivel"] = lv[l["layer"]]
    lite["totals"] = man["lite"]
    lite["files"] = {f: e for f, e in files.items() if lite_pred(f, e)}
    S.write_json(f"{OUT}/manifest.lite.json", lite)
    S.write_json(f"{OUT}/qa.json", {"summary": summ, "layer_checks": checks,
                                    "source_level_max_dev_from_smooth_curve_db": round(nat_dev, 2),
                                    "lite": man["lite"], "per_file": sorted(qa, key=lambda q: q["file"])})
    print(summ, checks, man["lite"], "nat_dev", round(nat_dev, 2))
    for m in NOTES:
        print(m, tuning[m])


if __name__ == "__main__":
    main()
