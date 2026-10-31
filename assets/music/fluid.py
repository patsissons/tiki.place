"""Minimal Standard MIDI File writer + offline fluidsynth renderer (reverb/chorus off).

Events are given in absolute seconds. We render with a fixed tempo and a high PPQ so timing is
accurate to well under a millisecond (fluidsynth itself quantises events to its 64-sample block).
"""
import os
import struct
import subprocess
import numpy as np

FLUIDSYNTH = "/opt/homebrew/bin/fluidsynth"
SF2 = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples", "fluid",
                   "fluid-soundfont-3.1", "FluidR3_GM.sf2")
PPQ = 960
TEMPO_US = 500000          # 120 BPM internally => 1 beat = 0.5 s; we convert seconds -> ticks directly


def _vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append(0x80 | (n & 0x7F))
        n >>= 7
    return bytes(reversed(out))


def write_midi(path, events, end_time):
    """events: list of (time_s, bytes) raw channel messages. Adds tempo + end-of-track at end_time."""
    tps = PPQ / (TEMPO_US / 1e6)   # ticks per second
    evs = [(0, b"\xff\x51\x03" + struct.pack(">I", TEMPO_US)[1:])]
    evs += [(int(round(t * tps)), msg) for t, msg in events]
    evs.sort(key=lambda e: e[0])
    evs.append((int(round(end_time * tps)), b"\xff\x2f\x00"))
    track = bytearray()
    last = 0
    for tick, msg in evs:
        track += _vlq(tick - last) + msg
        last = tick
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, PPQ))
        f.write(b"MTrk" + struct.pack(">I", len(track)) + bytes(track))


def note_events(ch, notes):
    """notes: list of (t_on, t_off, key, vel) -> raw events."""
    ev = []
    for t_on, t_off, key, vel in notes:
        ev.append((t_on, bytes([0x90 | ch, int(key), int(np.clip(vel, 1, 127))])))
        ev.append((t_off, bytes([0x80 | ch, int(key), 64])))
    return ev


def program_events(ch, bank, program, t=0.0):
    return [(t, bytes([0xB0 | ch, 0, bank])), (t, bytes([0xB0 | ch, 32, 0])), (t, bytes([0xC0 | ch, program]))]


def bend_range_events(ch, semitones, t=0.0):
    """RPN 0 = pitch bend sensitivity."""
    return [(t, bytes([0xB0 | ch, 101, 0])), (t, bytes([0xB0 | ch, 100, 0])),
            (t, bytes([0xB0 | ch, 6, semitones])), (t, bytes([0xB0 | ch, 38, 0])),
            (t, bytes([0xB0 | ch, 101, 127])), (t, bytes([0xB0 | ch, 100, 127]))]


def bend_events(ch, t, semis, range_semis):
    v = int(np.clip(round(8192 + semis / range_semis * 8192), 0, 16383))
    return [(t, bytes([0xE0 | ch, v & 0x7F, v >> 7]))]


def cc_events(ch, cc, value, t=0.0):
    return [(t, bytes([0xB0 | ch, cc, int(np.clip(value, 0, 127))]))]


def render(midi_path, wav_path, sr=48000, gain=0.6):
    """Offline render through fluidsynth with reverb and chorus disabled. Returns (2, n) float array."""
    cmd = [FLUIDSYNTH, "-ni", "-q", "-r", str(sr), "-g", str(gain),
           "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0",
           "-o", "synth.polyphony=256", "-o", "synth.sample-rate=%d" % sr,
           "-F", wav_path, "-O", "float", SF2, midi_path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-500:])
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", wav_path, "-f", "f64le", "-ac", "2", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<f8").reshape(-1, 2).T
    return x
