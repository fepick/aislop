import { ACTIONS } from "../src/config/combat-config.js";
import { AI_PROFILES } from "../src/config/ai-profiles.js";
import { ARENA_EVENTS } from "../src/config/arena-events.js";
import { STAGES, TRAINING_REWARD } from "../src/config/campaign-config.js";
import { EQUIPMENT, LEGACY_REWARDS, REWARD_WEIGHTS } from "../src/config/equipment.js";
import {
  ARENA_RULES_VERSION, DEFAULT_STATS, EQUIPMENT_RULES_VERSION, RULES_VERSION, STAT_BUDGET, TIME_LIMIT_TICKS, WORLD
} from "../src/config/game-config.js";
import {
  availableRewards,
  claimReward,
  createRun,
  effectiveStats,
  recordRound,
  restoreRun,
  roundConfig,
  seriesOutcome
} from "../src/campaign/campaign.js";
import {
  applyHits,
  counterChance,
  criticalChance,
  dodgeChance,
  normalDamage
} from "../src/core/combat-rules.js";
import { Game } from "../src/core/game.js";
import { canUseRopeDropkick } from "../src/core/ai-controller.js";
import { MatchArena } from "../src/core/match-arena.js";
import { SeededRng, mixSeed } from "../src/core/rng.js";
import {
  adjustAllocation,
  combatPower,
  combatPreview,
  createAllocation,
  deriveStats,
  resetAllocation
} from "../src/core/stat-rules.js";
import { AudioManager, hitGain } from "../src/presentation/audio-manager.js";
import { announcementForEvent, shakeForDamage } from "../src/presentation/feedback.js";
import { aggregateResults } from "../src/simulation/results-aggregator.js";
import { BatchRunner, runMatch } from "../src/simulation/simulation-runner.js";

const output = typeof print === "function" ? print : console.log;
const assert = {
  equal(actual, expected, message = "") {
    if (!Object.is(actual, expected)) throw new Error(`${message} expected ${expected}, received ${actual}`);
  },
  ok(value, message = "assertion failed") {
    if (!value) throw new Error(message);
  },
  deepEqual(actual, expected, message = "") {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) throw new Error(`${message} expected ${expectedJson}, received ${actualJson}`);
  }
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("seed RNG has a stable golden sequence", () => {
  const rng = new SeededRng(20260728);
  assert.deepEqual(
    [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()],
    [4186522634, 2291195719, 1609768887]
  );
});

test("derived match seeds are stable and unique", () => {
  const seeds = Array.from({ length: 1000 }, (_, index) => mixSeed(12, index));
  assert.equal(new Set(seeds).size, seeds.length);
  assert.deepEqual(seeds.slice(0, 3), [4169888526, 1679344211, 3574771948]);
});

test("default damage and critical chance match rules", () => {
  const game = new Game({ seed: 1 });
  assert.equal(normalDamage(7, game.players[0], game.players[1]), 9);
  assert.equal(criticalChance(game.players[0]), 0.12);
  assert.equal(game.players[0].health, 100);
});

test("campaign series ends at two wins or after three rounds", () => {
  const ready = createRun(7);
  const between = recordRound(ready, "P1");
  assert.equal(between.status, "between");
  const reward = recordRound(between, "P1");
  assert.equal(reward.status, "reward");
  assert.equal(recordRound(reward, "P2"), reward);
  assert.equal(seriesOutcome(["P1", "DRAW"]), null);
  assert.equal(seriesOutcome(["P1", "DRAW", "P1"]), "P1");
  const eliminated = ["P1", "DRAW", "P2"].reduce(recordRound, ready);
  assert.equal(eliminated.status, "eliminated");
  assert.deepEqual(eliminated.rounds, ["P1", "DRAW", "P2"]);
});

