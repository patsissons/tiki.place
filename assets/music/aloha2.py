"""
ALOHA loop, version 2: a sample-based tropical-lounge arrangement.

Same clock as the space loop: 80 BPM, 8 bars of 4/4, C major, 24.000 s = 1,152,000 samples @ 48 kHz.
Chords (shared with the space pad): | Cmaj7 | Am7 | Fmaj7 | G7 | Cmaj7 | Em7 | D7 | G7 |

Sources
  FluidR3_GM.sf2 (MIT) rendered offline with fluidsynth, reverb/chorus off:
    lead "steel"  bank 8 / prog 26 "Hawaiian Guitar"  (slides via pitch bend, vibrato via CC1)
    ukulele       bank 8 / prog 24 "Ukulele"          (off-beat chank comping)
    nylon guitar  bank 0 / prog 24 "Nylon String Guitar" (bossa-style syncopated comping)
    bass          bank 0 / prog 32 "Acoustic Bass"    (walking two-feel with approach notes)
  VCSL (CC0) samples placed directly: Vibraphone (soft/hard mallets, velocity layers), Bongos,
    Conga/Tumba/Quinto, Shaker Small, Cabasa, Guiro; round robins and velocity layers used.

Everything is placed circularly: the fluidsynth parts are rendered as three consecutive copies and the
middle copy is taken, so tails and early (pushed) notes wrap exactly like an endless loop; sample
parts are added modulo N; EQ and reverb are circular.
"""
import os
import re
import glob
import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

import render as R      # shared clock, helpers, circular EQ/convolution
import fluid

SR, N, BEAT, BAR, BARS, LOOP = R.SR, R.N, R.BEAT, R.BAR, R.BARS, R.LOOP_SECONDS
SAMPLES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples")
VCSL = os.path.join(SAMPLES, "vcsl")
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")

SWING = 0.60          # off-beat eighths land at 60 % of the beat (light swing)

# ----------------------------------------------------------------------------
# Harmony (one chord per bar)
# ----------------------------------------------------------------------------
PROG = ["Cmaj7", "Am7", "Fmaj7", "G7", "Cmaj7", "Em7", "D7", "G7"]
VOICE = {
    #          nylon root, nylon chord (bossa comp)         uke (reentrant G4 C4 E4 A4 strings)
    "Cmaj7": dict(root="C3", gtr=["E3", "G3", "B3", "D4"], uke=["G4", "C4", "E4", "B4"]),
    "Am7":   dict(root="A2", gtr=["E3", "G3", "C4", "E4"], uke=["G4", "C4", "E4", "G4"]),
    "Fmaj7": dict(root="F3", gtr=["A3", "C4", "E4", "G4"], uke=["A4", "C4", "F4", "A4"]),
    "G7":    dict(root="G2", gtr=["F3", "B3", "D4", "E4"], uke=["G4", "D4", "F4", "B4"]),
    "Em7":   dict(root="E3", gtr=["G3", "B3", "D4", "E4"], uke=["G4", "D4", "G4", "B4"]),
    "D7":    dict(root="D3", gtr=["F#3", "C4", "E4", "A4"], uke=["A4", "D4", "F#4", "C5"]),
}

