import { ASSETS } from "../config/asset-manifest.js";

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`에셋을 불러오지 못했습니다: ${source}`));
  image.src = source;
});

export async function loadAssets() {
  const [arena, p1Sheet, p2Sheet] = await Promise.all([
    loadImage(ASSETS.arena),
    loadImage(ASSETS.wrestlerSheets.P1),
    loadImage(ASSETS.wrestlerSheets.P2)
  ]);
  return {
    arena,
    wrestlerSheets: { P1: p1Sheet, P2: p2Sheet },
    sounds: ASSETS.sounds
  };
}
