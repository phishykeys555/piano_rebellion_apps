#!/usr/bin/env python3
"""Build drum-machine/keys/rhodes73 (1977 Rhodes Mark I Stage 73, jRhodes3d).

Version 1.0.0 (2026-11-27).
Usage: python3 tools/sounds/build_keys2.py <dir holding the jRhodes3d checkout> <drum-machine/keys>
Source: https://github.com/sfzinstruments/jlearman.jRhodes3d (samples CC BY 4.0 since
commit 4508215, 2026-11-22; credit required). Needs sndlib.py (same folder).
"""
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sndlib as S

SRC, OUT = sys.argv[1], sys.argv[2]
Q = "1"
SID = "rhodes73"
LAYERS = ["v1", "v2", "v3", "v4", "v5"]       # v1 softest ... v5 hardest (source _5 ... _1)


def length_s(m):
    for top, sec in ((48, 8.0), (60, 7.0), (72, 6.0), (84, 4.5)):
        if m < top:
            return sec
    return 3.0


def nat_job(j):
    x, sr = S.load(j["src"], max_s=2.5)
    on = S.onset_index(x, sr)
    hz, part = S.f0_hz(x[on:], sr, S.midi2hz(j["midi"]), width=150)
    return j["src"], (S.cents(hz, S.midi2hz(j["midi"])) if hz else None)


def sparse_level_gains(rows):
    """Like sndlib.level_gains, for a set whose top notes lack some layers:
    each layer follows its own smoothed natural level over the notes it has
    (no value is invented for a missing note), then the layers a note does
    have are forced to rise by 1 dB or more."""
    T = {}
    for L in sorted({r["layer_idx"] for r in rows}):
        rs = sorted([r for r in rows if r["layer_idx"] == L], key=lambda r: r["midi"])
        tr = S.smooth_trend([r["nat_rms_db"] for r in rs])
        for r, t in zip(rs, tr):
            T[(r["midi"], L)] = float(t)
    for m in sorted({r["midi"] for r in rows}):
        prev = None
        for L in sorted(L for (mm, L) in T if mm == m):
            if prev is not None:
                T[(m, L)] = max(T[(m, L)], prev + 1.0)
            prev = T[(m, L)]
    for r in rows:
        r["target_rms_db"] = T[(r["midi"], r["layer_idx"])]
        r["gain_db"] = r["target_rms_db"] - (r["nat_rms_db"] + r["norm_gain_db"])
    top = max(r["gain_db"] for r in rows)
    for r in rows:
        r["gain_db"] = round(r["gain_db"] - top, 2)


def regions_of(sfz):
    txt = re.sub(r"//.*", "", open(sfz, encoding="utf-8", errors="replace").read())
    grp, out = {}, []
    for head, body in re.findall(r"<(\w+)>([^<]*)", txt):
        ops = dict(re.findall(r"(\w+)=(\S+)", body))
        if head == "group":
            grp = ops
        elif head == "region" and "sample" in ops:
            out.append(dict(grp, **ops))
    return out


