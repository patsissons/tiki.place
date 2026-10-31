#!/usr/bin/env python
"""
tiki.place music spike: two sample-locked loops rendered from pure code.

  SPACE  dreamy synth pad / glass arpeggio / sub bass   (zoomed out)
  ALOHA  ukulele, slack-key guitar, lap steel, upright bass, shaker (zoomed in)

Both loops: 80 BPM, 8 bars of 4/4, key of C major, same chord progression,
24.000 s, exactly N = 1,152,000 samples at 48 kHz, stereo.

Everything is rendered circularly: notes that ring past the end wrap to the
start, filters/EQ are applied as circular frequency-domain multiplications,
and reverb/delay are circular convolutions, so tails wrap around the loop
point instead of being cut off.

Usage:  .venv/bin/python render.py [--no-encode]
Deterministic (seeded RNG). Needs numpy, scipy, ffmpeg on PATH.
"""
import os
import re
import sys
import json
import struct
import subprocess
import numpy as np
import scipy.signal as sg

HERE = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------------------
# Global clock
# ----------------------------------------------------------------------------
SR = 48000
BPM = 80
BARS = 8
BEATS_PER_BAR = 4
BEAT = 60.0 / BPM                     # 0.75 s
BAR = BEAT * BEATS_PER_BAR            # 3.0 s
LOOP_SECONDS = BARS * BAR             # 24.0 s
N = int(round(LOOP_SECONDS * SR))     # 1,152,000 samples
assert abs(N - LOOP_SECONDS * SR) < 1e-9, "loop length must be an integer number of samples"

TARGET_LUFS = -16.0                   # integrated loudness target per loop
TRUE_PEAK_CEILING_DB = -1.5

# ----------------------------------------------------------------------------
# Composition (edit me)
# ----------------------------------------------------------------------------
# One chord per bar. Hawaiian "hapa haole" style turnaround: II7 -> V7 -> I.
PROGRESSION = ["Cmaj7", "Am7", "Fmaj7", "G7", "Cmaj7", "Em7", "D7", "G7"]

# Per-chord voicings for each instrument.
#   uke        : 4 strings, reentrant tuning order [G4-string, C4, E4, A4]
#   gtr_bass   : [thumb beat-1 note, thumb beat-3 note]
#   gtr_treble : [t1, t2, t3] finger notes, low to high
#   pad        : synth pad voicing (space)
#   sparkle    : high chord tones for random twinkles (space)
CHORDS = {
    "Cmaj7": dict(uke=["G4", "C4", "E4", "B4"], gtr_bass=["C3", "G2"], gtr_treble=["G3", "B3", "E4"],
                  pad=["C3", "G3", "B3", "D4", "E4"], sparkle=["E6", "G6", "B6", "D7"]),
    "Am7":   dict(uke=["G4", "C4", "E4", "G4"], gtr_bass=["A2", "E2"], gtr_treble=["G3", "C4", "E4"],
                  pad=["A2", "E3", "G3", "B3", "C4"], sparkle=["E6", "G6", "B6", "C7"]),
    "Fmaj7": dict(uke=["A4", "C4", "F4", "A4"], gtr_bass=["F2", "C3"], gtr_treble=["A3", "C4", "E4"],
                  pad=["F2", "C3", "E3", "G3", "A3"], sparkle=["A6", "C7", "E7", "G6"]),
    "G7":    dict(uke=["G4", "D4", "F4", "B4"], gtr_bass=["G2", "D3"], gtr_treble=["B3", "D4", "F4"],
                  pad=["G2", "D3", "F3", "A3", "B3"], sparkle=["D6", "F6", "A6", "B6"]),
    "Em7":   dict(uke=["G4", "D4", "G4", "B4"], gtr_bass=["E2", "B2"], gtr_treble=["G3", "B3", "D4"],
                  pad=["E2", "B2", "D3", "G3", "B3"], sparkle=["G6", "B6", "D7", "E7"]),
    "D7":    dict(uke=["A4", "D4", "F#4", "C5"], gtr_bass=["D3", "A2"], gtr_treble=["A3", "C4", "F#4"],
                  pad=["D2", "A2", "C3", "E3", "F#3"], sparkle=["A6", "C7", "E7", "F#6"]),
}
# Bar 8's G7 gets a 13th in the pad for colour (keeps the B natural so the uke's G7 agrees).
PAD_OVERRIDES = {7: ["G2", "D3", "F3", "B3", "E4"]}

# Upright bass: (bar, beat, note, duration_in_beats). Walking turnarounds in bars 4 and 8.
BASS_LINE = [
    (0, 0, "C2", 2.0), (0, 2, "G1", 1.9),
    (1, 0, "A1", 2.0), (1, 2, "E2", 1.9),
    (2, 0, "F2", 2.0), (2, 2, "C2", 1.9),
    (3, 0, "G1", 2.0), (3, 2, "B1", 1.0), (3, 3, "D2", 0.95),
    (4, 0, "C2", 2.0), (4, 2, "G1", 1.9),
    (5, 0, "E2", 2.0), (5, 2, "B1", 1.9),
    (6, 0, "D2", 2.0), (6, 2, "A1", 1.9),
    (7, 0, "G1", 2.0), (7, 2, "A1", 1.0), (7, 3, "B1", 0.95),
]