# ----------------------------------------------------------------------------
# The hook (original). Call = steel in the odd bars, response = vibes in the even bars,
# both together in bar 8. Motif: three rising notes (3-5-6 of the chord) landing on beat 2,
# fall back 6-5-3; the second time (bar 5) it dances; bar 8 is the pull back to bar 1.
# (bar, beat, note, duration_in_beats, slide_from_semitones). Off-beats are swung later.
# ----------------------------------------------------------------------------
STEEL = [
    (0, 0.0, "E5", 0.5, 0), (0, 0.5, "G5", 0.5, 0), (0, 1.0, "A5", 1.5, -2), (0, 2.5, "G5", 0.5, 0), (0, 3.0, "E5", 1.2, 0),
    (2, 0.0, "C5", 0.5, 0), (2, 0.5, "E5", 0.5, 0), (2, 1.0, "F5", 1.5, -1), (2, 2.5, "E5", 0.5, 0), (2, 3.0, "C5", 1.2, 0),
    (4, 0.0, "E5", 0.5, 0), (4, 0.5, "G5", 0.5, 0), (4, 1.0, "A5", 1.0, -2), (4, 2.0, "G5", 0.5, 0), (4, 2.5, "A5", 0.5, 0),
    (4, 3.0, "G5", 0.5, 0), (4, 3.5, "E5", 0.7, 0),
    (6, 0.0, "A4", 0.5, 0), (6, 0.5, "C5", 0.5, 0), (6, 1.0, "D5", 1.5, -2), (6, 2.5, "C5", 0.5, 0), (6, 3.0, "A4", 1.2, 0),
    (7, 0.5, "G4", 0.5, 0), (7, 1.0, "B4", 1.0, 0), (7, 2.0, "D5", 1.0, -1), (7, 3.0, "F5", 0.5, 0), (7, 3.5, "D5", 0.5, 0),
]
VIBES = [   # (bar, beat, [notes], duration_in_beats, velocity 0-1)
    (1, 0.5, ["D5"], 0.5, 0.7), (1, 1.0, ["C5"], 1.5, 0.8), (1, 2.5, ["A4"], 0.5, 0.6), (1, 3.0, ["C5", "E5"], 1.4, 0.75),
    (3, 0.5, ["B4"], 0.5, 0.7), (3, 1.0, ["D5"], 1.0, 0.8), (3, 2.0, ["F5"], 0.5, 0.7), (3, 2.5, ["E5"], 0.5, 0.65), (3, 3.0, ["D5", "B4"], 1.4, 0.75),
    (5, 0.5, ["D5"], 0.5, 0.7), (5, 1.0, ["B4"], 1.5, 0.8), (5, 2.5, ["G4"], 0.5, 0.6), (5, 3.0, ["B4", "E5"], 1.4, 0.75),
    (7, 0.5, ["G4"], 0.5, 0.7), (7, 1.0, ["B4"], 1.0, 0.8), (7, 2.0, ["D5"], 1.0, 0.8), (7, 3.0, ["F5"], 0.5, 0.85), (7, 3.5, ["D5"], 0.6, 0.9),
    # soft chord "dings" under the steel's long note in the odd bars
    (0, 1.0, ["C4", "E4", "G4"], 1.5, 0.35), (2, 1.0, ["A3", "C4", "E4"], 1.5, 0.35),
    (4, 1.0, ["C4", "E4", "G4"], 1.0, 0.4), (6, 1.0, ["A3", "C4", "F#4"], 1.5, 0.35),
]
# Walking two-feel bass with approach notes into each chord change: (bar, beat, note, dur_beats, accent)
BASS = [
    (0, 0, "C2", 1.5, 1.0), (0, 1.5, "E2", 0.5, 0.5), (0, 2, "G2", 1.0, 0.8), (0, 3, "G#2", 1.0, 0.7),
    (1, 0, "A2", 1.5, 1.0), (1, 2, "E2", 1.0, 0.8), (1, 3, "G2", 1.0, 0.7),
    (2, 0, "F2", 1.5, 1.0), (2, 1.5, "C3", 0.5, 0.5), (2, 2, "A2", 1.0, 0.8), (2, 3, "F#2", 1.0, 0.7),
    (3, 0, "G2", 1.0, 1.0), (3, 1, "F2", 1.0, 0.7), (3, 2, "E2", 1.0, 0.8), (3, 3, "D2", 1.0, 0.75),
    (4, 0, "C2", 1.5, 1.0), (4, 2, "G2", 1.0, 0.8), (4, 3, "D2", 0.5, 0.65), (4, 3.5, "D#2", 0.5, 0.7),
    (5, 0, "E2", 1.5, 1.0), (5, 2, "B1", 1.0, 0.8), (5, 3, "D#2", 1.0, 0.7),
    (6, 0, "D2", 1.5, 1.0), (6, 1.5, "A1", 0.5, 0.5), (6, 2, "F#2", 1.0, 0.8), (6, 3, "A2", 0.5, 0.65), (6, 3.5, "G#2", 0.5, 0.7),
    (7, 0, "G2", 1.0, 1.0), (7, 1, "D2", 1.0, 0.7), (7, 2, "B1", 1.0, 0.85), (7, 3, "A1", 0.5, 0.7), (7, 3.5, "B1", 0.5, 0.8),
]
# Nylon comping: per bar a list of (beat, duration, use_next_chord, with_root, velocity)
P1 = [(0, 1.0, False, True, 0.8), (1.5, 0.5, False, False, 0.6), (2.5, 0.45, False, False, 0.65), (3.5, 0.9, True, False, 0.7)]
P2 = [(0, 0.6, False, True, 0.8), (1.5, 0.4, False, False, 0.6), (3.0, 0.6, False, False, 0.7), (3.5, 0.9, True, False, 0.65)]
P3 = [(0, 0.5, False, True, 0.85), (1.0, 0.5, False, False, 0.7), (2.0, 0.5, False, False, 0.75), (2.5, 0.5, False, False, 0.7), (3.5, 0.9, True, True, 0.8)]
GTR_PATTERN = [P1, P2, P1, P2, P1, P2, P1, P3]
# Ukulele chank: off-beat eighths; bars 5-8 add light on-beat 2 and 4
UKE_BEATS_A = [(0.5, 0.75), (1.5, 0.6), (2.5, 0.8), (3.5, 0.65)]
UKE_BEATS_B = [(0.5, 0.8), (1.0, 0.4), (1.5, 0.6), (2.5, 0.85), (3.0, 0.4), (3.5, 0.7)]
# Percussion grids (beat, velocity) per bar
BONGO = [(0, "H", 0.85), (0.5, "Hm", 0.5), (1.0, "H", 0.6), (1.5, "L", 0.9), (2.0, "H", 0.8), (2.5, "Hm", 0.5), (3.0, "H", 0.6), (3.5, "L", 0.95)]
CONGA = [(0, "Cm", 0.5), (0.5, "Cm", 0.45), (1.0, "Cm", 0.7), (1.5, "Cm", 0.45), (2.0, "Cm", 0.5), (2.5, "Cm", 0.45), (3.0, "C", 0.9), (3.5, "C", 0.85)]
FILL_BARS = [3, 7]      # fills into bar 5 and bar 1


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def swing(beat):
    """Map a nominal beat position inside the bar to a swung one."""
    b = np.floor(beat)
    f = beat - b
    if f < 0.5:
        f2 = f / 0.5 * SWING
    else:
        f2 = SWING + (f - 0.5) / 0.5 * (1 - SWING)
    return b + f2


