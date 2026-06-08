import { PITCH_FREQ } from '../editor/ShapeAnalyzer.js';

export class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.playing = false;
    this._timer = null;
    this._noteIndex = 0;
    this._track = null;
    this._bpm = 140;
  }

  async init(musicConfig) {
    this._bpm = musicConfig.bpm || 140;
    this._track = musicConfig.tracks[0];
    this.ctx = new AudioContext();
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  play() {
    if (!this.ctx || !this._track || this.playing) return;
    this.playing = true;
    this._noteIndex = 0;
    this._scheduleNext();
  }

  stop() {
    this.playing = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playSfx(pitch = 'C5', duration = 0.1, wave = 'square') {
    if (!this.ctx || this.muted) return;
    const freq = PITCH_FREQ[pitch] || 440;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  _scheduleNext() {
    if (!this.playing || !this._track) return;

    const notes = this._track.notes;
    const note = notes[this._noteIndex];

    if (!this.muted && this.ctx) {
      this._playNote(note);
    }

    const beatDuration = 60 / this._bpm;
    const delay = note.duration * beatDuration * 1000;

    this._noteIndex++;
    if (this._noteIndex >= notes.length) {
      if (this._track.loop) {
        this._noteIndex = 0;
      } else {
        this.playing = false;
        return;
      }
    }

    this._timer = setTimeout(() => this._scheduleNext(), delay);
  }

  _playNote(note) {
    const freq = PITCH_FREQ[note.pitch] || 440;
    const beatDuration = 60 / this._bpm;
    const duration = note.duration * beatDuration;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = note.wave || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration * 0.9);
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
}
