#!/usr/bin/env python3
"""Build drum-machine/keys/wurli2, keys/pianet and keys/upright2.

Version 1.0.0 (2026-11-27).
Usage: python3 tools/sounds/build_keys_extra.py <dir holding the source checkouts> <drum-machine/keys> [set ...]
Sources:
  GregSullivan.E-Pianos  https://github.com/sfzinstruments/GregSullivan.E-Pianos  (CC BY 3.0, credit required)
  VCSL                   https://github.com/sgossner/VCSL  folder "Chordophones/Zithers/Upright Piano, Knight" (CC0)
"""
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sndlib as S

SRC, OUT = sys.argv[1], sys.argv[2]
Q = "1"
SULLIVAN = {
    "library": "Greg Sullivan's E-Pianos", "author": "Greg Sullivan (sfz mapping by kinwie)",
    "url": "https://github.com/sfzinstruments/GregSullivan.E-Pianos", "author_site": "http://www.sullivang.net/",
    "licence": "CC BY 3.0 Unported", "licence_url": "https://creativecommons.org/licenses/by/3.0/",
    "licence_quote": "README.md: 'This repository contains 3 piano instruments made by Greg Sullivan, with the author permission with the request for attribution.' 'This work is licensed under a Creative Commons Attribution 3.0 Unported License.' LICENSE file: 'Creative Commons Legal Code / Attribution 3.0 Unported'",
    "changes_made": "pitch-corrected per file, onset trim, tail trim with fade, peak normalisation, MP3 encode",
}


def parse_sfz(path):
    """Regions of a flat sfz file with <global>/<master>/<group> inheritance."""
    txt = open(path, encoding="utf-8", errors="replace").read()
    defs = dict(re.findall(r"#define\s+(\$\w+)\s+(\S+)", txt))
    txt = re.sub(r"//.*", "", txt)
    for k in sorted(defs, key=len, reverse=True):
        txt = txt.replace(k, defs[k])
    scope = {"global": {}, "master": {}, "group": {}}
    regions = []
    for head, body in re.findall(r"<(\w+)>([^<]*)", txt):
        ops = {}
        for m in re.finditer(r"(\w+)=(.+?)(?=\s+\w+=|\s*$)", body.replace("\n", " ")):
            ops[m.group(1)] = m.group(2).strip()
        if head == "global":
            scope = {"global": ops, "master": {}, "group": {}}
        elif head == "master":
            scope["master"], scope["group"] = ops, {}
        elif head == "group":
            scope["group"] = ops
        elif head == "region":
            r = {}
            for s in ("global", "master", "group"):
                r.update(scope[s])
            r.update(ops)
            regions.append(r)
    return regions


def vc_midi(letter, octave):
    """VCSL note tags count octaves from C3 = 60 ('A-1' is the piano's lowest A, MIDI 21)."""
    return S.NOTE[letter[0].lower()] + (1 if "#" in letter else 0) + 12 * (int(octave) + 2)


def piano_len(m):
    if m >= 96:
        return 0.9 if m < 102 else 0.6
    for top, sec in ((36, 3.6), (48, 3.2), (60, 2.7), (72, 2.2), (84, 1.6), (96, 1.15)):
        if m < top:
            return sec


def nat_job(j):
    x, sr = S.load(j["src"], max_s=2.5)
    on = S.onset_index(x, sr)
    hz, part = S.f0_hz(x[on:], sr, S.midi2hz(j["midi"]), width=150)
    return j["src"], (S.cents(hz, S.midi2hz(j["midi"])) if hz else None)