# Lap steel melody: (bar, beat, note, duration_in_beats, slide_from_semitones)
# slide_from < 0 means the bar slides up into the note from below.
STEEL_MELODY = [
    (0, 0.5, "E5", 2.0, -2),
    (0, 3.0, "D5", 0.9, 0),
    (1, 0.0, "C5", 1.5, 0),
    (1, 2.0, "A4", 1.6, -2),
    (2, 1.0, "A4", 0.9, 0),
    (2, 2.0, "C5", 1.7, -3),
    (3, 0.0, "B4", 2.0, +1),
    (3, 3.0, "D5", 0.9, 0),
    (4, 0.0, "G5", 1.5, -2),
    (4, 2.0, "E5", 1.6, 0),
    (5, 0.0, "D5", 0.9, 0),
    (5, 1.0, "B4", 2.4, +1),
    (6, 0.5, "A4", 1.4, -2),
    (6, 2.5, "C5", 1.3, 0),
    (7, 0.0, "B4", 1.8, +1),
    (7, 2.0, "D5", 1.9, -2),
]

# Ukulele strum: (eighth-note slot in bar, direction, velocity). "D . D U . U D U"
UKE_STRUM = [(0, "D", 1.0), (2, "D", 0.8), (3, "U", 0.6), (5, "U", 0.6), (6, "D", 0.9), (7, "U", 0.65)]

# Slack-key fingerpicking: 8 eighth-note slots, b1/b2 = thumb bass notes, t1..t3 = treble fingers.
PICK_PATTERNS = [
    ["b1", "t2", "t1", "t3", "b2", "t2", "t1", "t3"],
    ["b1", "t1", "t2", "t3", "b2", "t3", "t2", "t1"],
]
PICK_PATTERN_BY_BAR = [0, 1, 0, 1, 0, 1, 0, 1]

# Shaker: velocity per eighth-note slot; bars 4 and 8 add a 16th pickup at the end.
SHAKER_VEL = [0.45, 0.85, 0.5, 0.95, 0.45, 0.85, 0.5, 1.0]
SHAKER_PICKUP_BARS = [3, 7]

# Space arpeggio ("glass" pluck), 8 eighth-note slots per bar, None = rest.
SPACE_ARP = [
    ["E5", None, "G5", "B5", None, "D6", None, "G5"],
    ["E5", None, "G5", "B5", None, "C6", None, "E5"],
    ["C5", None, "E5", "A5", None, "G5", None, "E5"],
    ["D5", None, "F5", "B5", None, "A5", None, "D6"],
    ["G5", None, "B5", "D6", None, "E6", None, "B5"],
    ["E5", None, "G5", "B5", None, "F#5", None, "D6"],
    ["F#5", None, "A5", "C6", None, "E6", None, "A5"],
    ["B5", None, "D6", "E6", None, "A5", None, "F5"],
]

# Space sub bass: root per bar (note, duration in beats); bar 8 walks like the upright.
SUB_BASS = [
    (0, 0, "C2", 4), (1, 0, "A1", 4), (2, 0, "F1", 4), (3, 0, "G1", 4),
    (4, 0, "C2", 4), (5, 0, "E2", 4), (6, 0, "D2", 4), (7, 0, "G1", 4),
]

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
NOTE_SEMIS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def freq(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d+)", name)
    semi = NOTE_SEMIS[m[1]] + {"#": 1, "b": -1, "": 0}[m[2]]
    midi = 12 * (int(m[3]) + 1) + semi
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def t_at(bar, beat):
    return (bar * BEATS_PER_BAR + beat) * BEAT


def db(x):
    return 10.0 ** (x / 20.0)


def pan_gains(pan):
    th = (pan + 1.0) * np.pi / 4.0
    return np.cos(th), np.sin(th)


def add_wrapped(dst, sig, start_sample):
    """Add sig (M,) or (2,M) into dst (2,N) starting at start_sample, wrapping modulo N."""
    if sig.ndim == 1:
        sig = np.stack([sig, sig])
    M = sig.shape[1]
    pos = 0
    start = int(start_sample) % N
    while pos < M:
        i = (start + pos) % N
        n = min(N - i, M - pos)
        dst[:, i:i + n] += sig[:, pos:pos + n]
        pos += n


def place(dst, sig, t, pan=0.0, gain=1.0):
    l, r = pan_gains(pan)
    add_wrapped(dst, np.stack([sig * (gain * l), sig * (gain * r)]), int(round(t * SR)))


def env_adsr(n, a, d, s, r, dur_s):
    """Linear-attack / exponential-decay envelope; total length n samples, release starts at dur_s."""
    t = np.arange(n) / SR
    e = np.ones(n)
    att = t < a
    e[att] = t[att] / max(a, 1e-6)
    dec = t >= a
    e[dec] = s + (1 - s) * np.exp(-(t[dec] - a) / max(d, 1e-6))
    rel = t >= dur_s
    e[rel] *= np.clip(1 - (t[rel] - dur_s) / max(r, 1e-6), 0, 1)
    return e


