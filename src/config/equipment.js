export const RARITIES = Object.freeze({
  common: "일반",
  rare: "레어",
  epic: "에픽",
  unique: "유니크"
});

const statGear = {
  common: [
    ["mat-treads", "매트 트레드", { moveSpeed: 3 }],
    ["cotton-wraps", "솜 손목 붕대", { attackSpeed: 2, insight: 1 }],
    ["training-singlet", "훈련 싱글렛", { maxHealth: 3 }],
    ["canvas-guard", "캔버스 가드", { defense: 3 }],
    ["leather-boots", "가죽 부츠", { power: 2, moveSpeed: 1 }],
    ["chalk-grip", "분필 그립", { power: 2, sharpness: 1 }],
    ["corner-towel", "코너 타월", { maxHealth: 2, defense: 1 }],
    ["scout-tape", "정찰 테이프", { insight: 3 }],
    ["speed-laces", "스피드 끈", { attackSpeed: 3 }],
    ["sharp-seams", "예리한 박음선", { sharpness: 3 }],
    ["mouthguard", "마우스가드", { maxHealth: 1, insight: 2 }],
    ["sparring-belt", "스파링 벨트", { power: 3 }]
  ],
  rare: [
    ["spring-soles", "스프링 밑창", { moveSpeed: 3, attackSpeed: 2 }],
    ["brass-grip", "황동 그립", { power: 4, sharpness: 1 }],
    ["stitch-guard", "이중 박음 보호대", { defense: 3, maxHealth: 2 }],
    ["reflex-wraps", "반사신경 랩", { insight: 3, attackSpeed: 2 }],
    ["pressure-belt", "압박 벨트", { maxHealth: 3, power: 2 }],
    ["silk-hood", "실크 후드", { sharpness: 3, insight: 2 }],
    ["soft-step", "무소음 부츠", { moveSpeed: 4, defense: 1 }],
    ["shock-pads", "충격 흡수 패드", { maxHealth: 4, defense: 1 }],
    ["speed-tape", "스프린트 테이프", { attackSpeed: 4, sharpness: 1 }],
    ["rivals-notes", "라이벌의 노트", { insight: 3, defense: 2 }]
  ],
  epic: [
    ["surge-boots", "서지 부츠", { attackSpeed: 4, moveSpeed: 3 }],
    ["iron-singlet", "철사 직조 싱글렛", { maxHealth: 4, defense: 3 }],
    ["heavy-soles", "헤비급 밑창", { power: 5, defense: 3, moveSpeed: -1 }],
    ["ringside-optics", "링사이드 렌즈", { insight: 4, sharpness: 3 }],
    ["comet-wraps", "혜성 붕대", { attackSpeed: 3, power: 3, sharpness: 1 }],
    ["breath-vest", "호흡 훈련 조끼", { maxHealth: 4, moveSpeed: 3 }]
  ],
  unique: [
    ["lightning-boots", "번개 부츠", { attackSpeed: 5, moveSpeed: 5, maxHealth: -2 }],
    ["iron-dynasty", "철왕조의 벨트", { maxHealth: 5, power: 4, defense: 2, attackSpeed: -2 }]
  ]
};

export const LEGACY_REWARDS = Object.freeze(["carbon", "heels", "wraps"]);

export const EQUIPMENT = Object.freeze([
  { id: "carbon", name: "카본 깔창", rarity: "unique", description: "로프 드롭킥 전진 거리 +35%",
    effects: Object.freeze({ ropeTravelMultiplier: 1.35 }) },
  { id: "heels", name: "하이힐", rarity: "rare", description: "일반 발차기 치명타 확률 +12%p",
    effects: Object.freeze({ kickCriticalBonus: 0.12 }) },
  { id: "wraps", name: "챔피언 랩", rarity: "rare", stats: Object.freeze({ defense: 2, insight: 2 }) },
  ...Object.entries(statGear).flatMap(([rarity, items]) =>
    items.map(([id, name, stats]) => Object.freeze({ id, name, rarity, stats: Object.freeze(stats) })))
]);

export const REWARD_WEIGHTS = Object.freeze([
  { common: 64, rare: 27, epic: 8, unique: 1 },
  { common: 48, rare: 34, epic: 15, unique: 3 },
  { common: 32, rare: 40, epic: 20, unique: 8 }
]);
