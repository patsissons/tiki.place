"""Arrangers: turn a sketch (key, tempo, chords, one theme) into the two moods.

Both moods play the same theme over the same chords on the same clock. `space` is slow and wide,
`bossa` plays at double time with a rhythm section. What plays is chosen per sketch in its
`space` / `bossa` tables, so orchestration is data.
"""
import os

import numpy as np
import scipy.signal as sg

import engine as E
from engine import R

import aloha2 as A2  # VCSL sample loading, strums and the image-source room

I = "Idiophones/Struck Idiophones"
M = "Membranophones/Struck Membranophones"

# name: (pan, highpass Hz, level dB (RMS while playing), reverb send dB)
SPACE_PROF = dict(
    pad=(0, 90, -14.5, -8), strings=(-0.15, 120, -19, -7), choir=(0.2, 200, -23, -5), sub=(0, 25, -17, -40),
    harp=(0.3, 120, -22, -6), arp=(0, 300, -21, -6), sparkle=(0, 800, -26, -2), wash=(0, 200, -31, -12),
    swell=(0, 500, -28, -8), chimes=(0.4, 800, -28, -6), lead=(-0.05, 200, -18.5, -5), counter=(-0.3, 150, -22, -5),
)
BOSSA_PROF = dict(
    lead=(0.1, 160, -19, -13), answer=(-0.3, 150, -24, -12), comp=(-0.45, 110, -24, -17), uke=(0.48, 220, -27, -16),
    keys=(0.3, 150, -27, -15), bass=(0, 34, -21, -30), drums=(0, 40, -25, -20), shaker=(0.6, 1500, -33, -23),
    bongos=(0.35, 150, -27, -19), congas=(-0.3, 70, -27, -19), cabasa=(-0.6, 1200, -35, -21),
    guiro=(-0.15, 500, -33, -17), counter=(0.25, 200, -25, -12), bpad=(0, 150, -29, -12), chimes=(0.4, 800, -31, -10),
)


def prof(table, name, i=0):
    p, hp, lvl, snd = table[name.split(":")[0]]
    if ":" in name and i:  # spread doubled lines a little and tuck the doubles under the first
        p, lvl = p + (0.22 if i % 2 else -0.22), lvl - 2.5
    return p, hp, lvl, snd


def profile_for(table, stems):
    seen, out = {}, {}
    for name in stems:
        base = name.split(":")[0]
        out[name] = prof(table, name, seen.get(base, 0))
        seen[base] = seen.get(base, 0) + 1
    return out


def lead_list(cfg, sec):
    lead = cfg["lead"]
    return lead[sec] if isinstance(lead, dict) else lead


def guide_line(S, low):
    """A slow voice-led line through the 3rds and 7ths: one note per chord."""
    out, prev = [], low + 6
    for s, ln, c in S["segs"]:
        cands = [k for iv in (c.third, c.seventh if c.seventh is not None else c.fifth)
                 for k in range(low, low + 15) if k % 12 == (c.root + iv) % 12]
        k = min(cands, key=lambda x: (abs(x - prev), x))
        out.append((s, ln, k))
        prev = k
    return out


def strum(*a, **k):
    return [(t0, t1 - t0, key, vel) for t0, t1, key, vel in A2.strum(*a, **k)]


def noise_swell(rng, rise=2.6, fall=1.6):
    n = int((rise + fall) * E.SR)
    t = np.arange(n) / E.SR
    x = sg.sosfilt(sg.butter(2, [2500, 11000], btype="band", fs=E.SR, output="sos"), rng.standard_normal((2, n)))
    env = np.where(t < rise, (t / rise) ** 3, np.exp(-(t - rise) / (fall / 4)))
    return x * env, rise


def theremin(f0, dur, prev_semis, rng):
    rel = 0.3
    n = int((dur + rel) * E.SR)
    t = np.arange(n) / E.SR
    glide = prev_semis * np.exp(-t / 0.07)
    vib = 0.22 * np.clip((t - 0.2) / 0.5, 0, 1) * np.sin(2 * np.pi * 5.6 * t + rng.random() * 6.28)
    ph = 2 * np.pi * np.cumsum(f0 * 2.0 ** ((glide + vib) / 12.0)) / E.SR
    y = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    env = (1 - np.exp(-t / 0.06)) * R.raised_cos_fade(n, int(dur * E.SR), int(rel * E.SR))
    return y * env


