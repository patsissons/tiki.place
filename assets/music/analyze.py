#!/usr/bin/env python
"""Measurements for the spike: sample counts, loop-seam discontinuity, stem levels, pictures.

Usage: .venv/bin/python analyze.py [file.wav ...]   (defaults to space.wav aloha.wav)
"""
import os
import sys
import subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def read_wav(path):
    """Decode any audio file to float64 (2,N) at its native rate via ffmpeg (handles 24-bit, m4a, ogg...)."""
    import json
    info = json.loads(subprocess.check_output(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path]))
    st = [s for s in info["streams"] if s["codec_type"] == "audio"][0]
    sr = int(st["sample_rate"])
    raw = subprocess.check_output(["ffmpeg", "-v", "quiet", "-i", path, "-f", "f64le", "-ac", "2", "-"])
    x = np.frombuffer(raw, dtype="<f8").reshape(-1, 2).T
    return x, sr


def seam_report(x, label):
    """Compare the jump across the loop point (last sample -> first sample) with ordinary
    sample-to-sample movement inside the loop. Also report the second difference (slope kink)."""
    d = np.abs(np.diff(x, axis=1))
    seam = np.abs(x[:, 0] - x[:, -1])
    # second difference across the seam: kink in slope
    dd = np.abs(np.diff(x, n=2, axis=1))
    seam_dd = np.abs((x[:, 1] - x[:, 0]) - (x[:, 0] - x[:, -1]))
    out = {}
    for ch, nm in enumerate("LR"):
        pct = (d[ch] < seam[ch]).mean() * 100
        out[nm] = dict(seam=float(seam[ch]), median=float(np.median(d[ch])), p95=float(np.percentile(d[ch], 95)),
                       p999=float(np.percentile(d[ch], 99.9)), max=float(d[ch].max()), percentile_of_seam=float(pct),
                       seam_dd=float(seam_dd[ch]), p95_dd=float(np.percentile(dd[ch], 95)))
    print(f"[{label}] seam step L={seam[0]:.6f} R={seam[1]:.6f} | typical step median={np.median(d):.6f} "
          f"p95={np.percentile(d,95):.6f} p99.9={np.percentile(d,99.9):.6f} max={d.max():.6f} | "
          f"seam step is at the {out['L']['percentile_of_seam']:.1f}/{out['R']['percentile_of_seam']:.1f} percentile of all steps")
    print(f"[{label}] seam 2nd-diff L={seam_dd[0]:.6f} R={seam_dd[1]:.6f} vs p95 2nd-diff {np.percentile(dd,95):.6f}")
    return out


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def spectrogram(path, png, seconds=None):
    subprocess.check_call(["ffmpeg", "-y", "-v", "quiet", "-i", path, "-lavfi",
                           "showspectrumpic=s=1600x600:legend=1:scale=log:fscale=log:start=30:stop=16000:color=magma", png])


def waveform(path, png):
    subprocess.check_call(["ffmpeg", "-y", "-v", "quiet", "-i", path, "-lavfi",
                           "showwavespic=s=1600x300:split_channels=1:colors=#ffb000|#00c0ff", png])


def seam_plot(files, png, ms=40):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(len(files), 1, figsize=(14, 2.6 * len(files)))
    axes = np.atleast_1d(axes)
    for ax, f in zip(axes, files):
        x, sr = read_wav(f)
        n = int(ms / 1000 * sr)
        seg = np.concatenate([x[0, -n:], x[0, :n]])
        t = (np.arange(2 * n) - n) / sr * 1000
        ax.plot(t, seg, lw=0.6)
        ax.axvline(0, color="r", lw=0.8, ls="--")
        ax.set_title(f"{os.path.basename(f)}: {ms} ms either side of the loop point (L channel)")
        ax.set_xlabel("ms (0 = wrap from last sample to first)")
    plt.tight_layout()
    plt.savefig(png, dpi=90)


def main():
    files = sys.argv[1:] or [os.path.join(HERE, "space.wav"), os.path.join(HERE, "aloha.wav")]
    os.makedirs(os.path.join(HERE, "img"), exist_ok=True)
    lengths = {}
    for f in files:
        x, sr = read_wav(f)
        lengths[f] = x.shape[1]
        print(f"\n== {os.path.basename(f)}: {x.shape[1]} samples @ {sr} Hz = {x.shape[1]/sr:.6f} s, "
              f"peak={20*np.log10(np.abs(x).max()+1e-12):.2f} dBFS, rms={rms_db(x):.2f} dBFS")
        seam_report(x, os.path.basename(f))
        base = os.path.splitext(os.path.basename(f))[0]
        spectrogram(f, os.path.join(HERE, "img", f"{base}_spec.png"))
        waveform(f, os.path.join(HERE, "img", f"{base}_wave.png"))
    seam_plot(files, os.path.join(HERE, "img", "seams.png"))
    stems_dir = os.path.join(HERE, "stems")
    if os.path.isdir(stems_dir) and not sys.argv[1:]:
        print("\n== stem levels (RMS dBFS, after instrument EQ and level, before reverb)")
        for s in sorted(os.listdir(stems_dir)):
            x, _ = read_wav(os.path.join(stems_dir, s))
            print(f"  {s:24s} rms={rms_db(x):7.2f}  peak={20*np.log10(np.abs(x).max()+1e-12):7.2f}")
    if len(set(lengths.values())) == 1:
        print(f"\nAll files have identical sample counts: {list(lengths.values())[0]}")
    else:
        print(f"\nSAMPLE COUNTS DIFFER: {lengths}")


if __name__ == "__main__":
    main()