def raised_cos_fade(n_total, fade_start, fade_len):
    e = np.ones(n_total)
    i0 = int(fade_start)
    i1 = min(n_total, i0 + int(fade_len))
    if i0 < n_total:
        k = np.arange(i1 - i0)
        e[i0:i1] = 0.5 * (1 + np.cos(np.pi * k / max(i1 - i0, 1)))
        e[i1:] = 0
    return e


# RBJ biquads (for circular EQ)
def rbj(kind, f0, Q, gain_db=0.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * Q)
    if kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hshelf":
        b = [A * ((A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * alpha), -2 * A * ((A - 1) + (A + 1) * cw),
             A * ((A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * alpha)]
        a = [(A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * alpha, 2 * ((A - 1) - (A + 1) * cw),
             (A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * alpha]
    elif kind == "lshelf":
        b = [A * ((A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * alpha), 2 * A * ((A - 1) - (A + 1) * cw),
             A * ((A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * alpha)]
        a = [(A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * alpha, -2 * ((A - 1) + (A + 1) * cw),
             (A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * alpha]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


_FREQS = np.fft.rfftfreq(N, 1.0 / SR)


def circ_filter(x, filters):
    """Apply a chain of (b, a) IIR filters circularly (steady-state response over the loop).
    x: (N,) or (2,N). Circular => no start-up transient and no end discontinuity."""
    H = np.ones(len(_FREQS), dtype=complex)
    for b, a in filters:
        _, h = sg.freqz(b, a, worN=_FREQS, fs=SR)
        H *= h
    X = np.fft.rfft(x, n=N, axis=-1)
    return np.fft.irfft(X * H, n=N, axis=-1)


def circ_convolve(x, ir):
    """Circular convolution of stereo x (2,N) with stereo IR (2,M), M <= N. Tails wrap."""
    X = np.fft.rfft(x, n=N, axis=-1)
    H = np.fft.rfft(ir, n=N, axis=-1)
    return np.fft.irfft(X * H, n=N, axis=-1)


def circ_roll_fractional(x, delay_samples):
    """Circular delay by a (possibly time-varying) fractional number of samples. x: (N,)."""
    idx = (np.arange(N) - delay_samples) % N
    i0 = np.floor(idx).astype(np.int64)
    fr = idx - i0
    i1 = (i0 + 1) % N
    return x[i0] * (1 - fr) + x[i1] * fr


def finite_lowpass(x, fc, order=2):
    sos = sg.butter(order, fc, btype="low", fs=SR, output="sos")
    return sg.sosfilt(sos, x)


def finite_bandpass(x, lo, hi, order=2):
    sos = sg.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sg.sosfilt(sos, x)


# ----------------------------------------------------------------------------
# Instruments
# ----------------------------------------------------------------------------
def karplus_strong(f0, dur, rng, t60=1.5, excite_lp=4000.0, pick_pos=0.22, release=0.03, vel=1.0,
                   dynamic_lp=True):
    """Plucked string. Fractional-delay Karplus-Strong via scipy.lfilter.
    Loop: y[n] = x[n] + g * (w0 y[n-L] + w1 y[n-L-1] + w2 y[n-L-2]) with a 3-tap lowpass whose
    group delay supplies the fractional part of the period, so the string is in tune."""
    D = SR / f0
    L = int(np.floor(D - 0.5))
    frac = D - 0.5 - L
    w = np.array([(1 - frac) / 2, 0.5, frac / 2])
    g = 10.0 ** (-3.0 * (D / SR) / t60)
    a = np.zeros(L + 3)
    a[0] = 1.0
    a[L:L + 3] = -g * w
    n = int((dur + release) * SR)
    # excitation: short noise burst, lowpassed (softer pick => darker), pick-position comb
    exc_len = L + 2
    exc = rng.uniform(-1, 1, exc_len)
    lp = excite_lp * (0.6 + 0.4 * vel) if dynamic_lp else excite_lp
    exc = finite_lowpass(exc, min(lp, SR * 0.45), order=1)
    # rev2: remove sub-fundamental energy from the burst (it was a broadband 'thud' under every pluck)
    exc = sg.sosfilt(sg.butter(2, max(20.0, 0.7 * f0), btype="high", fs=SR, output="sos"), exc)
    pp = max(1, int(round(pick_pos * L)))
    comb = exc.copy()
    comb[pp:] -= exc[:-pp]
    x = np.zeros(n)
    x[:exc_len] = comb
    y = sg.lfilter([1.0], a, x)
    y *= raised_cos_fade(n, int(dur * SR), int(release * SR))
    peak = np.max(np.abs(y)) + 1e-12
    return y / peak * vel


def ukulele_strum(chord_notes, direction, vel, rng, durs):
    """Return list of (delay_s, mono_signal, pan) for one strum. durs: per-string ring times."""
    order = [0, 1, 2, 3] if direction == "D" else [3, 2, 1]   # upstroke brushes the top 3
    gap = 0.011 if direction == "D" else 0.008
    out = []
    for k, si in enumerate(order):
        f = freq(chord_notes[si])
        v = vel * (0.85 + 0.3 * rng.random()) * (1.0 if direction == "D" else 0.8)
        sig = karplus_strong(f, durs[si], rng, t60=1.3 + 0.3 * rng.random(), excite_lp=5200.0,
                             pick_pos=0.18 + 0.08 * rng.random(), release=0.025, vel=v)
        # tiny string-to-string stereo spread (close pair on a small body)
        pan = 0.25 + 0.08 * (si - 1.5)
        out.append((k * gap * (0.9 + 0.2 * rng.random()), sig, pan))
    return out


def lap_steel(f0, dur, slide_from=0.0, vel=1.0, rng=None):
    """Steel guitar: additive harmonics, volume-pedal swell, bar slide into the note, delayed vibrato."""
    release = 0.35
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    slide = slide_from * np.exp(-t / 0.085)                      # ~250 ms glide
    vib_amt = np.clip((t - 0.30) / 0.45, 0, 1) ** 2               # vibrato fades in after 300 ms
    vib = 0.14 * vib_amt * np.sin(2 * np.pi * 5.3 * t + (rng.random() * 6.28 if rng else 0))
    f = f0 * 2.0 ** ((slide + vib) / 12.0)
    phase = 2 * np.pi * np.cumsum(f) / SR
    bright = 0.42 + 0.58 * np.exp(-t / 0.9)                        # tone darkens as it sustains
    y = np.zeros(n)
    kmax = int(min(14, (SR * 0.45) / f0))
    for k in range(1, kmax + 1):
        amp = (k ** -1.15) * bright ** (k - 1) * (1.0 if k % 2 else 0.85)
        y += amp * np.sin(k * phase + (rng.random() * 6.28 if rng else 0))
    # volume pedal swell + gentle sustain decay + release
    att = 0.10 if slide_from == 0 else 0.06
    env = (1 - np.exp(-t / att)) * np.exp(-t / 5.0)
    env *= raised_cos_fade(n, int(dur * SR), int(release * SR))
    y = np.tanh(1.6 * y * env) / 1.6
    return y / (np.max(np.abs(y)) + 1e-12) * vel


def upright_bass(f0, dur, rng, vel=1.0):
    """Upright: dark Karplus-Strong + finger thump, soft-saturated."""
    s = karplus_strong(f0, dur, rng, t60=1.1, excite_lp=700.0, pick_pos=0.3, release=0.05, vel=1.0,
                       dynamic_lp=False)
    n = len(s)
    t = np.arange(n) / SR
    thump = finite_lowpass(rng.uniform(-1, 1, n), 420.0, order=2) * np.exp(-t / 0.012) * 0.6
    y = s + thump
    y = np.tanh(1.8 * y) / np.tanh(1.8)
    return y / (np.max(np.abs(y)) + 1e-12) * vel


def shaker_hit(vel, rng):
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    c = 5200.0 * (0.92 + 0.16 * rng.random())
    y = finite_bandpass(noise, c * 0.55, c * 1.7, order=2)
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.032)
    y *= env
    return y / (np.max(np.abs(y)) + 1e-12) * vel


_saw_tables = {}


def saw_table(f0, size=4096):
    K = int(min(256, (SR / 2.0) / f0 * 0.98))
    if K in _saw_tables:
        return _saw_tables[K]
    x = np.arange(size) / size
    tbl = np.zeros(size)
    for k in range(1, K + 1):
        tbl += np.sin(2 * np.pi * k * x) / k
    tbl *= 2 / np.pi
    _saw_tables[K] = tbl
    return tbl


def pad_voice(f0, dur, rng, attack=0.7, release=0.9, detunes=(-11, 0, 11)):
    """Three detuned bandlimited saws (wavetable), slow attack. Filtering is done on the bus."""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for d in detunes:
        f = f0 * 2.0 ** (d / 1200.0)
        tbl = saw_table(f)
        ph = (f * t + rng.random()) % 1.0
        y += np.interp(ph * len(tbl), np.arange(len(tbl) + 1), np.append(tbl, tbl[0]))
    a = attack * (0.8 + 0.4 * rng.random())
    env = (1 - np.exp(-t / (a / 3))) * np.clip(t / a, 0, 1) ** 0.5
    env *= raised_cos_fade(n, int(dur * SR), int(release * SR))
    return y * env / len(detunes)


def glass_pluck(f0, vel, rng):
    """FM 'glass' pluck: carrier f, modulator 2f with decaying index, plus a quick 3rd partial."""
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t / 0.12)
    y = np.sin(2 * np.pi * f0 * t + idx * np.sin(2 * np.pi * 2 * f0 * t))
    y += 0.25 * np.sin(2 * np.pi * 3.01 * f0 * t) * np.exp(-t / 0.08)
    env = (1 - np.exp(-t / 0.0025)) * np.exp(-t / 0.42)
    return y * env * vel


def sparkle(f0, rng):
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    vib = 0.05 * np.sin(2 * np.pi * 4.5 * t + rng.random() * 6.28)
    ph = 2 * np.pi * np.cumsum(f0 * 2 ** (vib / 12)) / SR
    y = np.sin(ph) + 0.3 * np.sin(2 * ph) * np.exp(-t / 0.3)
    env = (1 - np.exp(-t / 0.02)) * np.exp(-t / 0.7)
    return y * env


def sub_bass(f0, dur, rng):
    release = 0.6
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f0 * t) + 0.22 * np.sin(2 * np.pi * 2 * f0 * t + 0.4)
    env = (1 - np.exp(-t / 0.25)) * raised_cos_fade(n, int(dur * SR), int(release * SR))
    return np.tanh(1.3 * y * env) / np.tanh(1.3)


# ----------------------------------------------------------------------------
# Reverb impulse responses (synthesised)
# ----------------------------------------------------------------------------
def make_ir(rng, length_s, t60_bands, predelay_ms, early=True):
    """Stereo IR: decorrelated noise with band-wise exponential decay + sparse early reflections.
    t60_bands: list of (lo_hz, hi_hz, t60_s)."""
    n = int(length_s * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        noise = rng.standard_normal(n)
        tail = np.zeros(n)
        for lo, hi, t60 in t60_bands:
            if lo <= 0:
                sos = sg.butter(2, hi, btype="low", fs=SR, output="sos")
            elif hi >= SR / 2:
                sos = sg.butter(2, lo, btype="high", fs=SR, output="sos")
            else:
                sos = sg.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
            band = sg.sosfiltfilt(sos, noise)
            tail += band * np.exp(-6.908 * t / t60)
        # diffusion build-up over the first ~40 ms
        tail *= np.clip(t / 0.04, 0, 1) ** 0.5
        ir[ch] = tail
    if early:
        for ch in range(2):
            for k in range(7):
                d = int((0.006 + 0.032 * rng.random()) * SR)
                ir[ch, d] += (0.5 - 0.06 * k) * (1 if rng.random() > 0.5 else -1) * 0.5
    pre = np.zeros((2, int(predelay_ms / 1000 * SR)))
    ir = np.concatenate([pre, ir], axis=1)
    ir /= np.sqrt(np.sum(ir ** 2) / 2)   # unit energy per channel (average)
    return ir


# ----------------------------------------------------------------------------
# ALOHA loop
# ----------------------------------------------------------------------------
def render_aloha(rng):
    stems = {k: np.zeros((2, N)) for k in ["uke", "gtr", "steel", "bass", "shaker"]}

    # --- Ukulele: strum events, per-string ring time until that string is hit again
    events = []
    for bar in range(BARS):
        chord = CHORDS[PROGRESSION[bar]]
        for slot, direction, vel in UKE_STRUM:
            t = t_at(bar, slot / 2.0) + rng.normal(0, 0.005)
            events.append((t, direction, vel * (0.92 + 0.16 * rng.random()), chord["uke"]))
    events.sort()
    times = np.array([e[0] for e in events])
    for i, (t, direction, vel, notes) in enumerate(events):
        durs = []
        for si in range(4):
            # next event that hits this string (upstrokes skip string 0 = the high-G string)
            nxt = None
            for j in range(1, len(events) + 1):
                e = events[(i + j) % len(events)]
                if e[1] == "D" or si != 0:
                    nxt = e[0] + (LOOP_SECONDS if (i + j) >= len(events) else 0)
                    break
            durs.append(max(0.15, nxt - t + 0.02))
        for delay, sig, pan in ukulele_strum(notes, direction, vel, rng, durs):
            place(stems["uke"], sig, t + delay, pan=pan)

    # --- Slack-key guitar: fingerpicked eighths, notes damped at the chord change
    gtr_events = []
    for bar in range(BARS):
        chord = CHORDS[PROGRESSION[bar]]
        pattern = PICK_PATTERNS[PICK_PATTERN_BY_BAR[bar]]
        for slot, which in enumerate(pattern):
            if which == ".":
                continue
            note = chord["gtr_bass"][int(which[1]) - 1] if which[0] == "b" else chord["gtr_treble"][int(which[1]) - 1]
            t = t_at(bar, slot / 2.0) + rng.normal(0, 0.006)
            vel = (0.9 if which[0] == "b" else 0.7) * (0.9 + 0.2 * rng.random())
            if slot in (0, 4):
                vel *= 1.08
            gtr_events.append((t, note, vel, bar))
    for i, (t, note, vel, bar) in enumerate(gtr_events):
        bar_end = t_at(bar + 1, 0) + 0.08
        same = [e[0] for e in gtr_events if e[1] == note and e[0] > t + 0.01]
        nxt_same = min(same) if same else (min([e[0] for e in gtr_events if e[1] == note]) + LOOP_SECONDS)
        dur = max(0.2, min(bar_end, nxt_same) - t)
        f = freq(note)
        sig = karplus_strong(f, dur, rng, t60=3.2 if f < 200 else 2.4, excite_lp=3600.0 if f < 200 else 4800.0,
                             pick_pos=0.14 + 0.1 * rng.random(), release=0.04, vel=vel)
        place(stems["gtr"], sig, t, pan=-0.3 + 0.1 * (f > 200))

    # --- Lap steel
    for bar, beat, note, dur_beats, slide in STEEL_MELODY:
        t = t_at(bar, beat) + rng.normal(0, 0.008)
        sig = lap_steel(freq(note), dur_beats * BEAT, slide_from=slide, vel=0.9 + 0.1 * rng.random(), rng=rng)
        place(stems["steel"], sig, t, pan=0.08)

    # --- Upright bass
    for bar, beat, note, dur_beats in BASS_LINE:
        t = t_at(bar, beat) + rng.normal(0, 0.004)
        sig = upright_bass(freq(note), dur_beats * BEAT - 0.06, rng, vel=0.9 + 0.15 * (beat == 0))
        place(stems["bass"], sig, t, pan=0.0)

    # --- Shaker
    for bar in range(BARS):
        for slot, vel in enumerate(SHAKER_VEL):
            t = t_at(bar, slot / 2.0) + rng.normal(0, 0.004) + 0.004 * (slot % 2)   # off-beats lean late
            place(stems["shaker"], shaker_hit(vel * (0.9 + 0.2 * rng.random()), rng), t, pan=-0.45)
        if bar in SHAKER_PICKUP_BARS:
            place(stems["shaker"], shaker_hit(0.6, rng), t_at(bar, 3.75), pan=-0.45)

    # --- Per-stem tone shaping (circular EQ), then levels
    stems["uke"] = circ_filter(stems["uke"], [rbj("hp", 150, 0.7), rbj("peak", 290, 2.5, 4.0),
                                              rbj("peak", 1100, 1.2, 2.0), rbj("hshelf", 6000, 0.7, -4.0)])
    stems["gtr"] = circ_filter(stems["gtr"], [rbj("hp", 80, 0.7), rbj("peak", 105, 2.0, 2.0),
                                              rbj("peak", 210, 2.0, 1.5), rbj("hshelf", 5000, 0.7, -5.0)])
    # rev2: light stem saturation on the uke to tame the strum crest factor (peaks were 24 dB over RMS)
    stems["uke"] = np.tanh(1.6 * stems["uke"]) / 1.6
    stems["bass"] = circ_filter(stems["bass"], [rbj("hp", 35, 0.7), rbj("peak", 95, 1.5, 3.0),
                                                rbj("peak", 700, 1.0, -3.0), rbj("lp", 2500, 0.7)])
    stems["steel"] = circ_filter(stems["steel"], [rbj("hp", 180, 0.7), rbj("hshelf", 4000, 0.7, -3.0)])
    stems["shaker"] = circ_filter(stems["shaker"], [rbj("hp", 2500, 0.7)])

    # rev1: steel was ~10 dB above uke/guitar in RMS, shaker inaudible (-56 dBFS)
    levels = dict(uke=db(-12.5), gtr=db(-11.5), steel=db(-21.5), bass=db(-11.5), shaker=db(-24.0))
    sends = dict(uke=db(-14), gtr=db(-15), steel=db(-8), bass=db(-26), shaker=db(-20))
    for k in stems:
        stems[k] *= levels[k]

    dry = sum(stems.values())
    send = sum(stems[k] * sends[k] for k in stems)
    # small warm room + a longer plate-ish tail for the steel
    ir_room = make_ir(rng, 1.6, [(0, 250, 0.9), (250, 2500, 1.3), (2500, 7000, 1.0), (7000, SR / 2, 0.5)], 12)
    wet = circ_convolve(send, ir_room)
    wet = circ_filter(wet, [rbj("hp", 150, 0.7), rbj("lp", 7000, 0.7)])
    mix = dry + wet
    return mix, stems, wet


# ----------------------------------------------------------------------------
# SPACE loop
# ----------------------------------------------------------------------------
def lfo(cycles_per_loop, phase=0.0):
    return np.sin(2 * np.pi * (cycles_per_loop * np.arange(N) / N + phase))


def render_space(rng):
    stems = {k: np.zeros((2, N)) for k in ["pad", "sub", "arp", "sparkle", "wash"]}

    # --- Pad: one voicing per bar; voices enter with slightly different attacks
    for bar in range(BARS):
        notes = PAD_OVERRIDES.get(bar, CHORDS[PROGRESSION[bar]]["pad"])
        for i, note in enumerate(notes):
            f = freq(note)
            t = t_at(bar, 0) - 0.25 + 0.12 * rng.random()
            sig = pad_voice(f, BAR + 0.25, rng, attack=0.6 + 0.25 * i / len(notes))
            place(stems["pad"], sig, t, pan=(-0.5 + i / (len(notes) - 1)) * 0.5, gain=1.0 / (0.5 + f / 300.0) ** 0.35)
    pad = stems["pad"]
    # "filter sweep" as a crossfade between a dark and a bright circular lowpass, 2 cycles per loop
    dark = circ_filter(pad, [rbj("lp", 520, 0.9), rbj("lp", 900, 0.7)])
    bright = circ_filter(pad, [rbj("lp", 2600, 1.4), rbj("lp", 4500, 0.7)])
    m = 0.5 + 0.5 * lfo(2, -0.25)          # dark at bar starts of 1 and 5, bright in bars 3 and 7
    m = m ** 1.5
    pad = dark * (1 - m) + bright * m
    # stereo chorus: two modulated circular delays in quadrature (LFO 8 cycles per loop = 0.333 Hz)
    base, depth = 14.0e-3 * SR, 3.5e-3 * SR
    mono = pad.mean(axis=0)
    chL = circ_roll_fractional(mono, base + depth * lfo(8, 0.0))
    chR = circ_roll_fractional(mono, base + depth * lfo(8, 0.25))
    ch2L = circ_roll_fractional(mono, base * 1.7 + depth * lfo(8, 0.5))
    ch2R = circ_roll_fractional(mono, base * 1.7 + depth * lfo(8, 0.75))
    pad = 0.55 * pad + 0.45 * np.stack([chL + 0.7 * ch2L, chR + 0.7 * ch2R]) / 1.7
    stems["pad"] = circ_filter(pad, [rbj("hp", 90, 0.7), rbj("peak", 300, 0.8, -2.0)])

    # --- Sub bass
    for bar, beat, note, dur_beats in SUB_BASS:
        place(stems["sub"], sub_bass(freq(note), dur_beats * BEAT - 0.3, rng), t_at(bar, beat) - 0.05, pan=0.0)

    # --- Glass arpeggio with circular ping-pong delay (dotted eighth)
    for bar in range(BARS):
        for slot, note in enumerate(SPACE_ARP[bar]):
            if note is None:
                continue
            vel = 0.75 + 0.25 * (slot == 0) + 0.1 * rng.random()
            place(stems["arp"], glass_pluck(freq(note), vel, rng), t_at(bar, slot / 2.0) + rng.normal(0, 0.003),
                  pan=0.15 * (1 if slot % 4 == 0 else -1))
    arp_dry = stems["arp"]
    D = int(round(0.75 * BEAT * SR))                        # dotted eighth
    X = np.fft.rfft(arp_dry.mean(axis=0), n=N)
    _, hlp = sg.freqz(*rbj("lp", 3200, 0.7), worN=_FREQS, fs=SR)
    H = 0.48 * hlp * np.exp(-1j * 2 * np.pi * _FREQS * D / SR)
    odd = np.fft.irfft(X * H / (1 - H * H), n=N)             # taps 1,3,5,... -> left
    even = np.fft.irfft(X * H * H / (1 - H * H), n=N)        # taps 2,4,6,... -> right
    stems["arp"] = arp_dry + 0.8 * np.stack([odd, even])
    stems["arp"] = circ_filter(stems["arp"], [rbj("hp", 300, 0.7)])

    # --- Sparkles: sparse random high chord tones (seeded)
    for bar in range(BARS):
        notes = CHORDS[PROGRESSION[bar]]["sparkle"]
        for _ in range(2 if bar % 2 == 0 else 1):
            t = t_at(bar, 0) + rng.random() * BAR
            place(stems["sparkle"], sparkle(freq(notes[rng.integers(len(notes))]), rng), t, pan=rng.uniform(-0.8, 0.8))

    # --- Wash: slowly sweeping filtered noise (one sweep per loop)
    noise = rng.standard_normal((2, N)) * 0.3
    lo = circ_filter(noise, [rbj("peak", 400, 1.2, 12.0), rbj("lp", 700, 0.7), rbj("hp", 250, 0.7)])
    mid = circ_filter(noise, [rbj("peak", 1300, 1.2, 12.0), rbj("lp", 2200, 0.7), rbj("hp", 800, 0.7)])
    hi = circ_filter(noise, [rbj("peak", 3600, 1.2, 12.0), rbj("lp", 6000, 0.7), rbj("hp", 2300, 0.7)])
    s = 0.5 + 0.5 * lfo(1, -0.25)   # 0 -> 1 -> 0 over the loop
    w_lo = np.clip(1 - 2 * s, 0, 1); w_hi = np.clip(2 * s - 1, 0, 1); w_mid = 1 - w_lo - w_hi
    stems["wash"] = (lo * w_lo + mid * w_mid + hi * w_hi) * (0.6 + 0.4 * lfo(1, 0.0))

    # rev1: sub was 6 dB over the pad in RMS; pad is the lead voice of this loop
    levels = dict(pad=db(-12.5), sub=db(-19.5), arp=db(-20.0), sparkle=db(-25.0), wash=db(-30.0))
    sends = dict(pad=db(-8), sub=db(-40), arp=db(-6), sparkle=db(-2), wash=db(-12))
    for k in stems:
        stems[k] *= levels[k]
    dry = sum(stems.values())
    send = sum(stems[k] * sends[k] for k in stems)
    ir_hall = make_ir(rng, 6.0, [(0, 200, 3.2), (200, 1500, 5.2), (1500, 5000, 3.8), (5000, SR / 2, 1.6)], 35)
    wet = circ_convolve(send, ir_hall)
    wet = circ_filter(wet, [rbj("hp", 120, 0.7), rbj("lp", 9000, 0.7)])
    mix = dry + wet
    return mix, stems, wet


# ----------------------------------------------------------------------------
# Output / measurement
# ----------------------------------------------------------------------------
def write_wav24(path, x):
    """x: (2,N) float in [-1,1] -> 24-bit PCM WAV."""
    assert x.shape == (2, N)
    xi = np.clip(np.round(x.T * 8388607.0), -8388608, 8388607).astype(np.int32)
    b = xi.astype("<i4").tobytes()
    b = np.frombuffer(b, dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes()   # drop MSB -> 24-bit LE
    with open(path, "wb") as f:
        datasize = len(b)
        f.write(b"RIFF" + struct.pack("<I", 36 + datasize) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, SR, SR * 6, 6, 24))
        f.write(b"data" + struct.pack("<I", datasize) + b)


def read_wav24(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "quiet", "-i", path, "-f", "f64le", "-ac", "2", "-"])
    x = np.frombuffer(raw, dtype="<f8").reshape(-1, 2).T.copy()
    assert x.shape == (2, N), x.shape
    return x


def write_wav_float(path, x):
    from scipy.io import wavfile
    wavfile.write(path, SR, x.T.astype(np.float32))


def ebur128(path):
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    out = r.stderr
    tail = out[out.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))
    lra = float(re.search(r"LRA:\s+(-?[\d.]+) LU", tail).group(1))
    return I, tp, lra


def normalise(name, mix, tmpdir):
    """Scale to TARGET_LUFS, then pull down if true peak exceeds the ceiling."""
    mix = circ_filter(mix, [rbj("hp", 28, 0.7)])
    mix = mix / (np.max(np.abs(mix)) + 1e-12) * 0.5
    tmp = os.path.join(tmpdir, f"_{name}_tmp.wav")
    write_wav_float(tmp, mix)
    I, tp, _ = ebur128(tmp)
    gain = db(TARGET_LUFS - I)
    if tp + 20 * np.log10(gain) > TRUE_PEAK_CEILING_DB:
        gain = db(TRUE_PEAK_CEILING_DB - tp)
    mix = mix * gain
    # safety soft clip (memoryless, so it does not break circularity); should be ~inactive
    mix = np.where(np.abs(mix) > 0.95, np.sign(mix) * (0.95 + np.tanh((np.abs(mix) - 0.95) * 20) / 20), mix)
    os.remove(tmp)
    return mix


def main():
    do_encode = "--no-encode" not in sys.argv
    out = HERE
    rng_a = np.random.default_rng(20261030)
    rng_s = np.random.default_rng(777)

    print(f"loop: {BPM} BPM, {BARS} bars, {LOOP_SECONDS:.3f} s, N={N} samples @ {SR} Hz")
    import time
    os.makedirs(os.path.join(out, "stems"), exist_ok=True)
    os.makedirs(os.path.join(out, "work"), exist_ok=True)
    # SPACE: frozen. space.wav is only (re)written with --space (it is the approved master; its
    # sha256 is recorded in REPORT.md). Normally we read the existing file for the 50/50 mix.
    space_path = os.path.join(out, "space.wav")
    if "--space" in sys.argv or not os.path.exists(space_path):
        t0 = time.time()
        space, space_stems, space_wet = render_space(rng_s)
        print(f"space rendered in {time.time()-t0:.1f}s")
        space = normalise("space", space, out)
        write_wav24(space_path, space)
        for nm, st in list(space_stems.items()) + [("space_wet", space_wet)]:
            write_wav_float(os.path.join(out, "stems", f"space_{nm}.wav"), st)
    else:
        space = read_wav24(space_path)
        print("space.wav left untouched (pass --space to re-render it)")

    # ALOHA v2: sample-based arrangement (aloha2.py). v1 (pure synthesis) is render_aloha() above,
    # kept for reference; `--aloha-v1` renders it instead.
    t0 = time.time()
    if "--aloha-v1" in sys.argv:
        aloha, aloha_stems, aloha_wet = render_aloha(rng_a)
    elif "--aloha-v2" in sys.argv:
        import aloha2
        aloha, aloha_stems, aloha_wet, _ir = aloha2.render(rng_a)
    else:
        import aloha3          # v3: 160 BPM re-performance (default)
        aloha, aloha_stems, aloha_wet, _ir = aloha3.render(rng_a)
    print(f"aloha rendered in {time.time()-t0:.1f}s")
    aloha = normalise("aloha", aloha, out)
    write_wav24(os.path.join(out, "aloha.wav"), aloha)
    for nm, st in list(aloha_stems.items()) + [("aloha_wet", aloha_wet)]:
        write_wav_float(os.path.join(out, "stems", f"aloha_{nm}.wav"), st)
    # 50/50 equal-power mix for measurement
    write_wav24(os.path.join(out, "mix5050.wav"), np.clip((aloha + space) * np.sqrt(0.5), -1, 1))
    with open(os.path.join(out, "loop.json"), "w") as f:
        json.dump(dict(sample_rate=SR, samples=N, seconds=LOOP_SECONDS, bpm=BPM, bars=BARS), f, indent=2)
    for nm in ["aloha", "space", "mix5050"]:
        I, tp, lra = ebur128(os.path.join(out, f"{nm}.wav"))
        print(f"{nm:8s} I={I:6.1f} LUFS  TP={tp:5.1f} dBTP  LRA={lra:4.1f} LU")
    if do_encode:
        subprocess.check_call([sys.executable, os.path.join(HERE, "encode.py")])


if __name__ == "__main__":
    main()
