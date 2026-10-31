"""
ALOHA loop, version 3: the v2 arrangement re-performed at 160 BPM (2:1 with the space loop).

Clock: 160 BPM, 16 bars of 4/4, 24.000 s = 1,152,000 samples @ 48 kHz. The space loop still changes
chord every 3.000 s, so each chord now lasts exactly TWO bars and every chord boundary sits on the
same sample as before (t = 3k s, sample 144,000 k):

  | Cmaj7 Cmaj7 | Am7 Am7 | Fmaj7 Fmaj7 | G7 G7 | Cmaj7 Cmaj7 | Em7 Em7 | D7 D7 | G7 G7 |

Palette unchanged from v2 (FluidR3 Hawaiian Guitar lead, VCSL vibraphone answers, GM ukulele chank,
GM nylon comping, GM acoustic bass, VCSL bongos/congas/shaker/cabasa/guiro, image-source room).
Hook identity kept (3-5-6 climb on beat 2 and fall back), now once per chord: steel call in the
first bar of each chord, vibes answer in the second bar, over the same chord.

Swing: 56 % (off-beat eighths at 56 % of the beat, ratio 1.27:1). See REPORT.md for the reasoning.
"""
import os
import numpy as np

import render as R
import fluid
from aloha2 import (VOICE, load_sample, Perc, hit, strum, render_loop_part, room_ir, set_rms,
                    midi_key, rr_pick, VCSL)

SR, N, LOOP = R.SR, R.N, R.LOOP_SECONDS
BPM = 160
BEAT = 60.0 / BPM            # 0.375 s
BAR = 4 * BEAT               # 1.5 s
BARS = 16
assert abs(BARS * BAR - LOOP) < 1e-9
SWING = 0.56

PROG = ["Cmaj7", "Am7", "Fmaj7", "G7", "Cmaj7", "Em7", "D7", "G7"]      # one per 2-bar section


