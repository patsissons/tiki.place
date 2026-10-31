# Map music

Source for the two loops in `public/music`. The explorer crossfades between them by map zoom (`lib/music`).

Both loops are exactly 1,152,000 samples at 48 kHz (24.000 s) in C major over the same eight chords, each lasting 3 s. That shared clock is what lets them blend, so a replacement for either has to keep it.

| Loop | Tempo | Source | Master |
| --- | --- | --- | --- |
| Space | 80 BPM | `render_space` in `render.py`, pure synthesis | `space.flac` |
| Aloha | 160 BPM | `aloha3.py` (note data), using helpers in `aloha2.py` and `fluid.py` | `aloha.flac` |

The FLAC files are the approved lossless masters. Licenses are in `public/music/CREDITS.txt`.

## Re-rendering the aloha loop

The samples are not in the repository. Put them in `assets/samples` (ignored by git):

- `assets/samples/vcsl`: [VCSL](https://github.com/sgossner/VCSL), CC0. Vibraphone, Bongos, Conga, Shaker Small, Cabasa and Guiro keep their repository paths.
- `assets/samples/fluid/fluid-soundfont-3.1/FluidR3_GM.sf2`: from [fluid-soundfont_3.1.orig.tar.gz](http://deb.debian.org/debian/pool/main/f/fluid-soundfont/), MIT.

You also need `fluidsynth` and `ffmpeg`. On macOS, `ffmpeg` provides the `aac_at` encoder used for the site's files.

```sh
cd assets/music
uv venv .venv && uv pip install --python .venv/bin/python numpy scipy
ffmpeg -i space.flac -c:a pcm_s24le space.wav   # render.py mixes against this; it never overwrites it without --space
.venv/bin/python render.py                      # writes aloha.wav, stems/, encoded/
cp encoded/aloha.aac_m4a.m4a ../../public/music/aloha.m4a
```

Rendering is deterministic. Pass `--no-encode` to skip the encoders and `--aloha-v2` or `--aloha-v1` for the earlier versions.