def chimes(L, dst, name, t, gain=1.0):
    x = A2.load_sample(os.path.join(A2.VCSL, I, "Mark Trees", "Legacy", name))
    L.place(dst, x[:, :int(5.0 * E.SR)] * R.raised_cos_fade(min(x.shape[1], int(5.0 * E.SR)), int(3.5 * E.SR), int(1.5 * E.SR))[None, :],
            t, gain=gain)


# ----------------------------------------------------------------------------
# SPACE
# ----------------------------------------------------------------------------
def build_space(L, S, rng):
    cfg, segs, theme = S["space"], S["segs"], S["theme"]
    layers, TB, B = cfg["layers"], L.bars * 4, L.beat
    half = TB / 2
    st = {}

    if "pad" in layers:
        pad = L.zeros()
        for s, ln, c in segs:
            ks = [c.bass(36)] + c.above([c.fifth], 43) + c.above(
                [c.seventh if c.seventh is not None else c.fifth, c.colour, c.third], 55)
            for i, k in enumerate(ks):
                sig = R.pad_voice(E.hz(k), ln * B + 0.25, rng, attack=0.6 + 0.25 * i / len(ks))
                L.place(pad, sig, s * B - 0.25 + 0.12 * rng.random(), pan=(-0.5 + i / (len(ks) - 1)) * 0.5,
                        gain=1.0 / (0.5 + E.hz(k) / 300.0) ** 0.35)
        dark = L.filt(pad, [R.rbj("lp", 520, 0.9), R.rbj("lp", 900, 0.7)])
        bright = L.filt(pad, [R.rbj("lp", 2600, 1.4), R.rbj("lp", 4500, 0.7)])
        m = (0.5 + 0.5 * L.lfo(L.bars / 4, -0.25)) ** 1.5
        pad = dark * (1 - m) + bright * m
        base, depth, mono = 14.0e-3 * E.SR, 3.5e-3 * E.SR, pad.mean(axis=0)
        cyc = round(L.dur / 3.0)
        ch = [L.delay(mono, base * k + depth * L.lfo(cyc, ph)) for k, ph in ((1, 0), (1, .25), (1.7, .5), (1.7, .75))]
        st["pad"] = 0.55 * pad + 0.45 * np.stack([ch[0] + 0.7 * ch[2], ch[1] + 0.7 * ch[3]]) / 1.7

    if "strings" in layers:
        notes = []
        for s, ln, c in segs:
            for k in c.above([c.third, c.fifth, c.seventh if c.seventh is not None else 0, c.colour], 58):
                notes.append((s * B, ln * B - 0.04, k, 58 + (8 if s >= half else 0) + rng.integers(-3, 4)))
        st["strings"] = E.inst_part(L, "sp_strings", "strings", notes, rng)

    if "choir" in layers:
        notes = []
        for s, ln, c in segs:
            for k in c.above([c.third, c.seventh if c.seventh is not None else c.fifth], 64):
                notes.append((s * B, ln * B - 0.04, k, 52 + (8 if s >= half else 0)))
        st["choir"] = E.inst_part(L, "sp_choir", "choir", notes, rng)

    if "sub" in layers:
        sub = L.zeros()
        for s, ln, c in segs:
            L.place(sub, R.sub_bass(E.hz(c.bass(29)), ln * B - 0.3, rng), s * B - 0.05)
        st["sub"] = sub

    if "harp" in layers:
        notes, shape = [], [0, 2, 4, 5, 7, 5, 4, 2]
        for s, ln, c in segs:
            lad = c.ladder(48, 86)
            for i in range(int(ln * 2)):
                k = lad[min(len(lad) - 1, shape[i % 8] + (2 if s >= half else 0))]
                notes.append((s * B + i * B / 2 + rng.normal(0, 0.006), 1.4, k, 54 + (14 if i == 0 else 0) + rng.integers(-5, 6)))
        st["harp"] = E.inst_part(L, "sp_harp", "harp", notes, rng)

    if "arp" in layers:
        arp = L.zeros()
        for bar in range(L.bars):
            for j, slot in enumerate([0, 2, 3, 5, 7]):
                beat = bar * 4 + slot / 2.0
                lad = E.chord_at(segs, beat, TB).ladder(72, 90)
                k = lad[[0, 1, 2, 3, 1][j] % len(lad)]
                L.place(arp, R.glass_pluck(E.hz(k), 0.75 + 0.25 * (slot == 0) + 0.1 * rng.random(), rng),
                        beat * B + rng.normal(0, 0.003), pan=0.15 * (1 if slot % 4 == 0 else -1))
        st["arp"] = arp + 0.8 * L.pingpong(arp, 0.75 * B)

    if "sparkle" in layers:
        sp = L.zeros()
        for bar in range(L.bars):
            for _ in range(2 if bar % 2 == 0 else 1):
                beat = bar * 4 + rng.random() * 4
                lad = E.chord_at(segs, beat, TB).ladder(88, 100)
                L.place(sp, R.sparkle(E.hz(lad[rng.integers(len(lad))]), rng), beat * B, pan=rng.uniform(-0.8, 0.8))
        st["sparkle"] = sp

    if "wash" in layers:
        noise = rng.standard_normal((2, L.n)) * 0.3
        lo = L.filt(noise, [R.rbj("peak", 400, 1.2, 12.0), R.rbj("lp", 700, 0.7), R.rbj("hp", 250, 0.7)])
        mid = L.filt(noise, [R.rbj("peak", 1300, 1.2, 12.0), R.rbj("lp", 2200, 0.7), R.rbj("hp", 800, 0.7)])
        hi = L.filt(noise, [R.rbj("peak", 3600, 1.2, 12.0), R.rbj("lp", 6000, 0.7), R.rbj("hp", 2300, 0.7)])
        s = 0.5 + 0.5 * L.lfo(2, -0.25)
        w_lo, w_hi = np.clip(1 - 2 * s, 0, 1), np.clip(2 * s - 1, 0, 1)
        st["wash"] = (lo * w_lo + mid * (1 - w_lo - w_hi) + hi * w_hi) * (0.6 + 0.4 * L.lfo(2, 0.0))

    if "swell" in layers:
        sw = L.zeros()
        for beat in (0, half):
            x, rise = noise_swell(rng)
            L.add(sw, x, int(round((beat * B - rise) * E.SR)))
        st["swell"] = sw

    if "chimes" in layers:
        ch = L.zeros()
        chimes(L, ch, "windchimes_slowAsc1.wav", -0.6)
        chimes(L, ch, "windchimes_slowDesc1.wav", half * B - 0.4, 0.8)
        st["chimes"] = ch

    for sec, (b0, b1) in (("A", (0, half)), ("B", (half, TB))):
        prev_k = None
        for inst, octv in lead_list(cfg, sec):
            name = f"lead:{inst}"
            if inst in ("glass", "theremin"):
                dst = st.setdefault(name, L.zeros())
            notes = []
            for s, d, k, _ in theme:
                if not b0 <= s < b1:
                    continue
                k2 = k + octv
                t = s * B + rng.normal(0, 0.008)
                acc = (8 if s % 4 == 0 else 0) + (6 if sec == "B" else 0)
                if inst == "glass":
                    L.place(dst, R.glass_pluck(E.hz(k2), 0.8 + acc / 60, rng), t)
                elif inst == "theremin":
                    L.place(dst, theremin(E.hz(k2), d * B * 0.98, 0 if prev_k is None else np.clip(prev_k - k2, -7, 7), rng) * (0.8 + acc / 60), t)
                    prev_k = k2
                elif inst in E.SUSTAINED or inst == "steel":
                    notes.append((t, d * B * 0.96, k2, 76 + acc + rng.integers(-4, 5), -2 if d >= 1.5 else 0))
                else:
                    notes.append((t, max(d * B, 0.6), k2, 78 + acc + rng.integers(-5, 6)))
            if notes:
                part = E.inst_part(L, f"sp_{sec}_{inst}", inst, notes, rng, slide=inst == "steel")
                st[name] = st.get(name, 0) + part
            if inst == "glass" and sec == "B":
                st[name] = st[name] + 0.6 * L.pingpong(st[name], 0.75 * B)

    counter = cfg.get("counter")
    if counter:                    # one instrument throughout, or one per section
        per = counter if isinstance(counter, dict) else {"A": counter, "B": counter}
        for sec, (inst, low) in per.items():
            notes = [(s * B + 0.02, ln * B - 0.06, k, 60 + (8 if s >= half else 0)) for s, ln, k in guide_line(S, low)
                     if (s >= half) == (sec == "B")]
            st["counter"] = st.get("counter", 0) + E.inst_part(L, f"sp_counter_{sec}", inst, notes, rng)

    ir = R.make_ir(rng, 6.0, [(0, 200, 3.2), (200, 1500, 5.2), (1500, 5000, 3.8), (5000, E.SR / 2, 1.6)], 35)
    return E.mix(L, st, profile_for(SPACE_PROF, st), ir, [R.rbj("hp", 120, 0.7), R.rbj("lp", 9000, 0.7)], drive=1.0)