def midi_key(name):
    return int(round(69 + 12 * np.log2(R.freq(name) / 440.0)))


def tt(bar, beat):
    return bar * BAR + swing(beat) * BEAT


def rr_pick(rng, items, last):
    """Round-robin choice that avoids repeating the previous sample."""
    if len(items) > 1 and last is not None:
        items = [i for i in items if i != last]
    return items[rng.integers(len(items))]


# ----------------------------------------------------------------------------
# fluidsynth parts
# ----------------------------------------------------------------------------
def render_loop_part(name, events, lead_in=0.0):
    """events: list of (t, msg) in loop seconds (may be <0 or >LOOP). Render 3 copies, keep the middle."""
    ev = []
    for t, msg in events:
        if t <= -0.5:                      # set-up events (program, bank, bend range) once, at time 0
            ev.append((0.0, msg))
            continue
        for k in range(3):
            tk = t + k * LOOP
            if tk >= 0:
                ev.append((tk, msg))
    mid = os.path.join(WORK, f"{name}.mid")
    wav = os.path.join(WORK, f"{name}_raw.wav")
    fluid.write_midi(mid, ev, 3 * LOOP + 2.0)
    x = fluid.render(mid, wav, sr=SR, gain=0.4)
    if x.shape[1] < 2 * N:
        x = np.concatenate([x, np.zeros((2, 2 * N - x.shape[1]))], axis=1)
    return x[:, N:2 * N].copy()


