import {
  AI_PROFILE_VERSION,
  ARENA_RULES_VERSION,
  EQUIPMENT_RULES_VERSION,
  FIXED_DT,
  PLAYER_CONFIGS,
  RNG_VERSION,
  RULES_VERSION,
  RESULT_SCHEMA_VERSION,
  STAT_RULES_VERSION,
  TIME_LIMIT_TICKS,
  WORLD
} from "../config/game-config.js";
import { ACTIONS } from "../config/combat-config.js";
import { AI_PROFILES } from "../config/ai-profiles.js";
import { SeededRng, mixSeed, normalizeSeed } from "./rng.js";
import { createPlayer } from "./player.js";
import { MatchArena } from "./match-arena.js";
import {
  applyHits,
  applyPendingCounter,
  buildHit,
  canHit,
  clamp,
  resolvePlayerOverlap
} from "./combat-rules.js";

const cooldownKeys = Object.keys(ACTIONS);
const scaledTiming = (player, config, arenaScale = 1) => {
  const scale = player.derivedStats.attackTimingScale * arenaScale;
  const startup = Math.max(1, Math.round(config.startup * scale));
  const active = Math.max(1, Math.round(config.active * scale));
  const recovery = Math.max(1, Math.round(config.recovery * scale));
  return {
    startup,
    active,
    recovery,
    total: startup + active + recovery,
    cooldown: Math.max(1, Math.round(config.cooldown * scale))
  };
};

export class Game {
  constructor({ seed = 0, mode = "simulation", p1Stats, p2Stats, p1Equipment, opponent, arena, collectEvents = false } = {}) {
    this.seed = normalizeSeed(seed);
    this.mode = mode;
    this.rng = new SeededRng(this.seed);
    this.aiRng = {
      P1: new SeededRng(mixSeed(this.seed, 101)),
      P2: new SeededRng(mixSeed(this.seed, 202))
    };
    this.combatRng = {
      P1: new SeededRng(mixSeed(this.seed, 303)),
      P2: new SeededRng(mixSeed(this.seed, 404))
    };
    this.counterRng = {
      P1: new SeededRng(mixSeed(this.seed, 505)),
      P2: new SeededRng(mixSeed(this.seed, 606))
    };
    this.dodgeRng = {
      P1: new SeededRng(mixSeed(this.seed, 707)),
      P2: new SeededRng(mixSeed(this.seed, 808))
    };
    this.players = [
      createPlayer(PLAYER_CONFIGS[0], p1Stats, p1Equipment),
      createPlayer(opponent ? { ...PLAYER_CONFIGS[1], ...opponent } : PLAYER_CONFIGS[1], p2Stats)
    ];
    this.tick = 0;
    this.status = "RUNNING";
    this.winner = null;
    this.resultType = null;
    this.collectEvents = collectEvents;
    this.events = [];
    this.recentEvents = [];
    this.arena = arena ? new MatchArena(arena, this.seed, event => this.publish(event)) : null;
  }

  emit(type, actorId, targetId, actionType, value, x) {
    this.publish({ tick: this.tick, type, actorId, targetId, actionType, value, position: { x, y: WORLD.floorY - 230 } });
  }

  publish(event) {
    this.recentEvents.push(event);
    if (this.collectEvents && this.events.length < 500) this.events.push(event);
  }

  get ring() {
    const bounds = this.arena?.bounds;
    return bounds && bounds.ringMinX !== WORLD.ringMinX ? bounds : WORLD;
  }

  startAction(player, type) {
    if (type === "IDLE") {
      player.decisionTicks = 8;
      return;
    }
    if (type === "APPROACH") {
      player.action = { type, elapsed: 0, hasHit: false };
      return;
    }
    const arenaScale = this.arena?.attackTimingScale(this.tick);
    const timing = scaledTiming(player, ACTIONS[type], arenaScale);
    player.action = { type, elapsed: 0, hasHit: false, timing };
    player.metrics.attacksAttempted += 1;
    player.metrics.actionAttempts[type] += 1;
    if (type === "ROPE_DROP_KICK") {
      player.metrics.ropeDropkickAttempts += 1;
      player.rage = 0;
    }
    this.emit("ACTION_STARTED", player.id, null, type, 0, player.x);
  }

