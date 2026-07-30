import {
  AI_PROFILE_VERSION,
  DEFAULT_STATS,
  FIXED_DT,
  PLAYER_CONFIGS,
  RESULT_SCHEMA_VERSION,
  RNG_VERSION,
  RULES_VERSION,
  STAT_RULES_VERSION
} from "../config/game-config.js";
import { Game } from "../core/game.js";
import { mixSeed, normalizeSeed } from "../core/rng.js";
import { normalizeRawStats } from "../core/stat-rules.js";
import { aggregateResults } from "./results-aggregator.js";

export function runMatch({
  seed,
  matchId = 1,
  mode = "simulation",
  collectEvents = false,
  p1Stats,
  p2Stats
} = {}) {
  const game = new Game({ seed, mode, collectEvents, p1Stats, p2Stats });
  while (game.status === "RUNNING") game.step();
  return game.getResult(matchId);
}

export class BatchRunner {
  constructor() {
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  async run({ count, baseSeed, p1Stats, p2Stats, onProgress = () => {} }) {
    this.cancelled = false;
    const normalizedBaseSeed = normalizeSeed(baseSeed);
    const statsSnapshot = {
      p1: normalizeRawStats(p1Stats ?? DEFAULT_STATS),
      p2: normalizeRawStats(p2Stats ?? PLAYER_CONFIGS[1].stats)
    };
    const results = [];
    for (let index = 0; index < count; index += 1) {
      if (this.cancelled) break;
      const seed = count === 1 ? normalizedBaseSeed : mixSeed(normalizedBaseSeed, index);
      results.push(runMatch({
        seed,
        matchId: index + 1,
        p1Stats: statsSnapshot.p1,
        p2Stats: statsSnapshot.p2
      }));
      onProgress(results.length, count);
      if ((index + 1) % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const summaries = results.map(result => ({
      matchId: result.matchId,
      seed: result.seed,
      winner: result.winner,
      resultType: result.resultType,
      elapsedTicks: result.elapsedTicks,
      elapsedSeconds: result.elapsedSeconds,
      p1FinalHealth: result.p1.finalHealth,
      p2FinalHealth: result.p2.finalHealth,
      p1Damage: result.p1.totalDamageDealt,
      p2Damage: result.p2.totalDamageDealt
    }));
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      status: this.cancelled ? "cancelled" : "completed",
      requestedMatches: count,
      completedMatches: results.length,
      baseSeed: normalizedBaseSeed,
      seedDerivation: count === 1 ? "identity" : "mix32-v1",
      rngAlgorithmVersion: RNG_VERSION,
      rulesVersion: RULES_VERSION,
      statRulesVersion: STAT_RULES_VERSION,
      aiProfileVersion: AI_PROFILE_VERSION,
      fixedDt: FIXED_DT,
      statsSnapshot,
      aggregate: aggregateResults(results),
      matches: summaries,
      singleMatch: count === 1 ? results[0] : undefined
    };
  }
}
