import { ACTIONS } from "../src/config/combat-config.js";
import { AI_PROFILES } from "../src/config/ai-profiles.js";
import { DEFAULT_STATS, STAT_BUDGET, TIME_LIMIT_TICKS, WORLD } from "../src/config/game-config.js";
import {
  applyHits,
  counterChance,
  criticalChance,
  normalDamage
} from "../src/core/combat-rules.js";
import { Game } from "../src/core/game.js";
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
  assert.equal(invested.criticalMultiplier, 1.75);
  assert.ok(Math.abs(invested.counterChance - 0.25) < 1e-12);
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
