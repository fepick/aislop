import { PLAYER_CONFIGS } from "../config/game-config.js";
import { normalizeSeed } from "../core/rng.js";
import { BatchRunner } from "../simulation/simulation-runner.js";

function metric(label, value) {
  return `<div class="metric">${label}<strong>${value}</strong></div>`;
}

function renderBatch(result, resultSummary, singleResult) {
  const data = result.aggregate;
  const percent = value => `${(value * 100).toFixed(1)}%`;
  resultSummary.innerHTML = [
    metric("완료 경기", data.totalMatches),
    metric("P1 승률", percent(data.p1WinRate)),
    metric("P2 승률", percent(data.p2WinRate)),
    metric("무승부", percent(data.drawRate)),
    metric("KO 비율", percent(data.koRate)),
    metric("평균 시간", `${data.averageMatchDuration.toFixed(2)}s`),
    metric("P1 평균 피해", data.averageDamageDealtByP1.toFixed(1)),
    metric("P2 평균 피해", data.averageDamageDealtByP2.toFixed(1)),
    metric("P1 평균 카운터", data.averageCountersByP1.toFixed(2)),
    metric("P2 평균 카운터", data.averageCountersByP2.toFixed(2)),
    metric("P1 카운터 성공률", percent(data.p1CounterSuccessRate)),
    metric("P2 카운터 성공률", percent(data.p2CounterSuccessRate)),
    metric("P1 평균 회피", data.averageDodgesByP1.toFixed(2)),
    metric("P2 평균 회피", data.averageDodgesByP2.toFixed(2)),
    metric("P1 회피 성공률", percent(data.p1DodgeSuccessRate)),
    metric("P2 회피 성공률", percent(data.p2DodgeSuccessRate))
  ].join("");
  singleResult.hidden = !result.singleMatch;
  singleResult.textContent = result.singleMatch ? JSON.stringify(result.singleMatch, null, 2) : "";
}

function canonicalResult({ mode, ...combatResult }) {
  return combatResult;
}

