"""Music v2 engine: a per-piece loop clock, chord symbols and voicings, theme notation,
fluidsynth parts and circular DSP.

Unlike render.py (one fixed 24 s clock), every piece here has its own length. All DSP that
touches the loop is circular, so the loop seam is seamless by construction.
"""
import os
import re
import sys

import numpy as np
import scipy.signal as sg

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import fluid  # noqa: E402
import render as R  # noqa: E402  (synth voices, biquads and IRs that do not depend on loop length)

SR = 48000
TAIL = 7.0  # seconds of ring-out rendered past the loop end and folded back onto the start


# ----------------------------------------------------------------------------
# Loop clock
# ----------------------------------------------------------------------------
class Loop:
    """`bpm` is the slow (celestial) tempo. The bossa mood plays at exactly twice that."""

    def __init__(self, bpm, bars, work):
        n = bars * 4 * 60.0 / bpm * SR
        assert abs(n - round(n)) < 1e-6, f"{bpm} BPM x {bars} bars is not a whole number of samples"
        self.bpm, self.bars = bpm, bars
        self.n = int(round(n))
        self.dur = self.n / SR
        self.beat = self.dur / (bars * 4)
        self.bar = 4 * self.beat
        self.freqs = np.fft.rfftfreq(self.n, 1.0 / SR)
        self.work = work
        os.makedirs(work, exist_ok=True)

    def zeros(self):
        return np.zeros((2, self.n))

    def t(self, bar, beat=0.0):
        return (bar * 4 + beat) * self.beat

    def add(self, dst, sig, start):
        """Add sig (M,) or (2,M) at sample `start`, wrapping modulo the loop."""
        if sig.ndim == 1:
            sig = np.stack([sig, sig])
        n, m, pos = self.n, sig.shape[1], 0
        start = int(start) % n
        while pos < m:
            i = (start + pos) % n
            k = min(n - i, m - pos)
            dst[:, i:i + k] += sig[:, pos:pos + k]
            pos += k

    def place(self, dst, sig, t, pan=0.0, gain=1.0):
        l, r = R.pan_gains(pan)
        if sig.ndim == 1:
            sig = np.stack([sig * (gain * l), sig * (gain * r)])
        else:
            sig = np.stack([sig[0] * (gain * l), sig[1] * (gain * r)])
        self.add(dst, sig, int(round(t * SR)))

    def filt(self, x, filters):
        h = np.ones(len(self.freqs), dtype=complex)
        for b, a in filters:
            h *= sg.freqz(b, a, worN=self.freqs, fs=SR)[1]
        return np.fft.irfft(np.fft.rfft(x, n=self.n, axis=-1) * h, n=self.n, axis=-1)

    def conv(self, x, ir):
        return np.fft.irfft(np.fft.rfft(x, n=self.n, axis=-1) * np.fft.rfft(ir, n=self.n, axis=-1),
                            n=self.n, axis=-1)

    def delay(self, x, samples):
        """Circular fractional (possibly time-varying) delay of a mono signal."""
        idx = (np.arange(self.n) - samples) % self.n
        i0 = np.floor(idx).astype(np.int64)
        fr = idx - i0
        return x[i0 % self.n] * (1 - fr) + x[(i0 + 1) % self.n] * fr

    def lfo(self, cycles, phase=0.0):
        return np.sin(2 * np.pi * (cycles * np.arange(self.n) / self.n + phase))

    def pingpong(self, x, delay_s, fb=0.48, lp=3200):
        """Circular ping-pong echo of a stereo signal: odd taps left, even taps right."""
        X = np.fft.rfft(x.mean(axis=0), n=self.n)
        hlp = sg.freqz(*R.rbj("lp", lp, 0.7), worN=self.freqs, fs=SR)[1]
        H = fb * hlp * np.exp(-1j * 2 * np.pi * self.freqs * delay_s)
        odd = np.fft.irfft(X * H / (1 - H * H), n=self.n)
        even = np.fft.irfft(X * H * H / (1 - H * H), n=self.n)
        return np.stack([odd, even])


# ----------------------------------------------------------------------------
# Pitch, chords, voicings
# ----------------------------------------------------------------------------
SEMI = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def key(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d+)", name)
    return 12 * (int(m[3]) + 1) + SEMI[m[1]] + {"#": 1, "b": -1, "": 0}[m[2]]


def hz(k):
    return 440.0 * 2.0 ** ((k - 69) / 12.0)


QUALITY = {
    "": [0, 4, 7], "m": [0, 3, 7], "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9],
    "maj7": [0, 4, 7, 11], "maj9": [0, 4, 7, 11, 14], "m7": [0, 3, 7, 10], "m9": [0, 3, 7, 10, 14],
    "7": [0, 4, 7, 10], "9": [0, 4, 7, 10, 14], "13": [0, 4, 7, 10, 21], "7b9": [0, 4, 7, 10, 13],
    "7sus4": [0, 5, 7, 10], "m7b5": [0, 3, 6, 10], "dim7": [0, 3, 6, 9],
}


