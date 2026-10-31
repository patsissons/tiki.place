#!/usr/bin/env python
"""Encode the masters to web formats, decode them back, and measure whether the loop seam survives.

For each format we report: file size, decoded sample count vs the master's N, the sample offset of
the decoded audio relative to the master (found by least-squares alignment, so encoder priming /
padding that a decoder failed to trim shows up here), and the seam discontinuity of the decoded
buffer if it were looped as-is (what a browser would do with the raw decodeAudioData result).

Decoders used: ffmpeg (what Chrome/Firefox build their demuxers on, roughly) and, on macOS,
afconvert = CoreAudio/AudioToolbox (the decoder Safari uses).
"""
import os
import json
import shutil
import subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "encoded")
LOOP = json.load(open(os.path.join(HERE, "loop.json")))
N, SR = LOOP["samples"], LOOP["sample_rate"]

ENCODERS = {
    # name: (extension, ffmpeg args)
    "opus_ogg":  ("ogg",  ["-c:a", "libopus", "-b:a", "112k", "-vbr", "on", "-application", "audio", "-frame_duration", "20"]),
    "opus_webm": ("webm", ["-c:a", "libopus", "-b:a", "112k", "-vbr", "on", "-application", "audio", "-frame_duration", "20"]),
    "opus_caf":  ("caf",  ["-c:a", "libopus", "-b:a", "112k", "-vbr", "on", "-application", "audio"]),
    "aac_m4a":   ("m4a",  ["-c:a", "aac_at", "-b:a", "160k", "-movflags", "+faststart"]),
    "mp3":       ("mp3",  ["-c:a", "libmp3lame", "-q:a", "2"]),
    "flac":      ("flac", ["-c:a", "flac", "-compression_level", "8"]),
}


def decode_ffmpeg(path):
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-f", "f64le", "-ac", "2", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<f8").reshape(-1, 2).T
    sr = int(subprocess.check_output(["ffprobe", "-v", "quiet", "-select_streams", "a:0", "-show_entries",
                                      "stream=sample_rate", "-of", "csv=p=0", path]).decode().strip().split(",")[0])
    return x, sr


def decode_afconvert(path):
    if not shutil.which("afconvert"):
        return None, None
    tmp = path + ".af.wav"
    r = subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEF32", path, tmp], capture_output=True, text=True)
    if r.returncode != 0:
        return None, r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "afconvert failed"
    x, sr = decode_ffmpeg(tmp)
    os.remove(tmp)
    return x, sr


def align(master, dec, search=(-2000, 8000), win=20000, start=4000):
    """Offset k such that dec[start+k : ...] best matches master[start : start+win]. Positive k means
    the decoded file has k extra samples of leading padding."""
    m = master[0, start:start + win]
    best, best_err = None, np.inf
    for k in range(search[0], search[1]):
        s = start + k
        if s < 0 or s + win > dec.shape[1]:
            continue
        e = np.mean((dec[0, s:s + win] - m) ** 2)
        if e < best_err:
            best, best_err = k, e
    return best, best_err


def seam_metric(x):
    d = np.abs(np.diff(x, axis=1))
    seam = np.abs(x[:, 0] - x[:, -1])
    return float(seam.max()), float(np.median(d)), float(np.percentile(d, 99.9)), float(d.max())


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    for stem in ["space", "aloha"]:
        master, msr = decode_ffmpeg(os.path.join(HERE, f"{stem}.wav"))
        assert master.shape[1] == N and msr == SR
        for name, (ext, args) in ENCODERS.items():
            path = os.path.join(OUT, f"{stem}.{name}.{ext}")
            r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(HERE, f"{stem}.wav")] + args + [path],
                               capture_output=True, text=True)
            if r.returncode != 0:
                results[f"{stem}.{name}"] = dict(error=r.stderr.strip()[-200:])
                print(f"{stem}.{name}: ENCODE FAILED {r.stderr.strip()[-200:]}")
                continue
            size = os.path.getsize(path)
            entry = dict(file=os.path.basename(path), bytes=size, kbps=round(size * 8 / LOOP["seconds"] / 1000, 1))
            for decname, decoder in [("ffmpeg", decode_ffmpeg), ("coreaudio", decode_afconvert)]:
                dec, dsr = decoder(path)
                if dec is None:
                    entry[decname] = dict(error=dsr)
                    continue
                # compare at the master rate; opus decodes at 48k which is our rate already
                if dsr != SR:
                    entry[decname] = dict(sample_rate=dsr, samples=int(dec.shape[1]), note="rate differs from master; not aligned")
                    continue
                k, err = align(master, dec)
                seam, med, p999, mx = seam_metric(dec)
                # error of the aligned region vs master (codec noise), in dB RMS
                a = dec[:, 4000 + k: 4000 + k + 200000]
                b = master[:, 4000: 4000 + 200000]
                snr = 10 * np.log10(np.mean(b ** 2) / (np.mean((a - b) ** 2) + 1e-20))
                # seam if we loop exactly N samples starting at the detected offset (what a JS trim would do)
                if k >= 0 and k + N <= dec.shape[1]:
                    trimmed = dec[:, k:k + N]
                    tseam = seam_metric(trimmed)[0]
                else:
                    tseam = None
                entry[decname] = dict(sample_rate=dsr, samples=int(dec.shape[1]), extra_samples=int(dec.shape[1] - N),
                                      leading_offset=int(k), snr_db=round(float(snr), 1),
                                      raw_loop_seam=round(seam, 6), seam_after_trim=None if tseam is None else round(tseam, 6),
                                      median_step=round(med, 6), p999_step=round(p999, 6))
            results[f"{stem}.{name}"] = entry
            print(f"{stem}.{name:10s} {size/1024:7.1f} KiB ({entry['kbps']} kbps)")
            for decname in ("ffmpeg", "coreaudio"):
                e = entry.get(decname)
                if not e:
                    continue
                if "error" in e:
                    print(f"    {decname:9s}: {e['error']}")
                elif "note" in e:
                    print(f"    {decname:9s}: {e['samples']} samples @ {e['sample_rate']} ({e['note']})")
                else:
                    print(f"    {decname:9s}: {e['samples']} samples ({e['extra_samples']:+d} vs master), leading offset {e['leading_offset']:+d}, "
                          f"SNR {e['snr_db']} dB, raw-loop seam {e['raw_loop_seam']:.5f} (median step {e['median_step']:.5f}, "
                          f"p99.9 {e['p999_step']:.5f}), seam after trim to N: {e['seam_after_trim']}")
    json.dump(results, open(os.path.join(OUT, "results.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
