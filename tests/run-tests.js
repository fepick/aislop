import { ACTIONS } from "../src/config/combat-config.js";
import { TIME_LIMIT_TICKS, WORLD } from "../src/config/game-config.js";
import { normalDamage, criticalChance } from "../src/core/combat-rules.js";
import { Game } from "../src/core/game.js";
import { SeededRng, mixSeed } from "../src/core/rng.js";
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
