import {
  AI_PROFILE_VERSION,
  DEFAULT_STATS,
  FIXED_DT,
  MAX_STEPS_PER_RENDER,
  PLAYER_CONFIGS,
  RULES_VERSION,
  STAT_BUDGET,
  STAT_RULES_VERSION,
  UNUSED_STATS
} from "./config/game-config.js";
import { Game } from "./core/game.js";
import { normalizeSeed } from "./core/rng.js";
import {
  STAT_KEYS,
  STAT_LABELS,
  adjustAllocation,
  combatPower,
  combatPreview,
  createAllocation,
  resetAllocation
} from "./core/stat-rules.js";
import { loadAssets } from "./presentation/asset-loader.js";
import { AudioManager } from "./presentation/audio-manager.js";
import { Renderer } from "./presentation/renderer.js";
import { BatchRunner } from "./simulation/simulation-runner.js";

const canvas = document.querySelector("#game-canvas");
const seedInput = document.querySelector("#seed-input");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const restartButton = document.querySelector("#restart-button");
const cancelButton = document.querySelector("#cancel-button");
const downloadButton = document.querySelector("#download-button");
const progressBar = document.querySelector("#progress-bar");
const progressLabel = document.querySelector("#progress-label");
const resultSummary = document.querySelector("#result-summary");
const singleResult = document.querySelector("#single-result");
const setupScreen = document.querySelector("#setup-screen");
const battleScreen = document.querySelector("#battle-screen");
const experienceFrame = document.querySelector("#experience-frame");
const battleOnlyElements = document.querySelectorAll(".battle-only");
const activeSeedElement = document.querySelector("#active-seed");
const statBudget = document.querySelector("#stat-budget");
const statControls = document.querySelector("#stat-controls");
const combatPreviewElement = document.querySelector("#combat-preview");
const opponentDescription = document.querySelector("#opponent-description");
const opponentStatsElement = document.querySelector("#opponent-stats");
const playerPower = document.querySelector("#player-power");
const opponentPower = document.querySelector("#opponent-power");
const resetStatsButton = document.querySelector("#reset-stats-button");
const beginBattleButton = document.querySelector("#begin-battle-button");
const backToSetupButton = document.querySelector("#back-to-setup-button");

let game;
let renderer;
let audio;
let paused = true;
let previousTimestamp = 0;
let accumulator = 0;
let lastBatchResult = null;
let activeRunner = null;
let activeMatchConfig = null;
let lastSpectatorResult = null;
let pendingSingleResult = null;
let viewTransitionTimer = null;
let viewTransitionToken = 0;
let allocation = createAllocation(DEFAULT_STATS, STAT_BUDGET);
let battleStats = {
  p1: { ...allocation.currentStats },
  p2: { ...PLAYER_CONFIGS[1].stats }
};

startButton.disabled = true;
beginBattleButton.disabled = true;

const seed = () => normalizeSeed(seedInput.value);

const cloneStats = stats => Object.freeze({ ...stats });

function snapshotMatchConfig() {
  return Object.freeze({
    seed: seed(),
    p1Stats: cloneStats(battleStats.p1),
    p2Stats: cloneStats(battleStats.p2),
    rulesVersion: RULES_VERSION,
    statRulesVersion: STAT_RULES_VERSION,
    aiProfileVersion: AI_PROFILE_VERSION
  });
}

function setLayerAccessibility(layer, active) {
  layer.setAttribute("aria-hidden", String(!active));
  layer.inert = !active;
}

function setView(view, animate = true) {
  const setup = view === "setup";
  const target = setup ? setupScreen : battleScreen;
  const other = setup ? battleScreen : setupScreen;
  const token = ++viewTransitionToken;
  if (viewTransitionTimer !== null) {
    clearTimeout(viewTransitionTimer);
    viewTransitionTimer = null;
  }
  experienceFrame.dataset.view = view;
  battleOnlyElements.forEach(element => { element.hidden = setup; });
  target.hidden = false;
  setLayerAccessibility(target, true);
  setLayerAccessibility(other, false);

  const finish = () => {
    if (token !== viewTransitionToken) return;
    target.dataset.active = "true";
    delete other.dataset.active;
    other.hidden = true;
    viewTransitionTimer = null;
  };
  if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }

  requestAnimationFrame(() => {
    if (token !== viewTransitionToken) return;
    target.dataset.active = "true";
    delete other.dataset.active;
    viewTransitionTimer = setTimeout(finish, 180);
  });
}

