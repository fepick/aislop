import { CAMPAIGN_VERSION, STAGES, TRAINING_REWARD } from "../config/campaign-config.js";
import { EQUIPMENT, LEGACY_REWARDS, REWARD_WEIGHTS } from "../config/equipment.js";
import { STAT_BUDGET, UNUSED_STATS } from "../config/game-config.js";
import { mixSeed, normalizeSeed, SeededRng } from "../core/rng.js";
import { STAT_KEYS, createAllocation } from "../core/stat-rules.js";

export const stageBudget = stage => STAT_BUDGET + stage * TRAINING_REWARD;
export const stageFor = run => STAGES[run.stage];
export const equipmentFor = run => EQUIPMENT.find(item => item.id === run.equipped);
const equipmentIds = new Set(EQUIPMENT.map(item => item.id));

export function availableRewards(run) {
  if (run.status !== "reward") return [];
  const excluded = new Set([...run.seenRewards, ...run.owned]);
  const weights = REWARD_WEIGHTS[run.stage];
  const pools = Object.entries(weights).map(([rarity, weight]) => ({
    weight,
    items: EQUIPMENT.filter(item => item.rarity === rarity && !excluded.has(item.id))
  }));
  const rng = new SeededRng(mixSeed(run.seed, 1010 + run.stage));
  const offer = [];
  for (let slot = 0; slot < 3; slot++) {
    const candidates = pools.filter(pool => pool.items.length);
    const weight = candidates.reduce((sum, pool) => sum + pool.weight, 0);
    let roll = rng.intInclusive(1, weight);
    const pool = candidates.find(candidate => (roll -= candidate.weight) <= 0);
    const index = rng.intInclusive(0, pool.items.length - 1);
    offer.push(pool.items.splice(index, 1)[0]);
  }
  return offer;
}

export function createRun(seed) {
  return {
    version: CAMPAIGN_VERSION,
    seed: normalizeSeed(seed),
    stage: 0,
    allocation: createAllocation(),
    owned: [],
    seenRewards: [],
    equipped: null,
    rounds: [],
    status: "ready"
  };
}

export function roundScore(rounds) {
  return {
    P1: rounds.filter(round => round === "P1").length,
    P2: rounds.filter(round => round === "P2").length
  };
}

export function seriesOutcome(rounds) {
  const score = roundScore(rounds);
  if (score.P1 === 2) return "P1";
  if (score.P2 === 2) return "P2";
  return rounds.length < 3 ? null : "DRAW";
}

export function recordRound(run, winner) {
  if (!["ready", "between"].includes(run.status) || !["P1", "P2", "DRAW"].includes(winner)) return run;
  const rounds = [...run.rounds, winner];
  const outcome = seriesOutcome(rounds);
  let status = "between";
  if (outcome === "P1") status = run.stage === STAGES.length - 1 ? "champion" : "reward";
  if (outcome === "P2" || outcome === "DRAW") status = "eliminated";
  return { ...run, rounds, status };
}

export function claimReward(run, id) {
  const offer = availableRewards(run);
  if (!offer.some(item => item.id === id)) return run;
  const allocation = run.allocation;
  return {
    ...run,
    stage: run.stage + 1,
    allocation: {
      ...allocation,
      totalBudget: allocation.totalBudget + TRAINING_REWARD,
      remainingBudget: allocation.remainingBudget + TRAINING_REWARD
    },
    owned: [...run.owned, id],
    seenRewards: [...run.seenRewards, ...offer.map(item => item.id)],
    equipped: id,
    rounds: [],
    status: "ready"
  };
}

export function effectiveStats(run) {
  const raw = run.allocation.currentStats;
  const bonuses = equipmentFor(run)?.stats ?? {};
  return Object.fromEntries(STAT_KEYS.map(key => [key, raw[key] + (bonuses[key] ?? 0)]));
}

export function roundConfig(run) {
  const stage = stageFor(run);
  return {
    seed: mixSeed(run.seed, run.stage * 3 + run.rounds.length),
    p1Stats: effectiveStats(run),
    p2Stats: stage.stats,
    p1Equipment: equipmentFor(run)?.effects,
    opponent: { name: stage.name, color: stage.color },
    arena: { id: stage.id, contract: run.rounds.length === 2 }
  };
}

export function restoreRun(json, fallbackSeed) {
  try {
    const saved = JSON.parse(json);
    if (!saved || ![1, CAMPAIGN_VERSION].includes(saved.version)
        || !Number.isInteger(saved.stage) || !STAGES[saved.stage]
        || !Array.isArray(saved.rounds) || saved.rounds.length > 3
        || !saved.rounds.every(round => ["P1", "P2", "DRAW"].includes(round))
        || seriesOutcome(saved.rounds.slice(0, -1))
        || !Array.isArray(saved.owned) || saved.owned.length !== saved.stage
        || new Set(saved.owned).size !== saved.stage
        || !saved.owned.every(id => equipmentIds.has(id))
        || (saved.equipped !== null && !saved.owned.includes(saved.equipped))) {
      return createRun(fallbackSeed);
    }

    const seenRewards = saved.version === 1
      ? saved.stage > 0 ? [...new Set([...LEGACY_REWARDS, ...saved.owned])] : []
      : saved.seenRewards;
    if (!Array.isArray(seenRewards) || seenRewards.length > saved.stage * 3
        || new Set(seenRewards).size !== seenRewards.length || !seenRewards.every(id => equipmentIds.has(id))
        || !saved.owned.every(id => seenRewards.includes(id))) {
      return createRun(fallbackSeed);
    }

    const outcome = seriesOutcome(saved.rounds);
    const status = outcome === "P1"
      ? saved.stage === STAGES.length - 1 ? "champion" : "reward"
      : outcome ? "eliminated" : saved.rounds.length ? "between" : "ready";
    const allocation = createAllocation(undefined, stageBudget(saved.stage));
    for (const key of STAT_KEYS) {
      if (UNUSED_STATS.includes(key)) continue;
      const points = saved.allocation?.currentStats?.[key] - allocation.baseStats[key];
      if (!Number.isInteger(points) || points < 0 || points > allocation.remainingBudget) {
        return createRun(fallbackSeed);
      }
      allocation.currentStats[key] += points;
      allocation.remainingBudget -= points;
    }
    return {
      version: CAMPAIGN_VERSION, seed: normalizeSeed(saved.seed), stage: saved.stage, allocation,
      owned: saved.owned, seenRewards, equipped: saved.equipped, rounds: saved.rounds, status
    };
  } catch {
    return createRun(fallbackSeed);
  }
}