test("campaign offers three distinct rewards per stage without repeating skipped items", () => {
  assert.equal(EQUIPMENT.length, 33);
  assert.equal(new Set(EQUIPMENT.map(item => item.id)).size, EQUIPMENT.length);
  assert.ok(EQUIPMENT.slice(3).every(item => Object.values(item.stats).some(bonus => bonus > 0)));
  let run = createRun(7);
  run = { ...run, allocation: adjustAllocation(run.allocation, "maxHealth", 1) };
  assert.equal(claimReward(run, EQUIPMENT[0].id), run);
  const shown = [];
  for (let index = 0; index < STAGES.length - 1; index++) {
    const reward = ["P1", "P1"].reduce(recordRound, run);
    const picks = availableRewards(reward);
    const ids = picks.map(item => item.id);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids.every(id => !shown.includes(id)));
    assert.equal(claimReward(reward, EQUIPMENT.find(item => !ids.includes(item.id)).id), reward);
    assert.deepEqual(availableRewards(restoreRun(JSON.stringify(reward), 99)), picks);
    shown.push(...ids);
    const chosen = picks.find(item => item.stats) ?? picks[0];
    run = claimReward(reward, chosen.id);
    assert.deepEqual(run.seenRewards, shown);
    assert.equal(run.stage, index + 1);
    assert.equal(run.equipped, chosen.id);
    assert.equal(run.allocation.remainingBudget, STAT_BUDGET - 1 + TRAINING_REWARD * run.stage);
    assert.deepEqual(run.rounds, []);
    for (const [key, bonus] of Object.entries(chosen.stats ?? {})) {
      assert.equal(effectiveStats(run)[key], run.allocation.currentStats[key] + bonus);
    }
  }
  assert.equal(roundConfig(run).opponent.name, STAGES.at(-1).name);
  const champion = ["P1", "DRAW", "P1"].reduce(recordRound, run);
  assert.equal(champion.status, "champion");
  assert.deepEqual(restoreRun(JSON.stringify(champion), 99), champion);
});

test("later reward rounds weight higher rarities more often", () => {
  assert.ok(REWARD_WEIGHTS.every(weights => Object.values(weights).reduce((sum, weight) => sum + weight, 0) === 100));
  const upperTiers = [0, 0, 0];
  for (let seed = 1; seed <= 200; seed++) {
    let run = createRun(seed);
    for (let stage = 0; stage < upperTiers.length; stage++) {
      const reward = ["P1", "P1"].reduce(recordRound, run);
      const picks = availableRewards(reward);
      upperTiers[stage] += picks.filter(item => ["epic", "unique"].includes(item.rarity)).length;
      run = claimReward(reward, picks[0].id);
    }
  }
  assert.ok(upperTiers[0] < upperTiers[1] && upperTiers[1] < upperTiers[2], upperTiers.join(", "));
});

test("version 1 saves preserve legacy equipment and exclude already shown rewards", () => {
  const oldSave = {
    ...createRun(21), version: 1, stage: 1, owned: ["wraps"], equipped: "wraps", rounds: ["P1", "P1"]
  };
  delete oldSave.seenRewards;
  const restored = restoreRun(JSON.stringify(oldSave), 99);
  assert.equal(restored.stage, 1);
  assert.equal(restored.equipped, "wraps");
  assert.equal(restored.status, "reward");
  assert.deepEqual(restored.seenRewards, LEGACY_REWARDS);
  assert.ok(availableRewards(restored).every(item => !LEGACY_REWARDS.includes(item.id)));
});

test("restoring a saved series preserves its next round and validates allocations", () => {
  const first = ["P1", "P1"].reduce(recordRound, createRun(77));
  const second = claimReward(first, availableRewards(first)[0].id);
  second.allocation = adjustAllocation(second.allocation, "power", 1);
  const between = recordRound(second, "DRAW");
  const corrupted = JSON.parse(JSON.stringify(between));
  corrupted.allocation.currentStats.power = 100;
  const restored = restoreRun(JSON.stringify(between), 99);
  assert.deepEqual(restored, between);
  assert.deepEqual(roundConfig(restored), roundConfig(between));
  assert.ok(roundConfig(restored).seed !== roundConfig(second).seed);
  assert.deepEqual(restoreRun(JSON.stringify(corrupted), 99), createRun(99));
  assert.deepEqual(restoreRun("invalid", 99), createRun(99));
});

test("campaign equipment affects its intended action and versions only modified matches", () => {
  const [carbon, heels] = EQUIPMENT;
  const base = new Game({ seed: 1 });
  const equipped = new Game({ seed: 1, p1Equipment: carbon.effects });
  function ropeTravel(game) {
    const [p1, p2] = game.players;
    p1.action = { type: "ROPE_DROP_KICK", elapsed: ACTIONS.ROPE_DROP_KICK.startup - 1, hasHit: false };
    game.updatePlayer(p1, p2.x);
    return p1.x - p1.previousX;
  }
  assert.ok(Math.abs(ropeTravel(equipped) / ropeTravel(base) - carbon.effects.ropeTravelMultiplier) < 1e-9);
  const wearer = new Game({ seed: 1, p1Equipment: heels.effects }).players[0];
  assert.equal(criticalChance(wearer, "KICK"), 0.24);
  assert.equal(criticalChance(wearer, "PUSH"), 0.12);
  assert.equal(criticalChance(wearer, "ROPE_DROP_KICK"), 0.12);
  assert.equal(runMatch({ seed: 1 }).rulesVersion, RULES_VERSION);
  assert.equal(runMatch({ seed: 1, p1Equipment: heels.effects }).rulesVersion, EQUIPMENT_RULES_VERSION);
  for (const item of [carbon, heels]) {
    const run = { ...createRun(1), owned: [item.id], equipped: item.id };
    const config = roundConfig(run);
    const { mode, ...spectator } = runMatch({ ...config, mode: "spectator" });
    const { mode: simulationMode, ...simulation } = runMatch(config);
    assert.deepEqual(spectator, simulation);
    assert.equal(simulation.rulesVersion, ARENA_RULES_VERSION);
    assert.deepEqual(simulation.p1.equipment, item.effects);
  }
});

