export const ASSETS = Object.freeze({
  arena: new URL("../../asset/gameboard/arena_480x270.png", import.meta.url).href,
  wrestlerSheets: Object.freeze({
    P1: new URL("../../asset/player_sprite/red_comet_sheet.png", import.meta.url).href,
    P2: new URL("../../asset/player_sprite/blue_bull_sheet.png", import.meta.url).href
  }),
  sounds: Object.freeze({
    attack: new URL("../../asset/sound/attack-shout.wav", import.meta.url).href,
    hit: new URL("../../asset/sound/hit-impact.wav", import.meta.url).href
  })
});

export const SPRITE_SHEET = Object.freeze({
  frameWidth: 543,
  frameHeight: 724,
  frames: Object.freeze({
    IDLE: 0,
    APPROACH: 0,
    KICK: 1,
    PUSH: 2,
    DROP_KICK: 3,
    ROPE_DROP_KICK: 3,
    HIT_STUN: 0,
    KO: 3
  }),
  drawHeight: 390,
  pivotX: 0.5,
  pivotY: 0.78
});
