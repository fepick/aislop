import { ACTIONS, COMBAT } from "../config/combat-config.js";
import { COUNTER, DEFAULT_STATS, STAT_BUDGET, UNUSED_STATS } from "../config/game-config.js";

export const STAT_KEYS = Object.freeze([
  "attackSpeed", "moveSpeed", "power", "maxHealth",
  "defense", "sharpness", "luck", "insight"
]);

export const STAT_LABELS = Object.freeze({
  attackSpeed: "공격 속도",
  moveSpeed: "이동 속도",
  power: "파워",
  maxHealth: "최대 체력",
  defense: "방어",
  sharpness: "예리함",
  luck: "행운",
  insight: "간파"
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeRawStats(stats = {}) {
  return Object.fromEntries(STAT_KEYS.map(key => [
    key,
    Number.isFinite(Number(stats[key])) ? Number(stats[key]) : DEFAULT_STATS[key]
  ]));
}

export function deriveStats(rawStats) {
  const raw = normalizeRawStats(rawStats);
  return {
    maxHealth: 50 + raw.maxHealth * 5,
    attackTimingScale: clamp(1 - 0.035 * (raw.attackSpeed - 10), 0.65, 1.35),
    moveScale: clamp(1 + 0.04 * (raw.moveSpeed - 10), 0.6, 1.6),
    defenseReduction: raw.defense * COMBAT.defenseScale,
    criticalChance: COMBAT.criticalBaseChance,
    criticalMultiplier: clamp(1.25 + raw.sharpness * 0.025, 1.25, 2),
    counterChance: clamp(
      COUNTER.baseChance + raw.insight * COUNTER.insightScale,
      COUNTER.chanceMin,
      COUNTER.chanceMax
    )
  };
}

export function damageFor(baseDamage, attackerStats, defenderStats, { rope = false, critical = false } = {}) {
  const attacker = normalizeRawStats(attackerStats);
  const defender = normalizeRawStats(defenderStats);
  let damage = Math.max(
    COMBAT.minimumDamage,
    Math.floor(baseDamage + attacker.power * COMBAT.powerScale - defender.defense * COMBAT.defenseScale)
  );
  if (rope) damage += COMBAT.ropeBonusDamage;
  if (critical) damage = Math.floor(damage * deriveStats(attacker).criticalMultiplier);
  return damage;
}

export function combatPreview(attackerStats, defenderStats) {
  const derived = deriveStats(attackerStats);
  return {
    minDamage: damageFor(ACTIONS.PUSH.baseDamage, attackerStats, defenderStats),
    maxDamage: damageFor(ACTIONS.ROPE_DROP_KICK.baseDamage, attackerStats, defenderStats, {
      rope: true,
      critical: true
    }),
    criticalChance: derived.criticalChance,
    criticalMultiplier: derived.criticalMultiplier,
    maxHealth: derived.maxHealth,
    defenseReduction: derived.defenseReduction,
    counterChance: derived.counterChance
  };
}

export function combatPower(stats) {
  const raw = normalizeRawStats(stats);
  return Math.round(
    1000
    + (raw.attackSpeed - 10) * 25
    + (raw.moveSpeed - 10) * 10
    + (raw.power - 10) * 30
    + (raw.maxHealth - 10) * 25
    + (raw.defense - 10) * 20
    + (raw.sharpness - 10) * 5
    + (raw.insight - 10) * 12
  );
}

export function createAllocation(baseStats = DEFAULT_STATS, totalBudget = STAT_BUDGET) {
  const base = normalizeRawStats(baseStats);
  return { baseStats: base, currentStats: { ...base }, totalBudget, remainingBudget: totalBudget };
}

export function adjustAllocation(state, key, delta) {
  if (!STAT_KEYS.includes(key) || UNUSED_STATS.includes(key) || ![-1, 1].includes(delta)) return state;
  if (delta > 0 && state.remainingBudget <= 0) return state;
  if (delta < 0 && state.currentStats[key] <= state.baseStats[key]) return state;
  return {
    ...state,
    currentStats: { ...state.currentStats, [key]: state.currentStats[key] + delta },
    remainingBudget: state.remainingBudget - delta
  };
}

export function resetAllocation(state) {
  return {
    ...state,
    currentStats: { ...state.baseStats },
    remainingBudget: state.totalBudget
  };
}