test("third arena round moves both boundaries and keeps fighters inside", () => {
  const between = ["P1", "P2"].reduce(recordRound, createRun(42));
  assert.equal(roundConfig(createRun(42)).arena.contract, false);
  assert.equal(roundConfig(recordRound(createRun(42), "DRAW")).arena.contract, false);
  assert.equal(roundConfig(between).arena.contract, true);
  const game = new Game(roundConfig(between));
  const { startTick, duration, inset } = game.arena.contraction;
  const [p1, p2] = game.players;
  p1.hitStunTicks = p2.hitStunTicks = 600;
  p1.x = p2.x = WORLD.ringMinX;
  game.tick = startTick;
  assert.ok(game.step().some(event => event.type === "RING_CONTRACTION"));
  assert.equal(game.ring.ringMinX, WORLD.ringMinX);
  for (let step = 1; step <= duration + 1; step += 1) {
    game.step();
    assert.ok(p1.x >= game.ring.ringMinX && p2.x <= game.ring.ringMaxX);
    assert.ok(p2.x - p1.x >= WORLD.minSeparation - 1e-9);
  }
  assert.equal(game.ring.ringMinX, WORLD.ringMinX + inset);
  assert.equal(game.ring.ringMaxX, WORLD.ringMaxX - inset);
  p1.x = game.ring.ringMinX + 20;
  p2.x = game.ring.ringMaxX - 20;
  p1.facing = 1;
  p1.rage = 100;
  assert.equal(canUseRopeDropkick(p1, p2), false);
  assert.equal(canUseRopeDropkick(p1, p2, game.ring), true);
});

test("arena reacts to strong hits and limits overlapping cheers", () => {
  const events = [];
  const arena = new MatchArena({ id: "iron-king" }, 42, event => events.push(event));
  arena.react(0, [{ type: "DODGE", value: 20 }]);
  arena.react(1, [{ type: "HIT", value: 10 }]);
  arena.react(2, [{ type: "CRITICAL", value: 12 }]);
  arena.react(3, [{ type: "HIT", actionType: "ROPE_DROP_KICK", value: 29 }]);
  arena.react(109, [{ type: "HIT", actionType: "ROPE_DROP_KICK", value: 29 }]);
  assert.deepEqual(events.map(event => [event.type, event.tick]), [["CROWD_CHEER", 2], ["CROWD_CHEER", 109]]);
});

test("spectator and headless agree on all six arena events and their combat results", () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 24; seed += 1) {
    const config = roundConfig(["P1", "P2"].reduce(recordRound, createRun(seed)));
    const spectator = new Game({ ...config, mode: "spectator", collectEvents: true });
    const headless = new Game({ ...config, collectEvents: true });
    while (spectator.status === "RUNNING") spectator.step();
    while (headless.status === "RUNNING") headless.step();
    const { mode, ...spectatorResult } = spectator.getResult();
    const { mode: headlessMode, ...headlessResult } = headless.getResult();
    assert.deepEqual(spectatorResult, headlessResult);
    assert.deepEqual(spectator.events, headless.events);
    assert.ok(spectator.events.some(event => event.type === "RING_CONTRACTION"));
    for (const event of spectator.events) {
      if (event.type === "ARENA_EVENT") kinds.add(event.kind);
    }
  }
  assert.deepEqual([...kinds].sort(), Object.keys(ARENA_EVENTS).sort());
});

test("a telegraphed chair can decide a round without crediting the opponent", () => {
  const game = new Game({ arena: { id: "blue-bull" } });
  const [victim, bystander] = game.players;
  victim.health = 7;
  game.arena.active = {
    kind: "chair", impactTick: 20, until: 100, landingX: victim.x, radius: ARENA_EVENTS.chair.radius
  };
  game.tick = 19;
  game.step();
  assert.equal(victim.health, 7);
  const events = game.step();
  assert.ok(events.some(event => event.type === "ARENA_EFFECT" && event.effect === "damage"));
  const result = game.getResult();
  assert.equal(result.winner, bystander.id);
  assert.equal(result.p2.totalDamageDealt, 0);
  assert.equal(result.arena.effects.P1.damage, 7);
  assert.equal(result.arena.effects.P2.damage, 0);
});

