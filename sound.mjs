// Synthesized locally: no downloaded audio, autoplay, or runtime dependencies.
export class PlantSound {
  constructor() {
    this.enabled = false;
    this.volume = 0.35;
    this.lastAlarm = -Infinity;
  }
  async toggle() {
    if (this.enabled) {
      this.enabled = false;
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
      return false;
    }
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    if (!this.context) {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      this.motors = ["pump", "turbine"].map((name) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = "sine";
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start();
        return { name, oscillator, gain };
      });
    }
    try {
      await this.context.resume();
    } catch {
      return false;
    }
    this.enabled = true;
    this.setVolume(this.volume);
    return true;
  }
  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.context)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume * 0.6 : 0,
        this.context.currentTime,
        0.03,
      );
  }
  tone(frequency, duration, gain = 0.09) {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const t = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(gain, t + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  click() {
    this.tone(850, 0.045, 0.055);
  }
  update(r, unacknowledged, severity, suspended) {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    this.motors[0].oscillator.frequency.setTargetAtTime(
      42 + r.actual.primary * 0.48 + r.actual.cooling * 0.12,
      t,
      0.2,
    );
    this.motors[1].oscillator.frequency.setTargetAtTime(
      65 + r.rpm * 0.045,
      t,
      0.2,
    );
    this.motors[0].gain.gain.setTargetAtTime(
      suspended
        ? 0
        : (0.012 * (r.actual.primary + r.actual.cooling + r.actual.emergency)) /
            200,
      t,
      0.08,
    );
    this.motors[1].gain.gain.setTargetAtTime(
      suspended ? 0 : (0.009 * r.rpm) / 3000,
      t,
      0.08,
    );
    if (
      unacknowledged &&
      !suspended &&
      t - this.lastAlarm > (severity === "danger" ? 1.7 : 4)
    ) {
      this.tone(severity === "danger" ? 660 : 440, 0.3, 0.12);
      this.lastAlarm = t;
    }
  }
  async visibility(hidden) {
    if (!this.context || !this.enabled) return;
    try {
      if (hidden) await this.context.suspend();
      else await this.context.resume();
    } catch {
      /* Visual alarms remain available. */
    }
  }
}
