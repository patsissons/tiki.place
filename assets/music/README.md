# Map music

Source for the two loops in `public/music`. The explorer crossfades between them by map zoom (`lib/music`).

Both loops play one original tune over the same chords: an orchestra for space, an exotica lounge band at double time for the ground. They are exactly 2,304,000 samples at 48 kHz (48.000 s, 16 bars at 80 BPM). That shared clock and harmony is what lets them blend, so a replacement for either has to keep it, and `LOOP_SECONDS` in `lib/music/blend.ts` has to match the length.

| Loop | Tempo | Site file | Master |
| --- | --- | --- | --- |
| Space | 80 BPM | `public/music/space.m4a` | `space.flac` |
| Aloha | 160 BPM | `public/music/aloha.m4a` | `aloha.flac` |

The FLAC files are the approved lossless masters. Licenses are in `public/music/CREDITS.txt`.

## How it is built

Everything current is in `v2/`:

- `sketches.py`: the scores. A sketch is a tempo, one chord symbol (or two) per bar, one theme, and a table saying which instruments play in each mood and section. The shipped music is the sketch `exomix`; the others are the round 1 options it was chosen from.
- `engine.py`: the loop clock, chord symbols and voicings, theme notation, fluidsynth parts and circular DSP. All processing wraps around the loop, so the seam is seamless by construction.
- `arrange.py`: turns a sketch into the two moods (`build_space`, `build_bossa`) and mixes them.
- `render_v2.py`: renders sketches to `v2/out/<id>/`, normalised to -16 LUFS.
- `verify.py`: checks length, loudness, peak, seam, AAC decode and that each chord segment contains its chord.
- `build_audition.py` and `audition/index.html`: a page for comparing sketches by ear, with the site's zoom blend.

`render.py`, `aloha2.py` and `fluid.py` in this folder are the first version of the music. `v2` still imports their synth voices, sample loading, room reverb and MIDI writer. `aloha3.py`, `encode.py` and `analyze.py` are only needed to reproduce the first version.

## Re-rendering

The samples are not in the repository. Put them in `assets/samples` (ignored by git):

- `assets/samples/vcsl`: [VCSL](https://github.com/sgossner/VCSL), CC0. The folders in use are listed in `public/music/CREDITS.txt`; a sparse checkout of those is enough.
- `assets/samples/fluid/fluid-soundfont-3.1/FluidR3_GM.sf2`: from [fluid-soundfont_3.1.orig.tar.gz](http://deb.debian.org/debian/pool/main/f/fluid-soundfont/), MIT.

You also need `fluidsynth` and `ffmpeg`. On macOS, `ffmpeg` provides the `aac_at` encoder used for the site's files.

```sh
cd assets/music
uv venv .venv && uv pip install --python .venv/bin/python numpy scipy
.venv/bin/python v2/render_v2.py exomix      # or no id, for every sketch
.venv/bin/python v2/verify.py exomix
cp v2/out/exomix/space.mp4 ../../public/music/space.m4a
cp v2/out/exomix/bossa.mp4 ../../public/music/aloha.m4a
ffmpeg -y -i v2/out/exomix/space.wav -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 space.flac
ffmpeg -y -i v2/out/exomix/bossa.wav -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 aloha.flac
```

Rendering is deterministic for a given sketch and seed.
