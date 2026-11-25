import { ACTIONS, ATTACK_ORDER } from "../config/combat-config.js";
import { WORLD } from "../config/game-config.js";
import { isBusy } from "./player.js";

const atOwnRope = (player, ring) =>
  player.facing === 1
    ? player.x <= ring.ringMinX + WORLD.ropeZoneWidth
    : player.x >= ring.ringMaxX - WORLD.ropeZoneWidth;

export function canUseRopeDropkick(player, opponent, ring = WORLD) {
  return player.rage >= 100
    && player.cooldowns.ROPE_DROP_KICK <= 0
    && atOwnRope(player, ring)
    && (opponent.x - player.x) * player.facing > 0
    && Math.abs(opponent.x - player.x) >= WORLD.ropeMinTargetDistance;
}

export function decideAction(player, opponent, profile, rng, ring = WORLD) {
  if (isBusy(player)) return null;
  if (canUseRopeDropkick(player, opponent, ring) && rng.next() < profile.ropeDropkickChance) {
    return "ROPE_DROP_KICK";
  }
  const distance = Math.abs(opponent.x - player.x);
  const candidates = ATTACK_ORDER.filter(type =>
    profile.actionWeights[type] > 0
      && player.cooldowns[type] <= 0
      && distance <= ACTIONS[type].range
  );
  if (candidates.length > 0) {
    const totalWeight = candidates.reduce((sum, type) => sum + profile.actionWeights[type], 0);
    let selection = rng.next() * totalWeight;
    for (const type of candidates) {
      selection -= profile.actionWeights[type];
      if (selection < 0) return type;
    }
    return candidates.at(-1);
  }
  return distance > WORLD.minSeparation ? "APPROACH" : "IDLE";
}
