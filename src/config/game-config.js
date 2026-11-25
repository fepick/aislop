export const RULES_VERSION = "0.6.0";
export const EQUIPMENT_RULES_VERSION = "0.7.0";
export const AI_PROFILE_VERSION = "0.2.0";
export const RESULT_SCHEMA_VERSION = "0.4.0";
export const STAT_RULES_VERSION = "1.1.0";
export const RNG_VERSION = "mulberry32-1";

export const LOGICAL_WIDTH = 1920;
export const LOGICAL_HEIGHT = 1080;
export const FIXED_DT = 1 / 60;
export const TIME_LIMIT_TICKS = 60 * 60;
export const MAX_STEPS_PER_RENDER = 5;

export const DEFAULT_STATS = Object.freeze({
  attackSpeed: 10,
  moveSpeed: 10,
  power: 10,
  maxHealth: 10,
  defense: 10,
  sharpness: 10,
  luck: 10,
  insight: 10
});
export const STAT_BUDGET = 10;
export const UNUSED_STATS = Object.freeze(["luck"]);

export const COUNTER = Object.freeze({
  baseChance: 0.05,
  insightScale: 0.01,
  chanceMin: 0.05,
  chanceMax: 0.45,
  poseTicks: 12,
  delayTicks: 18
});

export const DODGE = Object.freeze({
  pointsThreshold: 10,
  chancePerPoint: 0.005,
  chanceMax: 0.05
});

export const WORLD = Object.freeze({
  ringMinX: 300,
  ringMaxX: 1620,
  ropeZoneWidth: 106,
  ropeMinTargetDistance: 470,
  floorY: 805,
  playerHalfWidth: 62,
  playerHeight: 250,
  minSeparation: 124,
  approachSpeed: 265,
  knockbackFriction: 0.82
});

export const PLAYER_CONFIGS = Object.freeze([
  { id: "P1", name: "RED COMET", startX: 565, facing: 1, color: "#e62b2b", aiProfileId: "normal" },
  {
    id: "P2",
    name: "BLUE BULL",
    description: "강한 힘과 방어력을 앞세워 압박하는 느린 인파이터.",
    startX: 1355,
    facing: -1,
    color: "#277be0",
    aiProfileId: "normal",
    stats: Object.freeze({
      attackSpeed: 8,
      moveSpeed: 8,
      power: 12,
      maxHealth: 10,
      defense: 11,
      sharpness: 10,
      luck: 10,
      insight: 10
    })
  }
]);
