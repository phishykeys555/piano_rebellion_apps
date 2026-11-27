#!/usr/bin/env python3
"""Build the staged bass sets under drum-machine/bass/ from Karoryfer CC0 libraries.

Version 1.0.0 (2026-11-27).
Usage: python3 tools/sounds/build_bass.py <dir holding the source checkouts> <drum-machine/bass> [set ...]
Source checkouts (git clone https://github.com/sfzinstruments/<name>):
  karoryfer.fashionbass  karoryfer.pastabass  karoryfer.growlybass  karoryfer.meatbass
All four carry a CC0 1.0 LICENSE file; no credit is required.
"""
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sndlib as S

SRC, OUT = sys.argv[1], sys.argv[2]
CC0 = {"licence": "CC0 1.0 Universal", "licence_url": "https://creativecommons.org/publicdomain/zero/1.0/",
       "credit": "none required (optional: Karoryfer Samples, CC0)"}
PAT = re.compile(r"^([a-g]b?\d)_(\w+?)_rr(\d)\.wav$")

SETS = {
    "jfinger2": {
        "name": "Electric bass, J-style, roundwound, neck pickup, DI (Karoryfer Fashionbass)",
        "repo": "karoryfer.fashionbass", "dir": "notes", "octave": 0,
        "layers": ["p", "mf", "f", "ff"], "rr": 3, "lo": 24, "hi": 59, "len": (3.0, 2.6, 2.2),
        "technique": "plucked; the source readme does not name finger or pick ('played and mapped by D. Smolken', neck pickup only, onboard EQ flat, no effects). Five source layers (pp p mf f ff); pp is left out.",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'Royalty-free for all commercial and non-commercial use.' 'All samples recorded direct, using neck pickup only, with no effects and the onboard EQ set flat.'",
        "extras": [("release", r"^([a-g]b?\d)_release_rr([12])\.wav$", "rel", 0.4, "string release noise, play at note-off"),
                   ("noises", r"^noise_(\w+?)_rr([12])\.wav$", "n", 0.75,
                    "fingering = fret/finger noise per string (a c d g) and all strings; muted = dead (ghost) notes per string; mutedpalm, mutedstrum = muted strums")],
    },
    "flatfinger2": {
        "name": "Electric bass, fingered, flatwound, neck pickup, DI (Karoryfer Pastabass 'fetuccine', Squier Bass VI)",
        "repo": "karoryfer.pastabass", "dir": "samples/fetuccine", "octave": -12,
        "layers": ["vl1", "vl2", "vl3", "vl4"], "rr": 3, "lo": 28, "hi": 61, "len": (3.0, 2.6, 2.2),
        "technique": "fingered (stated by the source), flatwound strings, neck pickup: the round, thumpy P-style tone",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'Free download, open source and royalty-free for all commercial and non-commercial use, including conversion into other sampler formats and redistribution as part of larger sample libraries.' 'fetuccine - flatwound strings, fingered, neck pickup'",
        "extras": [],
    },
    "pick2": {
        "name": "Electric bass, picked, flatwound, bridge pickup, DI (Karoryfer Pastabass 'linguine', Squier Bass VI)",
        "repo": "karoryfer.pastabass", "dir": "samples/linguine", "octave": -12,
        "layers": ["vl1", "vl2", "vl3"], "rr": 3, "lo": 25, "hi": 58, "len": (3.0, 2.6, 2.2),
        "technique": "picked (stated by the source), flatwound strings, bridge pickup",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'linguine - flatwound strings, picked, bridge pickup'",
        "extras": [],
    },
    "mute2": {
        "name": "Electric bass, palm-muted and picked, flatwound, DI (Karoryfer Pastabass 'tagliatelle', Squier Bass VI)",
        "repo": "karoryfer.pastabass", "dir": "samples/tagliatelle", "octave": -12,
        "layers": ["vl1", "vl2", "vl3"], "rr": 3, "lo": 25, "hi": 58, "len": (1.6, 1.4, 1.2), "f0_t1": 0.45,
        "technique": "picked and muted (stated by the source), flatwound strings, both pickups",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'tagliatelle - flatwound strings, picked, muted, pickup combo'",
        "extras": [],
    },
    "jgrowl2": {
        "name": "Electric bass, J-style (Squier Jazz Bass), roundwound, both pickups, DI (Karoryfer Growlybass)",
        "repo": "karoryfer.growlybass", "dir": "sustain", "octave": -12,
        "layers": ["pp", "p", "f", "ff"], "rr": 3, "lo": 25, "hi": 60, "len": (3.0, 2.6, 2.2),
        "technique": "bright, aggressive plucked tone; the readme does not name finger or pick (it ships pick scrapes). 'All samples recorded direct, using both pickups and all knobs on 10.'",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'Royalty-free for all commercial and non-commercial use.' 'Sustained notes have four velocity layers and four round robins, staccato notes and release samples have five round robins, and pick scrapes have four round robins.'",
        "extras": [("staccato", r"^([a-g]b?\d)_staccato_rr([123])\.wav$", "s", 0.5, "staccato notes (short, damped), 3 round robins"),
                   ("release", r"^([a-g]b?\d)_rel_rr([12])\.wav$", "rel", 0.16, "string release noise, play at note-off"),
                   ("scrape", r"^scrape_(\d)_rr([12])\.wav$", "n_scrape", 1.5, "pick scrapes down the string, 4 kinds")],
    },
    "upright2": {
        "name": "Double bass, pizzicato (Karoryfer Meatbass, 1958 Otto Rubner, fifths tuning CGDA)",
        "repo": "karoryfer.meatbass", "dir": "Samples/pizz", "octave": 0,
        "layers": ["vl1", "vl2", "vl3", "vl4"], "rr": 3, "lo": 24, "hi": 60, "len": (3.0, 2.6, 2.0),
        "technique": "pizzicato, close mic, mono. 'Pizzicato - plucked notes with four velocity layers and four round robins, percussive noises with round robins also included'",
        "quote": "LICENSE: 'CC0 1.0 Universal'. readme.txt: 'This instrument is open source, and you can do whatever you want with it' and 'Royalty-free for all commercial and non-commercial use. Copyright 2016 Karoryfer Lecolds.'",
        "extras": [("", r"^perc(\d)_rr([12])\.wav$", "n_perc", 0.8, "percussive body/string noises (slaps, taps, thumps), 8 kinds")],
    },
}
TAGS = {3: ["p", "f", "ff"], 4: ["p", "mf", "f", "ff"]}