class Chord:
    def __init__(self, sym):
        m = re.fullmatch(r"([A-G][#b]?)(.*)", sym)
        self.sym = sym
        self.root = (SEMI[m[1][0]] + {"#": 1, "b": -1}.get(m[1][1:], 0)) % 12
        self.iv = QUALITY[m[2]]
        self.third, self.fifth = self.iv[1], self.iv[2]
        self.seventh = self.iv[3] if len(self.iv) > 3 else None
        # colour tone: a 9th where it is safe, otherwise the fifth
        self.colour = self.iv[4] if len(self.iv) > 4 else (
            14 if m[2] in ("maj7", "m7", "7", "6", "7sus4", "") else self.fifth)

    def pcs(self, ivs):
        return [(self.root + i) % 12 for i in ivs]

    def tones(self):
        return self.pcs(self.iv)

    def above(self, ivs, low):
        """Each interval placed in the first octave at or above `low`, sorted (close voicing)."""
        return sorted(low + ((self.root + i - low) % 12) for i in ivs)

    def shell(self, low=52):
        """Rootless comping voicing: 3rd, 7th (or 6th/5th), colour."""
        ivs = [self.third, self.seventh if self.seventh is not None else self.fifth, self.colour]
        if self.seventh is not None and self.colour != self.fifth:
            ivs.append(self.fifth)
        return self.above(sorted(set(i % 12 for i in ivs)), low)

    def bass(self, low=31):
        return low + ((self.root - low) % 12)

    def ladder(self, low, high):
        """All chord tones between low and high, ascending."""
        pcs = set(self.tones())
        return [k for k in range(low, high + 1) if k % 12 in pcs]


def parse_chords(bars):
    """bars: list of strings, one per slow bar, "Cmaj7" or "Em7 A7" (two chords, half a bar each).
    Returns segments [(start_beat, length_beats, Chord)] in slow beats."""
    segs = []
    for b, s in enumerate(bars):
        syms = s.split()
        span = 4.0 / len(syms)
        for i, sym in enumerate(syms):
            segs.append((b * 4 + i * span, span, Chord(sym)))
    return segs


def chord_at(segs, beat, total):
    beat %= total
    for s, ln, c in segs:
        if s <= beat < s + ln:
            return c
    return segs[-1][2]


def parse_theme(bars):
    """bars: list of strings, one per slow bar, tokens "E5:1.5" (note:slow beats), "-:1" is a rest,
    a leading "<" asks the bossa to anticipate the note by a fast eighth.
    Returns [(start_beat, dur_beats, midi_key, anticipate)]."""
    out = []
    for b, s in enumerate(bars):
        pos = 0.0
        for tok in s.split():
            ant = tok.startswith("<")
            name, d = tok.lstrip("<").split(":")
            d = float(d)
            if name != "-":
                out.append((b * 4 + pos, d, key(name), ant))
            pos += d
        assert abs(pos - 4.0) < 1e-9, f"bar {b + 1} adds up to {pos} beats: {s}"
    return out


# ----------------------------------------------------------------------------
# fluidsynth parts
# ----------------------------------------------------------------------------
# name: (bank, program)
GM = dict(
    piano=(0, 0), rhodes=(0, 4), celesta=(0, 8), glock=(0, 9), musicbox=(0, 10), vibes=(0, 11),
    marimba=(0, 12), bells=(0, 14), nylon=(0, 24), steelstr=(0, 25), jazzgtr=(0, 26), steel=(8, 26),
    uke=(8, 24), bass=(0, 32), violin=(0, 40), cello=(0, 42), pizz=(0, 45), harp=(0, 46),
    timpani=(0, 47), strings=(0, 48), slowstrings=(0, 49), choir=(0, 52), trumpet=(0, 56),
    trombone=(0, 57), mutedtrumpet=(0, 59), horn=(0, 60), tenorsax=(0, 66), oboe=(0, 68),
    clarinet=(0, 71), flute=(0, 73), panflute=(0, 75), whistle=(0, 78), ocarina=(0, 79),
)
SUSTAINED = {"violin", "cello", "strings", "slowstrings", "choir", "trumpet", "trombone", "mutedtrumpet",
             "horn", "tenorsax", "oboe", "clarinet", "flute", "panflute", "whistle", "ocarina"}


