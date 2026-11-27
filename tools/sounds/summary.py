#!/usr/bin/env python3
"""Collect every staged set's manifest into tools/sounds/staged_sets.json.

Version 1.0.0 (2026-11-27). Usage: python3 tools/sounds/summary.py (from the repo root)
"""
import glob
import json
import os

rows = []
for p in sorted(glob.glob("drum-machine/*/*/manifest.json")):
    m = json.load(open(p))
    q = json.load(open(os.path.join(os.path.dirname(p), "qa.json")))
    rows.append({"folder": os.path.dirname(p), "id": m["id"], "name": m["name"],
                 "licence": m["source"]["licence"], "credit": m["source"]["credit"],
                 "source_url": m["source"]["url"], "totals": m["totals"],
                 "lite": m.get("lite"), "layer_checks": q.get("layer_checks")})
json.dump({"version": "1.0.0", "date": "2026-11-27", "status": "staged, not wired into any app", "sets": rows},
          open("tools/sounds/staged_sets.json", "w"), indent=1)
for r in rows:
    t = r["totals"]
    print(f'{r["folder"]:34s} {t["files"]:4d} files {t["download_mb"]:6.2f} MB dl {t["decoded_mb_44k1"]:6.1f} MB decoded '
          f'onset<= {t["onset_ms_max"]} ms  tuning max {t.get("tuning_abs_cents_vs_target_max")} c  peak {t["peak_dbfs_max"]} dBFS')
