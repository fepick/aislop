import { clamp } from "../core/combat-rules.js";

export const hitGain = damage => clamp(0.25 + damage / 50, 0.25, 1);

export class AudioManager {
  constructor(sources, {
    contextFactory = () => {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("이 브라우저는 Web Audio를 지원하지 않습니다.");
      return new AudioContextClass();
    },
    fetcher = source => fetch(source)
  } = {}) {
    this.sources = sources;
    this.contextFactory = contextFactory;
    this.fetcher = fetcher;
    this.context = null;
    this.buffers = {};
    this.loading = null;
    this.voices = [];
    this.maxVoices = 4;
  }

  async unlock() {
    if (!this.context) this.context = this.contextFactory();
    await this.context.resume();
    if (!this.loading) {
      this.loading = Promise.all(Object.entries(this.sources).map(async ([key, source]) => {
        const response = await this.fetcher(source);
        if (!response.ok) throw new Error(`사운드를 불러오지 못했습니다: ${source}`);
        this.buffers[key] = await this.context.decodeAudioData(await response.arrayBuffer());
      })).catch(error => {
        this.loading = null;
        this.buffers = {};
        throw error;
      });
    }
    await this.loading;
  }

  play(key, gainValue) {
    if (!this.context || this.context.state !== "running" || !this.buffers[key]) return;
    while (this.voices.length >= this.maxVoices) this.voices.shift().stop();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers[key];
    gain.gain.value = gainValue;
    source.connect(gain).connect(this.context.destination);
    source.onended = () => {
      this.voices = this.voices.filter(voice => voice !== source);
    };
    this.voices.push(source);
    source.start();
  }

  consume(events) {
    for (const event of events) {
      if (event.type === "ACTION_STARTED") this.play("attack", 0.55);
      if (["HIT", "CRITICAL", "COUNTER"].includes(event.type)) {
        this.play("hit", hitGain(event.value));
      }
    }
  }
}
