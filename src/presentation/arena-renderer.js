import { LOGICAL_HEIGHT as HEIGHT, LOGICAL_WIDTH as WIDTH, WORLD } from "../config/game-config.js";

const THEMES = {
  "blue-bull": {
    mark: "SUBLEVEL 01", architecture: "brick", sky: "#25201c", wall: "#57372b",
    accent: "#e7aa65", crowd: ["#97604c", "#774743", "#696b6c", "#ac7f56"],
    mat: "#d3b388", seam: "#987756", apron: "#372726", ropes: ["#e66e45", "#eac69a", "#a05240"]
  },
  "neon-viper": {
    mark: "NEON CIRCUIT", architecture: "neon", sky: "#101325", wall: "#191f40",
    accent: "#70ffcb", crowd: ["#4f77a0", "#b07cab", "#50b29a", "#8278bd"],
    mat: "#99c5c2", seam: "#5a9e9b", apron: "#1b2a40", ropes: ["#73ffe3", "#e3abff", "#58b4ee"]
  },
  "velvet-phantom": {
    mark: "THE VELVET THEATRE", architecture: "curtain", sky: "#291422", wall: "#5d223c",
    accent: "#efafd9", crowd: ["#956685", "#a15164", "#86629e", "#ac835f"],
    mat: "#d5afd0", seam: "#a47c9f", apron: "#431e39", ropes: ["#e7a2de", "#f5d8c4", "#b26eb2"]
  },
  "iron-king": {
    mark: "THE IRON THRONE", architecture: "arch", sky: "#201c19", wall: "#3e3630",
    accent: "#ffe083", crowd: ["#b39151", "#807164", "#656a70", "#ae6756"],
    mat: "#d4c491", seam: "#a18d52", apron: "#302b23", ropes: ["#ffce63", "#fff0b2", "#a98545"]
  }
};
const SKIN_TONES = ["#aa7d6f", "#ad8865", "#745748", "#d09d7c"];

const polygon = (ctx, points, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [i, [x, y]] of points.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
};

function stroke(ctx, points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
}

function drawArchitecture(ctx, theme) {
  const wall = ctx.createLinearGradient(0, 190, 0, 710);
  wall.addColorStop(0, theme.sky);
  wall.addColorStop(0.65, theme.wall);
  wall.addColorStop(1, "#0d1017");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  if (theme.architecture === "brick") {
    ctx.strokeStyle = "#1f1617";
    ctx.lineWidth = 4;
    for (let y = 214; y < 586; y += 39) {
      for (let x = (y % 2 ? -57 : 0); x < WIDTH; x += 114) ctx.strokeRect(x, y, 114, 39);
    }
    for (const x of [104, 460, 1460, 1816]) {
      ctx.fillStyle = "#19171b";
      ctx.fillRect(x - 38, 245, 76, 184);
      ctx.fillStyle = theme.accent;
      ctx.fillRect(x - 21, 268, 42, 7);
    }
  } else if (theme.architecture === "neon") {
    for (const x of [90, 320, 580, 1340, 1600, 1830]) {
      stroke(ctx, [[x - 150, 309], [x, 249], [x + 150, 309]], "#2c5274", 12);
      stroke(ctx, [[x, 252], [x, 408]], theme.accent, 5);
      stroke(ctx, [[x - 85, 336], [x + 85, 336]], "#d45bea", 6);
    }
  } else if (theme.architecture === "curtain") {
    for (let x = 0; x <= WIDTH; x += 64) {
      ctx.fillStyle = x % 128 ? "#431c37" : "#732a50";
      ctx.beginPath();
      ctx.moveTo(x - 16, 190);
      ctx.quadraticCurveTo(x + 85, 377, x - 5, 585);
      ctx.lineTo(x + 52, 585);
      ctx.quadraticCurveTo(x + 125, 377, x + 42, 190);
      ctx.fill();
    }
    for (const x of [115, 435, 1485, 1805]) {
      stroke(ctx, [[x - 65, 255], [x, 291], [x + 65, 255]], "#d8978b", 8);
    }
  } else {
    for (const x of [160, 465, 1455, 1760]) {
      ctx.lineWidth = 32;
      ctx.strokeStyle = "#15171a";
      ctx.beginPath();
      ctx.moveTo(x - 108, 526);
      ctx.lineTo(x - 108, 323);
      ctx.quadraticCurveTo(x, 185, x + 108, 323);
      ctx.lineTo(x + 108, 526);
      ctx.stroke();
      stroke(ctx, [[x - 62, 305], [x, 246], [x + 62, 305]], "#aa733e", 7);
      stroke(ctx, [[x, 310], [x, 382]], theme.accent, 5);
    }
  }

  for (const [x, shift] of [[290, 210], [1630, -210]]) {
    const beam = ctx.createLinearGradient(0, 225, 0, 665);
    beam.addColorStop(0, theme.accent + "48");
    beam.addColorStop(1, theme.accent + "00");
    polygon(ctx, [[x - 13, 224], [x + 13, 224], [x + shift + 350, 665], [x + shift - 350, 665]], beam);
    ctx.fillStyle = "#201d20";
    ctx.fillRect(x - 50, 216, 100, 25);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x - 34, 232, 68, 6);
  }

  ctx.fillStyle = "#10111a";
  ctx.fillRect(657, 247, 606, 81);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(657, 247, 606, 81);
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.fillText(theme.mark, WIDTH / 2, 300, 550);

  for (let row = 0; row < 4; row++) {
    const y = 393 + row * 61;
    ctx.fillStyle = row % 2 ? "#191a21" : "#24242b";
    ctx.fillRect(0, y + 6, WIDTH, 58);
    ctx.fillStyle = "#13151b";
    ctx.fillRect(0, y + 51, WIDTH, 6);
  }
  polygon(ctx, [[0, 620], [WIDTH, 620], [WIDTH, HEIGHT], [0, HEIGHT]], "#16191f");
  ctx.restore();
}

