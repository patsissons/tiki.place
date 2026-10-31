import { gainsAtZoom, LOOP_SECONDS, MUSIC_FILES } from "./blend";

export type MusicState = "idle" | "loading" | "playing" | "paused" | "unavailable";

export type MusicPlayer = {
  /** Starts or resumes the music. The first call has to come from a user gesture, or browsers keep it silent. */
  play: () => void;
  /** Stops at once, keeping the position: the page lost focus. */
  pause: () => void;
  /** Fades out, then stops: the person turned the music off. */
  mute: () => void;
  setZoom: (zoom: number) => void;
  /** True once a gesture has let the audio start, so it can come back without another one. */
  unlocked: () => boolean;
  dispose: () => void;
};

const MASTER_GAIN = 0.6;
const FADE_IN_SECONDS = 0.4;
const FADE_OUT_SECONDS = 0.08;
const MUTE_SUSPEND_MS = 300;
const CROSSFADE_SECONDS = 0.06;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** One second of silent 8 kHz mono WAV, for the fallback below. */
function silentWavUrl() {
  const samples = 8000;
  const view = new DataView(new ArrayBuffer(44 + samples));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, samples, true);
  view.setUint32(28, samples, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

/**
 * iPhones silence web audio when the ring switch is on silent, unless the page
 * asks for the media session. The Audio Session API does that directly. iOS
 * browsers without it get a silent looping <audio> element, which moves the
 * session to the media channel but can show lock-screen controls for it.
 * Both also pause other audio on the device, so `release` hands the session
 * back whenever the music stops.
 */
function createMediaSession() {
  const session = (navigator as AudioSessionNavigator).audioSession;
  let silent: HTMLAudioElement | null = null;
  return {
    claim() {
      if (session) {
        session.type = "playback";
      } else if (isIos()) {
        if (!silent) {
          silent = new Audio(silentWavUrl());
          silent.loop = true;
        }
        void silent.play().catch(() => {});
      }
    },
    release() {
      if (session) session.type = "auto";
      silent?.pause();
    },
    dispose() {
      this.release();
      if (silent) URL.revokeObjectURL(silent.src);
      silent = null;
    },
  };
}

async function fetchLoop(ctx: AudioContext, url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return ctx.decodeAudioData(await response.arrayBuffer());
}

/**
 * Two looping tracks started at one shared time on one clock, so they cannot
 * drift apart, crossfaded by map zoom. Nothing is created or downloaded until
 * the first `play`.
 */
export function createMusicPlayer(onState: (state: MusicState) => void): MusicPlayer {
  const session = createMediaSession();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let spaceGain: GainNode | null = null;
  let alohaGain: GainNode | null = null;
  let zoom = 0;
  let wanted = false;
  let loading = false;
  let started = false;
  let failed = false;
  let disposed = false;
  let suspendTimer = 0;

  const report = () => {
    if (disposed) return;
    if (failed) onState("unavailable");
    else if (!started) onState(loading ? "loading" : "idle");
    else onState(wanted && ctx?.state === "running" ? "playing" : "paused");
  };

  const fadeTo = (value: number, seconds: number) => {
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(value, ctx.currentTime, seconds);
  };

  const applyZoom = (immediate: boolean) => {
    if (!ctx || !spaceGain || !alohaGain) return;
    const gains = gainsAtZoom(zoom);
    const now = ctx.currentTime;
    for (const [node, value] of [
      [spaceGain, gains.space],
      [alohaGain, gains.aloha],
    ] as const) {
      node.gain.cancelScheduledValues(now);
      if (immediate) node.gain.setValueAtTime(value, now);
      else node.gain.setTargetAtTime(value, now, CROSSFADE_SECONDS);
    }
  };

  const load = async (context: AudioContext) => {
    loading = true;
    report();
    try {
      const [space, aloha] = await Promise.all([fetchLoop(context, MUSIC_FILES.space), fetchLoop(context, MUSIC_FILES.aloha)]);
      if (disposed) return;
      const at = context.currentTime + 0.08;
      for (const [buffer, gain] of [
        [space, spaceGain],
        [aloha, alohaGain],
      ] as const) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = 0;
        // Pinned rather than taken from the buffer: some decoders leave trailing padding, which would be a gap.
        source.loopEnd = LOOP_SECONDS;
        source.connect(gain!);
        source.start(at);
      }
      started = true;
      if (wanted) fadeTo(MASTER_GAIN, FADE_IN_SECONDS);
    } catch (err) {
      console.warn("music unavailable", err);
      failed = true;
    }
    loading = false;
    report();
  };

  const ensureContext = () => {
    if (ctx) return ctx;
    const context = new AudioContext({ latencyHint: "playback" });
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    spaceGain = context.createGain();
    alohaGain = context.createGain();
    spaceGain.connect(master);
    alohaGain.connect(master);
    context.onstatechange = report;
    ctx = context;
    applyZoom(true);
    return context;
  };

  return {
    play() {
      if (disposed || failed || (wanted && ctx?.state === "running")) return;
      window.clearTimeout(suspendTimer);
      wanted = true;
      // Claim before the context starts: iOS picks its audio route from the session type at that moment.
      session.claim();
      const context = ensureContext();
      void context.resume().catch(() => {});
      if (started) fadeTo(MASTER_GAIN, FADE_IN_SECONDS);
      else if (!loading) void load(context);
      report();
    },
    pause() {
      window.clearTimeout(suspendTimer);
      wanted = false;
      session.release();
      void ctx?.suspend().catch(() => {});
      report();
    },
    mute() {
      wanted = false;
      session.release();
      fadeTo(0, FADE_OUT_SECONDS);
      window.clearTimeout(suspendTimer);
      suspendTimer = window.setTimeout(() => void ctx?.suspend().catch(() => {}), MUTE_SUSPEND_MS);
      report();
    },
    setZoom(next) {
      zoom = next;
      applyZoom(!started);
    },
    unlocked: () => ctx !== null,
    dispose() {
      disposed = true;
      window.clearTimeout(suspendTimer);
      session.dispose();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
