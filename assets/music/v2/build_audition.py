"""Assemble the audition page: `python build_audition.py <target dir>`.

Copies audition/index.html, writes sketches.json from out/manifest.json, and gathers the audio as
audio/<id>-{space,bossa}.mp4, with the loops that are live on the site as the baseline.
"""
import json
import os
import shutil
import sys

import engine as E
from sketches import SKETCHES

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(E.HERE)))
target = sys.argv[1]
os.makedirs(os.path.join(target, "audio"), exist_ok=True)
manifest = json.load(open(os.path.join(E.HERE, "out", "manifest.json")))

rows = [dict(id="live", title="What plays today", live=True, seconds=24,
             about="The current loops, for comparison: synth pad and glass arpeggio above; steel guitar, vibes and ukulele below.")]
shutil.copy(os.path.join(ROOT, "public/music/space.m4a"), os.path.join(target, "audio/live-space.mp4"))
shutil.copy(os.path.join(ROOT, "public/music/aloha.m4a"), os.path.join(target, "audio/live-bossa.mp4"))
for s in SKETCHES:
    m = manifest[s["id"]]
    rows.append({k: m[k] for k in ("id", "title", "about", "bpm", "seconds", "key", "chords")})
    for mood in ("space", "bossa"):
        shutil.copy(os.path.join(E.HERE, "out", s["id"], f"{mood}.mp4"), os.path.join(target, f"audio/{s['id']}-{mood}.mp4"))
json.dump(rows, open(os.path.join(target, "sketches.json"), "w"), indent=1)
shutil.copy(os.path.join(E.HERE, "audition", "index.html"), os.path.join(target, "index.html"))
print(f"{len(rows)} rows, {sum(os.path.getsize(os.path.join(target, 'audio', f)) for f in os.listdir(os.path.join(target, 'audio'))) / 1e6:.1f} MB of audio")
