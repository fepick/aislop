import { ACTIONS, ATTACK_ORDER } from "../config/combat-config.js";
import { WORLD } from "../config/game-config.js";
import { isBusy } from "./player.js";

const atOwnRope = player =>
  player.facing === 1
    ? player.x <= WORLD.ringMinX + WORLD.ropeZoneWidth
    : player.x >= WORLD.ringMaxX - WORLD.ropeZoneWidth;

export function canUseRopeDropkick(player, opponent) {
  return player.rage >= 100
    && player.cooldowns.ROPE_DROP_KICK <= 0
    && atOwnRope(player)
    && (opponent.x - player.x) * player.facing > 0
    && Math.abs(opponent.x - player.x) >= WORLD.ropeMinTargetDistance;
}

export function decideAction(player, opponent, profile, rng) {
  if (isBusy(player)) return null;
  if (canUseRopeDropkick(player, opponent) && rng.next() < profile.ropeDropkickChance) {
    return "ROPE_DROP_KICK";
  }
  const distance = Math.abs(opponent.x - player.x);
  const candidates = ATTACK_ORDER.filter(type =>
    player.cooldowns[type] <= 0 && distance <= ACTIONS[type].range
  );
  if (candidates.length > 0) return rng.pick(candidates);
  return distance > WORLD.minSeparation ? "APPROACH" : "IDLE";
}