function createSpectatorGame(start = true) {
  activeMatchConfig = snapshotMatchConfig();
  lastSpectatorResult = null;
  pendingSingleResult = null;
  game = new Game({
    seed: activeMatchConfig.seed,
    mode: "spectator",
    p1Stats: activeMatchConfig.p1Stats,
    p2Stats: activeMatchConfig.p2Stats
  });
  activeSeedElement.textContent = activeMatchConfig.seed;
  seedInput.disabled = start;
  renderer?.reset();
  paused = !start;
  accumulator = 0;
  previousTimestamp = 0;
}

const formatPercent = value => `${(value * 100).toFixed(0)}%`;

function renderSetup() {
  statBudget.textContent = allocation.remainingBudget;
  statControls.innerHTML = STAT_KEYS.map(key => {
    const unused = UNUSED_STATS.includes(key);
    const canDecrease = !unused && allocation.currentStats[key] > allocation.baseStats[key];
    const canIncrease = !unused && allocation.remainingBudget > 0;
    return `
      <div class="stat-row${unused ? " stat-unused" : ""}">
        <span>${STAT_LABELS[key]}${unused ? "<small>현재 버전 미적용</small>" : ""}</span>
        <button class="decrease" data-stat="${key}" data-delta="-1" ${canDecrease ? "" : "disabled"} aria-label="${STAT_LABELS[key]} 감소">−</button>
        <strong class="stat-value">${allocation.currentStats[key]}</strong>
        <button class="increase" data-stat="${key}" data-delta="1" ${canIncrease ? "" : "disabled"} aria-label="${STAT_LABELS[key]} 증가">＋</button>
      </div>
    `;
  }).join("");

  const preview = combatPreview(allocation.currentStats, PLAYER_CONFIGS[1].stats);
  const previewItems = [
    ["최소 데미지", preview.minDamage],
    ["최대 데미지", preview.maxDamage],
    ["치명타 확률", formatPercent(preview.criticalChance)],
    ["치명타 배율", `${preview.criticalMultiplier.toFixed(2)}×`],
    ["체력", preview.maxHealth],
    ["방어 보정", `−${preview.defenseReduction.toFixed(2)}`],
    ["카운터 확률", formatPercent(preview.counterChance)],
    ["회피 확률", formatPercent(preview.dodgeChance)]
  ];
  combatPreviewElement.innerHTML = previewItems.map(([label, value]) =>
    `<div class="preview-item"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");

  opponentDescription.textContent = PLAYER_CONFIGS[1].description;
  const opponent = PLAYER_CONFIGS[1].stats;
  opponentStatsElement.innerHTML = [
    ["POWER", opponent.power],
    ["DEFENSE", opponent.defense],
    ["SPEED", opponent.attackSpeed],
    ["MOVE", opponent.moveSpeed]
  ].map(([label, value]) =>
    `<div class="opponent-stat"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");
  playerPower.textContent = combatPower(allocation.currentStats);
  opponentPower.textContent = combatPower(opponent);
}

function showSetup() {
  paused = true;
  activeRunner?.cancel();
  seedInput.disabled = false;
  setView("setup");
  renderSetup();
}

function beginBattle() {
  battleStats = {
    p1: { ...allocation.currentStats },
    p2: { ...PLAYER_CONFIGS[1].stats }
  };
  setView("battle");
  prepareAndRun(() => createSpectatorGame());
}

async function ensureAudio() {
  if (!audio) return false;
  try {
    await audio.unlock();
    startButton.textContent = "관전 시작";
    return true;
  } catch (error) {
    progressLabel.textContent = `오디오 경고: ${error.message} · 다시 누르면 소리를 재시도합니다.`;
    startButton.textContent = "소리 재시도 및 관전 시작";
    return false;
  }
}

async function prepareAndRun(action) {
  startButton.disabled = true;
  const originalLabel = startButton.textContent;
  startButton.textContent = "사운드 준비 중…";
  await ensureAudio();
  startButton.disabled = false;
  if (startButton.textContent === "사운드 준비 중…") startButton.textContent = originalLabel;
  action();
}

function frame(timestamp) {
  if (!previousTimestamp) previousTimestamp = timestamp;
  const elapsed = Math.min((timestamp - previousTimestamp) / 1000, 0.25);
  previousTimestamp = timestamp;
  if (!paused && game?.status === "RUNNING") {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_RENDER) {
      const events = game.step();
      renderer.consume(events);
      audio.consume(events);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_RENDER) accumulator = Math.min(accumulator, FIXED_DT);
  }
  if (game?.status === "FINISHED" && !lastSpectatorResult) {
    lastSpectatorResult = game.getResult();
    seedInput.disabled = false;
    if (pendingSingleResult) showComparison(lastSpectatorResult, pendingSingleResult);
  }
  if (game && renderer) renderer.render(game);
  requestAnimationFrame(frame);
}