def main():
    out = f"{OUT}/{SID}"
    os.makedirs(out, exist_ok=True)
    d = f"{SRC}/jRhodes3d-mono"
    jobs = {}
    for f in sorted(os.listdir(d)):
        mm = re.match(r"A_(\d+)__\w+_(\d)\.flac$", f)
        if not mm:
            continue
        m, n = int(mm.group(1)), int(mm.group(2))
        jobs[f] = {"src": f"{d}/{f}", "midi": m, "layer": LAYERS[5 - n], "layer_idx": 5 - n, "art": "sustain",
                   "stereo": False, "q": Q, "target_cents": 0.0}
    js = list(jobs.values())
    nat = dict(S.run_pool(nat_job, js))
    notes = sorted({j["midi"] for j in js})
    med = {m: float(np.median([nat[j["src"]] for j in js if j["midi"] == m and nat[j["src"]] is not None])) for m in notes}
    for j in js:
        c = nat[j["src"]]
        if c is None or abs(c - med[j["midi"]]) > 30:
            c = med[j["midi"]]
        L = length_s(j["midi"])
        j.update(source_cents=round(c, 1), cents=round(-c, 1), length_s=L, max_load_s=L + 1.0,
                 out=f"{out}/{j['midi']}_{j['layer']}.mp3")
    rows = S.run_pool(S.make_sample, js)
    sparse_level_gains(rows)
    bysrc = {os.path.basename(r["src"]): r for r in rows}
    regions = []
    for r in regions_of(f"{SRC}/jRhodes3d-mono-no-xfade.sfz"):
        b = bysrc[r["sample"]]
        regions.append({"file": os.path.basename(b["out"]), "root": b["midi"],
                        "lokey": S.name2midi(r["lokey"]), "hikey": S.name2midi(r["hikey"]),
                        "lovel": int(r.get("lovel", 1)), "hivel": int(r.get("hivel", 127)),
                        "release_s": float(r.get("ampeg_release", 0.3))})
    man = {
        "id": SID, "name": "Tine electric piano (1977 Rhodes Mark I Stage 73)", "version": "1.0.0", "date": "2026-11-27",
        "status": "staged, not wired into index.html",
        "source": {
            "library": "jRhodes3d", "author": "Jeff Learman",
            "url": "https://github.com/sfzinstruments/jlearman.jRhodes3d",
            "upstream_url": "https://github.com/jlearman/jRhodes3d", "source_commit": "4508215a0ec6613a2af19d6f4dc7b329e0e7bba0",
            "licence": "CC BY 4.0 (samples)", "licence_url": "https://creativecommons.org/licenses/by/4.0/",
            "licence_quote": "LICENSE (commit 4508215, 2026-11-22, 'Revise sample licensing from CC BY-NC to CC BY'): 'License for samples: CC BY' ... 'To distribute the samples themselves, such as in an application, software instrument, or as a sample set, the jRhodes samples are licensed under CC BY 4.0.' ... 'BY: Credit must be given to the creator. Please (for example, in an About menu, or wherever credits are shown) state that samples are from (or based on, if that's the case) jRhodes3d - https://github.com/sfzinstruments/jlearman.jRhodes3d'",
            "licence_caveat": "Until 2026-11-22 these samples were CC BY-NC. The LICENSE file is the governing text, but stale lines remain upstream: the .sfz headers still say 'license: CC-SA-BY' and the sfzinstruments catalogue page still lists CC-BY-NC-4.0. Keep a copy of LICENSE at commit 4508215 with the app's records.",
            "instrument": "1977 Rhodes Mark I Stage 73, recorded direct from the harp connector with the owner's EQ (treble boost, low-mid scoop), noise-reduced; 16-bit / 44.1 kHz mono",
            "changes_made": "pitch-corrected per file, onset trim, tail trim with fade, peak normalisation, MP3 encode",
            "credit": "Electric piano: based on jRhodes3d by Jeff Learman (https://github.com/sfzinstruments/jlearman.jRhodes3d), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Retuned, trimmed and re-encoded for this app.",
        },
        "description": "Real Rhodes Mark I Stage 73, every 4th white key (15 roots, F1 to C7), up to five dynamics; the hard layers carry the bark. Mono DI: add tremolo/auto-pan, amp and cabinet tone in the app.",
        "format": {"codec": "MP3, libmp3lame VBR -q:a " + Q, "sample_rate": S.SR, "peak_dbfs": -2.0,
                   "note": "Decode _click.mp3 once in the app and subtract where the click lands, so a decoder that ignores the LAME tag stays aligned.",
                   "channels": "mono (the source is mono, 44.1 kHz / 16-bit)"},
        "file_pattern": {"sustain": "{root_midi}_{layer}.mp3"},
        "notes": notes,
        "note_spacing": "every 4th white key (3 to 6 semitones). Use `regions` (the source's own key and velocity map, no-crossfade version).",
        "layers": LAYERS,
        "layers_note": "v1 softest, v5 hardest. The top six roots have fewer layers (71 and 76: four; 81 to 96: three), as sampled; `regions` already maps velocities onto what exists.",
        "round_robins": 1,
        "articulations": {"sustain": f"{len(rows)} samples", "release": "none in the source: use a short amplitude release (regions[].release_s, 0.2 to 0.5 s)"},
        "sample_length": "source samples run up to 25 s; cut here to 8 s (bass) down to 3 s (top) with a cosine fade over the last 30 %",
        "regions": regions, "loop_points": None,
        "tuning": {"reference": "A4 = 440 Hz, equal temperament",
                   "method": "fundamental measured per file and corrected to 0 cents (files[].source_cents is what the source measured before correction)"},
        "gain": {"field": "files[].gain_db", "meaning": "apply at playback to the peak-normalised file: loudness is smooth across notes inside a layer and rises by 1 dB or more per layer; scale by velocity in the app. 0 dB is the loudest file."},
    }
    qa = S.run_pool(S.qa_job, rows)
    files = {}
    for r in rows:
        files[os.path.basename(r["out"])] = {k: r[k] for k in ("art", "midi", "layer", "gain_db", "cents", "target_cents", "source_cents")}
    summ, by = S.summarise(qa, files)
    for f, q in by.items():
        files[f].update(dur_s=q["dur_s"], bytes=q["bytes"], ch=q["ch"])
    man["format"]["encoder_delay"] = S.write_click(out)
    man["totals"], man["files"] = summ, files
    qj = {"summary": summ, "per_file": sorted(qa, key=lambda q: q["file"]), "layer_checks": S.layer_checks(rows, by)}
    S.write_json(f"{out}/manifest.json", man)
    S.write_json(f"{out}/qa.json", qj)
    print(summ)
    print(qj["layer_checks"])
    print("outside 3c:", [(q["file"], q.get("cents")) for q in qa if abs(q.get("cents", 0)) > 3])
    print("no pitch:", [q["file"] for q in qa if "cents" not in q])


if __name__ == "__main__":
    main()
