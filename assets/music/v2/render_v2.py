"""Render music v2 sketches: `python render_v2.py [id ...]` (all sketches when no id is given).

Writes out/<id>/{space,bossa}.wav (24-bit masters), {space,bossa}.mp4 (AAC for the audition page)
and out/manifest.json with measured loudness, peaks and seam checks.
"""
import json
import os
import struct
import subprocess
import sys
import time

import numpy as np

import engine as E
from engine import R
import arrange
from sketches import SKETCHES

OUT = os.path.join(E.HERE, "out")
BARS = 16


def write_wav24(path, x):
    xi = np.clip(np.round(x.T * 8388607.0), -8388608, 8388607).astype("<i4")
    b = np.frombuffer(xi.tobytes(), dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(b)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, E.SR, E.SR * 6, 6, 24))
        f.write(b"data" + struct.pack("<I", len(b)) + b)


def normalise(L, x, tmp):
    """Scale to the loudness target, then down if the true peak would pass the ceiling."""
    x = L.filt(x, [R.rbj("hp", 28, 0.7)])
    x = x / (np.max(np.abs(x)) + 1e-12) * 0.5
    R.write_wav_float(tmp, x)
    i, tp, _ = R.ebur128(tmp)
    gain = R.db(R.TARGET_LUFS - i)
    if tp + 20 * np.log10(gain) > R.TRUE_PEAK_CEILING_DB:
        gain = R.db(R.TRUE_PEAK_CEILING_DB - tp)
    os.remove(tmp)
    return x * gain


def seam(x):
    """Sample jump across the loop point, relative to the largest jump anywhere else."""
    d = np.abs(np.diff(x, axis=1)).max()
    return float(np.abs(x[:, 0] - x[:, -1]).max() / (d + 1e-12))


def levels(stems):
    return {k: round(float(10 * np.log10(np.mean(v ** 2) + 1e-20)), 1) for k, v in stems.items()}


def render(S):
    out = os.path.join(OUT, S["id"])
    L = E.Loop(S["bpm"], BARS, os.path.join(out, "work"))
    assert len(S["chords"]) == BARS and len(S["theme"]) == BARS
    S = dict(S, segs=E.parse_chords(S["chords"]), theme=E.parse_theme(S["theme"]))
    info = dict(id=S["id"], title=S["title"], about=S["about"], bpm=round(S["bpm"], 2), bars=BARS,
                samples=L.n, seconds=L.dur, key=S["chords"][0], chords=S["chords"])
    mixes = {}
    for mood, build in (("space", arrange.build_space), ("bossa", arrange.build_bossa)):
        t0 = time.time()
        mix, stems = build(L, S, np.random.default_rng(S["seed"] + (0 if mood == "space" else 1000)))
        mix = normalise(L, mix, os.path.join(out, "_tmp.wav"))
        wav = os.path.join(out, f"{mood}.wav")
        write_wav24(wav, mix)
        i, tp, lra = R.ebur128(wav)
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "aac_at", "-b:a", "128k",
                               "-movflags", "+faststart", os.path.join(out, f"{mood}.mp4")])
        mixes[mood] = mix
        info[mood] = dict(lufs=i, true_peak=tp, lra=lra, seam=round(seam(mix), 3), stems=levels(stems),
                          parts=sorted(stems))
        print(f"  {S['id']:8s} {mood:5s} {time.time() - t0:5.1f}s  I={i:6.1f} LUFS  TP={tp:5.1f}  seam={info[mood]['seam']}"
              f"  parts={len(stems)}", flush=True)
    assert mixes["space"].shape == mixes["bossa"].shape == (2, L.n)
    info["mix5050_peak"] = round(float(np.abs((mixes["space"] + mixes["bossa"]) * np.sqrt(0.5)).max()), 3)
    return info


def main():
    ids = sys.argv[1:]
    todo = [s for s in SKETCHES if not ids or s["id"] in ids]
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    for s in todo:
        manifest[s["id"]] = render(s)
        json.dump(manifest, open(path, "w"), indent=1)


if __name__ == "__main__":
    main()
