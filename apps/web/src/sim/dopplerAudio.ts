/**
 * Doppler sound, as scanners play it: the Doppler shift of moving blood is audible
 * (f = 2·f₀·v / c, a few hundred hertz to a few kilohertz), so flow is heard as a
 * "whoosh" that pulses with each heartbeat in an artery and hums steadily in a vein.
 * Flow toward the probe plays on the left, flow away on the right, as on most scanners.
 *
 * Each direction is band-passed noise whose centre follows the mean Doppler shift and
 * whose loudness follows how much blood moves that way.
 */
const SPEED_OF_SOUND = 1540;

interface Channel {
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
}

export class DopplerAudio {
  private context: AudioContext | null = null;
  private channels: [Channel, Channel] | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** Start (must follow a user gesture: browsers block sound until then). */
  start(): void {
    if (this.context) return;
    const context = new AudioContext();
    // Two seconds of white noise, looped: the raw material of the sound.
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
    const make = (pan: number): Channel => {
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 400;
      filter.Q.value = 2;
      const gain = context.createGain();
      gain.gain.value = 0;
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      source.connect(filter).connect(gain).connect(panner).connect(master);
      return { filter, gain };
    };
    this.channels = [make(-0.8), make(0.8)];
    source.start();
    this.source = source;
    this.context = context;
  }

  stop(): void {
    this.source?.stop();
    void this.context?.close();
    this.context = null;
    this.channels = null;
    this.source = null;
  }

  get playing(): boolean {
    return this.context !== null;
  }

  /**
   * Set the sound for the blood speeds in the gate right now (cm/s along the beam, toward the probe
   * positive, before angle correction), with the transmit frequency (MHz) and the signal strength.
   */
  update(speeds: ArrayLike<number>, frequencyMHz: number, power: number): void {
    const context = this.context;
    const channels = this.channels;
    if (!context || !channels) return;
    const now = context.currentTime;
    for (const [index, sign] of [
      [0, 1],
      [1, -1],
    ] as const) {
      let sum = 0;
      let sumSquares = 0;
      let count = 0;
      for (let n = 0; n < speeds.length; n++) {
        const v = speeds[n] * sign;
        if (v <= 1) continue;
        // Doppler shift (Hz) of this blood.
        const shift = (2 * frequencyMHz * 1e6 * (v / 100)) / SPEED_OF_SOUND;
        sum += shift;
        sumSquares += shift * shift;
        count++;
      }
      const channel = channels[index];
      const share = speeds.length > 0 ? count / speeds.length : 0;
      if (count === 0) {
        channel.gain.gain.setTargetAtTime(0, now, 0.02);
        continue;
      }
      const mean = sum / count;
      const spread = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
      const centre = Math.min(9000, Math.max(80, mean));
      channel.filter.frequency.setTargetAtTime(centre, now, 0.012);
      // Narrow flow (a clean spectral window) sounds tonal; broad flow sounds rough.
      channel.filter.Q.setTargetAtTime(Math.max(0.7, Math.min(8, centre / Math.max(60, spread * 2))), now, 0.02);
      channel.gain.gain.setTargetAtTime(Math.min(1.2, share * power * 2.2), now, 0.015);
    }
  }
}
