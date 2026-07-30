export function shakeForDamage(damage) {
  if (damage < 10) return { strength: 0, frames: 0 };
  if (damage < 20) return { strength: 6, frames: 6 };
  if (damage < 30) return { strength: 12, frames: 9 };
  return { strength: 20, frames: 12 };
}

export function shakeOffset(shake) {
  if (shake.frames <= 0 || shake.strength <= 0) return { x: 0, y: 0 };
  const elapsed = shake.totalFrames - shake.frames;
  const strength = shake.strength * (shake.frames / shake.totalFrames);
  const pattern = [
    [1, -0.5], [-0.75, 1], [0.5, 0.75], [-1, -0.25]
  ][elapsed % 4];
  return { x: pattern[0] * strength, y: pattern[1] * strength };
}

export function announcementForEvent(event) {
  if (event.type !== "ACTION_STARTED" || event.actionType !== "ROPE_DROP_KICK") return null;
  return { actorId: event.actorId, text: "로프 드롭킥!", life: 60 };
}