function firstDifference(left, right, path = "result") {
  if (Object.is(left, right)) return null;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return `${path}: ${JSON.stringify(left)} ≠ ${JSON.stringify(right)}`;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function comparisonText(spectatorResult, simulationResult) {
  const difference = firstDifference(
    canonicalResult(spectatorResult),
    canonicalResult(simulationResult)
  );
  if (!difference) {
    return `관전 결과와 일치 · seed ${spectatorResult.seed}`;
  }
  return `관전 결과 불일치 · seed ${spectatorResult.seed} · rules ${spectatorResult.rulesVersion}`
    + ` · stats ${JSON.stringify({ p1: spectatorResult.p1.rawStats, p2: spectatorResult.p2.rawStats })}`
    + ` · ${difference}`;
}

function renderSingleCounterMetrics(match, resultSummary) {
  const successRate = player => player.countersAttempted > 0
    ? player.countersSucceeded / player.countersAttempted
    : 0;
  resultSummary.innerHTML = [
    metric("P1 카운터 시도", match.p1.countersAttempted),
    metric("P1 카운터 성공", match.p1.countersSucceeded),
    metric("P1 카운터 성공률", `${(successRate(match.p1) * 100).toFixed(1)}%`),
    metric("P2 카운터 시도", match.p2.countersAttempted),
    metric("P2 카운터 성공", match.p2.countersSucceeded),
    metric("P2 카운터 성공률", `${(successRate(match.p2) * 100).toFixed(1)}%`),
    metric("P1 회피 시도", match.p1.dodgesAttempted),
    metric("P1 회피 성공", match.p1.dodgesSucceeded),
    metric("P1 회피 성공률", `${(
      match.p1.dodgesAttempted > 0 ? match.p1.dodgesSucceeded / match.p1.dodgesAttempted * 100 : 0
    ).toFixed(1)}%`),
    metric("P2 회피 시도", match.p2.dodgesAttempted),
    metric("P2 회피 성공", match.p2.dodgesSucceeded),
    metric("P2 회피 성공률", `${(
      match.p2.dodgesAttempted > 0 ? match.p2.dodgesSucceeded / match.p2.dodgesAttempted * 100 : 0
    ).toFixed(1)}%`)
  ].join("");
}

export function connectLab({ getStats, startExhibition }) {
  const panel = document.querySelector("#lab-panel");
  const toggle = document.querySelector("#lab-toggle");
  const seedInput = panel.querySelector("#seed-input");
  const exhibitionButton = panel.querySelector("#exhibition-button");
  const cancelButton = panel.querySelector("#cancel-button");
  const downloadButton = panel.querySelector("#download-button");
  const batchButtons = panel.querySelectorAll("[data-count]");
  const progressBar = panel.querySelector("#batch-progress");
  const progressLabel = panel.querySelector("#progress-label");
  const resultSummary = panel.querySelector("#result-summary");
  const singleResult = panel.querySelector("#single-result");
  let activeRunner;
  let lastBatch;
  let exhibitionConfig;
  let exhibitionResult;
  let comparisonResult;

  function snapshot() {
    return {
      seed: normalizeSeed(seedInput.value),
      p1Stats: { ...getStats() },
      p2Stats: PLAYER_CONFIGS[1].stats
    };
  }

  function compare() {
    if (exhibitionResult && comparisonResult) {
      progressLabel.textContent = comparisonText(exhibitionResult, comparisonResult);
    }
  }

  async function runBatch(count) {
    const config = count === 1 && exhibitionConfig ? exhibitionConfig : snapshot();
    comparisonResult = null;
    const runner = new BatchRunner();
    activeRunner = runner;
    batchButtons.forEach(button => { button.disabled = true; });
    cancelButton.disabled = false;
    downloadButton.disabled = true;
    progressBar.value = 0;
    progressLabel.textContent = `시드 ${config.seed} · ${count.toLocaleString()}회 실행 중…`;
    const started = performance.now();

    try {
      lastBatch = await runner.run({
        count,
        baseSeed: config.seed,
        p1Stats: config.p1Stats,
        p2Stats: config.p2Stats,
        onProgress: (done, total) => {
          progressBar.value = done / total;
          progressLabel.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} 경기`;
        }
      });
      renderBatch(lastBatch, resultSummary, singleResult);
      const elapsed = ((performance.now() - started) / 1000).toFixed(2);
      const status = lastBatch.status === "cancelled" ? "취소됨" : "완료";
      progressLabel.textContent = `${status} · ${lastBatch.completedMatches.toLocaleString()}경기 · ${elapsed}초`;

      if (lastBatch.singleMatch) {
        renderSingleCounterMetrics(lastBatch.singleMatch, resultSummary);
        if (config === exhibitionConfig) {
          comparisonResult = lastBatch.singleMatch;
          if (exhibitionResult) compare();
          else progressLabel.textContent += " · 관전 종료 후 자동 비교";
        }
      }
    } catch (error) {
      progressLabel.textContent = `시뮬레이션 실패 (${error.message})`;
    } finally {
      batchButtons.forEach(button => { button.disabled = false; });
      cancelButton.disabled = true;
      downloadButton.disabled = !lastBatch;
      activeRunner = null;
    }
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) seedInput.focus();
  });
  seedInput.addEventListener("input", () => {
    if (!exhibitionResult) return;
    exhibitionConfig = null;
    exhibitionResult = null;
    comparisonResult = null;
  });
  exhibitionButton.addEventListener("click", () => {
    const config = snapshot();
    if (!startExhibition(config)) return;
    exhibitionConfig = config;
    exhibitionResult = null;
    comparisonResult = null;
  });
  batchButtons.forEach(button => {
    button.addEventListener("click", () => runBatch(Number(button.dataset.count)));
  });
  cancelButton.addEventListener("click", () => activeRunner?.cancel());
  downloadButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(lastBatch, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aislop-results-${lastBatch.baseSeed}-${lastBatch.completedMatches}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  return {
    setMatchActive(active, exhibition = false) {
      exhibitionButton.disabled = active;
      seedInput.disabled = exhibition;
    },
    finishExhibition(result) {
      seedInput.disabled = false;
      exhibitionResult = result;
      compare();
    },
    leaveExhibition() {
      if (exhibitionResult) return;
      if (comparisonResult) progressLabel.textContent = "단일 경기 계산 완료";
      exhibitionConfig = null;
      comparisonResult = null;
    }
  };
}
