import { PLAYER_CONFIGS } from "./game-config.js";

export const CAMPAIGN_VERSION = 2;
export const CAMPAIGN_SAVE_KEY = "iron-ring-campaign-v1";
export const TRAINING_REWARD = 3;

export const STAGES = Object.freeze([
  {
    id: "blue-bull", venue: "지하 체육관", name: "BLUE BULL", title: "링의 문지기",
    color: "#6ea8ff", art: "./asset/campaign/blue-bull.png",
    intro: "폐쇄 위기의 체육관을 지키기 위해 레드 코멧이 상금 토너먼트에 오른다. 첫 관문은 링의 문지기 블루 불.",
    scouting: "느린 발을 힘과 방어력으로 보완하는 인파이터.",
    stats: PLAYER_CONFIGS[1].stats
  },
  {
    id: "neon-viper", venue: "네온 아레나", name: "NEON VIPER", title: "네온의 독사",
    color: "#7ade9c", art: "./asset/campaign/neon-viper.png",
    intro: "언더카드에서 이름을 알린 레드 코멧. 네온 아래에서 관중의 연승 기록을 독차지한 선수가 기다린다.",
    scouting: "속공과 회피에 특화된 선수. 체력과 방어는 낮다.",
    stats: { attackSpeed: 16, moveSpeed: 15, power: 10, maxHealth: 9, defense: 8, sharpness: 12 }
  },
  {
    id: "velvet-phantom", venue: "벨벳 극장", name: "VELVET PHANTOM", title: "반격의 유령",
    color: "#ce94fc", art: "./asset/campaign/velvet-phantom.png",
    intro: "결승 한 자리를 건 준결승. 상대는 관중의 환호가 끊기는 순간마다 반격을 꽂아 넣는다.",
    scouting: "간파와 예리함이 높아 카운터와 치명타가 위협적이다.",
    stats: { attackSpeed: 11, moveSpeed: 10, power: 11, maxHealth: 11, defense: 10, sharpness: 17, insight: 17 }
  },
  {
    id: "iron-king", venue: "철의 왕좌", name: "IRON KING", title: "현역 챔피언",
    color: "#f5b647", art: "./asset/campaign/iron-king.png",
    intro: "메인 이벤트. 챔피언이 벨트를 로프에 걸고 링 한가운데로 걸어 나온다. 오늘 밤 상금과 왕좌를 모두 가져와라.",
    scouting: "높은 체력과 강력한 압박이 특징인 헤비급 챔피언.",
    stats: { attackSpeed: 12, moveSpeed: 8, power: 16, maxHealth: 17, defense: 14, sharpness: 13, insight: 13 }
  }
]);