# ----------------------------------------------------------------------------
# BOSSA
# ----------------------------------------------------------------------------
COMP_A = [0, 3, 6, 10, 13]          # eighth slots in a slow bar (two fast bars): the bossa clave
COMP_B = [0, 3, 6, 9, 12, 15]
CLAVE = [0, 3, 6, 10, 13]
BONGO = [(0, "H", .85), (1, "Hm", .5), (2, "H", .6), (3, "L", .9), (4, "H", .8), (5, "Hm", .5), (6, "H", .6), (7, "L", .95)]
CONGA = [(0, "Cm", .5), (1, "Cm", .45), (2, "Cm", .7), (3, "Cm", .45), (4, "Cm", .5), (5, "Cm", .45), (6, "C", .9), (7, "C", .85)]


def hit(L, dst, perc, t, vel, rng, max_len=None, gain=1.0):
    if -0.02 < t < 0.0015:      # keep hard onsets off the exact loop point
        t = 0.0015 + abs(t) * 0.5
    x = perc.pick(min(0.999, vel), rng)
    if max_len:
        n = min(x.shape[1], int(max_len * E.SR))
        x = x[:, :n] * R.raised_cos_fade(n, int(n * 0.7), int(n * 0.3))
    L.add(dst, x * gain * (0.35 + 0.65 * vel) ** 1.3, int(round(t * E.SR)))


