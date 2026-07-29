import { ACTIONS, COMBAT } from "../config/combat-config.js";
import { COUNTER, WORLD } from "../config/game-config.js";

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalDamage(baseDamage, attacker, defender) {
  return Math.max(
    COMBAT.minimumDamage,
    Math.floor(baseDamage + attacker.stats.power * COMBAT.powerScale - defender.stats.defense * COMBAT.defenseScale)
  );
}

export function criticalChance(attacker) {
  return clamp(
    COMBAT.criticalBaseChance
      + attacker.stats.sharpness * COMBAT.criticalSharpnessScale
      + attacker.stats.luck * COMBAT.criticalLuckScale,
    COMBAT.criticalChanceMin,
    COMBAT.criticalChanceMax
  );
}

export function counterChance(defender) {
  return clamp(
    COUNTER.baseChance + defender.stats.insight * COUNTER.insightScale,
    COUNTER.chanceMin,
    COUNTER.chanceMax
  );
}

export function canHit(attacker, defender, actionConfig) {
  const signedDistance = (defender.x - attacker.x) * attacker.facing;
  if (signedDistance < 0) return false;
  if (Math.abs(defender.x - attacker.x) <= actionConfig.range) return true;
  const previousDistance = (defender.previousX - attacker.previousX) * attacker.facing;
  return previousDistance > actionConfig.range && signedDistance <= actionConfig.range;
}

export function buildHit(attacker, defender, actionType, rng) {
  const config = ACTIONS[actionType];
  const critical = rng.next() < criticalChance(attacker);
  let damage = normalDamage(config.baseDamage, attacker, defender);
  if (actionType === "ROPE_DROP_KICK") damage += COMBAT.ropeBonusDamage;
  if (critical) damage = Math.floor(damage * COMBAT.criticalMultiplier);
  return { attacker, defender, actionType, damage, critical, knockback: config.knockback };
}

const applyDamage = ({ attacker, defender, actionType, damage, critical, knockback }, emit, eventType) => {
  defender.health = Math.max(0, defender.health - damage);
  defender.hitStunTicks = COMBAT.hitStunTicks;
  defender.velocityX = attacker.facing * knockback;
  defender.action = null;
  attacker.metrics.totalDamageDealt += damage;
  defender.metrics.totalDamageTaken += damage;
  emit(eventType, attacker.id, defender.id, actionType, damage, defender.x);
};

export function applyHits(hits, emit, counterRng) {
  for (const hit of hits) {
    const { attacker, defender, actionType, damage, critical, knockback } = hit;
    defender.metrics.countersAttempted += 1;
    if (counterRng[defender.id].next() < counterChance(defender)) {
      const counterDamage = normalDamage(ACTIONS.PUSH.baseDamage, defender, attacker);
      defender.metrics.countersSucceeded += 1;
      defender.metrics.counterDamageDealt += counterDamage;
      defender.counterPoseTicks = COUNTER.poseTicks;
      defender.action = null;
      applyDamage({
        attacker: defender,
        defender: attacker,
        actionType: "PUSH",
        damage: counterDamage,
        critical: false,
        knockback: ACTIONS.PUSH.knockback
      }, emit, "COUNTER");
      continue;
    }
    applyDamage(hit, emit, critical ? "CRITICAL" : "HIT");
    attacker.metrics.attacksHit += 1;
    attacker.metrics.actionHits[actionType] += 1;
    if (critical) attacker.metrics.criticalHits += 1;
    if (actionType === "ROPE_DROP_KICK") attacker.metrics.ropeDropkickHits += 1;
    attacker.rage = clamp(
      attacker.rage + (critical ? COMBAT.rage.criticalHit : COMBAT.rage.normalHit),
      0,
      COMBAT.rage.maximum
    );
    defender.rage = clamp(
      defender.rage + (critical ? COMBAT.rage.criticalTaken : COMBAT.rage.normalTaken),
      0,
      COMBAT.rage.maximum
    );
  }
}

export function resolvePlayerOverlap(p1, p2) {
  const distance = p2.x - p1.x;
  const overlap = WORLD.minSeparation - Math.abs(distance);
  if (overlap <= 0) return;
  const direction = distance >= 0 ? 1 : -1;
  const half = overlap / 2;
  p1.x = clamp(p1.x - direction * half, WORLD.ringMinX, WORLD.ringMaxX);
  p2.x = clamp(p2.x + direction * half, WORLD.ringMinX, WORLD.ringMaxX);
}
