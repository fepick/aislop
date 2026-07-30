const action = (startup, active, recovery, range, baseDamage, knockback, cooldown, moveSpeed = 0) =>
  Object.freeze({ startup, active, recovery, total: startup + active + recovery, range, baseDamage, knockback, cooldown, moveSpeed });

export const ACTION_TYPES = Object.freeze({
  IDLE: "IDLE",
  APPROACH: "APPROACH",
  KICK: "KICK",
  PUSH: "PUSH",
  DROP_KICK: "DROP_KICK",
  ROPE_DROP_KICK: "ROPE_DROP_KICK"
});

export const ATTACK_ORDER = Object.freeze(["KICK", "PUSH", "DROP_KICK"]);

export const ACTIONS = Object.freeze({
  KICK: action(10, 5, 20, 205, 7, 52, 36),
  PUSH: action(7, 5, 14, 205, 4, 88, 30),
  DROP_KICK: action(16, 6, 29, 250, 10, 105, 58, 245),
  ROPE_DROP_KICK: action(18, 25, 34, 270, 12, 170, 90, 920)
});

export const COMBAT = Object.freeze({
  criticalBaseChance: 0.12,
  powerScale: 0.6,
  defenseScale: 0.35,
  minimumDamage: 1,
  ropeBonusDamage: 22,
  hitStunTicks: 13,
  rage: Object.freeze({
    normalHit: 8,
    normalTaken: 12,
    criticalHit: 14,
    criticalTaken: 18,
    maximum: 100
  })
});
