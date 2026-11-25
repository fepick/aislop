export const THROW_FLIGHT_TICKS = 54;

export const ARENA_EVENTS = Object.freeze({
  chair: {
    name: "의자 투척", detail: "착지 범위 피해 8 · 짧은 경직", color: "#ffad86",
    radius: 95, damage: 8, stun: 18, duration: 150
  },
  trash: {
    name: "쓰레기 투척", detail: "착지 범위 피해 3 · 해당 구역 이동 둔화", color: "#c5e682",
    radius: 125, damage: 3, moveScale: 0.55, duration: 234
  },
  medic: {
    name: "링 닥터", detail: "남은 체력 비율이 낮은 선수 체력 +10", color: "#b8f4bd",
    healing: 10, duration: 135
  },
  fury: {
    name: "관중의 열기", detail: "두 선수 분노 +28", color: "#ffce7a",
    rage: 28, duration: 135
  },
  speed: {
    name: "스피드 라운드", detail: "두 선수의 새 공격 동작이 22% 짧아짐", color: "#9df4ff",
    attackScale: 0.78, duration: 240
  },
  ropes: {
    name: "탄성 로프", detail: "두 선수 넉백 거리 +45%", color: "#edb3ff",
    knockbackScale: 1.45, duration: 240
  }
});
