#!/usr/bin/env python3
"""Shared helpers for the Modal Metronome sample-set builders (tools/sounds).

Version 1.0.0 (2026-11-27).
Needs: python3, numpy, scipy, soundfile, ffmpeg (libmp3lame).
Everything here is offline tooling. Nothing in this folder is loaded by an app.
"""
import json
import math
import os
import subprocess
import tempfile
from fractions import Fraction

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100            # delivery sample rate
PEAK = 10 ** (-2.0 / 20)   # every file is peak-normalised to -2 dBFS
PREROLL_MS = 1.0      # audio kept before the detected onset
ONSET_DB = -34.0      # onset = first sample above this, relative to the attack peak
LAME_Q = "2"          # libmp3lame VBR quality (V2, about 170-190 kbps on dense stereo)

NOTE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def name2midi(s):
    """'A0' -> 21, 'D#1' -> 27, 'gb2' -> 42, 'A-1' -> 9 (C4 = 60)."""
    s = s.strip().lower()
    n = NOTE[s[0]]
    i = 1
    while i < len(s) and s[i] in "#b":
        n += 1 if s[i] == "#" else -1
        i += 1
    return n + 12 * (int(s[i:]) + 1)


def midi2hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def load(path, max_s=None):
    info = sf.info(path)
    frames = -1 if max_s is None else int(max_s * info.samplerate)
    x, sr = sf.read(path, frames=frames, dtype="float64", always_2d=True)
    return x, sr


def mono(x):
    return x.mean(axis=1) if x.ndim == 2 else x


def onset_index(x, sr, db=ONSET_DB, search_s=1.5):
    """First sample whose magnitude passes `db` below the attack peak."""
    m = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    m = m[: int(search_s * sr)]
    if m.size == 0 or m.max() <= 0:
        return 0
    # attack peak: the largest value in the 80 ms after the signal first
    # reaches 25 % of the global peak (keeps a late swell from moving the mark)
    first = int(np.argmax(m >= 0.25 * m.max()))
    pk = m[first: first + int(0.08 * sr)].max()
    thr = pk * 10 ** (db / 20)
    return int(np.argmax(m >= thr))


def resample(x, sr_in, sr_out=SR, cents=0.0):
    """Resample to sr_out and raise the pitch by `cents` in one pass."""
    ratio = (sr_out / sr_in) / (2 ** (cents / 1200.0))
    fr = Fraction(ratio).limit_denominator(3000)
    if fr == 1:
        return x.copy()
    return signal.resample_poly(x, fr.numerator, fr.denominator, axis=0)


def trim(x, sr, length_s, fade_frac=0.30, min_fade_s=0.05, onset=None):
    """Cut at the onset (minus the pre-roll), cap the length, fade both ends."""
    if onset is None:
        onset = onset_index(x, sr)
    start = max(0, onset - int(PREROLL_MS * sr / 1000))
    y = x[start: start + int(length_s * sr)].copy()
    n = len(y)
    fi = min(n, max(1, int(0.0005 * sr)))             # 0.5 ms fade-in
    ramp = np.linspace(0, 1, fi, endpoint=False)
    fo = min(n, int(max(min_fade_s, fade_frac * n / sr) * sr))
    out = 0.5 * (1 + np.cos(np.linspace(0, math.pi, fo)))
    if y.ndim == 2:
        y[:fi] *= ramp[:, None]
        y[n - fo:] *= out[:, None]
    else:
        y[:fi] *= ramp
        y[n - fo:] *= out
    return y


def rms_db(x, sr, t0=0.0, t1=0.4):
    seg = mono(x)[int(t0 * sr): int(t1 * sr)]
    if seg.size == 0:
        return -120.0
    return 20 * math.log10(max(1e-9, float(np.sqrt(np.mean(seg ** 2)))))


def centroid_hz(x, sr, t1=0.3):
    seg = mono(x)[: int(t1 * sr)]
    if seg.size < 64:
        return 0.0
    sp = np.abs(np.fft.rfft(seg * np.hanning(seg.size)))
    f = np.fft.rfftfreq(seg.size, 1 / sr)
    return float((sp * f).sum() / max(1e-12, sp.sum()))


def _peak_near(spec, df, f, width):
    lo = max(1, int((f * 2 ** (-width / 1200)) / df))
    hi = min(len(spec) - 2, int((f * 2 ** (width / 1200)) / df) + 1)
    if hi <= lo:
        return None, -200.0
    k = lo + int(np.argmax(spec[lo:hi + 1]))
    if k <= 0 or k >= len(spec) - 1:
        return None, -200.0
    a, b, c = np.log(spec[k - 1] + 1e-20), np.log(spec[k] + 1e-20), np.log(spec[k + 1] + 1e-20)
    d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    return (k + d) * df, 20 * math.log10(spec[k] + 1e-20)


