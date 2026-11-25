import { ARENA_EVENTS, THROW_FLIGHT_TICKS } from "../config/arena-events.js";
import { COMBAT } from "../config/combat-config.js";
import { WORLD } from "../config/game-config.js";
import { mixSeed, SeededRng } from "./rng.js";
import { clamp } from "./stat-rules.js";

const kinds = Object.keys(ARENA_EVENTS);
const emptyEffects = () => ({ damage: 0, healing: 0, rage: 0 });

const isHeavyHit = ({ type, actionType, value }) =>
  ["HIT", "CRITICAL", "COUNTER"].includes(type)
  && (value >= 18 || type === "CRITICAL" || actionType === "ROPE_DROP_KICK");

export class MatchArena {
  constructor({ id, contract }, seed, publish) {
    this.id = id;
    this.publish = publish;
    this.bounds = { ringMinX: WORLD.ringMinX, ringMaxX: WORLD.ringMaxX };
    this.eventRng = new SeededRng(mixSeed(seed, 901));
    this.nextEventTick = this.eventRng.intInclusive(205, 310);
    this.nextCheerTick = 0;
    this.active = null;
    this.cheers = 0;
    this.eventCounts = Object.fromEntries(kinds.map(kind => [kind, 0]));
    this.effects = { P1: emptyEffects(), P2: emptyEffects() };
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

  advance(tick, players = []) {
    const change = this.contraction;
    if (change && tick === change.startTick) {
      this.publish({ type: "RING_CONTRACTION", tick, duration: change.duration });
    }
    if (change && tick > change.startTick) {
      const inset = change.inset * Math.min(1, (tick - change.startTick) / change.duration);
      this.bounds.ringMinX = WORLD.ringMinX + inset;
      this.bounds.ringMaxX = WORLD.ringMaxX - inset;
    }

    const active = this.active;
    if (active?.impactTick === tick) this.resolveThrow(active, tick, players);
    if (players.length < 2 || tick < this.nextEventTick) return;

    const rng = this.eventRng;
    const choices = kinds.filter(kind => kind !== active?.kind);
    const kind = choices[rng.intInclusive(0, choices.length - 1)];
    const rule = ARENA_EVENTS[kind];
    const event = { type: "ARENA_EVENT", kind, tick, until: tick + rule.duration };
    if (rule.radius) {
      const target = players[rng.intInclusive(0, players.length - 1)];
      event.impactTick = tick + THROW_FLIGHT_TICKS;
      event.landingX = clamp(Math.round(target.x) + rng.intInclusive(-45, 45), this.bounds.ringMinX, this.bounds.ringMaxX);
      event.side = rng.next() < 0.5 ? -1 : 1;
      event.radius = rule.radius;
    }
    this.active = event;
    this.eventCounts[kind] += 1;
    this.nextEventTick = tick + rng.intInclusive(405, 565);
    this.publish(event);
    if (kind === "medic") this.healTrailing(tick, players, rule.healing);
    if (kind === "fury") {
      for (const player of players) this.applyEffect(tick, kind, player, "rage", rule.rage);
    }
  }

  resolveThrow(event, tick, players) {
    const rule = ARENA_EVENTS[event.kind];
    for (const player of players) {
      if (player.health <= 0 || !this.inZone(event, player.x)) continue;
      this.applyEffect(tick, event.kind, player, "damage", rule.damage);
      if (rule.stun) {
        player.hitStunTicks = Math.max(player.hitStunTicks, rule.stun);
        player.action = null;
        player.pendingCounter = null;
      }
    }
  }

  inZone(event, x) {
    const position = clamp(x, this.bounds.ringMinX, this.bounds.ringMaxX);
    return Math.abs(position - event.landingX) <= event.radius;
  }

  healTrailing(tick, players, amount) {
    const ratio = player => player.health / player.derivedStats.maxHealth;
    const minimum = Math.min(...players.map(ratio));
    for (const player of players) {
      if (player.health > 0 && ratio(player) === minimum) this.applyEffect(tick, "medic", player, "healing", amount);
    }
  }

  applyEffect(tick, kind, player, effect, amount) {
    let value;
    if (effect === "damage") {
      value = Math.min(player.health, amount);
      player.health -= value;
    } else if (effect === "healing") {
      value = Math.min(player.derivedStats.maxHealth - player.health, amount);
      player.health += value;
    } else {
      value = Math.min(COMBAT.rage.maximum - player.rage, amount);
      player.rage += value;
    }
    if (value <= 0) return;
    this.effects[player.id][effect] += value;
    this.publish({
      type: "ARENA_EFFECT", kind, effect, value, tick, targetId: player.id,
      position: { x: player.x, y: WORLD.floorY - 160 }
    });
  }

  attackTimingScale(tick) {
    return this.active?.kind === "speed" && tick < this.active.until ? ARENA_EVENTS.speed.attackScale : 1;
  }

  knockbackScale(tick) {
    return this.active?.kind === "ropes" && tick < this.active.until ? ARENA_EVENTS.ropes.knockbackScale : 1;
  }

  moveScale(tick, x) {
    const active = this.active;
    return active?.kind === "trash" && tick >= active.impactTick && tick < active.until && this.inZone(active, x)
      ? ARENA_EVENTS.trash.moveScale
      : 1;
  }

  react(tick, events) {
    if (tick < this.nextCheerTick || !events.some(isHeavyHit)) return;
    this.publish({ type: "CROWD_CHEER", tick });
    this.cheers += 1;
    this.nextCheerTick = tick + 105;
  }

  summary() {
    return {
      id: this.id,
      ringBounds: { ...this.bounds },
      ...(this.contraction ? { contraction: { ...this.contraction } } : {}),
      crowdEvents: { cheers: this.cheers, chairs: this.eventCounts.chair, trash: this.eventCounts.trash },
      eventCounts: { ...this.eventCounts },
      effects: Object.fromEntries(Object.entries(this.effects).map(([id, effect]) => [id, { ...effect }]))
    };
  }
}
