import { FIXED_DT, MAX_STEPS_PER_RENDER } from "./config/game-config.js";
import { Game } from "./core/game.js";
import { normalizeSeed } from "./core/rng.js";
import { loadAssets } from "./presentation/asset-loader.js";
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

let game;
let renderer;
let paused = true;
let previousTimestamp = 0;
let accumulator = 0;
let lastBatchResult = null;
let activeRunner = null;

const seed = () => normalizeSeed(seedInput.value);

function createSpectatorGame() {
  game = new Game({ seed: seed(), mode: "spectator" });
  paused = false;
  accumulator = 0;
  previousTimestamp = 0;
}

function frame(timestamp) {
  if (!previousTimestamp) previousTimestamp = timestamp;
  const elapsed = Math.min((timestamp - previousTimestamp) / 1000, 0.25);
  previousTimestamp = timestamp;
  if (!paused && game?.status === "RUNNING") {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_RENDER) {
      renderer.consume(game.step());
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_RENDER) accumulator = Math.min(accumulator, FIXED_DT);
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
    metric("P2 평균 피해", data.averageDamageDealtByP2.toFixed(1))
  ].join("");
  singleResult.textContent = result.singleMatch ? JSON.stringify(result.singleMatch, null, 2) : "";
}

async function runBatch(count) {
  document.querySelectorAll("[data-count]").forEach(button => { button.disabled = true; });
  cancelButton.disabled = false;
  downloadButton.disabled = true;
  progressBar.style.width = "0%";
  progressLabel.textContent = `${count}회 시뮬레이션 준비 중…`;
  activeRunner = new BatchRunner();
  const started = performance.now();
  try {
    lastBatchResult = await activeRunner.run({
      count,
      baseSeed: seed(),
      onProgress: (done, total) => {
        const progress = done / total;
        progressBar.style.width = `${progress * 100}%`;
        progressLabel.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} 경기`;
      }
    });
    renderBatch(lastBatchResult);
    const elapsed = ((performance.now() - started) / 1000).toFixed(2);
    progressLabel.textContent = `${lastBatchResult.status} · ${lastBatchResult.completedMatches}경기 · ${elapsed}초`;
    downloadButton.disabled = false;
  } catch (error) {
    progressLabel.textContent = `실패: ${error.message}`;
  } finally {
    document.querySelectorAll("[data-count]").forEach(button => { button.disabled = false; });
    cancelButton.disabled = true;
    activeRunner = null;
  }
}

startButton.addEventListener("click", createSpectatorGame);
pauseButton.addEventListener("click", () => { paused = true; });
resumeButton.addEventListener("click", () => { if (game?.status === "RUNNING") paused = false; });
restartButton.addEventListener("click", createSpectatorGame);
document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "r" && !event.repeat) createSpectatorGame();
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

try {
  const assets = await loadAssets();
  renderer = new Renderer(canvas, assets);
  createSpectatorGame();
  requestAnimationFrame(frame);
} catch (error) {
  progressLabel.textContent = error.message;
}