def coarse_f0(x, sr, fmin=20.0, fmax=5000.0, t0=0.06, t1=0.8):
    """Octave-safe pitch estimate (YIN style), used when the note is unknown."""
    seg = mono(x)[int(t0 * sr): int(t1 * sr)]
    if sr > 22050 and fmax < 2500:
        seg = signal.resample_poly(seg, 1, 2)
        sr = sr // 2
    n = seg.size
    tmax = min(n // 2, int(sr / fmin))
    tmin = max(2, int(sr / fmax))
    w = n - tmax
    nf = 1 << int(math.ceil(math.log2(2 * n)))
    fa = np.fft.rfft(seg[:w], nf)
    fb = np.fft.rfft(seg, nf)
    acf = np.fft.irfft(np.conj(fa) * fb, nf)[: tmax + 1]
    cs = np.concatenate([[0.0], np.cumsum(seg ** 2)])
    e0 = cs[w] - cs[0]
    taus = np.arange(tmax + 1)
    et = cs[taus + w] - cs[taus]
    d = e0 + et - 2 * acf
    d[0] = 0
    cm = np.ones_like(d)
    run = np.cumsum(d[1:])
    cm[1:] = d[1:] * np.arange(1, tmax + 1) / np.maximum(run, 1e-12)
    cand = cm[tmin:]
    below = np.where(cand < 0.15)[0]
    if below.size:
        k = below[0]
        while k + 1 < cand.size and cand[k + 1] < cand[k]:
            k += 1
    else:
        k = int(np.argmin(cand))
    return sr / (k + tmin)


def f0_hz(x, sr, expect_hz, t0=None, t1=None, width=120):
    """Fundamental near expect_hz from a zero-padded FFT.

    Uses partial 1; falls back to partial 2 (halved) when the fundamental is
    weak or below 45 Hz. Returns (hz, partial_used)."""
    if t0 is None:
        t0 = 0.10 if expect_hz < 1000 else 0.03
    if t1 is None:
        t1 = 1.6 if expect_hz < 500 else (0.9 if expect_hz < 1500 else 0.35)
    seg = mono(x)[int(t0 * sr): int(t1 * sr)]
    if seg.size < 256:
        return None, 0
    nfft = 1 << max(18, int(math.ceil(math.log2(seg.size))) + 3)
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size), nfft))
    df = sr / nfft
    f1, a1 = _peak_near(spec, df, expect_hz, width)
    f2, a2 = _peak_near(spec, df, 2 * expect_hz, width)
    if f1 is None or expect_hz < 45 or (f2 is not None and a1 < a2 - 30):
        if f2 is None:
            return f1, 1
        return f2 / 2, 2
    return f1, 1


def cents(hz, ref_hz):
    return 1200 * math.log2(hz / ref_hz)


def normalise(x, peak=PEAK):
    p = float(np.abs(x).max())
    if p <= 0:
        return x, 0.0
    return x * (peak / p), 20 * math.log10(peak / p)


def encode_mp3(x, out_path, sr=SR, q=LAME_Q):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
        tmp = t.name
    try:
        sf.write(tmp, x, sr, subtype="FLOAT")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", tmp, "-map_metadata", "-1",
             "-c:a", "libmp3lame", "-q:a", str(q), "-ar", str(sr), "-id3v2_version", "0",
             "-write_id3v1", "0", out_path], check=True)
    finally:
        os.unlink(tmp)
    return os.path.getsize(out_path)


def decode(path, sr=SR, raw_delay=False):
    """Decode with ffmpeg. raw_delay=True keeps the encoder/decoder delay."""
    ch = int(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=channels", "-of", "csv=p=0", path], capture_output=True, text=True,
        check=True).stdout.strip().split(",")[0])
    cmd = ["ffmpeg", "-v", "error"]
    if raw_delay:
        cmd += ["-flags2", "+skip_manual"]
    cmd += ["-i", path, "-f", "f32le", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype("float64").reshape(-1, ch)


def qa_file(path, midi=None, pitched=True):
    """Numbers measured on the DECODED delivery file."""
    y = decode(path)
    r = {
        "bytes": os.path.getsize(path),
        "ch": y.shape[1],
        "dur_s": round(len(y) / SR, 3),
        "peak_dbfs": round(20 * math.log10(max(1e-9, float(np.abs(y).max()))), 2),
        "onset_ms": round(1000 * onset_index(y, SR) / SR, 2),
        "rms_db": round(rms_db(y, SR), 2),
        "centroid_hz": round(centroid_hz(y, SR)),
    }
    if pitched and midi is not None:
        hz, part = f0_hz(y, SR, midi2hz(midi))
        if hz:
            r["cents"] = round(cents(hz, midi2hz(midi)), 2)
            r["partial"] = part
    return r


def decoded_mb(dur_s, ch, sr=SR):
    """Web Audio keeps float32 per channel."""
    return dur_s * sr * ch * 4 / 1e6


def smooth_trend(vals, win=5):
    """Median-then-mean smoothing across neighbouring notes."""
    v = np.asarray(vals, dtype=float)
    n = len(v)
    if n < 3:
        return np.full(n, v.mean())
    h = win // 2
    med = np.array([np.median(v[max(0, i - h): i + h + 1]) for i in range(n)])
    return np.array([med[max(0, i - h): i + h + 1].mean() for i in range(n)])


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, sort_keys=False)
        f.write("\n")