def steel_events(rng, ch=0):
    bank, prog = 8, 26
    ev = fluid.program_events(ch, bank, prog, t=-1.0) + fluid.bend_range_events(ch, 12, t=-1.0)
    ev += fluid.cc_events(ch, 1, 0, t=-1.0)
    notes = []
    for bar, beat, note, dur, slide in STEEL:
        t = tt(bar, beat) + rng.normal(0, 0.006)
        d = dur * BEAT * (0.95 if dur <= 0.5 else 0.9)
        vel = 96 + (14 if beat in (1.0, 2.0) and dur >= 1.0 else 0) + (6 if bar >= 4 else 0) + rng.integers(-5, 6)
        if bar == 7 and beat >= 3.0:
            vel += 8          # the pickup into bar 1 leans in
        notes.append((t, t + d, midi_key(note), vel))
        if slide:
            for j in range(16):
                ev += fluid.bend_events(ch, t - 0.004 + j * 0.014, slide * (1 - j / 15) ** 1.3, 12)
        else:
            ev += fluid.bend_events(ch, t - 0.004, 0.0, 12)
        # delayed vibrato on the long notes (CC1 ramps up after ~0.3 s)
        if dur >= 1.0:
            ev += fluid.cc_events(ch, 1, 0, t)
            for j, v in enumerate([6, 14, 24, 34, 40]):
                ev += fluid.cc_events(ch, 1, v, t + 0.28 + 0.07 * j)
        else:
            ev += fluid.cc_events(ch, 1, 8, t)
    ev += fluid.note_events(ch, notes)
    return ev


def bass_events(rng, ch=1):
    ev = fluid.program_events(ch, 0, 32, t=-1.0)
    notes = []
    for bar, beat, note, dur, acc in BASS:
        t = tt(bar, beat) + rng.normal(0, 0.005)
        d = dur * BEAT * 0.88
        vel = int(np.clip(70 + 40 * acc + rng.normal(0, 4) + (4 if bar >= 4 else 0), 40, 125))
        notes.append((t, t + d, midi_key(note), vel))
    ev += fluid.note_events(ch, notes)
    return ev


def strum(t0, keys, vel, rng, spread=0.011, down=True, dur=0.4):
    """Return note tuples for a strum starting at t0. Downstroke = low to high."""
    order = keys if down else keys[::-1]
    out = []
    for i, k in enumerate(order):
        dt = i * spread * (0.85 + 0.3 * rng.random())
        v = vel * (0.9 + 0.2 * rng.random()) * (1.0 if i < len(order) - 1 else 1.08)
        out.append((t0 + dt, t0 + dt + dur, k, int(np.clip(v, 1, 127))))
    return out


def guitar_events(rng, ch=2):
    ev = fluid.program_events(ch, 0, 24, t=-1.0)
    notes = []
    for bar in range(BARS):
        for beat, dur, use_next, with_root, vel in GTR_PATTERN[bar]:
            chord = PROG[(bar + 1) % BARS] if use_next else PROG[bar]
            v = VOICE[chord]
            keys = [midi_key(n) for n in v["gtr"]]
            if with_root:
                keys = [midi_key(v["root"])] + keys
            t = tt(bar, beat) + rng.normal(0, 0.006)
            vv = (62 + 40 * vel) * (1.05 if bar >= 4 else 0.95)
            notes += strum(t, keys, vv, rng, spread=0.012, dur=dur * BEAT)
    # a few single-note fills answering the vibes in bars 2 and 6 (low register counter-line)
    for bar, beat, note, dur in [(1, 3.5, "E3", 0.5), (1, 3.75, "G3", 0.5), (5, 3.5, "B3", 0.5), (5, 3.75, "D4", 0.6)]:
        t = tt(bar, beat) + rng.normal(0, 0.005)
        notes.append((t, t + dur * BEAT, midi_key(note), 78 + rng.integers(0, 8)))
    ev += fluid.note_events(ch, notes)
    return ev


def uke_events(rng, ch=3):
    ev = fluid.program_events(ch, 8, 24, t=-1.0)
    notes = []
    for bar in range(BARS):
        keys = [midi_key(n) for n in VOICE[PROG[bar]]["uke"]]
        grid = UKE_BEATS_A if bar < 4 else UKE_BEATS_B
        for beat, vel in grid:
            t = tt(bar, beat) + rng.normal(0, 0.005) + 0.003
            down = (beat % 1.0) == 0.5
            vv = 50 + 55 * vel * (0.95 + 0.1 * (bar >= 4))
            notes += strum(t, keys, vv, rng, spread=0.007, down=down, dur=0.22 * BEAT if down else 0.3 * BEAT)
    ev += fluid.note_events(ch, notes)
    return ev


