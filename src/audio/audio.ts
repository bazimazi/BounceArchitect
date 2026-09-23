const SCALE = [196, 220, 247, 294, 330, 294, 247, 220];

export class AudioBus {
  private ctx: AudioContext | null = null;
  private music = 0.35;
  private sfx = 0.8;
  private nextNote = 0;
  private step = 0;
  private started = false;
  private lastBounce = 0;

  setMusic(value: number): void {
    this.music = value;
    if (value <= 0) this.nextNote = 0;
  }

  setSfx(value: number): void {
    this.sfx = value;
  }

  unlock(): void {
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume();
    this.started = true;
    if (this.nextNote === 0) this.nextNote = ctx.currentTime + 0.2;
  }

  tick(): void {
    if (!this.started || this.music <= 0) return;
    const ctx = this.context();
    const now = ctx.currentTime;
    if (this.nextNote === 0) this.nextNote = now + 0.2;
    let guard = 0;
    while (this.nextNote < now + 0.25 && guard < 3) {
      const freq = SCALE[this.step % SCALE.length] ?? 220;
      this.tone(freq, this.nextNote, 1.5, this.music * 0.045, 'triangle');
      this.nextNote += 1.7;
      this.step += 1;
      guard += 1;
    }
  }

  play(name: string): void {
    if (this.sfx <= 0) return;
    const ctx = this.context();
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const gain = this.sfx;
    if (name === 'place' || name === 'remove' || name === 'ui') {
      this.tone(name === 'remove' ? 180 : 420, now, 0.06, gain * 0.12, 'sine');
      return;
    }
    if (name === 'launch') {
      this.tone(240, now, 0.08, gain * 0.1, 'triangle');
      this.tone(480, now + 0.07, 0.1, gain * 0.08, 'triangle');
      return;
    }
    if (name === 'bounce') {
      if (now - this.lastBounce < 0.05) return;
      this.lastBounce = now;
      this.noise(now, 0.05, gain * 0.08);
      return;
    }
    if (name === 'spring' || name === 'cannon') {
      this.tone(name === 'cannon' ? 140 : 180, now, 0.12, gain * 0.14, 'sawtooth');
      this.tone(520, now + 0.04, 0.14, gain * 0.06, 'triangle');
      return;
    }
    if (name === 'portal') {
      this.tone(660, now, 0.12, gain * 0.07, 'sine');
      this.tone(880, now + 0.06, 0.12, gain * 0.05, 'sine');
      return;
    }
    if (name === 'switch') {
      this.tone(320, now, 0.08, gain * 0.1, 'square');
      return;
    }
    if (name === 'break') {
      this.noise(now, 0.12, gain * 0.12);
      return;
    }
    if (name === 'goal') {
      this.tone(520, now, 0.08, gain * 0.08, 'sine');
      return;
    }
    if (name === 'win') {
      [523, 659, 784].forEach((freq, index) => this.tone(freq, now + index * 0.09, 0.2, gain * 0.1, 'triangle'));
      return;
    }
    if (name === 'fail') {
      this.tone(196, now, 0.18, gain * 0.08, 'sine');
      this.tone(146, now + 0.1, 0.22, gain * 0.06, 'sine');
    }
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, when: number, duration: number, volume: number, type: OscillatorType): void {
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noise(when: number, duration: number, volume: number): void {
    const ctx = this.context();
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(when);
  }
}