def chord_at(bar):
    return PROG[(bar // 2) % 8]


def swing(beat):
    b = np.floor(beat)
    f = beat - b
    f2 = f / 0.5 * SWING if f < 0.5 else SWING + (f - 0.5) / 0.5 * (1 - SWING)
    return b + f2


def tt(bar, beat):
    return bar * BAR + swing(beat) * BEAT


# ----------------------------------------------------------------------------
# Hook. (bar, beat, note, duration_in_beats, slide_from_semitones)
# Odd-numbered sections' first bar = steel call; second bar = vibes answer over the same chord.
# ----------------------------------------------------------------------------
def call(bar, n1, n2, n3, slide=-2):
    """The motif: n1 n2 -> n3 (held, slid into) n2 n1, landing n3 on beat 2."""
    return [(bar, 0.0, n1, 0.5, 0), (bar, 0.5, n2, 0.5, 0), (bar, 1.0, n3, 1.5, slide),
            (bar, 2.5, n2, 0.5, 0), (bar, 3.0, n1, 0.9, 0)]


STEEL = (
    call(0, "E5", "G5", "A5")                       # Cmaj7  3-5-6
    + call(2, "C5", "E5", "G5")                     # Am7    b3-5-b7
    + call(4, "A4", "C5", "D5")                     # Fmaj7  3-5-6
    + call(6, "B4", "D5", "E5")                     # G7     3-5-13
    # second half: the motif "dances"
    + [(8, 0.0, "E5", 0.5, 0), (8, 0.5, "G5", 0.5, 0), (8, 1.0, "A5", 1.0, -2), (8, 2.0, "G5", 0.5, 0),
       (8, 2.5, "A5", 0.5, 0), (8, 3.0, "G5", 0.5, 0), (8, 3.5, "E5", 0.6, 0)]
    + call(10, "G4", "B4", "D5")                    # Em7    b3-5-b7
    + call(12, "A4", "C5", "D5")                    # D7     5-b7-8 (tritone colour into G7)
    # bars 14-15: the rise and the pull back into bar 1 (steel and vibes together)
    + [(14, 0.0, "G4", 0.9, 0), (14, 1.0, "B4", 0.9, 0), (14, 2.0, "D5", 0.9, -1), (14, 3.0, "F5", 0.9, 0),
       (15, 0.0, "D5", 1.5, +1), (15, 2.0, "F5", 0.5, 0), (15, 2.5, "D5", 0.5, 0), (15, 3.0, "B4", 0.5, 0),
       (15, 3.5, "D5", 0.5, 0)]
)

# Vibes answers: second bar of each section, over the same chord. (bar, beat, [notes], dur_beats, vel)
VIBES = [
    # Cmaj7: D5 C5(held) A4 G4
    (1, 0.5, ["D5"], 0.5, 0.7), (1, 1.0, ["C5"], 1.5, 0.8), (1, 2.5, ["A4"], 0.5, 0.6), (1, 3.0, ["G4", "C5"], 1.0, 0.7),
    # Am7: B4 A4(held) G4 E4
    (3, 0.5, ["B4"], 0.5, 0.7), (3, 1.0, ["A4"], 1.5, 0.8), (3, 2.5, ["G4"], 0.5, 0.6), (3, 3.0, ["E4", "A4"], 1.0, 0.7),
    # Fmaj7: G4 A4(held) F4 E4
    (5, 0.5, ["G4"], 0.5, 0.7), (5, 1.0, ["A4"], 1.5, 0.8), (5, 2.5, ["F4"], 0.5, 0.6), (5, 3.0, ["E4", "A4"], 1.0, 0.7),
    # G7 (end of first half): D5 F5 E5 D5 -> leads to C
    (7, 0.5, ["D5"], 0.5, 0.75), (7, 1.0, ["F5"], 1.0, 0.8), (7, 2.0, ["E5"], 0.5, 0.7), (7, 2.5, ["D5"], 0.5, 0.65), (7, 3.0, ["B4", "D5"], 1.0, 0.75),
    # Cmaj7 (second half): E5 D5 C5(held) A4
    (9, 0.5, ["E5"], 0.5, 0.75), (9, 1.0, ["D5"], 0.5, 0.7), (9, 1.5, ["C5"], 1.5, 0.8), (9, 3.0, ["A4", "E5"], 1.0, 0.7),
    # Em7: B4 G4(held) E4 D4
    (11, 0.5, ["B4"], 0.5, 0.7), (11, 1.0, ["G4"], 1.5, 0.8), (11, 2.5, ["E4"], 0.5, 0.6), (11, 3.0, ["D4", "G4"], 1.0, 0.7),
    # D7: C5 A4(held) F#4 A4
    (13, 0.5, ["C5"], 0.5, 0.7), (13, 1.0, ["A4"], 1.5, 0.8), (13, 2.5, ["F#4"], 0.5, 0.6), (13, 3.0, ["A4", "C5"], 1.0, 0.7),
    # bars 14-15: unison with the steel, louder
    (14, 0.0, ["G4"], 0.9, 0.8), (14, 1.0, ["B4"], 0.9, 0.8), (14, 2.0, ["D5"], 0.9, 0.85), (14, 3.0, ["F5"], 0.9, 0.9),
    (15, 0.0, ["D5"], 1.5, 0.85), (15, 2.0, ["F5"], 0.5, 0.85), (15, 2.5, ["D5"], 0.5, 0.8), (15, 3.0, ["B4"], 0.5, 0.8), (15, 3.5, ["D5"], 0.6, 0.9),
    # soft chord dings under the calls (beat 2 of each call bar), short
    # (pass 2: quieter and shorter; at 160 they were cluttering 300-500 Hz under every call)
    (0, 1.0, ["C4", "E4", "G4"], 0.6, 0.25), (2, 1.0, ["A3", "C4", "E4"], 0.6, 0.25), (4, 1.0, ["A3", "C4", "F4"], 0.6, 0.25),
    (6, 1.0, ["B3", "D4", "F4"], 0.6, 0.25), (8, 1.0, ["C4", "E4", "G4"], 0.5, 0.3), (10, 1.0, ["G3", "B3", "D4"], 0.6, 0.25),
    (12, 1.0, ["A3", "C4", "F#4"], 0.6, 0.25),
]

# Bass: two-feel in the first bar of each chord (root, fifth as half notes), walking quarters in the
# second bar leading into the next root. (bar, beat, note, dur_beats, accent)
BASS = [
    (0, 0, "C2", 1.85, 1.0), (0, 2, "G2", 1.85, 0.8), (1, 0, "C2", 0.85, 0.9), (1, 1, "E2", 0.85, 0.7), (1, 2, "G2", 0.85, 0.8), (1, 3, "G#2", 0.85, 0.75),
    (2, 0, "A2", 1.85, 1.0), (2, 2, "E2", 1.85, 0.8), (3, 0, "C3", 0.85, 0.9), (3, 1, "B2", 0.85, 0.7), (3, 2, "G2", 0.85, 0.8), (3, 3, "E2", 0.85, 0.75),
    (4, 0, "F2", 1.85, 1.0), (4, 2, "C3", 1.85, 0.8), (5, 0, "F2", 0.85, 0.9), (5, 1, "A2", 0.85, 0.7), (5, 2, "C3", 0.85, 0.8), (5, 3, "F#2", 0.85, 0.75),
    (6, 0, "G2", 1.85, 1.0), (6, 2, "D2", 1.85, 0.8), (7, 0, "G2", 0.85, 0.9), (7, 1, "F2", 0.85, 0.7), (7, 2, "E2", 0.85, 0.8), (7, 3, "D2", 0.85, 0.8),
    (8, 0, "C2", 1.85, 1.0), (8, 2, "G2", 1.85, 0.8), (9, 0, "C2", 0.85, 0.9), (9, 1, "E2", 0.85, 0.7), (9, 2, "D2", 0.85, 0.8), (9, 3, "D#2", 0.85, 0.75),
    (10, 0, "E2", 1.85, 1.0), (10, 2, "B1", 1.85, 0.8), (11, 0, "G2", 0.85, 0.9), (11, 1, "F#2", 0.85, 0.7), (11, 2, "E2", 0.85, 0.8), (11, 3, "D#2", 0.85, 0.75),
    (12, 0, "D2", 1.85, 1.0), (12, 2, "A1", 1.85, 0.8), (13, 0, "D2", 0.85, 0.9), (13, 1, "F#2", 0.85, 0.7), (13, 2, "A2", 0.85, 0.8), (13, 3, "G#2", 0.85, 0.75),
    (14, 0, "G2", 0.85, 1.0), (14, 1, "F2", 0.85, 0.7), (14, 2, "E2", 0.85, 0.8), (14, 3, "D2", 0.85, 0.75),
    (15, 0, "B1", 0.85, 0.9), (15, 1, "D2", 0.85, 0.7), (15, 2, "G1", 0.85, 0.85), (15, 3, "A1", 0.45, 0.7), (15, 3.5, "B1", 0.45, 0.85),
]

# Nylon comping, per 2-bar section: list of (bar_offset, beat, dur_beats, use_next_chord, with_root, vel)
COMP_A = [(0, 0.0, 0.8, False, True, 0.8), (0, 1.5, 0.4, False, False, 0.6), (0, 3.0, 0.5, False, False, 0.7),
          (1, 0.5, 0.4, False, False, 0.6), (1, 2.0, 0.5, False, True, 0.7), (1, 3.5, 0.9, True, False, 0.7)]
COMP_B = [(0, 0.0, 0.8, False, True, 0.8), (0, 1.5, 0.4, False, False, 0.6), (0, 2.5, 0.4, False, False, 0.65),
          (1, 0.5, 0.4, False, False, 0.6), (1, 1.5, 0.4, False, False, 0.6), (1, 3.5, 0.9, True, False, 0.7)]
COMP_END = [(0, 0.0, 0.8, False, True, 0.85), (0, 1.5, 0.4, False, False, 0.65), (0, 3.0, 0.5, False, False, 0.7),
            (1, 0.0, 0.45, False, True, 0.8), (1, 1.0, 0.45, False, False, 0.75), (1, 2.0, 0.45, False, False, 0.8), (1, 3.5, 0.9, True, True, 0.85)]
COMP_BY_SECTION = [COMP_A, COMP_B, COMP_A, COMP_B, COMP_A, COMP_B, COMP_A, COMP_END]

# Ukulele chank: off-beats every bar; second half adds light on-beats 2 and 4
UKE_A = [(0.5, 0.7), (1.5, 0.85), (2.5, 0.7), (3.5, 0.9)]
UKE_B = [(0.5, 0.75), (1.0, 0.4), (1.5, 0.9), (2.5, 0.75), (3.0, 0.4), (3.5, 0.95)]

# Percussion per bar (beat, articulation, velocity)
BONGO = [(0, "H", 0.85), (0.5, "Hm", 0.5), (1.0, "H", 0.6), (1.5, "L", 0.9), (2.0, "H", 0.8), (2.5, "Hm", 0.5), (3.0, "H", 0.6), (3.5, "L", 0.95)]
CONGA = [(0, "Cm", 0.5), (0.5, "Cm", 0.45), (1.0, "Cm", 0.7), (1.5, "Cm", 0.45), (2.0, "Cm", 0.5), (2.5, "Cm", 0.45), (3.0, "C", 0.9), (3.5, "C", 0.85)]
BIG_FILL_BARS = [7, 15]       # into bar 8 (top of the second half) and into bar 0 (the loop)
SMALL_FILL_BARS = [11]        # a flick into the D7 turnaround


# ----------------------------------------------------------------------------
# fluidsynth parts
# ----------------------------------------------------------------------------
def steel_events(rng, ch=0):
    ev = fluid.program_events(ch, 8, 26, t=-1.0) + fluid.bend_range_events(ch, 12, t=-1.0) + fluid.cc_events(ch, 1, 0, t=-1.0)
    notes = []
    for bar, beat, note, dur, slide in STEEL:
        t = tt(bar, beat) + rng.normal(0, 0.005)
        d = dur * BEAT * (0.92 if dur <= 0.5 else 0.9)
        vel = 96 + (14 if dur >= 1.0 else 0) + (6 if bar >= 8 else 0) + rng.integers(-5, 6)
        if bar >= 14:
            vel += 6
        notes.append((t, t + d, midi_key(note), vel))
        if slide:
            for j in range(12):
                ev += fluid.bend_events(ch, t - 0.004 + j * 0.013, slide * (1 - j / 11) ** 1.3, 12)   # ~150 ms slide
        else:
            ev += fluid.bend_events(ch, t - 0.004, 0.0, 12)
        if dur >= 1.0:   # delayed vibrato on held notes, faster onset than v2
            ev += fluid.cc_events(ch, 1, 0, t)
            for j, v in enumerate([8, 18, 30, 40]):
                ev += fluid.cc_events(ch, 1, v, t + 0.18 + 0.06 * j)
        else:
            ev += fluid.cc_events(ch, 1, 8, t)
    ev += fluid.note_events(ch, notes)
    return ev


def bass_events(rng, ch=1):
    ev = fluid.program_events(ch, 0, 32, t=-1.0)
    notes = []
    for bar, beat, note, dur, acc in BASS:
        t = tt(bar, beat) + rng.normal(0, 0.004)
        notes.append((t, t + dur * BEAT * 0.9, midi_key(note), int(np.clip(70 + 40 * acc + rng.normal(0, 4) + (4 if bar >= 8 else 0), 40, 125))))
    ev += fluid.note_events(ch, notes)
    return ev


def guitar_events(rng, ch=2):
    ev = fluid.program_events(ch, 0, 24, t=-1.0)
    notes = []
    for sec in range(8):
        for boff, beat, dur, use_next, with_root, vel in COMP_BY_SECTION[sec]:
            bar = 2 * sec + boff
            chord = PROG[(sec + 1) % 8] if use_next else PROG[sec]
            v = VOICE[chord]
            keys = [midi_key(n) for n in v["gtr"]]
            if with_root:
                keys = [midi_key(v["root"])] + keys
            t = tt(bar, beat) + rng.normal(0, 0.005)
            notes += strum(t, keys, (62 + 40 * vel) * (1.05 if bar >= 8 else 0.95), rng, spread=0.009, dur=dur * BEAT)
    for bar, beat, note, dur in [(3, 3.0, "E3", 0.5), (3, 3.5, "G3", 0.5), (11, 3.0, "B3", 0.5), (11, 3.5, "D4", 0.6)]:
        t = tt(bar, beat) + rng.normal(0, 0.004)
        notes.append((t, t + dur * BEAT, midi_key(note), 78 + rng.integers(0, 8)))
    ev += fluid.note_events(ch, notes)
    return ev


def uke_events(rng, ch=3):
    ev = fluid.program_events(ch, 8, 24, t=-1.0)
    notes = []
    for bar in range(BARS):
        keys = [midi_key(n) for n in VOICE[chord_at(bar)]["uke"]]
        grid = UKE_A if bar < 8 else UKE_B
        for beat, vel in grid:
            t = tt(bar, beat) + rng.normal(0, 0.004) + 0.002
            down = (beat % 1.0) == 0.5
            notes += strum(t, keys, 50 + 55 * vel, rng, spread=0.006, down=down, dur=(0.22 if down else 0.3) * BEAT)
    ev += fluid.note_events(ch, notes)
    return ev


# ----------------------------------------------------------------------------
# sample parts
# ----------------------------------------------------------------------------
class Vibes3:
    """VCSL vibraphone with shorter, tempo-appropriate damping (names are middle C = C3, hence +12)."""
    def __init__(self):
        import glob, re
        self.notes = {}
        for kind, sub in [("soft", "Soft Mallets"), ("hard", "Hard Mallets")]:
            for f in glob.glob(os.path.join(VCSL, "Idiophones/Struck Idiophones/Vibraphone", sub, "*.wav")):
                m = re.search(r"Vibes_\w+_([A-G]#?\d)_v(\d)_rr(\d)", os.path.basename(f))
                self.notes.setdefault(kind, []).append((midi_key(m.group(1)) + 12, int(m.group(2)), f))

    def play(self, dst, t, note, dur, vel, rng, pan, ring_extra=0.3, fade=0.25):
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
        ring = int((dur + ring_extra) * SR)
        n = min(x.shape[1], ring + int(fade * SR))
        x = x[:, :n] * R.raised_cos_fade(n, ring, int(fade * SR))
        amp = (0.3 + 0.7 * vel) ** 1.4
        l, r = R.pan_gains(pan)
        R.add_wrapped(dst, np.stack([x[0] * amp * l, x[1] * amp * r]), int(round(t * SR)))


def render_vibes(rng):
    dst = np.zeros((2, N))
    vib = Vibes3()
    for bar, beat, notes, dur, vel in VIBES:
        t = tt(bar, beat) + rng.normal(0, 0.006)
        for i, n in enumerate(notes):
            v = vel * (0.95 + 0.1 * rng.random()) * (1.05 if bar >= 8 else 1.0)
            pan = -0.3 + 0.12 * (midi_key(n) - 72) / 12.0
            # the last note of a phrase may ring a little longer
            extra = 0.5 if beat == 3.0 else 0.3
            vib.play(dst, t + i * 0.010, n, dur * BEAT, min(1.0, v), rng, pan, ring_extra=extra)
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
    # two shaker pools per stroke direction -> 4 different files per direction, never the same twice in a row
    shk = dict(down=[Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Down_rr*"), Perc(I + "/Shaker, Small", "Mid_ShakerLowFaster_Down_rr*")],
               up=[Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Up_rr*"), Perc(I + "/Shaker, Small", "Mid_ShakerLowFaster_Up_rr*")],
               roll=Perc(I + "/Shaker, Small", "Mid_Shaker_Roll_Fast_rr*"))
    cab = Perc(I + "/Cabasa", "Cabasa1_Rub_v*")
    gui = dict(slow=Perc(I + "/Guiro", "Guiro_Slow_rr*"), med=Perc(I + "/Guiro", "Guiro_Med_rr*"), fast=Perc(I + "/Guiro", "Guiro_Fast_rr*"))
    for bar in range(BARS):
        dyn = 0.84 if bar < 8 else 1.0          # pass 2: a little more lift into the second half
        big = bar in BIG_FILL_BARS
        small = bar in SMALL_FILL_BARS
        # bongos: martillo (8ths); at 160 this is the pattern's natural tempo
        for beat, art, vel in BONGO:
            if big and beat >= 3.0:
                continue
            if small and beat >= 3.5:
                continue
            hit(out["bongos"], bongo[art], tt(bar, beat) + rng.normal(0, 0.003), min(1, vel * dyn * (0.9 + 0.2 * rng.random())), rng, 0.35, max_len=0.6)
        if big:
            hit(out["bongos"], bongo["Hroll"], tt(bar, 2.5) + rng.normal(0, 0.003), 0.5, rng, 0.35, max_len=0.25)
            for i, (art, vel) in enumerate([("L", 0.8), ("L", 0.7), ("H", 0.9), ("H", 0.8)]):
                hit(out["bongos"], bongo[art], tt(bar, 3.0 + 0.25 * i) + rng.normal(0, 0.002), vel, rng, 0.35)
        if small:
            for i, (art, vel) in enumerate([("H", 0.75), ("L", 0.9)]):
                hit(out["bongos"], bongo[art], tt(bar, 3.5 + 0.25 * i) + rng.normal(0, 0.002), vel, rng, 0.35)
        # congas: one-bar tumbao, open tones on 4 and 4&; tumba on 2& of the second bar of a section
        for beat, art, vel in CONGA:
            if big and beat >= 3.0:
                continue
            hit(out["congas"], conga[art], tt(bar, beat) + rng.normal(0, 0.003), min(1, vel * dyn * (0.9 + 0.2 * rng.random())), rng, -0.3, max_len=0.8)
        if bar % 2 == 1 and not big:
            hit(out["congas"], conga["T"], tt(bar, 1.5) + rng.normal(0, 0.003), 0.75, rng, -0.4)
        if big:
            for i, (art, vel) in enumerate([("Q", 0.85), ("Q", 0.7), ("Qm", 0.6), ("C", 0.95)]):
                hit(out["congas"], conga[art], tt(bar, 3.0 + 0.25 * i) + rng.normal(0, 0.002), vel, rng, -0.25)
        if bar in (0, 8):
            hit(out["congas"], conga["T"], tt(bar, 0) + rng.normal(0, 0.002), 0.9, rng, -0.4)
        # shaker: 8ths (5.3 hits/s); alternate pools so consecutive hits never share a file
        for e in range(8):
            beat = e / 2.0
            up = e % 2 == 1
            pool = shk["up" if up else "down"][(bar + e // 2) % 2]
            vel = (0.85 if up else 0.55) * dyn * (0.88 + 0.24 * rng.random())
            hit(out["shaker"], pool, tt(bar, beat) + rng.normal(0, 0.0025) + (0.005 if up else 0), vel, rng, 0.6, max_len=0.22)
        if big:
            hit(out["shaker"], shk["roll"], tt(bar, 3.0), 0.6, rng, 0.6, max_len=0.35)
        # cabasa on 2 and 4
        for beat in (1.0, 3.0):
            hit(out["cabasa"], cab, tt(bar, beat) + rng.normal(0, 0.003), 0.5 * dyn, rng, -0.6, max_len=0.3)
        # guiro: a slow scrape in the answer bar of Am7 and Em7, a fast one before the big fills
        if bar in (3, 11):
            hit(out["guiro"], gui["slow"], tt(bar, 2.0), 0.6, rng, -0.15, max_len=0.6)
        if big:
            hit(out["guiro"], gui["fast"], tt(bar, 2.0), 0.7, rng, -0.15, max_len=0.4)
    return out


# ----------------------------------------------------------------------------
def render(rng):
    stems = {}
    stems["steel"] = render_loop_part("v3_steel", steel_events(rng))
    stems["bass"] = render_loop_part("v3_bass", bass_events(rng))
    stems["gtr"] = render_loop_part("v3_gtr", guitar_events(rng))
    stems["uke"] = render_loop_part("v3_uke", uke_events(rng))
    stems["vibes"] = render_vibes(rng)
    stems.update(render_percussion(rng))

    def pan(x, p):
        l, r = R.pan_gains(p)
        m = x.mean(axis=0)
        return np.stack([m * l, m * r])
    stems["steel"] = pan(stems["steel"], 0.12)
    stems["bass"] = pan(stems["bass"], 0.0)
    stems["gtr"] = pan(stems["gtr"], -0.45)
    stems["uke"] = pan(stems["uke"], 0.48)

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

    # same balance as v2 (whole-loop RMS targets, dBFS)
    target = dict(steel=-24.5, vibes=-29.0, gtr=-29.5, uke=-31.5, bass=-25.0,
                  bongos=-33.0, congas=-31.5, shaker=-39.0, cabasa=-43.0, guiro=-42.0)
    for k in stems:
        stems[k] = set_rms(stems[k], target[k])
    sends = dict(steel=R.db(-13), vibes=R.db(-12), gtr=R.db(-17), uke=R.db(-16), bass=R.db(-30),
                 bongos=R.db(-19), congas=R.db(-19), shaker=R.db(-23), cabasa=R.db(-21), guiro=R.db(-17))
    dry = sum(stems.values())
    send = sum(stems[k] * sends[k] for k in stems)
    # slightly shorter room than v2: the faster groove needs less tail
    ir = room_ir(rng, tail_t60=(1.1, 0.95, 0.8, 0.45), length=1.5)
    wet = R.circ_convolve(send, ir)
    wet = R.circ_filter(wet, [F("hp", 160, 0.7), F("lp", 8000, 0.7)])
    mix = dry + wet
    mix = np.tanh(1.25 * mix) / 1.25
    return mix, stems, wet, ir
