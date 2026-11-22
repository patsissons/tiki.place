"""Check rendered sketches: `python verify.py [id ...]`.

For each mood: sample count, loudness, true peak, loop seam, and whether the audio in each chord
segment actually contains that chord (chroma energy on chord tones versus the other pitch classes).
For the pair: equal lengths, the 50/50 blend does not clip, and the AAC file decodes to the loop.
"""
import json
import os
import subprocess
import sys

import numpy as np

import engine as E
from sketches import SKETCHES

OUT = os.path.join(E.HERE, "out")


def read(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "quiet", "-i", path, "-f", "f64le", "-ac", "2", "-ar", "48000", "-"])
    return np.frombuffer(raw, dtype="<f8").reshape(-1, 2).T


def chroma(x):
    """Energy per pitch class, 110 Hz to 2 kHz."""
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / E.SR)
    ok = (f > 110) & (f < 2000)
    pc = np.round(69 + 12 * np.log2(f[ok] / 440.0)).astype(int) % 12
    return np.bincount(pc, weights=X[ok], minlength=12)


def chord_fit(x, segs, beat):
    """Share of chroma energy on chord tones, averaged over segments, and the worst segment."""
    fits = []
    for s, ln, c in segs:
        a, b = int(s * beat * E.SR), int((s + ln) * beat * E.SR)
        ch = chroma(x[:, a:b].mean(axis=0))
        tones = set(c.tones()) | {(c.root + c.colour) % 12}
        fits.append((sum(ch[p] for p in tones) / ch.sum(), c.sym, s))
    return float(np.mean([f[0] for f in fits])), min(fits)


def main():
    ids = sys.argv[1:]
    manifest = json.load(open(os.path.join(OUT, "manifest.json")))
    bad = 0
    for S in SKETCHES:
        if ids and S["id"] not in ids:
            continue
        m = manifest[S["id"]]
        segs = E.parse_chords(S["chords"])
        beat = m["seconds"] / (m["bars"] * 4)
        notes = []
        for mood in ("space", "bossa"):
            x = read(os.path.join(OUT, S["id"], f"{mood}.wav"))
            aac = read(os.path.join(OUT, S["id"], f"{mood}.mp4"))
            fit, worst = chord_fit(x, segs, beat)
            i = m[mood]
            checks = {
                "length": x.shape[1] == m["samples"],
                "lufs": abs(i["lufs"] + 16) <= 1,
                "peak": i["true_peak"] <= -1.5,
                "seam": i["seam"] <= 1.0,
                "aac": abs(aac.shape[1] - m["samples"]) <= 2112,
                "chords": fit > 0.6 and worst[0] > 0.3,
            }
            fails = [k for k, v in checks.items() if not v]
            bad += len(fails)
            notes.append(f"{mood}: chord fit {fit:.2f} (worst {worst[0]:.2f} on {worst[1]} at beat {worst[2]:g})"
                         f" aac {aac.shape[1] - m['samples']:+d}" + (f"  FAIL {fails}" if fails else ""))
        clip = m["mix5050_peak"] >= 1.0
        bad += clip
        print(f"{S['id']:8s} {m['seconds']:.1f}s  " + " | ".join(notes) + f" | 50/50 peak {m['mix5050_peak']}" + ("  FAIL clip" if clip else ""))
    print("all checks pass" if not bad else f"{bad} check(s) failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