function metric(label, value) {
  return `<div class="metric">${label}<strong>${value}</strong></div>`;
}

function renderBatch(result) {
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

function showComparison(spectatorResult, simulationResult) {
  const difference = firstDifference(
    canonicalResult(spectatorResult),
    canonicalResult(simulationResult)
  );
  if (!difference) {
    progressLabel.textContent = `관전 결과와 일치 · seed ${activeMatchConfig.seed}`;
    return;
  }
  progressLabel.textContent =
    `관전 결과 불일치 · seed ${activeMatchConfig.seed} · rules ${activeMatchConfig.rulesVersion}`
    + ` · stats ${JSON.stringify({ p1: activeMatchConfig.p1Stats, p2: activeMatchConfig.p2Stats })}`
    + ` · ${difference}`;
}

function renderSingleCounterMetrics(match) {
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

async function runBatch(count) {
  document.querySelectorAll("[data-count]").forEach(button => { button.disabled = true; });
  cancelButton.disabled = false;
  downloadButton.disabled = true;
  progressBar.style.width = "0%";
  progressLabel.textContent = `${count}회 시뮬레이션 준비 중…`;
  activeRunner = new BatchRunner();
  const batchConfig = count === 1 && activeMatchConfig
    ? activeMatchConfig
    : snapshotMatchConfig();
  const started = performance.now();
  try {
    lastBatchResult = await activeRunner.run({
      count,
      baseSeed: batchConfig.seed,
      p1Stats: batchConfig.p1Stats,
      p2Stats: batchConfig.p2Stats,
      onProgress: (done, total) => {
        const progress = done / total;
        progressBar.style.width = `${progress * 100}%`;
        progressLabel.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} 경기`;
      }
    });
    renderBatch(lastBatchResult);
    if (count === 1) {
      pendingSingleResult = lastBatchResult.singleMatch;
      renderSingleCounterMetrics(pendingSingleResult);
    }
    const elapsed = ((performance.now() - started) / 1000).toFixed(2);
    progressLabel.textContent = `${lastBatchResult.status} · ${lastBatchResult.completedMatches}경기 · ${elapsed}초`;
    if (count === 1 && lastSpectatorResult) {
      showComparison(lastSpectatorResult, pendingSingleResult);
    } else if (count === 1) {
      progressLabel.textContent += " · 관전 종료 후 자동 비교";
    }
    downloadButton.disabled = false;
  } catch (error) {
    progressLabel.textContent = `실패: ${error.message}`;
  } finally {
    document.querySelectorAll("[data-count]").forEach(button => { button.disabled = false; });
    cancelButton.disabled = true;
    activeRunner = null;
  }
}

startButton.addEventListener("click", () => prepareAndRun(() => createSpectatorGame()));
pauseButton.addEventListener("click", () => { paused = true; });
resumeButton.addEventListener("click", () => {
  if (game?.status === "RUNNING") prepareAndRun(() => { paused = false; });
});
restartButton.addEventListener("click", () => prepareAndRun(() => createSpectatorGame()));
document.addEventListener("keydown", event => {
  if (experienceFrame.dataset.view === "battle" && event.key.toLowerCase() === "r" && !event.repeat) {
    prepareAndRun(() => createSpectatorGame());
  }
});
document.querySelectorAll("[data-count]").forEach(button => {
  button.addEventListener("click", () => runBatch(Number(button.dataset.count)));
});
cancelButton.addEventListener("click", () => activeRunner?.cancel());
downloadButton.addEventListener("click", () => {
  if (!lastBatchResult) return;
  const blob = new Blob([JSON.stringify(lastBatchResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aislop-results-${lastBatchResult.baseSeed}-${lastBatchResult.completedMatches}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
statControls.addEventListener("click", event => {
  const button = event.target.closest("[data-stat]");
  if (!button) return;
  allocation = adjustAllocation(allocation, button.dataset.stat, Number(button.dataset.delta));
  renderSetup();
});
resetStatsButton.addEventListener("click", () => {
  allocation = resetAllocation(allocation);
  renderSetup();
});
beginBattleButton.addEventListener("click", beginBattle);
backToSetupButton.addEventListener("click", showSetup);

try {
  const assets = await loadAssets();
  renderer = new Renderer(canvas, assets);
  audio = new AudioManager(assets.sounds);
  startButton.disabled = false;
  beginBattleButton.disabled = false;
  createSpectatorGame(false);
  setView("setup", false);
  renderSetup();
  requestAnimationFrame(frame);
} catch (error) {
  progressLabel.textContent = error.message;
}