test("medic, rage and temporary modifiers respect caps, zones and attack start", () => {
  const game = new Game({ arena: { id: "blue-bull" }, p1Stats: { maxHealth: 20 } });
  const { arena, players: [p1, p2] } = game;
  p1.health = 71;
  p2.health = 50;
  arena.healTrailing(25, game.players, 10);
  assert.equal(p1.health, 81);
  assert.equal(p2.health, 50);
  p1.rage = 97;
  arena.applyEffect(26, "fury", p1, "rage", ARENA_EVENTS.fury.rage);
  assert.equal(p1.rage, 100);
  assert.equal(arena.effects.P1.rage, 3);

  arena.active = { kind: "speed", until: 100 };
  game.startAction(p1, "KICK");
  const speedTiming = p1.action.timing.total;
  game.tick = 101;
  assert.equal(p1.action.timing.total, speedTiming);
  game.startAction(p2, "KICK");
  assert.ok(speedTiming < p2.action.timing.total);

  arena.active = { kind: "trash", impactTick: 100, until: 200, landingX: p1.x, radius: ARENA_EVENTS.trash.radius };
  assert.equal(arena.moveScale(99, p1.x), 1);
  assert.equal(arena.moveScale(101, p2.x), 1);
  assert.equal(arena.moveScale(101, p1.x), ARENA_EVENTS.trash.moveScale);
  assert.equal(arena.moveScale(200, p1.x), 1);
  arena.active = { kind: "ropes", until: 190 };
  assert.equal(arena.knockbackScale(189), ARENA_EVENTS.ropes.knockbackScale);
  assert.equal(arena.knockbackScale(190), 1);
});

test("stat rules derive documented baseline and investment values", () => {
  const baseline = deriveStats(DEFAULT_STATS);
  assert.equal(baseline.maxHealth, 100);
  assert.equal(baseline.attackTimingScale, 1);
  assert.equal(baseline.moveScale, 1);
  assert.equal(baseline.criticalChance, 0.12);
  assert.equal(baseline.criticalMultiplier, 1.5);
  assert.ok(Math.abs(baseline.counterChance - 0.15) < 1e-12);
  const invested = deriveStats({
    ...DEFAULT_STATS,
    attackSpeed: 20,
    moveSpeed: 20,
    maxHealth: 20,
    sharpness: 20,
    insight: 20
  });
  assert.equal(invested.maxHealth, 150);
  assert.equal(invested.attackTimingScale, 0.65);
  assert.ok(Math.abs(invested.moveScale - 1.4) < 1e-12);
  assert.equal(invested.dodgeChance, 0.05);
  assert.equal(invested.criticalMultiplier, 1.75);
  assert.ok(Math.abs(invested.counterChance - 0.25) < 1e-12);
});

test("moveSpeed dodge chance starts above baseline and caps at five percent", () => {
  assert.equal(dodgeChance(new Game({
    seed: 1,
    p1Stats: { ...DEFAULT_STATS, moveSpeed: 10 }
  }).players[0]), 0);
  assert.ok(Math.abs(dodgeChance(new Game({
    seed: 1,
    p1Stats: { ...DEFAULT_STATS, moveSpeed: 15 }
  }).players[0]) - 0.025) < 1e-12);
  assert.equal(dodgeChance(new Game({
    seed: 1,
    p1Stats: { ...DEFAULT_STATS, moveSpeed: 100 }
  }).players[0]), 0.05);
});

test("luck is preserved but has no derived combat effect", () => {
  const a = deriveStats({ ...DEFAULT_STATS, luck: 10 });
  const b = deriveStats({ ...DEFAULT_STATS, luck: 99 });
  assert.deepEqual(a, b);
});

test("allocation enforces budget baseline and unused luck", () => {
  const initial = createAllocation(DEFAULT_STATS, STAT_BUDGET);
  const unchangedDown = adjustAllocation(initial, "power", -1);
  const unchangedLuck = adjustAllocation(initial, "luck", 1);
  assert.equal(unchangedDown, initial);
  assert.equal(unchangedLuck, initial);
  let state = initial;
  for (let count = 0; count < 12; count += 1) state = adjustAllocation(state, "power", 1);
  assert.equal(state.currentStats.power, 20);
  assert.equal(state.remainingBudget, 0);
  state = adjustAllocation(state, "power", -1);
  assert.equal(state.currentStats.power, 19);
  assert.equal(state.remainingBudget, 1);
  assert.deepEqual(resetAllocation(state), initial);
});

