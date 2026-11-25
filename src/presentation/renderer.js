import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TIME_LIMIT_TICKS, WORLD } from "../config/game-config.js";
import { SPRITE_SHEET } from "../config/asset-manifest.js";
import { ArenaRenderer } from "./arena-renderer.js";
import { announcementForEvent, shakeForDamage, shakeOffset } from "./feedback.js";

const font = (size, weight = "bold") => `${weight} ${size}px "Courier New", monospace`;
const healthScale = player => Math.max(0.78, Math.min(1.42, Math.sqrt(player.derivedStats.maxHealth / 100)));
const ARENA_EFFECT_STYLE = {
  damage: ["#721d17", "−", ""],
  healing: ["#1e6e41", "+", " HP"],
  rage: ["#856000", "+", " 분노"]
};

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assets;
    this.arena = new ArenaRenderer(this.ctx);
    this.floating = [];
    this.announcements = [];
    this.shake = { strength: 0, frames: 0, totalFrames: 0 };
  }

  consume(events) {
    for (const event of events) {
      this.arena.consume(event);
      const announcement = announcementForEvent(event);
      if (announcement) this.announcements.push(announcement);
      if (event.type === "ARENA_EFFECT") {
        this.floating.push({ ...event, life: 55 });
      } else if (event.type === "HIT" || event.type === "CRITICAL" || event.type === "COUNTER") {
        this.floating.push({ ...event, life: 55 });
        const shake = shakeForDamage(event.value);
        if (shake.strength > this.shake.strength || shake.frames > this.shake.frames) {
          this.shake = {
            strength: Math.max(this.shake.strength, shake.strength),
            frames: Math.max(this.shake.frames, shake.frames),
            totalFrames: Math.max(this.shake.totalFrames, shake.frames)
          };
        }
      }
    }
    if (this.floating.length > 24) this.floating.splice(0, this.floating.length - 24);
  }

  reset() {
    this.arena.reset();
    this.floating = [];
    this.announcements = [];
    this.shake = { strength: 0, frames: 0, totalFrames: 0 };
  }

  drawBar(x, y, width, height, value, maximum, color, reverse = false) {
    const ctx = this.ctx;
    const ratio = Math.max(0, Math.min(1, value / maximum));
    ctx.fillStyle = "#090909";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#d6d0c2";
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = color;
    const fillWidth = (width - 12) * ratio;
    ctx.fillRect(reverse ? x + width - 6 - fillWidth : x + 6, y + 6, fillWidth, height - 12);
  }

  drawPortrait(player, x, mirrored, sheet) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#0a0a0a";
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 7;
    ctx.fillRect(x, 24, 132, 132);
    ctx.strokeRect(x, 24, 132, 132);
    ctx.beginPath();
    ctx.rect(x + 8, 32, 116, 116);
    ctx.clip();
    if (mirrored) {
      ctx.translate(x + 132, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    ctx.drawImage(sheet, 0, 0, SPRITE_SHEET.frameWidth, SPRITE_SHEET.frameHeight, x - 4, -9, 140, 187);
    ctx.restore();
  }

  drawHud(game, opponentSheet) {
    const ctx = this.ctx;
    const [p1, p2] = game.players;
    ctx.fillStyle = "#080808e8";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 190);
    this.drawPortrait(p1, 28, false, this.assets.wrestlerSheets.P1);
    this.drawPortrait(p2, 1760, true, opponentSheet);
    ctx.font = font(42);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(p1.name, 185, 60);
    ctx.textAlign = "right";
    ctx.fillText(p2.name, 1735, 60);
    this.drawBar(185, 76, 600, 58, p1.health, p1.derivedStats.maxHealth, p1.color);
    this.drawBar(1135, 76, 600, 58, p2.health, p2.derivedStats.maxHealth, p2.color, true);
    this.drawBar(185, 143, 420, 25, p1.rage, 100, "#f2b544");
    this.drawBar(1315, 143, 420, 25, p2.rage, 100, "#f2b544", true);
    const seconds = Math.max(0, Math.ceil((TIME_LIMIT_TICKS - game.tick) / 60));
    ctx.fillStyle = "#111";
    ctx.strokeStyle = "#e9dfc8";
    ctx.lineWidth = 6;
    ctx.fillRect(835, 26, 250, 130);
    ctx.strokeRect(835, 26, 250, 130);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = font(86);
    ctx.fillText(String(seconds).padStart(2, "0"), 960, 122);
  }

  drawPlayer(player, sheet) {
    const ctx = this.ctx;
    let pose = player.counterPoseTicks > 0
      ? "PUSH"
      : player.hitStunTicks > 0
        ? "HIT_STUN"
        : player.action?.type ?? "IDLE";
    if (player.health <= 0) pose = "KO";
    const frame = SPRITE_SHEET.frames[pose] ?? 0;
    const scale = healthScale(player);
    const drawHeight = SPRITE_SHEET.drawHeight * scale;
    const drawWidth = SPRITE_SHEET.frameWidth / SPRITE_SHEET.frameHeight * drawHeight;
    const markerWidth = 104 * scale;
    ctx.fillStyle = player.color;
    ctx.fillRect(Math.round(player.x - markerWidth / 2), WORLD.floorY + 10, markerWidth, 8);
    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.globalAlpha = player.hitStunTicks > 0 && player.hitStunTicks % 4 < 2 ? 0.58 : 1;
    if (player.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(
      sheet,
      frame * SPRITE_SHEET.frameWidth, 0, SPRITE_SHEET.frameWidth, SPRITE_SHEET.frameHeight,
      -drawWidth * SPRITE_SHEET.pivotX, -drawHeight * SPRITE_SHEET.pivotY,
      drawWidth, drawHeight
    );
    ctx.restore();
  }

  drawFloating() {
    const ctx = this.ctx;
    for (const item of this.floating) {
      const progress = 1 - item.life / 55;
      ctx.globalAlpha = item.life / 55;
      ctx.textAlign = "center";
      ctx.font = font(item.type === "CRITICAL" || item.type === "COUNTER" ? 44 : 36);
      ctx.fillStyle = item.type === "COUNTER" ? "#258cff" : item.type === "CRITICAL" ? "#ff3030" : "#111";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      const y = item.position.y - progress * 110;
      let text = String(item.value);
      const arenaEffect = ARENA_EFFECT_STYLE[item.effect];
      if (arenaEffect) {
        const [color, sign, unit] = arenaEffect;
        ctx.fillStyle = color;
        ctx.font = 'bold 31px "Malgun Gothic", sans-serif';
        text = `${sign}${item.value}${unit}`;
      }
      ctx.strokeText(text, item.position.x, y);
      ctx.fillText(text, item.position.x, y);
      if (item.type === "CRITICAL") {
        ctx.font = font(22);
        ctx.fillText("CRITICAL", item.position.x, y - 42);
      }
      if (item.type === "COUNTER") {
        ctx.font = font(22);
        ctx.fillText("COUNTER", item.position.x, y - 42);
      }
      item.life -= 1;
    }
    ctx.globalAlpha = 1;
    this.floating = this.floating.filter(item => item.life > 0);
  }

  drawAnnouncements(game) {
    if (game.status !== "RUNNING") {
      this.announcements = [];
      return;
    }
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = font(38);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#e62b2b";
    for (const item of this.announcements) {
      const player = game.players.find(candidate => candidate.id === item.actorId);
      if (!player) continue;
      const halfWidth = ctx.measureText(item.text).width / 2;
      const x = Math.max(halfWidth + 20, Math.min(LOGICAL_WIDTH - halfWidth - 20, player.x));
      const y = Math.max(235, player.y - 345 * healthScale(player));
      ctx.strokeText(item.text, x, y);
      ctx.fillText(item.text, x, y);
      item.life -= 1;
    }
    this.announcements = this.announcements.filter(item => item.life > 0);
  }

  render(game) {
    const ctx = this.ctx;
    const opponentSheet = this.assets.opponentSheets[game.arena?.id] ?? this.assets.wrestlerSheets.P2;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const offset = shakeOffset(this.shake);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 190, LOGICAL_WIDTH, LOGICAL_HEIGHT - 190);
    ctx.clip();
    ctx.translate(offset.x, offset.y);
    if (game.arena) {
      this.arena.draw(game.arena.id, game.ring, game.tick);
    } else {
      ctx.drawImage(this.assets.arena, 0, 0, 480, 270, -20, -20, LOGICAL_WIDTH + 40, LOGICAL_HEIGHT + 40);
    }
    this.drawPlayer(game.players[0], this.assets.wrestlerSheets.P1);
    this.drawPlayer(game.players[1], opponentSheet);
    if (game.arena) this.arena.drawProps(game.arena.id, game.tick);
    ctx.restore();
    this.drawHud(game, opponentSheet);
    this.drawFloating();
    this.drawAnnouncements(game);
    if (game.arena) this.arena.drawSignal(game.tick);
    this.shake.frames = Math.max(0, this.shake.frames - 1);
    if (this.shake.frames === 0) this.shake = { strength: 0, frames: 0, totalFrames: 0 };
  }
}