# ----------------------------------------------------------------------------
# VCSL sample parts
# ----------------------------------------------------------------------------
_cache = {}


def load_sample(path):
    if path in _cache:
        return _cache[path]
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768.0
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    x = x.T
    if sr != SR:
        g = np.gcd(sr, SR)
        x = sg.resample_poly(x, SR // g, sr // g, axis=1)
    # trim leading silence (-50 dBFS) so the hit lands on the grid
    env = np.max(np.abs(x), axis=0)
    on = int(np.argmax(env > 10 ** (-50 / 20)))
    x = x[:, max(0, on - 24):]
    x = x / (np.max(np.abs(x)) + 1e-9)
    _cache[path] = x
    return x


def bank(folder, pattern):
    files = sorted(glob.glob(os.path.join(VCSL, folder, pattern)))
    assert files, (folder, pattern)
    out = []
    for f in files:
        m = re.search(r"_v(\d)", os.path.basename(f))
        out.append((int(m.group(1)) if m else 1, f))
    layers = sorted(set(v for v, _ in out))
    return layers, out


class Perc:
    """Percussion articulation with velocity layers + round robins."""
    def __init__(self, folder, pattern):
        self.layers, self.files = bank(folder, pattern)
        self.last = None

    def pick(self, vel, rng):
        li = min(len(self.layers) - 1, int(vel * len(self.layers)))
        layer = self.layers[li]
        cands = [f for v, f in self.files if v == layer]
        f = rr_pick(rng, cands, self.last)
        self.last = f
        return load_sample(f)


def hit(dst, perc, t, vel, rng, pan, gain=1.0, max_len=None):
    # keep hard percussion onsets off the exact loop point: a hit humanised a few samples before
    # t=0 wraps correctly, but then the loop seam sits inside a transient and every seam metric
    # (and any codec) sees the onset instead of the music. Nudge such hits to start >= 1.5 ms in.
    if -0.02 < t < 0.0015:
        t = 0.0015 + abs(t) * 0.5
    x = perc.pick(vel, rng)
    if max_len:
        n = min(x.shape[1], int(max_len * SR))
        x = x[:, :n] * R.raised_cos_fade(n, int(n * 0.7), int(n * 0.3))
    amp = gain * (0.35 + 0.65 * vel) ** 1.3
    l, r = R.pan_gains(pan)
    R.add_wrapped(dst, np.stack([x[0] * amp * l, x[1] * amp * r]), int(round(t * SR)))


class Vibes:
    def __init__(self):
        self.notes = {}   # (kind) -> list of (midi, layer, path)
        for kind, sub in [("soft", "Soft Mallets"), ("hard", "Hard Mallets")]:
            for f in glob.glob(os.path.join(VCSL, "Idiophones/Struck Idiophones/Vibraphone", sub, "*.wav")):
                m = re.search(r"Vibes_\w+_([A-G]#?\d)_v(\d)_rr(\d)", os.path.basename(f))
                # VCSL names use middle C = C3 (measured: the "A4" file sounds at 880 Hz), so +12
                self.notes.setdefault(kind, []).append((midi_key(m.group(1)) + 12, int(m.group(2)), f))

    def play(self, dst, t, note, dur, vel, rng, pan):
        key = midi_key(note)
        kind = "soft" if vel < 0.6 else "hard"
        layers = sorted(set(l for _, l, _ in self.notes[kind]))
        layer = layers[0] if (vel < 0.4 or (kind == "hard" and vel < 0.85)) else layers[-1]
        cands = [(k, f) for k, l, f in self.notes[kind] if l == layer]
        k0, f = min(cands, key=lambda c: abs(c[0] - key))
        x = load_sample(f)
        ratio = 2 ** ((key - k0) / 12.0)
        if abs(ratio - 1) > 1e-6:
            n_out = int(x.shape[1] / ratio)
            idx = np.arange(n_out) * ratio
            x = np.stack([np.interp(idx, np.arange(x.shape[1]), x[c]) for c in range(2)])
        # pedal-ish damping: ring for the written duration + 0.5 s, then fade over 0.45 s
        ring = int((dur + 0.5) * SR)
        n = min(x.shape[1], ring + int(0.45 * SR))
        x = x[:, :n] * R.raised_cos_fade(n, ring, int(0.45 * SR))
        amp = (0.3 + 0.7 * vel) ** 1.4
        l, r = R.pan_gains(pan)
        R.add_wrapped(dst, np.stack([x[0] * amp * l, x[1] * amp * r]), int(round(t * SR)))


def render_vibes(rng):
    dst = np.zeros((2, N))
    vib = Vibes()
    for bar, beat, notes, dur, vel in VIBES:
        t = tt(bar, beat) + rng.normal(0, 0.007)
        for i, n in enumerate(notes):
            v = vel * (0.95 + 0.1 * rng.random()) * (1.05 if bar >= 4 else 1.0)
            pan = -0.3 + 0.12 * (midi_key(n) - 72) / 12.0        # higher notes a little further right, like a real bar layout
            vib.play(dst, t + i * 0.012, n, dur * BEAT, min(1.0, v), rng, pan)
    return dst


def render_percussion(rng):
    out = {k: np.zeros((2, N)) for k in ["bongos", "congas", "shaker", "cabasa", "guiro"]}
    B = "Membranophones/Struck Membranophones/Bongos"
    C = "Membranophones/Struck Membranophones/Conga"
    I = "Idiophones/Struck Idiophones"
    bongo = dict(H=Perc(B, "BongoH_Hit1_v*"), Hm=Perc(B, "BongoH_HitMuted1_v*"), L=Perc(B, "BongoL_Hit1_v*"),
                 Lm=Perc(B, "BongoL_HitMuted2_v*"), Hroll=Perc(B, "BongoH_Roll_v*"))
    conga = dict(C=Perc(C, "Conga_HitN_v*"), Cm=Perc(C, "Conga_HitFM_v*"), T=Perc(C, "Tumba_HitN_v*"),
                 Q=Perc(C, "Quinto_HitN_v*"), Qm=Perc(C, "Quinto_HitFM1_v*"))
    shk = dict(down=Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Down_rr*"), up=Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Up_rr*"),
               roll=Perc(I + "/Shaker, Small", "Mid_Shaker_Roll_Fast_rr*"))
    cab = Perc(I + "/Cabasa", "Cabasa1_Rub_v*")
    gui = dict(slow=Perc(I + "/Guiro", "Guiro_Slow_rr*"), med=Perc(I + "/Guiro", "Guiro_Med_rr*"), fast=Perc(I + "/Guiro", "Guiro_Fast_rr*"))
    for bar in range(BARS):
        dyn = 0.88 if bar < 4 else 1.0
        fill = bar in FILL_BARS
        # bongos: martillo-lite; fill replaces beat 4 in fill bars
        for beat, art, vel in BONGO:
            if fill and beat >= 3.0:
                continue
            hit(out["bongos"], bongo[art], tt(bar, beat) + rng.normal(0, 0.004), min(1, vel * dyn * (0.92 + 0.16 * rng.random())), rng, 0.35)
        if fill:
            hit(out["bongos"], bongo["Hroll"], tt(bar, 2.75) + rng.normal(0, 0.004), 0.55, rng, 0.35, max_len=0.35)
            for i, (art, vel) in enumerate([("L", 0.8), ("L", 0.7), ("H", 0.9), ("H", 0.75)]):
                hit(out["bongos"], bongo[art], tt(bar, 3.0 + 0.25 * i) + rng.normal(0, 0.003), vel, rng, 0.35)
        # congas: tumbao; tumba accent on 2-and in odd bars; quinto fill into bars 5 and 1
        for beat, art, vel in CONGA:
            if fill and beat >= 3.0:
                continue
            hit(out["congas"], conga[art], tt(bar, beat) + rng.normal(0, 0.004), min(1, vel * dyn * (0.92 + 0.16 * rng.random())), rng, -0.3)
        if bar % 2 == 1 and not fill:
            hit(out["congas"], conga["T"], tt(bar, 1.5) + rng.normal(0, 0.004), 0.8, rng, -0.4)
        if fill:
            for i, (art, vel) in enumerate([("Q", 0.85), ("Q", 0.7), ("Qm", 0.6), ("C", 0.95)]):
                hit(out["congas"], conga[art], tt(bar, 3.0 + 0.25 * i) + rng.normal(0, 0.003), vel, rng, -0.25)
        if bar in (0, 4):
            hit(out["congas"], conga["T"], tt(bar, 0) + rng.normal(0, 0.003), 0.9, rng, -0.4)   # downbeat thump after the fill
        # shaker: every eighth, down/up alternate, off-beats accented, slightly late
        for e in range(8):
            beat = e / 2.0
            up = e % 2 == 1
            vel = (0.85 if up else 0.55) * dyn * (0.9 + 0.2 * rng.random())
            hit(out["shaker"], shk["up" if up else "down"], tt(bar, beat) + rng.normal(0, 0.003) + (0.006 if up else 0), vel, rng, 0.6, max_len=0.5)
        if fill:
            hit(out["shaker"], shk["roll"], tt(bar, 3.5), 0.6, rng, 0.6, max_len=0.45)
        # cabasa on 2 and 4
        for beat in (1.0, 3.0):
            hit(out["cabasa"], cab, tt(bar, beat) + rng.normal(0, 0.004), 0.5 * dyn, rng, -0.6, max_len=0.6)
        # guiro: sparse scrapes
        if bar in (1, 5):
            hit(out["guiro"], gui["slow"], tt(bar, 2.5), 0.6, rng, -0.15, max_len=0.9)
        if fill:
            hit(out["guiro"], gui["fast"], tt(bar, 2.5), 0.7, rng, -0.15, max_len=0.6)
    return out