test("preview and combat power use the shared stat formulas", () => {
  const preview = combatPreview(DEFAULT_STATS, DEFAULT_STATS);
  assert.equal(preview.minDamage, 6);
  assert.equal(preview.maxHealth, 100);
  assert.equal(preview.criticalChance, 0.12);
  assert.equal(combatPower(DEFAULT_STATS), 1000);
  assert.equal(combatPower({ ...DEFAULT_STATS, power: 20 }), 1300);
});

test("moveSpeed scales approach and rope dropkick travel", () => {
  const baseline = new Game({ seed: 1, p1Stats: DEFAULT_STATS });
  const faster = new Game({ seed: 1, p1Stats: { ...DEFAULT_STATS, moveSpeed: 20 } });
  for (const game of [baseline, faster]) {
    const [p1, p2] = game.players;
    p1.action = { type: "APPROACH", elapsed: 0, hasHit: false };
    game.updatePlayer(p1, p2.x);
  }
  assert.ok(
    faster.players[0].x - faster.players[0].previousX
      > baseline.players[0].x - baseline.players[0].previousX
  );
  for (const game of [baseline, faster]) {
    const p1 = game.players[0];
    p1.action = { type: "ROPE_DROP_KICK", elapsed: ACTIONS.ROPE_DROP_KICK.startup - 1, hasHit: false };
    game.updatePlayer(p1, game.players[1].x);
  }
  assert.ok(
    faster.players[0].x - faster.players[0].previousX
      > baseline.players[0].x - baseline.players[0].previousX
  );
});

test("default AI disables only the normal dropkick", () => {
  assert.equal(AI_PROFILES.normal.actionWeights.DROP_KICK, 0);
  assert.ok(AI_PROFILES.normal.actionWeights.PUSH > 0);
  assert.ok(AI_PROFILES.normal.ropeDropkickChance > 0);
  let pushAttempts = 0;
  let ropeDropkickAttempts = 0;
  for (let seed = 0; seed < 100; seed += 1) {
    const result = runMatch({ seed });
    assert.equal(result.p1.actionAttempts.DROP_KICK, 0);
    assert.equal(result.p2.actionAttempts.DROP_KICK, 0);
    pushAttempts += result.p1.actionAttempts.PUSH + result.p2.actionAttempts.PUSH;
    ropeDropkickAttempts +=
      result.p1.actionAttempts.ROPE_DROP_KICK + result.p2.actionAttempts.ROPE_DROP_KICK;
  }
  assert.ok(pushAttempts > 0);
  assert.ok(ropeDropkickAttempts > 0);
});

test("counter chance scales with insight and clamps", () => {
  assert.equal(counterChance(new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, insight: 0 }
  }).players[1]), 0.05);
  assert.ok(Math.abs(counterChance(new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, insight: 10 }
  }).players[1]) - 0.15) < 1e-12);
  assert.equal(counterChance(new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, insight: 100 }
  }).players[1]), 0.45);
});

test("a successful counter ignores the hit and retaliates after 18 ticks", () => {
  const game = new Game({ seed: 1 });
  const [attacker, defender] = game.players;
  const attackerHealth = attacker.health;
  const defenderHealth = defender.health;
  const events = [];
  applyHits([{
    attacker,
    defender,
    actionType: "KICK",
    damage: 20,
    critical: false,
    knockback: ACTIONS.KICK.knockback
  }], (...args) => events.push(args), {
    P1: { next: () => 1 },
    P2: { next: () => 0 }
  });
  assert.equal(defender.health, defenderHealth);
  assert.equal(attacker.health, attackerHealth);
  assert.equal(defender.metrics.countersAttempted, 1);
  assert.equal(defender.metrics.countersSucceeded, 0);
  assert.equal(attacker.metrics.attacksHit, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "COUNTER_TRIGGERED");
  attacker.decisionTicks = 999;
  defender.decisionTicks = 999;
  for (let tick = 0; tick < 17; tick += 1) {
    game.step();
    assert.equal(attacker.health, attackerHealth);
  }
  const counterEvents = game.step();
  assert.ok(attacker.health < attackerHealth);
  assert.equal(defender.metrics.countersSucceeded, 1);
  assert.equal(counterEvents.filter(event => event.type === "COUNTER").length, 1);
});