  updatePlayer(player, opponentX) {
    const ring = this.ring;
    player.previousX = player.x;
    player.counterPoseTicks = Math.max(0, player.counterPoseTicks - 1);
    for (const key of cooldownKeys) player.cooldowns[key] = Math.max(0, player.cooldowns[key] - 1);

    if (player.hitStunTicks > 0) {
      player.hitStunTicks -= 1;
      player.x += player.velocityX * (this.arena?.knockbackScale(this.tick) ?? 1);
      player.velocityX *= WORLD.knockbackFriction;
      player.x = clamp(player.x, ring.ringMinX, ring.ringMaxX);
      return;
    }

    if (player.pendingCounter) return;
    if (!player.action) return;
    const action = player.action;
    const arenaMove = this.arena?.moveScale(this.tick, player.x) ?? 1;
    if (action.type === "APPROACH") {
      player.facing = opponentX >= player.x ? 1 : -1;
      player.x += player.facing * WORLD.approachSpeed * player.derivedStats.moveScale * arenaMove * FIXED_DT;
      if (ring !== WORLD) player.x = clamp(player.x, ring.ringMinX, ring.ringMaxX);
      action.elapsed += 1;
      if (Math.abs(opponentX - player.x) <= 220 || action.elapsed >= 30) {
        player.action = null;
        player.decisionTicks = 1;
      }
      return;
    }

    const config = ACTIONS[action.type];
    const timing = action.timing ?? scaledTiming(player, config);
    action.elapsed += 1;
    if (action.type === "DROP_KICK" && action.elapsed >= timing.startup && action.elapsed < timing.startup + timing.active) {
      player.x += player.facing * config.moveSpeed * arenaMove * FIXED_DT;
    }
    if (action.type === "ROPE_DROP_KICK" && action.elapsed >= timing.startup && action.elapsed < timing.startup + timing.active) {
      const travelMultiplier = player.equipment.ropeTravelMultiplier ?? 1;
      player.x += player.facing * config.moveSpeed * player.derivedStats.moveScale * travelMultiplier * arenaMove * FIXED_DT;
    }
    player.x = clamp(player.x, ring.ringMinX, ring.ringMaxX);
    if (action.elapsed >= timing.total) {
      player.cooldowns[action.type] = timing.cooldown;
      player.action = null;
      player.decisionTicks = 1;
    }
  }

  resolvePendingCounters() {
    const due = [];
    for (const counterer of this.players) {
      const pending = counterer.pendingCounter;
      if (!pending) continue;
      pending.remainingTicks -= 1;
      if (pending.remainingTicks > 0) continue;
      counterer.pendingCounter = null;
      const target = this.players.find(player => player.id === pending.targetId);
      if (counterer.health > 0 && target?.health > 0) due.push({ counterer, target, pending });
    }
    for (const item of due) {
      applyPendingCounter(item.counterer, item.target, item.pending, (...args) => this.emit(...args));
    }
  }

  finishIfNeeded() {
    const [p1, p2] = this.players;
    if (p1.health > 0 && p2.health > 0) return false;
    this.status = "FINISHED";
    if (p1.health <= 0 && p2.health <= 0) {
      this.winner = "DRAW";
      this.resultType = "DRAW";
    } else {
      this.winner = p1.health > 0 ? "P1" : "P2";
      this.resultType = "KO";
    }
    this.emit("KO", this.winner, null, null, 0, 960);
    return true;
  }