def finish(out, man, rows, layer_rows=None):
    qa = S.run_pool(S.qa_job, rows)
    files = {}
    for r in rows:
        files[os.path.basename(r["out"])] = {k: r[k] for k in (
            "art", "midi", "layer", "gain_db", "cents", "target_cents", "pitched", "onset_checked",
            "sfz_tune_cents", "sfz_volume_db", "source_cents") if k in r and r[k] is not None}
    summ, by = S.summarise(qa, files)
    for f, q in by.items():
        files[f].update(dur_s=q["dur_s"], bytes=q["bytes"], ch=q["ch"])
    man["format"]["encoder_delay"] = S.write_click(out)
    man["totals"], man["files"] = summ, files
    qj = {"summary": summ, "per_file": sorted(qa, key=lambda q: q["file"])}
    if layer_rows:
        qj["layer_checks"] = S.layer_checks(layer_rows, by)
    S.write_json(f"{out}/manifest.json", man)
    S.write_json(f"{out}/qa.json", qj)
    print(man["id"], summ)
    print("  ", qj.get("layer_checks"))
    print("   outside 3c:", [(q["file"], q["cents"], files[q["file"]].get("target_cents")) for q in qa
                             if "cents" in q and files[q["file"]].get("pitched", True)
                             and abs(q["cents"] - files[q["file"]].get("target_cents", 0)) > 3])
    return by


FMT = {"codec": "MP3, libmp3lame VBR -q:a " + Q, "sample_rate": S.SR, "peak_dbfs": -2.0,
       "note": "Decode _click.mp3 once in the app and subtract where the click lands, so a decoder that ignores the LAME tag stays aligned."}


def sullivan(sid, sub, sfz, name, len_fn, tagre, order, descr):
    out = f"{OUT}/{sid}"
    os.makedirs(out, exist_ok=True)
    d = f"{SRC}/GregSullivan.E-Pianos/{sub}"
    regs = [r for r in parse_sfz(f"{d}/{sfz}") if "sample" in r]
    samples = {}
    for r in regs:
        f = r["sample"]
        is_rel = r.get("trigger") == "release" or "release" in f.lower()
        lead = re.match(r"(\d+)_", f)
        root = int(r.get("pitch_keycenter", lead.group(1) if lead else r.get("lokey", 60)))
        tag = "rel" if is_rel else re.search(tagre, f).group(1).lower()
        samples.setdefault(f, {"src": f"{d}/Samples/{f}", "midi": root, "layer": tag,
                               "art": "release" if is_rel else "sustain",
                               "sfz_tune_cents": float(r.get("tune", 0)), "stereo": False, "q": Q,
                               "target_cents": 0.0})
    jobs = list(samples.values())
    nat = dict(S.run_pool(nat_job, [j for j in jobs if j["art"] == "sustain"]))
    for j in jobs:
        if j["art"] == "sustain":
            c = nat.get(j["src"])
            if c is None or abs(c + j["sfz_tune_cents"]) > 25:      # distrust a wild reading
                c = -j["sfz_tune_cents"]
            L = len_fn(j["midi"])
            j.update(source_cents=round(c, 1), cents=round(-c, 1), length_s=L, max_load_s=L + 1.0,
                     layer_idx=order.index(j["layer"]), out=f"{out}/{j['midi']}_{j['layer']}.mp3")
        else:
            j.update(length_s=0.35, pitched=False, out=f"{out}/{j['midi']}_rel.mp3", fade_frac=0.4,
                     cents=-j["sfz_tune_cents"])
    rows = S.run_pool(S.make_sample, jobs)
    bysrc = {os.path.basename(r["src"]): r for r in rows}
    # The source layers are level-matched (velocity sets the volume in the sfz),
    # so the gains here make loudness smooth across notes inside a layer and
    # rising by 1 dB or more per layer; the app's velocity curve does the rest.
    sus0 = [r for r in rows if r["art"] == "sustain"]
    ref = S.level_gains(sus0)
    vols = {}
    for r in regs:
        vols.setdefault(r["sample"], []).append(float(r.get("volume", 0)) + float(r.get("group_volume", 0)))
    for f, r in bysrc.items():
        r["sfz_volume_db"] = round(float(np.mean(vols[f])), 2)
        if r["art"] != "sustain":
            r["gain_db"] = round(-r["norm_gain_db"] + r["sfz_volume_db"] - ref, 2)
    regions = []
    for r in regs:
        b = bysrc[r["sample"]]
        e = {"file": os.path.basename(b["out"]), "root": b["midi"],
             "lokey": int(r.get("lokey", r.get("key", b["midi"]))), "hikey": int(r.get("hikey", r.get("key", b["midi"]))),
             "lovel": int(r.get("lovel", 1)), "hivel": int(r.get("hivel", 127)), "art": b["art"]}
        regions.append(e)
    sus = [r for r in rows if r["art"] == "sustain"]
    man = {
        "id": sid, "name": name, "version": "1.0.0", "date": "2026-11-27",
        "status": "staged, not wired into index.html",
        "source": dict(SULLIVAN, instrument=sub,
                       credit=f"Electric piano: {sub} from Greg Sullivan's E-Pianos, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Retuned, trimmed and re-encoded for this app."),
        "description": descr,
        "format": dict(FMT, channels="mono (the source is mono, 44.1 kHz / 16-bit)"),
        "file_pattern": {"sustain": "{root_midi}_{layer}.mp3", "release": "{root_midi}_rel.mp3"},
        "notes": sorted({r["midi"] for r in sus}),
        "note_spacing": "sparse and uneven, as sampled by the source. Use `regions` (the source's own key and velocity map), not a fixed grid.",
        "layers": order, "round_robins": 1,
        "articulations": {"sustain": f"{len(sus)} samples", "release": f"{len(rows) - len(sus)} key-release samples"},
        "regions": regions, "loop_points": None,
        "tuning": {"reference": "A4 = 440 Hz, equal temperament",
                   "method": "fundamental measured per file and corrected to 0 cents; files[].sfz_tune_cents is the source mapping's own correction, kept for cross-checking (source_cents should be near its negative)"},
        "gain": {"field": "files[].gain_db", "meaning": "apply at playback to the peak-normalised file. The source layers are level-matched, so these gains make loudness smooth across notes inside a layer and 1 dB or more apart between layers; scale by velocity in the app. 0 dB is the loudest sustain."},
    }
    finish(out, man, rows, sus)
    chk = [(os.path.basename(r["out"]), r["source_cents"], -r["sfz_tune_cents"]) for r in sus if abs(r["source_cents"] + r["sfz_tune_cents"]) > 6]
    print("   measured vs sfz tune differs > 6 c:", chk)