test("a counter cancels the counterer's simultaneous normal attack", () => {
  const game = new Game({ seed: 1 });
  const [p1, p2] = game.players;
  const events = [];
  applyHits([
    {
      attacker: p1,
      defender: p2,
      actionType: "KICK",
      damage: 20,
      critical: false,
      knockback: ACTIONS.KICK.knockback
    },
    {
      attacker: p2,
      defender: p1,
      actionType: "KICK",
      damage: 20,
      critical: false,
      knockback: ACTIONS.KICK.knockback
    }
  ], (...args) => events.push(args), {
    P1: { next: () => 1 },
    P2: { next: () => 0 }
  });
  assert.equal(p1.health, p1.derivedStats.maxHealth);
  assert.equal(p2.health, p2.derivedStats.maxHealth);
  assert.equal(p1.metrics.attacksHit, 0);
  assert.equal(p2.metrics.attacksHit, 0);
  assert.equal(p1.pendingCounter, null);
  assert.equal(p2.pendingCounter.targetId, "P1");
  assert.equal(events.filter(event => event[0] === "COUNTER_TRIGGERED").length, 1);
  assert.equal(events.filter(event => event[0] === "ACTION_CANCELLED").length, 1);
});

test("simultaneous counters are resolved symmetrically", () => {
  const game = new Game({ seed: 1 });
  const [p1, p2] = game.players;
  const events = [];
  const hit = (attacker, defender) => ({
    attacker,
    defender,
    actionType: "KICK",
    damage: 20,
    critical: false,
    knockback: ACTIONS.KICK.knockback
  });
  applyHits([hit(p1, p2), hit(p2, p1)], (...args) => events.push(args), {
    P1: { next: () => 0 },
    P2: { next: () => 0 }
  });
  assert.equal(p1.health, p1.derivedStats.maxHealth);
  assert.equal(p2.health, p2.derivedStats.maxHealth);
  assert.equal(p1.pendingCounter.targetId, "P2");
  assert.equal(p2.pendingCounter.targetId, "P1");
  assert.equal(events.filter(event => event[0] === "COUNTER_TRIGGERED").length, 2);
  assert.equal(events.filter(event => event[0] === "HIT").length, 0);
});

test("a successful dodge prevents all hit effects and metrics", () => {
  const game = new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, moveSpeed: 20 }
  });
  const [attacker, defender] = game.players;
  const events = [];
  const before = {
    health: defender.health,
    action: { type: "APPROACH", elapsed: 0, hasHit: false },
    attackerRage: attacker.rage,
    defenderRage: defender.rage,
    velocityX: defender.velocityX
  };
  defender.action = before.action;
  applyHits([{
    attacker,
    defender,
    actionType: "KICK",
    damage: 99,
    critical: true,
    knockback: ACTIONS.KICK.knockback
  }], (...args) => events.push(args), {
    P1: { next: () => 1 },
    P2: { next: () => 1 }
  }, {
    P1: { next: () => 1 },
    P2: { next: () => 0 }
  });
  assert.equal(defender.health, before.health);
  assert.equal(defender.action, before.action);
  assert.equal(defender.velocityX, before.velocityX);
  assert.equal(attacker.rage, before.attackerRage);
  assert.equal(defender.rage, before.defenderRage);
  assert.equal(attacker.metrics.attacksHit, 0);
  assert.equal(attacker.metrics.criticalHits, 0);
  assert.equal(defender.metrics.dodgesAttempted, 1);
  assert.equal(defender.metrics.dodgesSucceeded, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "DODGE");
  assert.equal(events[0][1], "P2");
  assert.equal(events[0][4], 0);
});

test("counter priority skips dodge RNG and dodge metrics", () => {
  const game = new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, moveSpeed: 20 }
  });
  const [attacker, defender] = game.players;
  let dodgeRolls = 0;
  applyHits([{
    attacker,
    defender,
    actionType: "KICK",
    damage: 20,
    critical: false,
    knockback: ACTIONS.KICK.knockback
  }], () => {}, {
    P1: { next: () => 1 },
    P2: { next: () => 0 }
  }, {
    P1: { next: () => { dodgeRolls += 1; return 0; } },
    P2: { next: () => { dodgeRolls += 1; return 0; } }
  });
  assert.equal(dodgeRolls, 0);
  assert.equal(defender.metrics.dodgesAttempted, 0);
  assert.equal(defender.metrics.dodgesSucceeded, 0);
  assert.ok(defender.pendingCounter);
});

test("rope dropkick can be dodged without a counter roll", () => {
  const game = new Game({
    seed: 1,
    p2Stats: { ...DEFAULT_STATS, moveSpeed: 20 }
  });
  const [attacker, defender] = game.players;
  let counterRolls = 0;
  applyHits([{
    attacker,
    defender,
    actionType: "ROPE_DROP_KICK",
    damage: 30,
    critical: false,
    knockback: ACTIONS.ROPE_DROP_KICK.knockback
  }], () => {}, {
    P1: { next: () => { counterRolls += 1; return 0; } },
    P2: { next: () => { counterRolls += 1; return 0; } }
  }, {
    P1: { next: () => 1 },
    P2: { next: () => 0 }
  });
  assert.equal(counterRolls, 0);
  assert.equal(defender.metrics.countersAttempted, 0);
  assert.equal(defender.metrics.dodgesSucceeded, 1);
  assert.equal(attacker.metrics.ropeDropkickHits, 0);
});