# ----------------------------------------------------------------------------
# Room: image-source early reflections + diffuse tail
# ----------------------------------------------------------------------------
def room_ir(rng, dims=(7.0, 5.5, 3.2), src=(2.6, 2.1, 1.3), ear=(4.4, 3.6, 1.25), order=3, absorb=0.32,
            tail_t60=(1.3, 1.1, 0.9, 0.5), length=1.8):
    c = 343.0
    n = int(length * SR)
    ir = np.zeros((2, n))
    direct = None
    ears = [(ear[0] - 0.09, ear[1], ear[2]), (ear[0] + 0.09, ear[1], ear[2])]
    taps = {0: [], 1: [], 2: [], 3: []}
    for nx in range(-order, order + 1):
        for ny in range(-order, order + 1):
            for nz in range(-order, order + 1):
                k = abs(nx) + abs(ny) + abs(nz)
                if k > order:
                    continue
                # image position
                px = nx * dims[0] + (src[0] if nx % 2 == 0 else dims[0] - src[0])
                py = ny * dims[1] + (src[1] if ny % 2 == 0 else dims[1] - src[1])
                pz = nz * dims[2] + (src[2] if nz % 2 == 0 else dims[2] - src[2])
                for ch, e in enumerate(ears):
                    d = np.sqrt((px - e[0]) ** 2 + (py - e[1]) ** 2 + (pz - e[2]) ** 2)
                    taps[k].append((ch, d, (1 - absorb) ** k / max(d, 1.0)))
    d0 = min(d for ch, d, a in taps[0])
    early = np.zeros((2, n))
    for k, lst in taps.items():
        if k == 0:
            continue    # the direct sound is the dry signal
        buf = np.zeros((2, n))
        for ch, d, a in lst:
            i = int(round((d - d0) / c * SR)) + int(0.004 * SR)
            if i < n:
                buf[ch, i] += a * (1 if rng.random() > 0.3 else -1)
        for _ in range(k):   # each bounce darkens
            buf = sg.sosfilt(sg.butter(1, 6000 - 900 * k, fs=SR, output="sos"), buf, axis=1)
        early += buf
    # diffuse tail
    t = np.arange(n) / SR
    tail = np.zeros((2, n))
    bands = [(0, 250), (250, 1500), (1500, 5000), (5000, SR / 2)]
    for ch in range(2):
        noise = rng.standard_normal(n)
        for (lo, hi), t60 in zip(bands, tail_t60):
            if lo == 0:
                sos = sg.butter(2, hi, btype="low", fs=SR, output="sos")
            elif hi >= SR / 2:
                sos = sg.butter(2, lo, btype="high", fs=SR, output="sos")
            else:
                sos = sg.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
            tail[ch] += sg.sosfiltfilt(sos, noise) * np.exp(-6.908 * t / t60)
    tail *= np.clip((t - 0.012) / 0.05, 0, 1) ** 2          # builds up after the first reflections
    tail *= 0.012
    ir = early + tail
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


