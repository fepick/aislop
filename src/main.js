import {
  CAMPAIGN_SAVE_KEY,
  STAGES
} from "./config/campaign-config.js";
import { ARENA_EVENTS } from "./config/arena-events.js";
import { EQUIPMENT, RARITIES } from "./config/equipment.js";
import { FIXED_DT, MAX_STEPS_PER_RENDER, UNUSED_STATS } from "./config/game-config.js";
import {
  availableRewards,
  claimReward,
  createRun,
  effectiveStats,
  equipmentFor,
  recordRound,
  restoreRun,
  roundConfig,
  roundScore,
  stageFor
} from "./campaign/campaign.js";
import { Game } from "./core/game.js";
import {
  STAT_KEYS,
  STAT_LABELS,
  adjustAllocation,
  combatPower,
  combatPreview,
  normalizeRawStats,
  resetAllocation
} from "./core/stat-rules.js";
import { loadAssets } from "./presentation/asset-loader.js";
import { AudioManager } from "./presentation/audio-manager.js";
import { connectLab } from "./presentation/lab.js";
import { Renderer } from "./presentation/renderer.js";

const select = id => document.getElementById(id);
const frameElement = select("experience-frame");
const screens = Object.fromEntries(["setup", "battle", "reward", "ending"]
  .map(view => [view, select(`${view}-screen`)]));
const beginButton = select("begin-battle-button");
const resetButton = select("reset-stats-button");
const statControls = select("stat-controls");
const loadoutList = select("loadout-list");
const rewardList = select("reward-list");
const arenaAnnouncement = select("arena-announcement");
const resultOverlay = select("battle-overlay");
const resultAction = select("result-action");
const battleControls = select("battle-controls");
const pauseButton = select("pause-button");
const speedButton = select("speed-button");
const restartButton = select("restart-button");
const skipButton = select("skip-button");
const exitExhibitionButton = select("exit-exhibition-button");
const soundButton = select("sound-button");
const bootError = select("boot-error");

let storageFailed = false;
let run = restoreRun(readSave(), newSeed());
let game;
let renderer;
let audio;
let match;
let roundFinished = false;
let paused = false;
let speed = 1;
let previousTimestamp = null;
let accumulator = 0;

const lab = connectLab({
  getStats: () => run.allocation.currentStats,
  startExhibition: config => {
    if (!renderer || match) return false;
    startMatch({ config, stage: STAGES[0], exhibition: true });
    return true;
  }
});

const statRows = STAT_KEYS.filter(key => !UNUSED_STATS.includes(key)).map(key => {
  const label = STAT_LABELS[key];
  const row = document.createElement("div");
  row.className = "stat-row";
  row.innerHTML = `
    <span class="stat-label">${label}</span>
    <button data-stat="${key}" data-delta="-1" aria-label="${label} 감소">−</button>
    <strong class="stat-value"></strong>
    <button data-stat="${key}" data-delta="1" aria-label="${label} 증가">+</button>`;
  statControls.append(row);
  const [decrease, increase] = row.querySelectorAll("button");
  return { key, decrease, increase, value: row.querySelector(".stat-value") };
});

function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function readSave() {
  try {
    return localStorage.getItem(CAMPAIGN_SAVE_KEY);
  } catch {
    storageFailed = true;
    return null;
  }
}

function saveRun() {
  try {
    localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(run));
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  renderSeed();
}

function renderSeed() {
  select("run-seed").textContent = `시드 ${run.seed}${storageFailed ? " · 자동 저장 불가" : ""}`;
}

function setView(view) {
  frameElement.dataset.view = view;
  for (const [name, screen] of Object.entries(screens)) {
    screen.hidden = name !== view;
    screen.inert = screen.hidden;
  }
  battleControls.hidden = view !== "battle";
}

function renderPath() {
  select("stage-path").innerHTML = STAGES.map((stage, index) => {
    const cleared = index < run.stage || (index === run.stage && ["reward", "champion"].includes(run.status));
    return `
      <li class="stage-step${cleared ? " cleared" : ""}" ${index === run.stage ? 'aria-current="step"' : ""}>
        <span class="step-index" ${cleared ? 'aria-label="승리"' : 'aria-hidden="true"'}>${cleared ? "✓" : index + 1}</span>
        <div><strong>${stage.venue}</strong><small>${stage.name}</small></div>
      </li>`;
  }).join("");
}