test("rope dropkick bypasses counter metrics and RNG", () => {
  const game = new Game({ seed: 1 });
  const [attacker, defender] = game.players;
  const before = defender.health;
  let counterRolls = 0;
  const events = [];
  applyHits([{
    attacker,
    defender,
    actionType: "ROPE_DROP_KICK",
    damage: 30,
    critical: false,
    knockback: ACTIONS.ROPE_DROP_KICK.knockback
  }], (...args) => events.push(args), {
    P1: { next: () => { counterRolls += 1; return 0; } },
    P2: { next: () => { counterRolls += 1; return 0; } }
  });
  assert.ok(defender.health < before);
  assert.equal(defender.metrics.countersAttempted, 0);
  assert.equal(counterRolls, 0);
  assert.equal(events[0][0], "HIT");
});

test("damage feedback uses bounded tiers", () => {
  assert.deepEqual(shakeForDamage(9), { strength: 0, frames: 0 });
  assert.deepEqual(shakeForDamage(10), { strength: 6, frames: 6 });
  assert.deepEqual(shakeForDamage(20), { strength: 12, frames: 9 });
  assert.deepEqual(shakeForDamage(30), { strength: 20, frames: 12 });
  assert.equal(hitGain(0), 0.25);
  assert.ok(hitGain(20) > hitGain(10));
  assert.equal(hitGain(100), 1);
});

test("rope dropkick starts one tracked announcement", () => {
  assert.deepEqual(announcementForEvent({
    type: "ACTION_STARTED",
    actionType: "ROPE_DROP_KICK",
    actorId: "P2"
  }), { actorId: "P2", text: "로프 드롭킥!", life: 60 });
  assert.equal(announcementForEvent({
    type: "ACTION_STARTED",
    actionType: "PUSH",
    actorId: "P1"
  }), null);
  assert.deepEqual(announcementForEvent({
    type: "DODGE",
    actorId: "P1"
  }), { actorId: "P1", text: "회피!", life: 42 });
});

test("audio buffers load once and can play mapped events", async () => {
  let contextCount = 0;
  let fetchCount = 0;
  let playCount = 0;
  let stopCount = 0;
  const context = {
    state: "running",
    destination: {},
    resume: async () => {},
    decodeAudioData: async data => data,
    createGain: () => ({ gain: { value: 0 }, connect() { return this; } }),
    createBufferSource: () => ({
      connect() { return this; },
      start() { playCount += 1; },
      stop() { stopCount += 1; },
      onended: null,
      buffer: null
    })
  };
  const audio = new AudioManager({ attack: "attack.wav", hit: "hit.wav" }, {
    contextFactory: () => { contextCount += 1; return context; },
    fetcher: async () => {
      fetchCount += 1;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    }
  });
  await audio.unlock();
  await audio.unlock();
  audio.consume([
    { type: "ACTION_STARTED", value: 0 },
    { type: "HIT", value: 10 }
  ]);
  audio.consume(Array.from({ length: 5 }, () => ({ type: "HIT", value: 10 })));
  assert.equal(contextCount, 1);
  assert.equal(fetchCount, 2);
  assert.equal(playCount, 7);
  assert.equal(audio.voices.length, 4);
  assert.equal(stopCount, 3);
});

test("audio loading failure can be retried", async () => {
  let shouldFail = true;
  const context = {
    state: "running",
    resume: async () => {},
    decodeAudioData: async data => data
  };
  const audio = new AudioManager({ hit: "hit.wav" }, {
    contextFactory: () => context,
    fetcher: async () => {
      if (shouldFail) throw new Error("temporary failure");
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    }
  });
  let failed = false;
  try {
    await audio.unlock();
  } catch {
    failed = true;
  }
  assert.ok(failed);
  shouldFail = false;
  await audio.unlock();
  assert.ok(audio.buffers.hit);
});

test("same seed produces the same deterministic result", () => {
  const a = runMatch({ seed: 77 });
  const b = runMatch({ seed: 77 });
  assert.deepEqual(a, b);
});

test("custom stat snapshots are recorded and affect matches", () => {
  const result = runMatch({
    seed: 77,
    p1Stats: { ...DEFAULT_STATS, maxHealth: 20 },
    p2Stats: DEFAULT_STATS
  });
  assert.equal(result.p1.rawStats.maxHealth, 20);
  assert.equal(result.p1.derivedStats.maxHealth, 150);
  assert.equal(result.p2.rawStats.maxHealth, 10);
  assert.deepEqual(result.unusedStats, ["luck"]);
});