# ----------------------------------------------------------------------------
# Mix
# ----------------------------------------------------------------------------
def set_rms(x, target_db):
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12
    return x * (R.db(target_db) / rms)


def render(rng):
    os.makedirs(WORK, exist_ok=True)
    stems = {}
    stems["steel"] = render_loop_part("steel", steel_events(rng))
    stems["bass"] = render_loop_part("bass", bass_events(rng))
    stems["gtr"] = render_loop_part("gtr", guitar_events(rng))
    stems["uke"] = render_loop_part("uke", uke_events(rng))
    stems["vibes"] = render_vibes(rng)
    stems.update(render_percussion(rng))

    # fluidsynth parts are mono-ish; pan them
    def pan(x, p):
        l, r = R.pan_gains(p)
        m = x.mean(axis=0)
        return np.stack([m * l, m * r])
    stems["steel"] = pan(stems["steel"], 0.12)
    stems["bass"] = pan(stems["bass"], 0.0)
    stems["gtr"] = pan(stems["gtr"], -0.45)
    stems["uke"] = pan(stems["uke"], 0.48)

    # tone
    F = R.rbj
    stems["steel"] = R.circ_filter(stems["steel"], [F("hp", 160, 0.7), F("peak", 2800, 1.0, 1.5), F("hshelf", 7000, 0.7, -3.0)])
    stems["bass"] = R.circ_filter(stems["bass"], [F("hp", 34, 0.7), F("peak", 90, 1.2, 2.0), F("peak", 400, 1.0, -2.0), F("lp", 4500, 0.7)])
    stems["gtr"] = R.circ_filter(stems["gtr"], [F("hp", 110, 0.7), F("peak", 250, 1.0, -2.5), F("hshelf", 6000, 0.7, -2.0)])
    stems["uke"] = R.circ_filter(stems["uke"], [F("hp", 220, 0.7), F("peak", 1800, 1.0, 1.5), F("hshelf", 8000, 0.7, -2.0)])
    stems["vibes"] = R.circ_filter(stems["vibes"], [F("hp", 150, 0.7), F("peak", 900, 1.0, -1.5)])
    stems["bongos"] = R.circ_filter(stems["bongos"], [F("hp", 150, 0.7), F("peak", 600, 1.0, -2.0)])
    stems["congas"] = R.circ_filter(stems["congas"], [F("hp", 70, 0.7), F("peak", 350, 1.0, -2.0)])
    stems["shaker"] = R.circ_filter(stems["shaker"], [F("hp", 1500, 0.7), F("hshelf", 9000, 0.7, -2.0)])
    stems["cabasa"] = R.circ_filter(stems["cabasa"], [F("hp", 1200, 0.7)])
    stems["guiro"] = R.circ_filter(stems["guiro"], [F("hp", 500, 0.7), F("lp", 9000, 0.7)])

    # balance: whole-loop RMS targets (dBFS). Sparse parts peak well above these.
    # rev2 of the v2 mix: uke chank up 1.5 dB, bongos up 1 dB, reverb sends down 3 dB (the return
    # was within 2 dB of the lead's RMS, which would smear the percussion)
    target = dict(steel=-24.5, vibes=-29.0, gtr=-29.5, uke=-31.5, bass=-25.0,
                  bongos=-33.0, congas=-31.5, shaker=-39.0, cabasa=-43.0, guiro=-42.0)
    for k in stems:
        stems[k] = set_rms(stems[k], target[k])
    sends = dict(steel=R.db(-13), vibes=R.db(-12), gtr=R.db(-17), uke=R.db(-16), bass=R.db(-30),
                 bongos=R.db(-19), congas=R.db(-19), shaker=R.db(-23), cabasa=R.db(-21), guiro=R.db(-17))
    dry = sum(stems.values())
    send = sum(stems[k] * sends[k] for k in stems)
    ir = room_ir(rng)
    wet = R.circ_convolve(send, ir)
    wet = R.circ_filter(wet, [F("hp", 160, 0.7), F("lp", 8000, 0.7)])
    mix = dry + wet
    # glue: light bus saturation (memoryless)
    mix = np.tanh(1.25 * mix) / 1.25
    return mix, stems, wet, ir
