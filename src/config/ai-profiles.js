export const AI_PROFILES = Object.freeze({
  normal: Object.freeze({
    decisionIntervalMin: 12,
    decisionIntervalMax: 30,
    approachDistance: 230,
    ropeDropkickChance: 0.85,
    actionWeights: Object.freeze({ KICK: 1, PUSH: 1, DROP_KICK: 1 }),
    actionFailureRate: 0,
    rangeError: 0,
    cooldownMultiplier: 1,
    reengageBias: 1
  })
});