def write_click(folder):
    """A one-sample click at t=0, encoded like every other file in the set.

    The app can decode it once and read where the click lands: that is the
    decoder's untrimmed MP3 delay on this browser (0 where the LAME tag is
    honoured, about 1105 samples = 25.06 ms where it is not)."""
    x = np.zeros(int(0.25 * SR))
    x[0] = PEAK
    p = os.path.join(folder, "_click.mp3")
    encode_mp3(x, p)
    d0 = decode(p)[:, 0]
    d1 = decode(p, raw_delay=True)[:, 0]
    return {"file": "_click.mp3",
            "click_at_samples_tag_honoured": int(np.argmax(np.abs(d0))),
            "click_at_samples_tag_ignored": int(np.argmax(np.abs(d1)))}


# ---------------------------------------------------------------- set helpers
def measure_natural(path, midi, max_s=3.0):
    """Cents of the source file's fundamental against equal temperament."""
    x, sr = load(path, max_s=max_s)
    on = onset_index(x, sr)
    hz, part = f0_hz(x[on:], sr, midi2hz(midi))
    return None if not hz else cents(hz, midi2hz(midi))


def detect_midi(path, lo_hz=20.0, hi_hz=600.0):
    """Sounding MIDI note of a source file (octave-safe), with its cents."""
    x, sr = load(path, max_s=2.0)
    on = onset_index(x, sr)
    c = coarse_f0(x[on:], sr, fmin=lo_hz, fmax=hi_hz)
    m = int(round(69 + 12 * math.log2(c / 440.0)))
    hz, part = f0_hz(x[on:], sr, midi2hz(m))
    return m, (cents(hz, midi2hz(m)) if hz else None)


def make_sample(job):
    """One delivery file. job keys: src, out, length_s, cents (pitch fix),
    stereo (bool), fade_frac, max_load_s, pitched(bool), midi."""
    x, sr = load(job["src"], max_s=job.get("max_load_s"))
    if not job.get("stereo", True):
        x = x.mean(axis=1, keepdims=True)
    elif x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    on = onset_index(x, sr) if job.get("find_onset", True) else 0
    start = max(0, on - int(0.02 * sr))
    need = int((job["length_s"] * 2 ** (job.get("cents", 0.0) / 1200) + 0.1) * sr)
    x = x[start: on + need]
    y = resample(x, sr, SR, job.get("cents", 0.0))
    y = trim(y, SR, job["length_s"], fade_frac=job.get("fade_frac", 0.30),
             onset=None if job.get("find_onset", True) else 0)
    nat_rms = rms_db(y, SR)
    nat_peak = 20 * math.log10(max(1e-9, float(np.abs(y).max())))
    y, ngain = normalise(y)
    if y.shape[1] == 1:
        y = y[:, 0]
    encode_mp3(y, job["out"], q=job.get("q", LAME_Q))
    if job.get("find_onset", True):
        # check the onset on the decoded file; pull the start in if it sits late
        for _ in range(2):
            late = onset_index(decode(job["out"]), SR) - int(PREROLL_MS * SR / 1000)
            if late <= int(0.0005 * SR):
                break
            y = y[late:].copy()
            fi = max(1, int(0.0005 * SR))
            y[:fi] = (y[:fi].T * np.linspace(0, 1, fi, endpoint=False)).T
            encode_mp3(y, job["out"], q=job.get("q", LAME_Q))
    r = dict(job)
    r.update(nat_rms_db=nat_rms, nat_peak_db=nat_peak, norm_gain_db=ngain,
             src_onset_ms=1000 * on / sr)
    return r


def qa_job(job):
    r = qa_file(job["out"], midi=job.get("midi"), pitched=job.get("pitched", True))
    r["file"] = os.path.basename(job["out"])
    return r


