const ratio = (value, total) => total > 0 ? value / total : 0;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function aggregateResults(results) {
  const p1Wins = results.filter(result => result.winner === "P1").length;
  const p2Wins = results.filter(result => result.winner === "P2").length;
  const draws = results.filter(result => result.winner === "DRAW").length;
  const koCount = results.filter(result => result.resultType === "KO").length;
  const timeoutCount = results.filter(result => result.resultType === "TIMEOUT").length;
  const durations = results.map(result => result.elapsedSeconds).sort((a, b) => a - b);
  const total = results.length;
  const sum = (side, field) => results.reduce((value, result) => value + result[side][field], 0);
  const sumAction = (side, field, action) =>
    results.reduce((value, result) => value + result[side][field][action], 0);
  const actions = ["KICK", "PUSH", "DROP_KICK", "ROPE_DROP_KICK"];
  const actionMetrics = side => Object.fromEntries(actions.map(action => [
    action,
    {
      attempts: sumAction(side, "actionAttempts", action),
      hits: sumAction(side, "actionHits", action),
      hitRate: ratio(
        sumAction(side, "actionHits", action),
        sumAction(side, "actionAttempts", action)
      )
    }
  ]));
  return {
    totalMatches: total,
    p1Wins,
    p2Wins,
    draws,
    p1WinRate: ratio(p1Wins, total),
    p2WinRate: ratio(p2Wins, total),
    drawRate: ratio(draws, total),
    koRate: ratio(koCount, total),
    timeoutRate: ratio(timeoutCount, total),
    averageMatchDuration: average(durations),
    medianMatchDuration: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
    minMatchDuration: durations[0] ?? 0,
    maxMatchDuration: durations.at(-1) ?? 0,
    averageDamageDealtByP1: ratio(sum("p1", "totalDamageDealt"), total),
    averageDamageDealtByP2: ratio(sum("p2", "totalDamageDealt"), total),
    averageCriticalHitsByP1: ratio(sum("p1", "criticalHits"), total),
    averageCriticalHitsByP2: ratio(sum("p2", "criticalHits"), total),
    averageRopeDropkickHitsByP1: ratio(sum("p1", "ropeDropkickHits"), total),
    averageRopeDropkickHitsByP2: ratio(sum("p2", "ropeDropkickHits"), total),
    averageCountersByP1: ratio(sum("p1", "countersSucceeded"), total),
    averageCountersByP2: ratio(sum("p2", "countersSucceeded"), total),
    p1CounterSuccessRate: ratio(sum("p1", "countersSucceeded"), sum("p1", "countersAttempted")),
    p2CounterSuccessRate: ratio(sum("p2", "countersSucceeded"), sum("p2", "countersAttempted")),
    p1AttackHitRate: ratio(sum("p1", "attacksHit"), sum("p1", "attacksAttempted")),
    p2AttackHitRate: ratio(sum("p2", "attacksHit"), sum("p2", "attacksAttempted")),
    actionMetrics: {
      p1: actionMetrics("p1"),
      p2: actionMetrics("p2")
    }
  };
}