def build_bossa(L, S, rng):
    cfg, segs, theme = S["bossa"], S["segs"], S["theme"]
    layers, TB, B = cfg["layers"], L.bars * 4, L.beat
    half = TB / 2
    fb, e = B / 2, B / 4                       # fast beat, fast eighth
    swing = cfg.get("swing", 0.53)
    NE = L.bars * 16                           # eighths in the loop

    def te(i):                                 # time of eighth slot i (may be fractional or negative)
        odd = int(np.floor(i)) % 2 == 1
        return i * e + ((swing - 0.5) * fb if odd else 0.0)

    def ch(i):
        return E.chord_at(segs, i / 4.0, TB)

    def dyn(i):
        return 1.0 if i / 4.0 >= half else 0.9

    st = {}

    if "comp" in layers:
        notes = []
        for bar in range(L.bars):
            pat = (COMP_A, COMP_B)[(bar + (1 if bar * 4 >= half else 0)) % 2]
            for j, slot in enumerate(pat):
                i = bar * 16 + slot
                c = ch(i + 1) if slot in (7, 15) else ch(i)
                keys = c.shell(52)
                if slot == 0:
                    keys = [c.bass(40)] + keys
                nxt = pat[j + 1] if j + 1 < len(pat) else 16
                d = min(nxt - slot, 3) * e * 0.85
                notes += strum(te(i) + rng.normal(0, 0.006), keys, (58 + 30 * (slot == 0) + 14 * rng.random()) * dyn(i), rng,
                                  spread=0.012, dur=d)
        st["comp"] = E.inst_part(L, "bo_comp", cfg.get("comp", "nylon"), notes, rng)

    if "uke" in layers:
        notes = []
        for i in range(1, NE, 2):
            c = ch(i)
            keys = c.above([c.third, c.fifth, c.seventh if c.seventh is not None else 0, c.colour], 62)
            notes += strum(te(i) + rng.normal(0, 0.005) + 0.003, keys, (50 + 28 * (i % 4 == 3)) * dyn(i), rng,
                              spread=0.007, down=i % 4 == 1, dur=0.25 * fb)
        st["uke"] = E.inst_part(L, "bo_uke", "uke", notes, rng)

    if "keys" in layers:
        notes = []
        for s, ln, c in segs:
            ks = c.shell(55)
            t = s * B + rng.normal(0, 0.006)
            notes += [(t + 0.008 * j, ln * B - 0.08, k, 52 + rng.integers(0, 8)) for j, k in enumerate(ks)]
            if ln >= 4:
                i = s * 4 + 11
                notes += [(te(i) + 0.006 * j, 2 * e, k, 44 + rng.integers(0, 8)) for j, k in enumerate(ks[1:])]
        st["keys"] = E.inst_part(L, "bo_keys", cfg.get("keys", "rhodes"), notes, rng)

    if "bpad" in layers:
        notes = [(s * B, ln * B - 0.04, k, 50) for s, ln, c in segs for k in c.shell(57)[:3]]
        st["bpad"] = E.inst_part(L, "bo_pad", "slowstrings", notes, rng)

    if "bass" in layers:
        notes = []
        for f in range(L.bars * 2):
            i0 = f * 8
            c, cn = ch(i0), ch(i0 + 8)
            root = c.bass(31)
            fifth = root + c.fifth if root + c.fifth <= 43 else root + c.fifth - 12
            nroot = cn.bass(31)
            appr = root if cn is c else nroot + (1 if fifth > nroot else -1)
            if f in (L.bars - 1, L.bars * 2 - 1):      # walk into the next section
                third = root + c.third if root + c.third <= 43 else root + c.third - 12
                line = [(0, 1.9, root, 100), (2, 1.9, third, 84), (4, 1.9, fifth, 88), (6, 1.9, appr, 86)]
            else:
                line = [(0, 2.8, root, 100), (3, 0.9, fifth, 66), (4, 2.8, fifth, 86), (7, 0.9, appr, 72)]
            for sl, d, k, v in line:
                notes.append((te(i0 + sl) + rng.normal(0, 0.005), d * e * 0.9, k, v * dyn(i0) + rng.normal(0, 3)))
        st["bass"] = E.inst_part(L, "bo_bass", "bass", notes, rng)

    if "drums" in layers:
        hits = []
        for i in range(NE):
            inB, sl16, sl8 = i / 4.0 >= half, i % 16, i % 8
            fill = (i >= NE - 4) or (NE // 2 - 4 <= i < NE // 2)
            if fill:
                hits.append((te(i), [47, 47, 45, 43][i % 4], 52 + 7 * (i % 4)))
                continue
            hits.append((te(i) + rng.normal(0, 0.003), 51 if inB else 42, (34 if i % 2 == 0 else 46) + rng.integers(-4, 5)))
            if sl16 in CLAVE:
                hits.append((te(i) + rng.normal(0, 0.003), 37, 64 + rng.integers(-5, 6)))
            if sl8 in (0, 3, 4, 7):
                hits.append((te(i) + rng.normal(0, 0.003), 35, {0: 52, 3: 38, 4: 46, 7: 38}[sl8]))
            if inB and sl8 == 4:
                hits.append((te(i), 44, 40))
        st["drums"] = E.drum_part(L, "bo_drums", hits, kit=cfg.get("kit", 32))

    perc = {k: L.zeros() for k in ("shaker", "bongos", "congas", "cabasa", "guiro") if k in layers}
    if "shaker" in perc:
        shk = dict(d=A2.Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Down_rr*"), u=A2.Perc(I + "/Shaker, Small", "Mid_ShakerDouble_Up_rr*"))
        for i in range(NE):
            up = i % 2 == 1
            hit(L, perc["shaker"], shk["u" if up else "d"], te(i) + rng.normal(0, 0.003) + (0.006 if up else 0),
                (0.85 if up else 0.55) * dyn(i) * (0.9 + 0.2 * rng.random()), rng, max_len=0.5)
    if "bongos" in perc:
        bg = dict(H=A2.Perc(M + "/Bongos", "BongoH_Hit1_v*"), Hm=A2.Perc(M + "/Bongos", "BongoH_HitMuted1_v*"), L=A2.Perc(M + "/Bongos", "BongoL_Hit1_v*"))
        for i in range(NE):
            _, art, vel = BONGO[i % 8]
            hit(L, perc["bongos"], bg[art], te(i) + rng.normal(0, 0.004), vel * dyn(i) * (0.92 + 0.16 * rng.random()), rng)
    if "congas" in perc:
        cg = dict(C=A2.Perc(M + "/Conga", "Conga_HitN_v*"), Cm=A2.Perc(M + "/Conga", "Conga_HitFM_v*"), T=A2.Perc(M + "/Conga", "Tumba_HitN_v*"))
        for i in range(NE):
            _, art, vel = CONGA[i % 8]
            hit(L, perc["congas"], cg[art], te(i) + rng.normal(0, 0.004), vel * dyn(i) * (0.92 + 0.16 * rng.random()), rng)
            if i % 16 == 11:
                hit(L, perc["congas"], cg["T"], te(i), 0.8, rng)
    if "cabasa" in perc:
        cab = A2.Perc(I + "/Cabasa", "Cabasa1_Rub_v*")
        for i in range(2, NE, 4):
            hit(L, perc["cabasa"], cab, te(i) + rng.normal(0, 0.004), 0.5 * dyn(i), rng, max_len=0.6)
    if "guiro" in perc:
        gu = dict(slow=A2.Perc(I + "/Guiro", "Guiro_Slow_rr*"), fast=A2.Perc(I + "/Guiro", "Guiro_Fast_rr*"))
        for bar in range(L.bars):
            if bar % 2 == 1:
                hit(L, perc["guiro"], gu["slow"], te(bar * 16 + 10), 0.6, rng, max_len=0.9)
            if bar % 4 == 3:
                hit(L, perc["guiro"], gu["fast"], te(bar * 16 + 13), 0.7, rng, max_len=0.6)
    st.update(perc)

    if "chimes" in layers:
        c2 = L.zeros()
        chimes(L, c2, "windchimes_asc1.wav", -0.5)
        chimes(L, c2, "windchimes_desc1.wav", half * B - 0.4, 0.8)
        st["chimes"] = c2

    # --- theme, re-phrased for the bossa: selected on-beat notes come a fast eighth early
    ph = []
    for s, d, k, ant in theme:
        if ant or (cfg.get("sync", True) and s % 1 == 0 and int(s) % 4 in (1, 3)):
            s -= 0.25
        ph.append([s, d, k])
    for a, b in zip(ph, ph[1:] + [[ph[0][0] + TB, 0, 0]]):
        a[1] = min(a[1] + 0.25, b[0] - a[0])
    for sec, (b0, b1) in (("A", (0, half)), ("B", (half, TB))):
        for inst, octv in lead_list(cfg, sec):
            notes = []
            for s, d, k, in ph:
                if not b0 - 0.3 <= s < b1 - 0.3:
                    continue
                t = te(s * 4) + rng.normal(0, 0.006)
                acc = (10 if d >= 1 else 0) + (6 if sec == "B" else 0)
                sus = inst in E.SUSTAINED or inst == "steel"
                notes.append((t, d * B * (0.95 if sus else 0.9), k + octv, 88 + acc + rng.integers(-5, 6), -2 if d >= 1.25 else 0))
            if notes:
                part = E.inst_part(L, f"bo_{sec}_{inst}", inst, notes, rng, slide=inst == "steel")
                st[f"lead:{inst}"] = st.get(f"lead:{inst}", 0) + part

    if cfg.get("answer"):          # short chord-tone replies under the theme's long notes
        inst, notes, flip = cfg["answer"], [], False
        for s, d, k in ph:
            if d < 2:
                continue
            i0 = int(round(s * 4)) + 4
            lo, hi = (46, 69) if inst == "trombone" else (55, 84)      # keep replies inside the instrument
            lad = [x for x in ch(i0).ladder(lo, hi) if x < k - 2][-4:]
            if len(lad) < 3:
                continue
            seq = lad[-3:] if not flip else lad[-3:][::-1]
            flip = not flip
            for off, kk in zip((0, 1, 3), seq):
                notes.append((te(i0 + off) + rng.normal(0, 0.006), 0.5, kk, 62 + 6 * off + rng.integers(-4, 5)))
        if notes:
            st["answer"] = E.inst_part(L, "bo_answer", inst, notes, rng)

    if cfg.get("counter"):
        inst, low = cfg["counter"]
        notes = [(s * B + 0.02, ln * B - 0.06, k, 62) for s, ln, k in guide_line(S, low)
                 if s >= half or cfg.get("counter_all")]
        st["counter"] = E.inst_part(L, "bo_counter", inst, notes, rng)

    ir = A2.room_ir(rng)
    return E.mix(L, st, profile_for(BOSSA_PROF, st), ir, [R.rbj("hp", 160, 0.7), R.rbj("lp", 8000, 0.7)])
