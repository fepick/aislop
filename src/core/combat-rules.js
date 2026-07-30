import { ACTIONS, COMBAT } from "../config/combat-config.js";
import { COUNTER, WORLD } from "../config/game-config.js";
import { damageFor } from "./stat-rules.js";

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalDamage(baseDamage, attacker, defender) {
  return damageFor(baseDamage, attacker.rawStats, defender.rawStats);
}

export function criticalChance(attacker) {
  return attacker.derivedStats.criticalChance;
}

export function counterChance(defender) {
  return defender.derivedStats.counterChance;
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
  if (critical) damage = Math.floor(damage * attacker.derivedStats.criticalMultiplier);
  return { attacker, defender, actionType, damage, critical, knockback: config.knockback };
}

const applyDamage = ({
  attacker,
  defender,
  actionType,
  damage,
  critical,
  knockback,
  knockbackDirection = attacker.facing
}, emit, eventType) => {
  defender.health = Math.max(0, defender.health - damage);
  defender.hitStunTicks = COMBAT.hitStunTicks;
  defender.velocityX = knockbackDirection * knockback;
  defender.action = null;
  attacker.metrics.totalDamageDealt += damage;
  defender.metrics.totalDamageTaken += damage;
  emit(eventType, attacker.id, defender.id, actionType, damage, defender.x);
};

export function applyHits(hits, emit, counterRng) {
  for (const hit of hits) {
    const { attacker, defender, actionType, damage, critical, knockback } = hit;
    const canCounter = actionType !== "ROPE_DROP_KICK" && defender.pendingCounter === null;
    if (canCounter) defender.metrics.countersAttempted += 1;
    if (canCounter && counterRng[defender.id].next() < counterChance(defender)) {
      const counterDamage = normalDamage(ACTIONS.PUSH.baseDamage, defender, attacker);
      defender.action = null;
      defender.pendingCounter = {
        targetId: attacker.id,
        remainingTicks: COUNTER.delayTicks,
        damage: counterDamage,
        knockback: ACTIONS.PUSH.knockback,
        knockbackDirection: defender.facing
      };
      emit("COUNTER_TRIGGERED", defender.id, attacker.id, "PUSH", 0, defender.x);
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

export function applyPendingCounter(counterer, target, pending, emit) {
  counterer.metrics.countersSucceeded += 1;
  counterer.metrics.counterDamageDealt += pending.damage;
  counterer.counterPoseTicks = COUNTER.poseTicks;
  applyDamage({
    attacker: counterer,
    defender: target,
    actionType: "PUSH",
    damage: pending.damage,
    critical: false,
    knockback: pending.knockback,
    knockbackDirection: pending.knockbackDirection
  }, emit, "COUNTER");
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
