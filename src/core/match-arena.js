import { WORLD } from "../config/game-config.js";
import { mixSeed, SeededRng } from "./rng.js";

const isHeavyHit = ({ type, actionType, value }) =>
  ["HIT", "CRITICAL", "COUNTER"].includes(type)
  && (value >= 18 || type === "CRITICAL" || actionType === "ROPE_DROP_KICK");

export class MatchArena {
  constructor({ id, contract }, seed, publish) {
    this.id = id;
    this.publish = publish;
    this.bounds = { ringMinX: WORLD.ringMinX, ringMaxX: WORLD.ringMaxX };
    this.crowdRng = new SeededRng(mixSeed(seed, 901));
    this.nextThrowTick = this.crowdRng.intInclusive(300, 480);
    this.nextCheerTick = 0;
    this.counts = { cheers: 0, chairs: 0, trash: 0 };
    this.contraction = null;
    if (contract) {
      const rng = new SeededRng(mixSeed(seed, 902));
      this.contraction = {
        startTick: rng.intInclusive(170, 270),
        duration: 220,
        inset: rng.intInclusive(175, 240)
      };
    }
  }

  advance(tick) {
    const change = this.contraction;
    if (change && tick === change.startTick) {
      this.publish({ type: "RING_CONTRACTION", tick, duration: change.duration });
    }
    if (change && tick > change.startTick) {
      const progress = Math.min(1, (tick - change.startTick) / change.duration);
      const inset = change.inset * progress;
      this.bounds.ringMinX = WORLD.ringMinX + inset;
      this.bounds.ringMaxX = WORLD.ringMaxX - inset;
    }

    if (tick < this.nextThrowTick) return;
    const rng = this.crowdRng;
    const item = rng.next() < 0.32 ? "chair" : "trash";
    const side = rng.next() < 0.5 ? -1 : 1;
    const landingX = rng.intInclusive(Math.ceil(this.bounds.ringMinX), Math.floor(this.bounds.ringMaxX));
    this.publish({ type: "CROWD_THROW", tick, item, side, landingX });
    this.counts[item === "chair" ? "chairs" : "trash"] += 1;
    this.nextThrowTick = tick + rng.intInclusive(460, 790);
  }

  react(tick, events) {
    if (tick < this.nextCheerTick || !events.some(isHeavyHit)) return;
    this.publish({ type: "CROWD_CHEER", tick });
    this.counts.cheers += 1;
    this.nextCheerTick = tick + 105;
  }

  summary() {
    return {
      id: this.id,
      ringBounds: { ...this.bounds },
      ...(this.contraction ? { contraction: { ...this.contraction } } : {}),
      crowdEvents: { ...this.counts }
    };
  }
}
