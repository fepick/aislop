export function normalizeSeed(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) >>> 0 : 0;
}

export function mixSeed(baseSeed, index) {
  let value = (normalizeSeed(baseSeed) ^ Math.imul((index + 1) >>> 0, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return (value ^ (value >>> 15)) >>> 0;
}

export class SeededRng {
  constructor(seed) {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed;
  }

  nextUint32() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next() {
    return this.nextUint32() / 4294967296;
  }

  intInclusive(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }
}
