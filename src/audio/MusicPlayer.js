const NOTE_OFFSETS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const STEPS_PER_BEAT = 4;
const LOOKAHEAD_SEC = 0.15;
const SCHEDULER_INTERVAL_MS = 25;
const MUSIC_VOLUME = 0.22;
const FADE_SEC = 0.12;

export function noteToFreq(name) {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) return 440;
  const [, letter, accidental, octave] = match;
  let semis = NOTE_OFFSETS[letter] + (Number(octave) - 4) * 12;
  if (accidental === '#') semis += 1;
  if (accidental === 'b') semis -= 1;
  return 440 * Math.pow(2, semis / 12);
}

function parsePattern(text) {
  const events = [];
  let step = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [value, len] = token.split(':');
    const steps = Number(len) || 1;
    if (value !== 'r') events.push({ step, steps, value });
    step += steps;
  }
  return { events, length: step };
}

export class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.playing = false;
    this.currentTrackName = '';
    this._tracks = {};
    this._track = null;
    this._bpm = 120;
    this._timer = null;
    this._waves = {};
    this._noise = null;
    this._master = null;
    this._bus = null;
    this._events = [];
    this._eventIndex = 0;
    this._loopStart = 0;
    this._loopDuration = 0;
    this._stepDuration = 0;
  }

  async init(musicConfig) {
    this._bpm = musicConfig.bpm || 120;
    this._tracks = {};
    for (const track of musicConfig.tracks) {
      this._tracks[track.name] = track;
    }
    this._track = this._tracks.main || musicConfig.tracks[0];
    this.currentTrackName = this._track?.name || '';
  }

  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this._setupGraph();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  play() {
    if (!this.ctx || !this._track || this.playing) return;
    this.playing = true;

    const { events, loopSteps } = this._compileTrack(this._track);
    this._events = events;
    this._eventIndex = 0;
    this._stepDuration = 60 / (this._track.bpm || this._bpm) / STEPS_PER_BEAT;
    this._loopDuration = loopSteps * this._stepDuration;

    this._bus = this.ctx.createGain();
    this._bus.connect(this._master);
    this._loopStart = this.ctx.currentTime + 0.05;

    this._tick();
    this._timer = setInterval(() => this._tick(), SCHEDULER_INTERVAL_MS);
  }

  playTrack(name) {
    const track = this._tracks[name];
    if (!track || !this.ctx) return;
    if (this.currentTrackName === name && this.playing) return;
    this.stop();
    this._track = track;
    this.currentTrackName = name;
    this.play();
  }

  stop() {
    this.playing = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._bus && this.ctx) {
      const bus = this._bus;
      const now = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + FADE_SEC);
      setTimeout(() => bus.disconnect(), (FADE_SEC + LOOKAHEAD_SEC) * 1000 + 50);
    }
    this._bus = null;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this._master && this.ctx) {
      this._master.gain.setTargetAtTime(this.muted ? 0 : MUSIC_VOLUME, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  playSfx(pitch = 'C5', duration = 0.1, wave = 'square') {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = noteToFreq(pitch);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  destroy() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  _setupGraph() {
    // Gentle low-pass keeps the pulse channels from getting shrill.
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 6500;
    filter.Q.value = 0.5;
    filter.connect(this.ctx.destination);

    this._master = this.ctx.createGain();
    this._master.gain.value = this.muted ? 0 : MUSIC_VOLUME;
    this._master.connect(filter);

    const length = this.ctx.sampleRate;
    this._noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this._noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  _compileTrack(track) {
    const events = [];
    let loopSteps = 0;
    for (const channel of track.channels) {
      let offset = 0;
      for (const name of channel.sequence) {
        const pattern = parsePattern(track.patterns[name] || '');
        for (const event of pattern.events) {
          events.push({ ...event, step: event.step + offset, channel });
        }
        offset += pattern.length;
      }
      loopSteps = Math.max(loopSteps, offset);
    }
    events.sort((a, b) => a.step - b.step);
    return { events, loopSteps };
  }

  _tick() {
    if (!this.playing || !this._events.length) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD_SEC;

    while (true) {
      if (this._eventIndex >= this._events.length) {
        if (!this._track.loop) {
          this.stop();
          return;
        }
        this._eventIndex = 0;
        this._loopStart += this._loopDuration;
      }
      const event = this._events[this._eventIndex];
      const time = this._loopStart + event.step * this._stepDuration;
      if (time > horizon) break;
      if (time >= this.ctx.currentTime - 0.02) this._playEvent(event, time);
      this._eventIndex++;
    }
  }

  _playEvent(event, time) {
    const { channel } = event;
    const duration = event.steps * this._stepDuration;
    const volume = channel.volume ?? 0.5;
    if (channel.wave === 'noise') {
      this._playDrum(event.value, time, volume);
    } else {
      this._playTone(channel, noteToFreq(event.value), time, duration, volume);
    }
  }

  _playTone(channel, freq, time, duration, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (channel.wave === 'pulse') {
      osc.setPeriodicWave(this._pulseWave(channel.duty ?? 0.25));
    } else {
      osc.type = channel.wave || 'square';
    }
    osc.frequency.value = freq;

    const gate = duration * (channel.gate ?? 0.9);
    const sustain = volume * (channel.sustain ?? 0.7);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.006);
    env.gain.setTargetAtTime(sustain, time + 0.006, 0.08);
    env.gain.setTargetAtTime(0, time + gate, 0.025);

    if (channel.vibrato && duration > 0.3) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, time);
      depth.gain.linearRampToValueAtTime(freq * 0.006, time + 0.25);
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + gate + 0.2);
    }

    osc.connect(env);
    env.connect(this._bus);
    osc.start(time);
    osc.stop(time + gate + 0.2);
  }

  _playDrum(kind, time, volume) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.connect(this._bus);

    if (kind === 'k') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      env.gain.setValueAtTime(volume * 1.6, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      osc.connect(env);
      osc.start(time);
      osc.stop(time + 0.2);
      return;
    }

    const isSnare = kind === 's';
    const decay = isSnare ? 0.14 : 0.04;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = ctx.createBiquadFilter();
    filter.type = isSnare ? 'bandpass' : 'highpass';
    filter.frequency.value = isSnare ? 2200 : 7000;
    env.gain.setValueAtTime(volume * (isSnare ? 0.9 : 0.35), time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);
    src.connect(filter);
    filter.connect(env);
    src.start(time, Math.random() * 0.5);
    src.stop(time + decay + 0.02);
  }

  _pulseWave(duty) {
    if (this._waves[duty]) return this._waves[duty];
    // Band-limited pulse: fewer harmonics than a raw square, so it stays chiptune but softer.
    const harmonics = 24;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
      imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
    }
    this._waves[duty] = this.ctx.createPeriodicWave(real, imag);
    return this._waves[duty];
  }
}
