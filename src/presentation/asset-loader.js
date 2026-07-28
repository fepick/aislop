import { ASSETS } from "../config/asset-manifest.js";

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`에셋을 불러오지 못했습니다: ${source}`));
  image.src = source;
});

export async function loadAssets() {
  const [arena, wrestlerSheet] = await Promise.all([
    loadImage(ASSETS.arena),
    loadImage(ASSETS.wrestlerSheet)
  ]);
  return { arena, wrestlerSheet };
}