test("batch runner freezes its stat snapshot", async () => {
  const p1Stats = { ...DEFAULT_STATS, maxHealth: 20 };
  const result = await new BatchRunner().run({
    count: 1,
    baseSeed: 9,
    p1Stats,
    p2Stats: DEFAULT_STATS,
    onProgress: () => { p1Stats.maxHealth = 1; }
  });
  assert.equal(result.statsSnapshot.p1.maxHealth, 20);
  assert.equal(result.singleMatch.p1.rawStats.maxHealth, 20);
  assert.equal(result.singleMatch.p1.derivedStats.maxHealth, 150);
});

test("spectator and simulation share combat results", () => {
  const spectator = runMatch({ seed: 90, mode: "spectator" });
  const simulation = runMatch({ seed: 90, mode: "simulation" });
  const withoutMode = ({ mode, ...rest }) => rest;
  assert.deepEqual(withoutMode(spectator), withoutMode(simulation));
});

test("spectator and simulation canonical results match across 100 seeds", () => {
  const withoutMode = ({ mode, ...rest }) => rest;
  for (let seed = 0; seed < 100; seed += 1) {
    assert.deepEqual(
      withoutMode(runMatch({ seed, mode: "spectator" })),
      withoutMode(runMatch({ seed, mode: "simulation" }))
    );
  }
});

test("higher insight produces a higher counter success rate across 1000 seeds", () => {
  const rates = insight => {
    const results = Array.from({ length: 1000 }, (_, seed) => runMatch({
      seed,
      p1Stats: { ...DEFAULT_STATS, insight },
      p2Stats: DEFAULT_STATS
    }));
    return aggregateResults(results).p1CounterSuccessRate;
  };
  const baselineRate = rates(10);
  const investedRate = rates(20);
  assert.ok(baselineRate > 0.12 && baselineRate < 0.18);
  assert.ok(investedRate > 0.22 && investedRate < 0.28);
  assert.ok(investedRate > baselineRate);
});

test("moveSpeed 20 produces a five percent dodge rate across 1000 seeds", () => {
  const baseline = aggregateResults(Array.from({ length: 1000 }, (_, seed) => runMatch({
    seed,
    p1Stats: { ...DEFAULT_STATS, moveSpeed: 10 },
    p2Stats: DEFAULT_STATS
  })));
  const faster = aggregateResults(Array.from({ length: 1000 }, (_, seed) => runMatch({
    seed,
    p1Stats: { ...DEFAULT_STATS, moveSpeed: 20 },
    p2Stats: DEFAULT_STATS
  })));
  assert.equal(baseline.p1DodgeSuccessRate, 0);
  assert.ok(faster.p1DodgeSuccessRate > 0.035);
  assert.ok(faster.p1DodgeSuccessRate < 0.065);
  assert.ok(faster.averageDodgesByP1 > 0);
});

test("matches terminate within the fixed 60 second limit", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const result = runMatch({ seed });
    assert.ok(result.elapsedTicks <= TIME_LIMIT_TICKS);
    assert.ok(["P1", "P2", "DRAW"].includes(result.winner));
  }
});

test("fighters never leave the ring", () => {
  const game = new Game({ seed: 999 });
  while (game.status === "RUNNING") {
    game.step();
    for (const player of game.players) {
      assert.ok(player.x >= WORLD.ringMinX && player.x <= WORLD.ringMaxX);
      assert.ok(Number.isFinite(player.x));
    }
  }
});

test("an attack can only hit once", () => {
  const game = new Game({ seed: 2 });
  const [p1, p2] = game.players;
  p1.x = 800;
  p2.x = 950;
  p1.action = { type: "KICK", elapsed: ACTIONS.KICK.startup - 1, hasHit: false };
  p1.decisionTicks = 999;
  p2.decisionTicks = 999;
  const before = p2.health;
  for (let index = 0; index < ACTIONS.KICK.active; index += 1) game.step();
  assert.ok(p2.health < before);
  assert.equal(p1.metrics.attacksHit, 1);
});

test("aggregate invariants hold", () => {
  const results = Array.from({ length: 20 }, (_, seed) => runMatch({ seed }));
  const aggregate = aggregateResults(results);
  assert.equal(aggregate.p1Wins + aggregate.p2Wins + aggregate.draws, results.length);
  assert.equal(aggregate.totalMatches, results.length);
  assert.ok(aggregate.koRate >= 0 && aggregate.koRate <= 1);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    output(`✓ ${name}`);
  } catch (error) {
    output(`✗ ${name}: ${error.message}`);
    throw error;
  }
}
output(`\n${passed}/${tests.length} tests passed`);