def upright():
    sid = "upright2"
    out = f"{OUT}/{sid}"
    os.makedirs(out, exist_ok=True)
    d = f"{SRC}/VCSL/Chordophones/Zithers/Upright Piano, Knight"

    def target(m):
        return 0.0 if m >= 45 else -0.5 * (45 - m)
    jobs = []
    for f in sorted(os.listdir(f"{d}/Sustains")):
        mm = re.match(r"Player_vl(\d)_rr1_([A-G]#?)(-?\d)\.wav$", f)
        m = vc_midi(mm.group(2), mm.group(3))
        v = int(mm.group(1))
        jobs.append({"src": f"{d}/Sustains/{f}", "midi": m, "layer": v, "layer_idx": v - 1, "art": "sustain",
                     "stereo": True, "q": Q, "target_cents": target(m)})
    nat = dict(S.run_pool(nat_job, jobs))
    notes = sorted({j["midi"] for j in jobs})
    med = {m: float(np.median([nat[j["src"]] for j in jobs if j["midi"] == m and nat[j["src"]] is not None])) for m in notes}
    for j in jobs:
        c = nat[j["src"]]
        if c is None or abs(c - med[j["midi"]]) > 30:
            c = med[j["midi"]]
        L = piano_len(j["midi"])
        j.update(source_cents=round(c, 1), cents=round(j["target_cents"] - c, 1), length_s=L, max_load_s=L + 1.0,
                 out=f"{out}/{j['midi']}_v{j['layer']}.mp3")
    sus = S.run_pool(S.make_sample, jobs)
    ref = S.level_gains(sus)
    extra = []
    for f in sorted(os.listdir(f"{d}/Releases")):
        mm = re.match(r"Player_rel_rr1_([A-G]#?)(-?\d)\.wav$", f)
        m = vc_midi(mm.group(1), mm.group(2))
        extra.append({"src": f"{d}/Releases/{f}", "out": f"{out}/rel_{m}.mp3", "midi": m, "art": "release",
                      "length_s": 0.5, "stereo": False, "pitched": False, "fade_frac": 0.5, "onset_checked": False})
    for kind in ("On", "Off"):
        for i, f in enumerate(sorted(os.listdir(f"{d}/Pedal/{kind}"))):
            extra.append({"src": f"{d}/Pedal/{kind}/{f}", "out": f"{out}/pedal_{'d' if kind == 'On' else 'u'}{i + 1}.mp3",
                          "art": "pedal_down" if kind == "On" else "pedal_up", "length_s": 1.0, "stereo": True,
                          "pitched": False, "fade_frac": 0.4, "onset_checked": False})
    ext = S.run_pool(S.make_sample, extra)
    for r in ext:
        r["gain_db"] = round(-r["norm_gain_db"] - ref, 2)
    man = {
        "id": sid, "name": "Upright piano v2 (Knight upright)", "version": "1.0.0", "date": "2026-11-27",
        "status": "staged, not wired into index.html",
        "source": {"library": "Versilian Community Sample Library (VCSL), 'Upright Piano, Knight'",
                   "author": "Versilian Studios LLC; sampled by Simon Dalzell of Ivy Audio",
                   "url": "https://github.com/sgossner/VCSL", "format": "44.1 kHz / 24-bit WAV, stereo",
                   "licence": "CC0 1.0 Universal", "licence_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                   "licence_quote": "README.md: 'This collection is under a Creative Commons 0 license. Essentially it's Public Domain- you can do whatever you want with these sounds (even make commercial software), no royalties, no credit, no special terms.'",
                   "credit": "none required (optional: Versilian Studios VCSL, CC0)",
                   "changes_made": "retuned per file, onset trim, tail trim with fade, peak normalisation, MP3 encode"},
        "format": dict(FMT, channels="stereo (releases are mono)"),
        "file_pattern": {"sustain": "{midi}_v{layer}.mp3", "release": "rel_{midi}.mp3", "pedal": "pedal_d1..4|u1..4.mp3"},
        "notes": notes, "note_spacing": "whole tone (every 2 semitones), as sampled by the source; playback shifts +-1 semitone",
        "layers": [{"layer": 1, "lovel": 1, "hivel": 75, "vel": 50}, {"layer": 2, "lovel": 76, "hivel": 127, "vel": 105}],
        "layer_note": "the source has two dynamic layers only",
        "round_robins": 1,
        "articulations": {"sustain": f"2 layers x {len(notes)} notes", "release": f"{sum(1 for e in extra if e['art'] == 'release')} key-release samples, mono",
                          "pedal_down": "4 takes", "pedal_up": "4 takes"},
        "tail_note": "same register lengths as grand2 (3.6 s in the bass down to 0.6 s at the top); the last 30 % of every file is a cosine fade",
        "loop_points": None,
        "tuning": {"reference": "A4 = 440 Hz", "target": "equal temperament from A2 up; below A2 a bass stretch of 0.5 cent per semitone",
                   "method": "fundamental measured per file; every file corrected to the target",
                   "per_note_source_cents_median": {str(m): round(med[m], 1) for m in notes}},
        "gain": {"field": "files[].gain_db", "meaning": "apply at playback to the peak-normalised file. Restores the source dynamics, smoothed across notes inside each layer. 0 dB is the loudest file.",
                 "reference_offset_db": round(ref, 2)},
    }
    finish(out, man, sus + ext, sus)


if __name__ == "__main__":
    want = sys.argv[3:] or ["wurli2", "pianet", "upright2"]
    if "wurli2" in want:
        sullivan("wurli2", "Wurlitzer EP200", "Wurlitzer EP200.sfz", "Reed electric piano (Wurlitzer EP200)",
                 lambda m: 4.0 if m < 60 else (3.2 if m < 72 else 2.4), r"\d([a-z]+)\.", ["pp", "mp", "f", "ff"],
                 "Wurlitzer EP200 reed piano, four dynamics (pp mp f ff); the ff layer carries the bark.")
    if "pianet" in want:
        sullivan("pianet", "Pianet T", "Pianet T.sfz", "Hohner Pianet T (plucked-reed electric piano)",
                 lambda m: 4.0 if m < 48 else (3.5 if m < 60 else (3.0 if m < 72 else 2.2)), r"_(P|FF)\.", ["p", "ff"],
                 "Hohner Pianet T. NOT a Rhodes: it is staged because no tine piano with a clean CC0/CC BY licence was found. Two dynamics only (P, FF).")
    if "upright2" in want:
        upright()