function drawCrowd(ctx, theme, tick = 0, energy = 0) {
  for (let row = 0; row < 4; row++) {
    for (let seat = 0; seat < 35; seat++) {
      if ((seat + row * 2) % 12 === 0) continue;
      const x = 26 + seat * 55 + (row % 2) * 19;
      const y = 427 + row * 61 + (seat * 5 + row * 3) % 9;
      const jump = energy && (seat + row) % 4 !== 0
        ? Math.round(Math.max(0, Math.sin(tick * 0.23 + seat * 0.58 + row * 0.35)) * 21 * energy)
        : 0;
      const top = y - jump;
      ctx.fillStyle = theme.crowd[(seat * 3 + row) % theme.crowd.length];
      ctx.fillRect(x - 15, top - 11, 30, 23 + jump);
      if (jump > 3) {
        ctx.fillRect(x - 23, top - 25, 8, 25);
        ctx.fillRect(x + 14, top - 26, 8, 25);
      }
      ctx.fillStyle = SKIN_TONES[(seat + row) % 4];
      ctx.fillRect(x - 8, top - 24, 16, 15);
      ctx.fillStyle = "#191922";
      ctx.fillRect(x - 9, top - 25, 18, 6);
    }
  }
}

function drawRing(ctx, theme, ring) {
  const left = ring.ringMinX;
  const right = ring.ringMaxX;
  const backL = [left + 23, 574];
  const backR = [right - 23, 574];
  const frontL = [left - 76, 887];
  const frontR = [right + 76, 887];
  polygon(ctx, [[frontL[0] - 65, 895], [frontR[0] + 65, 895], [frontR[0] + 120, 1017], [frontL[0] - 120, 1017]], "#090b10");
  polygon(ctx, [backL, backR, frontR, frontL], theme.mat);
  polygon(ctx, [frontL, frontR, [frontR[0], 966], [frontL[0], 966]], theme.apron);
  stroke(ctx, [frontL, frontR], theme.accent, 8);
  stroke(ctx, [[frontL[0], 968], [frontR[0], 968]], "#07090e", 12);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...backL);
  for (const point of [backR, frontR, frontL]) ctx.lineTo(...point);
  ctx.clip();
  ctx.fillStyle = theme.seam;
  ctx.globalAlpha = .30;
  for (let y = 621; y < 889; y += 66) ctx.fillRect(frontL[0], y, frontR[0] - frontL[0], 3);
  ctx.fillRect(left, 574, 4, 313);
  ctx.fillRect(right - 4, 574, 4, 313);
  ctx.translate(WIDTH / 2, 716);
  ctx.scale(1, .49);
  ctx.lineWidth = 8;
  ctx.strokeStyle = theme.seam;
  ctx.rotate(-.11);
  ctx.strokeRect(-135, -114, 270, 228);
  ctx.font = 'bold 63px "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.fillText("IRON", 0, -4);
  ctx.fillText("RING", 0, 59);
  ctx.restore();

  for (const [i, color] of theme.ropes.entries()) {
    const backY = 423 + i * 62;
    const frontY = 663 + i * 65;
    const line = [[frontL[0], frontY], [backL[0], backY], [backR[0], backY], [frontR[0], frontY]];
    stroke(ctx, line, "#17141b", 15);
    stroke(ctx, line, color, 7);
  }
  for (const [x, y] of [backL, backR, frontL, frontR]) {
    const postTop = y - (y === 574 ? 172 : 241);
    ctx.fillStyle = "#181921";
    ctx.fillRect(x - 18, postTop, 36, y - postTop + 14);
    ctx.fillStyle = theme.apron;
    ctx.fillRect(x - 13, postTop + 7, 16, y - postTop + 2);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x - 19, postTop, 38, 10);
  }

  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = .62;
  ctx.font = 'bold 21px "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.fillText(theme.mark, WIDTH / 2, 937);
  ctx.globalAlpha = 1;
}

