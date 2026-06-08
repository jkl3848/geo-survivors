export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.paused = false;
    this.fixedDt = 1 / 60;
    this.maxDelta = 0.1;
    this.accumulator = 0;
    this.lastTime = 0;
    this._rafId = null;
    this.fps = 0;
    this._frameCount = 0;
    this._fpsTimer = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this._tick(this.lastTime);
  }

  stop() {
    this.running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  setPaused(paused) {
    this.paused = paused;
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame((t) => this._tick(t / 1000));

    let delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > this.maxDelta) delta = this.maxDelta;

    this._frameCount++;
    this._fpsTimer += delta;
    if (this._fpsTimer >= 1) {
      this.fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTimer = 0;
    }

    if (!this.paused) {
      this.accumulator += delta;
      while (this.accumulator >= this.fixedDt) {
        this.update(this.fixedDt);
        this.accumulator -= this.fixedDt;
      }
    }

    this.render(delta);
  }
}
