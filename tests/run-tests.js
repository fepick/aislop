import { ACTIONS } from "../src/config/combat-config.js";
import { AI_PROFILES } from "../src/config/ai-profiles.js";
import { TIME_LIMIT_TICKS, WORLD } from "../src/config/game-config.js";
import {
  applyHits,
  counterChance,
  criticalChance,
  normalDamage
} from "../src/core/combat-rules.js";
import { Game } from "../src/core/game.js";
import { SeededRng, mixSeed } from "../src/core/rng.js";
import { hitGain } from "../src/presentation/audio-manager.js";
import { shakeForDamage } from "../src/presentation/feedback.js";
import { aggregateResults } from "../src/simulation/results-aggregator.js";
import { runMatch } from "../src/simulation/simulation-runner.js";

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
  assert.ok(Math.abs(criticalChance(game.players[0]) - 0.18) < 1e-12);
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
  const game = new Game({ seed: 1 });
  const defender = game.players[1];
  defender.stats.insight = 0;
  assert.equal(counterChance(defender), 0.05);
  defender.stats.insight = 10;
  assert.ok(Math.abs(counterChance(defender) - 0.15) < 1e-12);
  defender.stats.insight = 100;
  assert.equal(counterChance(defender), 0.45);
});

test("a successful counter ignores the original hit and retaliates once", () => {
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
  assert.ok(attacker.health < attackerHealth);
  assert.equal(defender.metrics.countersAttempted, 1);
  assert.equal(defender.metrics.countersSucceeded, 1);
  assert.equal(attacker.metrics.attacksHit, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "COUNTER");
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

test("same seed produces the same deterministic result", () => {
  const a = runMatch({ seed: 77 });
  const b = runMatch({ seed: 77 });
  assert.deepEqual(a, b);
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