function drawProp(ctx, event, now, theme) {
  const age = now - event.tick;
  const progress = Math.min(age / 54, 1);
  const x = event.side < 0 ? 125 : WIDTH - 125;
  const landingY = WORLD.floorY + 44;
  const chair = event.item === "chair";
  ctx.save();
  ctx.translate(x + (event.landingX - x) * progress, 529 + (landingY - 529) * progress - 255 * Math.sin(progress * Math.PI));
  ctx.globalAlpha = Math.min(1, (180 - age) / 35);
  ctx.rotate(event.side * (progress * Math.PI * 3.5 + (1 - progress) * .6));
  if (chair) {
    stroke(ctx, [[-19, 32], [-4, 4], [20, 29]], "#172127", 9);
    stroke(ctx, [[-19, 32], [-4, 4], [20, 29]], "#cfdfd9", 4);
    polygon(ctx, [[-21, -23], [13, -23], [18, -3], [-18, -3]], "#cde2e2");
    polygon(ctx, [[-17, 0], [18, 0], [23, 11], [-12, 11]], "#6c888f");
  } else {
    polygon(ctx, [[-13, -10], [4, -14], [15, -2], [12, 12], [-14, 9]], "#eee1c3");
    polygon(ctx, [[-10, -8], [7, -10], [9, 5], [-12, 7]], theme.accent);
    stroke(ctx, [[-5, -8], [4, 2], [0, 9]], "#7a6255", 3);
  }
  ctx.restore();
}

export class ArenaRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.backdrops = new Map();
    this.reset();
  }

  reset() {
    this.cheerTick = -Infinity;
    this.contractionUntil = -Infinity;
    this.props = [];
  }

  consume(event) {
    if (event.type === "CROWD_CHEER") this.cheerTick = event.tick;
    if (event.type === "RING_CONTRACTION") this.contractionUntil = event.tick + event.duration;
    if (event.type === "CROWD_THROW") this.props.push(event);
  }

  backdrop(id, theme) {
    if (!this.backdrops.has(id)) {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      drawArchitecture(canvas.getContext("2d"), theme);
      this.backdrops.set(id, canvas);
    }
    return this.backdrops.get(id);
  }

  draw(id, ring, tick) {
    const theme = THEMES[id];
    this.ctx.drawImage(this.backdrop(id, theme), 0, 0);
    const energy = Math.max(0, 1 - (tick - this.cheerTick) / 100);
    drawCrowd(this.ctx, theme, tick, energy);
    drawRing(this.ctx, theme, ring);
  }

  drawProps(id, tick) {
    this.props = this.props.filter(event => tick - event.tick < 180);
    for (const item of this.props) drawProp(this.ctx, item, tick, THEMES[id]);
  }

  drawSignal(tick) {
    const lastThrow = this.props.at(-1);
    const contraction = tick <= this.contractionUntil;
    const toss = lastThrow && tick - lastThrow.tick < 80;
    const cheering = tick - this.cheerTick < 95;
    if (!contraction && !toss && !cheering) return;
    const message = contraction ? "▶  링 수축 중  ◀"
      : toss ? lastThrow.item === "chair" ? "링사이드에 의자가 날아왔다!" : "링사이드에 쓰레기가 날아왔다!"
        : "관중의 환호!";
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 29px "Malgun Gothic", sans-serif';
    const width = ctx.measureText(message).width + 68;
    const x = (WIDTH - width) / 2;
    ctx.fillStyle = "#12151ce8";
    ctx.fillRect(x, 194, width, 43);
    ctx.fillStyle = "#ffdc80";
    ctx.fillRect(x, 194, 4, 43);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, WIDTH / 2, 215);
    ctx.restore();
  }
}