  step() {
    if (this.status !== "RUNNING") return this.recentEvents;
    this.recentEvents = [];
    const [p1, p2] = this.players;
    this.arena?.advance(this.tick, this.players);
    const ring = this.ring;
    if (ring !== WORLD) {
      p1.x = clamp(p1.x, ring.ringMinX, ring.ringMaxX);
      p2.x = clamp(p2.x, ring.ringMinX, ring.ringMaxX);
      resolvePlayerOverlap(p1, p2, ring);
    }
    this.resolvePendingCounters();
    if (this.finishIfNeeded()) {
      this.arena?.react(this.tick, this.recentEvents);
      this.tick += 1;
      return this.recentEvents;
    }

    for (const [player, opponent] of [[p1, p2], [p2, p1]]) {
      if (player.hitStunTicks <= 0 && !player.action && !player.pendingCounter) {
        player.decisionTicks -= 1;
        if (player.decisionTicks <= 0) {
          const profile = AI_PROFILES[player.aiProfileId];
          const { decideAction } = this.aiModule;
          const aiRng = this.aiRng[player.id];
          this.startAction(player, decideAction(player, opponent, profile, aiRng, ring));
          player.decisionTicks = aiRng.intInclusive(profile.decisionIntervalMin, profile.decisionIntervalMax);
        }
      }
    }

    const startX = { P1: p1.x, P2: p2.x };
    this.updatePlayer(p1, startX.P2);
    this.updatePlayer(p2, startX.P1);
    resolvePlayerOverlap(p1, p2, ring);

    const hits = [];
    for (const [attacker, defender] of [[p1, p2], [p2, p1]]) {
      const action = attacker.action;
      if (!action || action.hasHit || !ACTIONS[action.type]) continue;
      const config = ACTIONS[action.type];
      const timing = action.timing ?? scaledTiming(attacker, config);
      const active = action.elapsed >= timing.startup && action.elapsed < timing.startup + timing.active;
      if (active && canHit(attacker, defender, config)) {
        action.hasHit = true;
        hits.push(buildHit(attacker, defender, action.type, this.combatRng[attacker.id]));
      }
    }
    applyHits(hits, (...args) => this.emit(...args), this.counterRng, this.dodgeRng);
    this.arena?.react(this.tick, this.recentEvents);

    this.tick += 1;
    if (this.finishIfNeeded()) {
      return this.recentEvents;
    } else if (this.tick >= TIME_LIMIT_TICKS) {
      this.status = "FINISHED";
      if (p1.health === p2.health) {
        this.winner = "DRAW";
        this.resultType = "DRAW";
      } else {
        this.winner = p1.health > p2.health ? "P1" : "P2";
        this.resultType = "TIMEOUT";
      }
      this.emit("TIMEOUT", this.winner, null, null, 0, 960);
    }
    return this.recentEvents;
  }

  get aiModule() {
    return aiController;
  }

  getResult(matchId = 1) {
    if (this.status !== "FINISHED") throw new Error("Match is not finished");
    const playerResult = player => ({
      name: player.name,
      rawStats: { ...player.rawStats },
      derivedStats: { ...player.derivedStats },
      aiProfileId: player.aiProfileId,
      ...(Object.keys(player.equipment).length ? { equipment: { ...player.equipment } } : {}),
      finalHealth: player.health,
      finalRage: player.rage,
      ...player.metrics
    });
    const baseRulesVersion = Object.keys(this.players[0].equipment).length ? EQUIPMENT_RULES_VERSION : RULES_VERSION;
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      matchId,
      seed: this.seed,
      mode: this.mode,
      rulesVersion: this.arena ? ARENA_RULES_VERSION : baseRulesVersion,
      statRulesVersion: STAT_RULES_VERSION,
      aiProfileVersion: AI_PROFILE_VERSION,
      rngAlgorithmVersion: RNG_VERSION,
      unusedStats: ["luck"],
      winner: this.winner,
      resultType: this.resultType,
      elapsedTicks: this.tick,
      elapsedSeconds: this.tick / 60,
      p1: playerResult(this.players[0]),
      p2: playerResult(this.players[1]),
      ...(this.arena ? { arena: this.arena.summary() } : {})
    };
  }
}

import * as aiController from "./ai-controller.js";
