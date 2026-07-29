import { DEFAULT_STATS, WORLD } from "../config/game-config.js";

const actionCounters = () => ({
  KICK: 0,
  PUSH: 0,
  DROP_KICK: 0,
  ROPE_DROP_KICK: 0
});

const emptyMetrics = () => ({
  totalDamageDealt: 0,
  totalDamageTaken: 0,
  attacksAttempted: 0,
  attacksHit: 0,
  criticalHits: 0,
  ropeDropkickAttempts: 0,
  ropeDropkickHits: 0,
  countersAttempted: 0,
  countersSucceeded: 0,
  counterDamageDealt: 0,
  actionAttempts: actionCounters(),
  actionHits: actionCounters()
});

export function createPlayer(config, stats = DEFAULT_STATS) {
  const statCopy = { ...DEFAULT_STATS, ...stats };
  return {
    id: config.id,
    name: config.name,
    color: config.color,
    aiProfileId: config.aiProfileId,
    stats: statCopy,
    health: statCopy.maxHealth,
    rage: 0,
    x: config.startX,
    previousX: config.startX,
    y: WORLD.floorY,
    facing: config.facing,
    velocityX: 0,
    action: null,
    hitStunTicks: 0,
    counterPoseTicks: 0,
    decisionTicks: 1,
    cooldowns: { KICK: 0, PUSH: 0, DROP_KICK: 0, ROPE_DROP_KICK: 0 },
    metrics: emptyMetrics()
  };
}

export function isBusy(player) {
  return player.hitStunTicks > 0 || player.action !== null;
}