def lengths(cfg, m):
    a, b, c = cfg["len"]
    return a if m < 36 else (b if m < 48 else c)


def nat_job(j):
    x, sr = S.load(j["src"], max_s=2.5)
    on = S.onset_index(x, sr)
    hz, part = S.f0_hz(x[on:], sr, S.midi2hz(j["midi"]), t1=j.get("f0_t1"), width=150)
    return j["src"], (S.cents(hz, S.midi2hz(j["midi"])) if hz else None), S.rms_db(x[on:], sr)


def qa_job(j):
    y = S.decode(j["out"])
    r = S.qa_file(j["out"], midi=None, pitched=False)
    if j.get("pitched", True) and j.get("midi") is not None:
        hz, part = S.f0_hz(y, S.SR, S.midi2hz(j["midi"]), t1=j.get("f0_t1"))
        if hz:
            r["cents"] = round(S.cents(hz, S.midi2hz(j["midi"])), 2)
            r["partial"] = part
    r["file"] = os.path.basename(j["out"])
    return r


def build(sid):
    cfg = SETS[sid]
    out = f"{OUT}/{sid}"
    os.makedirs(out, exist_ok=True)
    d = f"{SRC}/{cfg['repo']}/{cfg['dir']}"
    jobs = []
    for f in sorted(os.listdir(d)):
        mm = PAT.match(f)
        if not mm or mm.group(2) not in cfg["layers"] or int(mm.group(3)) > cfg["rr"]:
            continue
        m = S.name2midi(mm.group(1)) + cfg["octave"]
        if not cfg["lo"] <= m <= cfg["hi"]:
            continue
        jobs.append({"src": f"{d}/{f}", "midi": m, "src_layer": mm.group(2), "rr": int(mm.group(3)),
                     "f0_t1": cfg.get("f0_t1"), "art": "sustain", "stereo": False, "target_cents": 0.0})
    nat = {s: (c, l) for s, c, l in S.run_pool(nat_job, jobs)}
    lev = {L: float(np.mean([nat[j["src"]][1] for j in jobs if j["src_layer"] == L])) for L in cfg["layers"]}
    order = list(cfg["layers"])          # the source's own soft-to-loud order
    tags = TAGS[len(order)]
    notes = sorted({j["midi"] for j in jobs})
    tuning = {}
    for m in notes:
        v = [nat[j["src"]][0] for j in jobs if j["midi"] == m and nat[j["src"]][0] is not None]
        tuning[m] = {"source_cents_median": round(float(np.median(v)), 1),
                     "source_cents_min": round(min(v), 1), "source_cents_max": round(max(v), 1)}
    for j in jobs:
        c = nat[j["src"]][0]
        med = tuning[j["midi"]]["source_cents_median"]
        if c is None or abs(c - med) > 40:
            c = med
        li = order.index(j["src_layer"])
        L = lengths(cfg, j["midi"]) * (0.8 if li == 0 else 1.0)
        j.update(cents=round(-c, 1), layer_idx=li, layer=tags[li], length_s=round(L, 3),
                 max_load_s=L + 1.0, out=f"{out}/{j['midi']}_{tags[li]}_{j['rr']}.mp3")
    rows = S.run_pool(S.make_sample, jobs)
    ref = S.level_gains(rows)

    extra, arts = [], {"sustain": f"{len(order)} layers x {cfg['rr']} round robins x {len(notes)} notes"}
    for sub, pat, tag, L, desc in cfg["extras"]:
        ed = f"{SRC}/{cfg['repo']}/{sub}" if sub else d
        n = 0
        for f in sorted(os.listdir(ed)):
            mm = re.match(pat, f)
            if not mm:
                continue
            j = {"src": f"{ed}/{f}", "length_s": L, "stereo": False, "pitched": False, "fade_frac": 0.3,
                 "art": {"rel": "release", "s": "staccato"}.get(tag, "noise"), "rr": int(mm.group(2))}
            if tag in ("rel", "s"):
                m = S.name2midi(mm.group(1)) + cfg["octave"]
                if not cfg["lo"] - 3 <= m <= cfg["hi"] + 3:
                    continue
                j.update(midi=m, out=f"{out}/{m}_{tag}_{mm.group(2)}.mp3")
                if tag == "rel":
                    j.update(find_onset=False, onset_checked=False)
            else:
                j.update(noise=mm.group(1), out=f"{out}/{tag}_{mm.group(1)}_{mm.group(2)}.mp3" if tag != "n" else f"{out}/n_{mm.group(1)}_{mm.group(2)}.mp3")
            extra.append(j)
            n += 1
        arts[{"rel": "release", "s": "staccato"}.get(tag, "noise_" + tag[2:] if tag != "n" else "noise")] = f"{n} files. {desc}"
    ext = S.run_pool(S.make_sample, extra) if extra else []
    for r in ext:
        r["gain_db"] = round(-r["norm_gain_db"] - ref, 2)
    allrows = rows + ext
    qa = S.run_pool(qa_job, allrows)
    files = {}
    for r in allrows:
        files[os.path.basename(r["out"])] = {k: r[k] for k in (
            "art", "midi", "layer", "rr", "noise", "gain_db", "cents", "target_cents", "pitched", "onset_checked")
            if k in r and r[k] is not None}
    summ, by = S.summarise(qa, files)
    for f, q in by.items():
        files[f].update(dur_s=q["dur_s"], bytes=q["bytes"], ch=q["ch"])
    checks = S.layer_checks(rows, by)
    click = S.write_click(out)
    man = {
        "id": sid, "name": cfg["name"], "version": "1.0.0", "date": "2026-11-27",
        "status": "staged, not wired into index.html",
        "source": dict(library=cfg["repo"], url=f"https://github.com/sfzinstruments/{cfg['repo']}",
                       publisher="Karoryfer Samples (D. Smolken)", licence_quote=cfg["quote"],
                       changes_made="pitch-corrected per file, onset trim, tail trim with fade, peak normalisation, MP3 encode", **CC0),
        "technique": cfg["technique"],
        "format": {"codec": "MP3, libmp3lame VBR -q:a " + S.LAME_Q, "sample_rate": S.SR, "channels": "mono (DI)",
                   "peak_dbfs": -2.0, "encoder_delay": click,
                   "note": "Decode _click.mp3 once in the app and subtract where the click lands, so a decoder that ignores the LAME tag stays aligned."},
        "file_pattern": {"sustain": "{midi}_{layer}_{rr}.mp3", "staccato": "{midi}_s_{rr}.mp3",
                         "release": "{midi}_rel_{rr}.mp3", "noise": "n_{name}_{rr}.mp3"},
        "midi_numbering": "sounding pitch (E1 = 28), the same as the existing bass folders",
        "notes": notes, "note_spacing": "as sampled by the source, 2 to 3 semitones apart",
        "layers": [{"layer": tags[i], "source_layer": L, "mean_source_level_db": round(lev[L], 1)} for i, L in enumerate(order)],
        "round_robins": cfg["rr"], "articulations": arts,
        "not_in_source": "slides, hammer-ons, harmonics and slap/pop are not sampled in this library",
        "tail_note": "sustains run %s s (low / mid / high register), the softest layer 0.8x; the last 30 %% of every file is a cosine fade" % (cfg["len"],),
        "loop_points": None,
        "tuning": {"reference": "A4 = 440 Hz, equal temperament", "method": "fundamental measured per file over 0.1-1.6 s (partial 2 below 45 Hz); every file corrected to 0 cents",
                   "per_note_source_cents": {str(m): tuning[m] for m in notes}},
        "gain": {"field": "files[].gain_db", "meaning": "apply at playback to the peak-normalised file. Restores the source dynamics, smoothed across notes inside each layer; round robins share one target. 0 dB is the loudest file.",
                 "reference_offset_db": round(ref, 2)},
        "totals": summ, "files": files,
    }
    S.write_json(f"{out}/manifest.json", man)
    S.write_json(f"{out}/qa.json", {"summary": summ, "layer_checks": checks, "per_file": sorted(qa, key=lambda q: q["file"])})
    print(sid, "order", order, {k: round(v, 1) for k, v in lev.items()})
    print("  ", summ)
    print("  ", checks)
    print("   src cents", {m: tuning[m]["source_cents_median"] for m in notes})
    bad = [(q["file"], q["cents"]) for q in qa if "cents" in q and files[q["file"]].get("pitched", True) and abs(q["cents"]) > 3]
    print("   outside 3c:", bad[:20])


if __name__ == "__main__":
    for sid in (sys.argv[3:] or list(SETS)):
        build(sid)