def level_gains(rows, key_layer="layer_idx", key_note="midi"):
    """Playback gain per file so that, within a layer, loudness follows a
    smooth curve across notes, and layers never cross.

    rows need nat_rms_db and norm_gain_db. Adds gain_db (to apply at playback
    to the peak-normalised file) and target_rms_db. Round robins of one
    note/layer share one target."""
    layers = sorted({r[key_layer] for r in rows})
    notes = sorted({r[key_note] for r in rows})
    T = {}
    for L in layers:
        per = []
        for n in notes:
            v = [r["nat_rms_db"] for r in rows if r[key_layer] == L and r[key_note] == n]
            per.append(float(np.mean(v)) if v else np.nan)
        per = np.array(per)
        ok = ~np.isnan(per)
        if ok.sum() == 0:
            continue
        per[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), per[ok])
        T[L] = smooth_trend(per)
    prev = None
    for L in layers:                       # layers must rise by 1 dB or more
        if L not in T:
            continue
        if prev is not None:
            T[L] = np.maximum(T[L], T[prev] + 1.0)
        prev = L
    for r in rows:
        t = float(T[r[key_layer]][notes.index(r[key_note])])
        r["target_rms_db"] = t
        r["gain_db"] = t - (r["nat_rms_db"] + r["norm_gain_db"])
    top = max(r["gain_db"] for r in rows)
    for r in rows:
        r["gain_db"] = round(r["gain_db"] - top, 2)
    return top


def run_pool(fn, jobs, procs=4):
    from multiprocessing import Pool
    with Pool(procs) as p:
        return p.map(fn, jobs, chunksize=4)


def summarise(qa_rows, files):
    """Roll the per-file QA up into the numbers the report quotes."""
    by = {q["file"]: q for q in qa_rows}
    cents_v = [abs(q["cents"]) for q in qa_rows if "cents" in q and files[q["file"]].get("pitched", True)]
    tgt = [abs(q["cents"] - files[q["file"]].get("target_cents", 0.0)) for q in qa_rows
           if "cents" in q and files[q["file"]].get("pitched", True)]
    s = {
        "files": len(qa_rows),
        "download_mb": round(sum(q["bytes"] for q in qa_rows) / 1e6, 2),
        "decoded_mb_44k1": round(sum(decoded_mb(q["dur_s"], q["ch"]) for q in qa_rows), 1),
        "decoded_mb_48k": round(sum(decoded_mb(q["dur_s"], q["ch"], 48000) for q in qa_rows), 1),
        "seconds": round(sum(q["dur_s"] for q in qa_rows), 1),
        "kbps_avg": round(8 * sum(q["bytes"] for q in qa_rows) / 1000 / max(1e-9, sum(q["dur_s"] for q in qa_rows))),
        "peak_dbfs_max": max(q["peak_dbfs"] for q in qa_rows),
        "clipped_files": sum(1 for q in qa_rows if q["peak_dbfs"] >= 0.0),
        "onset_ms_max": max(q["onset_ms"] for q in qa_rows if files[q["file"]].get("onset_checked", True)),
        "onset_ms_median": float(np.median([q["onset_ms"] for q in qa_rows if files[q["file"]].get("onset_checked", True)])),
    }
    if tgt:
        s.update(tuning_abs_cents_vs_target_max=round(max(tgt), 2),
                 tuning_abs_cents_vs_target_median=round(float(np.median(tgt)), 2),
                 tuning_files_outside_3c=sum(1 for t in tgt if t > 3.0),
                 tuning_files_measured=len(tgt))
    return s, by


def layer_checks(rows, by, key_layer="layer_idx", key_note="midi"):
    """Level and brightness order across layers; level spread across notes."""
    notes = sorted({r[key_note] for r in rows})
    layers = sorted({r[key_layer] for r in rows})
    lvl = {}
    brt = {}
    for r in rows:
        q = by[os.path.basename(r["out"])]
        k = (r[key_note], r[key_layer])
        lvl.setdefault(k, []).append(q["rms_db"] + r["gain_db"])
        brt.setdefault(k, []).append(q["centroid_hz"])
    lv = {k: float(np.mean(v)) for k, v in lvl.items()}
    br = {k: float(np.mean(v)) for k, v in brt.items()}
    lev_viol = bri_viol = pairs = 0
    for n in notes:
        ls = [L for L in layers if (n, L) in lv]
        for a, b in zip(ls, ls[1:]):
            pairs += 1
            lev_viol += lv[(n, b)] <= lv[(n, a)]
            bri_viol += br[(n, b)] < br[(n, a)] * 0.97
    spread = {}
    for L in layers:
        v = np.array([lv[(n, L)] for n in notes if (n, L) in lv])
        if len(v) > 2:
            spread[str(L)] = round(float(np.abs(v - smooth_trend(v)).max()), 2)
    rr = [max(v) - min(v) for v in lvl.values() if len(v) > 1]
    return {"layer_pairs": pairs, "level_order_violations": int(lev_viol),
            "brightness_order_violations": int(bri_viol),
            "max_level_dev_from_smooth_curve_db_by_layer": spread,
            "max_round_robin_level_spread_db": round(max(rr), 2) if rr else None}
