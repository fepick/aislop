import { CAMPAIGN_VERSION, EQUIPMENT, STAGES, TRAINING_REWARD } from "../config/campaign-config.js";
import { STAT_BUDGET, UNUSED_STATS } from "../config/game-config.js";
import { mixSeed, normalizeSeed } from "../core/rng.js";
import { STAT_KEYS, createAllocation } from "../core/stat-rules.js";

export const stageBudget = stage => STAT_BUDGET + stage * TRAINING_REWARD;
export const stageFor = run => STAGES[run.stage];
export const equipmentFor = run => EQUIPMENT.find(item => item.id === run.equipped);
export const availableRewards = run => EQUIPMENT.filter(item => !run.owned.includes(item.id));

export function createRun(seed) {
  return {
    version: CAMPAIGN_VERSION,
    seed: normalizeSeed(seed),
    stage: 0,
    allocation: createAllocation(),
    owned: [],
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
  if (run.status !== "reward" || !availableRewards(run).some(item => item.id === id)) return run;
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
    if (!saved || saved.version !== CAMPAIGN_VERSION
        || !Number.isInteger(saved.stage) || !STAGES[saved.stage]
        || !Array.isArray(saved.rounds) || saved.rounds.length > 3
        || !saved.rounds.every(round => ["P1", "P2", "DRAW"].includes(round))
        || seriesOutcome(saved.rounds.slice(0, -1))
        || !Array.isArray(saved.owned) || saved.owned.length !== saved.stage
        || new Set(saved.owned).size !== saved.stage
        || !saved.owned.every(id => EQUIPMENT.some(item => item.id === id))
        || (saved.equipped !== null && !saved.owned.includes(saved.equipped))) {
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
      owned: saved.owned, equipped: saved.equipped, rounds: saved.rounds, status
    };
  } catch {
    return createRun(fallbackSeed);
  }
}