function renderTraining() {
  const { allocation, status } = run;
  const allowed = status === "ready";
  const stats = effectiveStats(run);
  select("stat-budget").textContent = allocation.remainingBudget;
  resetButton.disabled = !allowed || allocation.remainingBudget === allocation.totalBudget;
  for (const { key, value, decrease, increase } of statRows) {
    const current = allocation.currentStats[key];
    value.textContent = stats[key];
    value.classList.toggle("boosted", stats[key] > current);
    value.classList.toggle("reduced", stats[key] < current);
    decrease.disabled = !allowed || current <= allocation.baseStats[key];
    increase.disabled = !allowed || allocation.remainingBudget === 0;
  }

  const preview = combatPreview(stats, stageFor(run).stats);
  const percent = rate => `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
  select("preview-line").textContent = allowed
    ? `체력 ${preview.maxHealth} · 전투력 ${combatPower(stats)} · 회피 ${percent(preview.dodgeChance)} · 카운터 ${percent(preview.counterChance)}`
    : "시리즈 진행 중에는 훈련과 장비가 고정됩니다.";
}

function equipmentDescription(item) {
  const stats = Object.entries(item.stats ?? {})
    .map(([key, value]) => `${STAT_LABELS[key]} ${value > 0 ? "+" : "−"}${Math.abs(value)}`);
  return item.description ? [...stats, item.description].join(" · ") : stats.join(" · ");
}

function renderLoadout() {
  select("equipment-count").textContent = `${run.owned.length}/${EQUIPMENT.length} 보유`;
  const equipped = equipmentFor(run);
  select("equipment-detail").textContent = equipped ? equipmentDescription(equipped) : "";
  const items = EQUIPMENT.filter(item => run.owned.includes(item.id));
  loadoutList.innerHTML = items.length ? items.map(item => `
    <button class="quiet item-slot" data-equip="${item.id}" title="${RARITIES[item.rarity]} · ${equipmentDescription(item)}" aria-pressed="${run.equipped === item.id}"
      ${run.status === "ready" ? "" : "disabled"}>${item.name}</button>`).join("")
    : '<p class="loadout-empty">첫 스테이지를 이기면 장비를 얻습니다.</p>';
}

function renderSetup() {
  const stage = stageFor(run);
  select("stage-kicker").textContent = `${run.stage + 1} / ${STAGES.length} · ${stage.venue}`;
  select("stage-intro").textContent = stage.intro;
  const art = select("opponent-art");
  art.src = stage.art;
  select("opponent-name").textContent = stage.name;
  select("opponent-title").textContent = stage.title;
  const stats = normalizeRawStats(stage.stats);
  select("opponent-power").textContent = `전투력 ${combatPower(stats)}`;
  select("scouting-copy").textContent = stage.scouting;
  select("opponent-stats").innerHTML = ["power", "maxHealth", "attackSpeed", "moveSpeed"].map(key =>
    `<div class="opponent-stat"><span>${STAT_LABELS[key]}</span><strong>${stats[key]}</strong></div>`
  ).join("");
  beginButton.firstElementChild.textContent = run.rounds.length ? `${run.rounds.length + 1}라운드 이어서` : "경기 시작";
  renderTraining();
  renderLoadout();
}

function showCampaign(focus = false) {
  match = null;
  lab.setMatchActive(!renderer);
  renderPath();
  renderSeed();
  if (run.status === "reward") {
    rewardList.innerHTML = availableRewards(run).map(item => `
      <button class="reward-option" data-reward="${item.id}" data-rarity="${item.rarity}">
        <span class="rarity">${RARITIES[item.rarity]}</span>
        <strong>${item.name}</strong>
        <small>${equipmentDescription(item)}</small>
      </button>`).join("");
    setView("reward");
    if (focus) rewardList.querySelector("button").focus();
    return;
  }
  if (["champion", "eliminated"].includes(run.status)) {
    const won = run.status === "champion";
    select("ending-kicker").textContent = won ? "토너먼트 우승" : `${stageFor(run).venue} · 탈락`;
    select("ending-title").textContent = won ? "새로운 챔피언, 레드 코멧" : "다시 링 위로";
    select("ending-copy").textContent = won
      ? "아이언 킹을 꺾고 벨트와 상금을 거머쥐었다. 지하 체육관의 불이 다시 켜졌다."
      : "이번 도전은 여기까지. 새 토너먼트에서 다른 훈련과 장비 조합으로 다시 도전할 수 있습니다.";
    setView("ending");
    if (focus) select("new-run-button").focus();
    return;
  }
  renderSetup();
  setView("setup");
  if (focus) beginButton.focus();
}

function updateBattleControls() {
  select("battle-stage").textContent = match.exhibition ? "전투 실험실" : match.stage.venue;
  const { P1, P2 } = roundScore(run.rounds);
  select("battle-score").textContent = match.exhibition
    ? `단일 경기 · 시드 ${match.config.seed}`
    : `${match.round}라운드 · RED COMET ${P1}–${P2} ${match.stage.name} · ${match.round === 3 ? "링 수축" : "2승제"}`;
  pauseButton.disabled = roundFinished;
  pauseButton.textContent = paused ? "재개" : "일시정지";
  pauseButton.setAttribute("aria-pressed", String(paused));
  speedButton.disabled = roundFinished;
  speedButton.textContent = `${speed}×`;
  speedButton.setAttribute("aria-pressed", String(speed === 2));
  restartButton.disabled = roundFinished;
  skipButton.disabled = roundFinished;
  exitExhibitionButton.hidden = !match.exhibition || roundFinished;
}

function playStartBell(currentGame) {
  if (!audio.enabled) return;
  audio.unlock().then(() => {
    soundButton.title = "";
    if (game === currentGame && !roundFinished && match) audio.play("bell", 0.45);
  }).catch(() => {
    soundButton.title = "사운드를 다시 켜거나 다음 경기에서 재시도할 수 있습니다.";
  });
}

function startMatch(options) {
  match = options;
  game = new Game({ ...match.config, mode: "spectator" });
  renderer.reset();
  roundFinished = false;
  paused = false;
  accumulator = 0;
  previousTimestamp = null;
  resultOverlay.hidden = true;
  arenaAnnouncement.textContent = "";
  lab.setMatchActive(true, match.exhibition);
  setView("battle");
  updateBattleControls();
  renderer.render(game);
  pauseButton.focus();
  frameElement.scrollIntoView({ block: "nearest" });
  playStartBell(game);
}

function startRound() {
  const stage = stageFor(run);
  startMatch({ config: roundConfig(run), stage, round: run.rounds.length + 1, exhibition: false });
}

function finishRound() {
  if (roundFinished) return;
  roundFinished = true;
  const result = game.getResult();
  const winner = result.winner === "P1" ? "RED COMET" : match.stage.name;
  const method = { KO: "KO", DRAW: "무승부", TIMEOUT: "시간 종료 판정" }[result.resultType];
  const p1Health = Math.max(0, Math.round(result.p1.finalHealth));
  const p2Health = Math.max(0, Math.round(result.p2.finalHealth));
  select("result-kicker").textContent = match.exhibition ? "실험실 · 단일 경기" : `${match.round}라운드 종료`;
  select("result-title").textContent = result.winner === "DRAW" ? "무승부" : `${winner} 승리`;
  select("result-copy").textContent = `${method} · 남은 체력 ${p1Health} / ${p2Health}`;
  const arenaResult = select("result-arena");
  const arena = result.arena;
  const eventCount = arena ? Object.values(arena.eventCounts).reduce((sum, count) => sum + count, 0) : 0;
  arenaResult.hidden = eventCount === 0;
  if (eventCount > 0) {
    const { P1, P2 } = arena.effects;
    const healthEffect = (P1.damage || P2.damage || P1.healing || P2.healing)
      ? ` · 피해 ${P1.damage}/${P2.damage} · 회복 ${P1.healing}/${P2.healing}` : "";
    arenaResult.textContent = `경기장 이벤트 ${eventCount}회${healthEffect}`;
  }

  if (match.exhibition) {
    lab.finishExhibition(result);
    resultAction.textContent = "캠페인으로";
  } else {
    run = recordRound(run, result.winner);
    saveRun();
    renderPath();
    resultAction.textContent = {
      between: "다음 라운드", reward: "장비 보상 선택", champion: "챔피언 등극", eliminated: "토너먼트 결과"
    }[run.status];
  }
  const focusWasInBattle = screens.battle.contains(document.activeElement)
    || battleControls.contains(document.activeElement);
  updateBattleControls();
  resultOverlay.hidden = false;
  if (focusWasInBattle) resultAction.focus();
  audio.play("bell", 0.5);
}

function renderFrame(timestamp) {
  const elapsed = previousTimestamp === null ? 0 : Math.min((timestamp - previousTimestamp) / 1000, 0.25);
  previousTimestamp = timestamp;
  if (match && !roundFinished && !paused) {
    accumulator += elapsed * speed;
    let steps = 0;
    const stepLimit = MAX_STEPS_PER_RENDER * speed;
    while (game.status === "RUNNING" && accumulator >= FIXED_DT && steps < stepLimit) {
      const events = game.step();
      renderer.consume(events);
      audio.consume(events);
      const announcement = events.find(event => event.type === "ARENA_EVENT");
      if (announcement) {
        const { name, detail } = ARENA_EVENTS[announcement.kind];
        arenaAnnouncement.textContent = `${name} · ${detail}`;
      }
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === stepLimit) accumulator = Math.min(accumulator, FIXED_DT);
    renderer.render(game);
    if (game.status === "FINISHED") finishRound();
  }
  requestAnimationFrame(renderFrame);
}

statControls.addEventListener("click", event => {
  const button = event.target.closest("[data-stat]");
  if (!button || run.status !== "ready") return;
  const allocation = adjustAllocation(run.allocation, button.dataset.stat, Number(button.dataset.delta));
  run = { ...run, allocation };
  saveRun();
  renderTraining();
  if (button.disabled) {
    const row = statRows.find(candidate => candidate.key === button.dataset.stat);
    (row.decrease.disabled ? row.increase : row.decrease).focus();
  }
});
resetButton.addEventListener("click", () => {
  run = { ...run, allocation: resetAllocation(run.allocation) };
  saveRun();
  renderTraining();
  statRows[0].increase.focus();
});
loadoutList.addEventListener("click", event => {
  const button = event.target.closest("[data-equip]");
  if (!button || run.status !== "ready" || !run.owned.includes(button.dataset.equip)) return;
  run = { ...run, equipped: run.equipped === button.dataset.equip ? null : button.dataset.equip };
  saveRun();
  renderTraining();
  renderLoadout();
  loadoutList.querySelector(`[data-equip="${button.dataset.equip}"]`).focus();
});
rewardList.addEventListener("click", event => {
  const button = event.target.closest("[data-reward]");
  if (!button) return;
  run = claimReward(run, button.dataset.reward);
  saveRun();
  showCampaign(true);
});
select("new-run-button").addEventListener("click", () => {
  run = createRun(newSeed());
  saveRun();
  showCampaign(true);
});
beginButton.addEventListener("click", startRound);
resultAction.addEventListener("click", () => {
  if (!match.exhibition && run.status === "between") startRound();
  else showCampaign(true);
});
pauseButton.addEventListener("click", () => {
  paused = !paused;
  previousTimestamp = null;
  updateBattleControls();
});
speedButton.addEventListener("click", () => {
  speed = speed === 1 ? 2 : 1;
  accumulator = 0;
  updateBattleControls();
});
restartButton.addEventListener("click", () => startMatch(match));
skipButton.addEventListener("click", () => {
  renderer.reset();
  while (game.status === "RUNNING") game.step();
  renderer.render(game);
  finishRound();
});
exitExhibitionButton.addEventListener("click", () => {
  lab.leaveExhibition();
  showCampaign(true);
});
soundButton.addEventListener("click", () => {
  if (!audio) return;
  audio.setEnabled(!audio.enabled);
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.textContent = audio.enabled ? "사운드 켜짐" : "사운드 꺼짐";
  if (audio.enabled) audio.unlock().then(() => { soundButton.title = ""; })
    .catch(() => { soundButton.title = "사운드를 불러오지 못했습니다."; });
});
document.addEventListener("keydown", event => {
  if (!match || roundFinished || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (event.key.toLowerCase() === "r") startMatch(match);
});

saveRun();
showCampaign();
try {
  const assets = await loadAssets();
  renderer = new Renderer(select("game-canvas"), assets);
  audio = new AudioManager(assets.sounds);
  beginButton.disabled = false;
  lab.setMatchActive(false);
  requestAnimationFrame(renderFrame);
} catch (error) {
  bootError.hidden = false;
  bootError.textContent = error.message;
}