def fluid_part(L, name, events, gain=0.4, mono=True):
    """events: (t, msg) in loop seconds. t <= -0.5 marks set-up events. Notes that start just before
    0 wrap to the end; everything that rings past the end is folded back onto the start."""
    ev = []
    for t, msg in events:
        if t <= -0.5:
            ev.append((0.0, msg))
        else:
            ev.append((t % L.dur if t < 0 else t, msg))
    mid = os.path.join(L.work, f"{name}.mid")
    wav = os.path.join(L.work, f"{name}.wav")
    fluid.write_midi(mid, ev, L.dur + TAIL)
    x = fluid.render(mid, wav, sr=SR, gain=gain)
    os.remove(wav)
    out = L.zeros()
    L.add(out, x[:, :min(x.shape[1], L.n + int(TAIL * SR))], 0)
    if mono:
        m = out.mean(axis=0)
        out = np.stack([m, m])
    return out


def inst_part(L, name, inst, notes, rng, ch=0, swell=None, slide=False, gain=0.4):
    """notes: [(t, dur, key, vel)] or with a 5th element, the slide-in in semitones.
    Sustained instruments get an expression swell per onset and delayed vibrato on long notes."""
    bank, prog = GM[inst]
    ev = fluid.program_events(ch, bank, prog, t=-1.0) + fluid.cc_events(ch, 1, 0, t=-1.0)
    ev += fluid.cc_events(ch, 11, 127 if not (swell or inst in SUSTAINED) else 84, t=-1.0)
    if slide:
        ev += fluid.bend_range_events(ch, 12, t=-1.0)
    swell = inst in SUSTAINED if swell is None else swell
    out, seen = [], set()
    for n in notes:
        t, d, k, v = n[:4]
        if t < 0:
            t += L.dur
        out.append((t, t + d, k, int(np.clip(v, 1, 127))))
        tk = round(t, 3)
        if swell and tk not in seen:
            seen.add(tk)
            rise = min(0.45, d * 0.5)
            for j in range(6):
                ev += fluid.cc_events(ch, 11, 84 + 36 * (j / 5) ** 0.7, t + rise * j / 5)
            if d > 1.2:
                for j in range(5):
                    ev += fluid.cc_events(ch, 11, 120 - 22 * (j + 1) / 5, t + d * (0.55 + 0.09 * j))
        if slide:
            s = n[4] if len(n) > 4 else 0
            if s:
                for j in range(16):
                    ev += fluid.bend_events(ch, t - 0.004 + j * 0.014, s * (1 - j / 15) ** 1.3, 12)
            else:
                ev += fluid.bend_events(ch, t - 0.004, 0.0, 12)
        if (swell or slide) and d >= 0.6:
            ev += fluid.cc_events(ch, 1, 0, t)
            for j, vv in enumerate([6, 14, 24, 32]):
                ev += fluid.cc_events(ch, 1, vv, t + 0.26 + 0.07 * j)
    ev += fluid.note_events(ch, out)
    return fluid_part(L, name, ev, gain=gain)


def drum_part(L, name, hits, kit=0):
    """hits: [(t, gm_drum_key, vel)] on the GM drum channel. Kept in stereo."""
    ev = [(-1.0, bytes([0xC9, kit]))]
    notes = [((t + L.dur) if t < 0 else t, 0, k, v) for t, k, v in hits]
    ev += fluid.note_events(9, [(t, t + 0.25, k, int(np.clip(v, 1, 127))) for t, _, k, v in notes])
    return fluid_part(L, name, ev, gain=0.4, mono=False)


# ----------------------------------------------------------------------------
# Mix helpers
# ----------------------------------------------------------------------------
def pan(x, p):
    l, r = R.pan_gains(p)
    return np.stack([x[0] * l, x[1] * r]) * np.sqrt(2)


def set_rms(x, target_db):
    """Level a stem by its RMS while it is playing: 100 ms blocks within 30 dB of the loudest."""
    blk = SR // 10
    p = np.mean(x[:, :x.shape[1] // blk * blk].reshape(2, -1, blk) ** 2, axis=(0, 2))
    rms = np.sqrt(np.mean(p[p > p.max() * 1e-3])) + 1e-12
    return x * (R.db(target_db) / rms)


def mix(L, stems, profile, ir, wet_eq, drive=1.25):
    """profile[name] = (pan, highpass_hz, rms_db, send_db). Returns (mix, levelled stems)."""
    out, dry, send = {}, L.zeros(), L.zeros()
    for name, x in stems.items():
        p, hp, lvl, snd = profile[name]
        if not np.any(x):
            continue
        x = L.filt(pan(x, p), [R.rbj("hp", hp, 0.7)])
        x = set_rms(x, lvl)
        out[name] = x
        dry += x
        send += x * R.db(snd)
    wet = L.filt(L.conv(send, ir), wet_eq)
    m = dry + wet
    return np.tanh(drive * m) / drive, out
