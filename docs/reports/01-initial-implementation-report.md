# 초기 버전 구현 결과 보고서

작성일: 2026-07-28  
참조 계획: `docs/plans/01-codex-plan-review.md`  
구현 버전: rules `0.1.0`, AI profile `0.1.0`, result schema `0.1.0`

## 1. 구현 결과 요약

HTML, CSS, vanilla JavaScript와 Canvas 2D만 사용해 초기 버전을 구현했다. 브라우저 관전 모드와 렌더링 없는 결과 전용 모드가 같은 `Game.step()` 전투 코어를 사용한다. 외부 라이브러리, 백엔드, 외부 API는 추가하지 않았다.

완료된 주요 기능:

- 1920×1080 논리 해상도와 반응형 16:9 Canvas
- 480×270 경기장 배경의 최근접 4배 렌더링
- RGBA 4프레임 선수 시트, P2 좌우 반전
- 체력·분노·제한 시간·이름·대체 초상화를 포함한 동적 HUD
- 고정 1/60초 전투 update와 `requestAnimationFrame` 렌더 분리
- 양측 동일 FSM AI와 seed 기반 판단 주기/행동 선택
- 접근, 발차기, 밀기, 드롭킥, 피격 경직, 넉백, 링 경계와 비관통
- 일반/치명타 피해, 플로팅 피해 숫자, 분노 축적
- 로프 구역 조건과 분노 100 소비형 로프 드롭킥
- KO, 제한 시간 판정, 동시 KO 무승부
- 관전 시작, 일시정지, 재개, 버튼/키보드 R 재시작
- headless 1회·100회·1,000회, 진행률, 취소, 집계 결과
- compact match summary 기반 JSON 다운로드
- `rulesVersion`, `aiProfileVersion`, RNG/schema 버전 기록

준비 화면, 스탯 배분 UI, 직접 조작, 멀티플레이, 사운드, 해설 패널은 계획대로 제외했다.

## 2. 구현 구조

```text
src/
├─ config/
│  ├─ game-config.js
│  ├─ combat-config.js
│  ├─ ai-profiles.js
│  └─ asset-manifest.js
├─ core/
│  ├─ rng.js
│  ├─ player.js
│  ├─ combat-rules.js
│  ├─ ai-controller.js
│  └─ game.js
├─ simulation/
│  ├─ simulation-runner.js
│  └─ results-aggregator.js
├─ presentation/
│  ├─ asset-loader.js
│  └─ renderer.js
└─ main.js
```

- `core`는 DOM과 Canvas에 의존하지 않는다.
- `presentation`은 상태와 이벤트를 읽기만 하며 전투 결과를 변경하지 않는다.
- `simulation`은 렌더러 없이 코어를 종료까지 step하고 결과만 집계한다.
- 게임 수치, AI 프로필, 에셋 URL은 `config`에 모았다.

## 3. 확정한 초기 규칙

모호했던 항목은 `docs/decisions/001-initial-combat-rules.md`에 기록했다.

- 시작 체력은 `stats.maxHealth`를 사용하고 기본값은 100이다.
- `insight`는 초기 결과에 보존하지만 계산에는 사용하지 않는다.
- `attackSpeed`는 기준값 10 대비 startup, active, recovery와 cooldown tick을 조정한다.
- 같은 tick의 공격은 함께 적용하며 동시 KO는 DRAW다.
- 마지막 tick의 공격/KO가 제한 시간 판정보다 우선한다.
- 치명타 분노는 일반 분노에 더하지 않고 대체한다.
- 로프 드롭킥은 시작 시 분노를 소비하고 취소 시 환불하지 않는다.
- P2 tint는 적용하지 않고 원본 좌우 반전과 파란 HUD로 구분한다.

## 4. 결정성과 슬롯 공정성 수정

첫 1,000회 실행에서는 P2 승률이 74.4%로 나타났다. 조사 결과 P1을 이동시킨 다음 P2가 갱신된 P1 위치를 같은 tick 안에서 관찰해, P2만 더 최신 상대 위치로 접근 종료를 판단하는 순차 update 문제가 있었다.

양측이 tick 시작 위치 스냅샷을 사용하도록 바꿨고 AI 판단/치명타 RNG도 선수별 파생 스트림으로 분리했다. 수정 후 명중률은 P1 72.06%, P2 72.58%로 근접했다. 승률 차이는 5%p이며 초기 smoke 기준으로 허용하되, 시작 위치 교환 paired test를 후속 자동화할 필요가 있다.

## 5. 검증 결과

### 자동 회귀 테스트

macOS JavaScriptCore에서 다음 9개 테스트가 모두 통과했다.

1. Mulberry32 골든 시퀀스
2. 1,000개 파생 seed의 안정성과 중복 없음
3. 기본 피해와 치명타 확률
4. 동일 seed 결과 재현
5. 관전/headless 결과 일치
6. 모든 경기가 3,600 tick 안에 종료
7. 링 경계 및 유한 좌표 불변식
8. active 구간의 공격당 단일 hit
9. 집계 승패 합계와 비율 불변식

실행 결과: `9/9 tests passed`

### 정적 호스팅

Python 정적 서버에서 다음 리소스의 HTTP 200 응답을 확인했다.

- `/index.html`
- `/src/main.js`
- `/asset/gameboard/arena_480x270.png`
- `/asset/player_sprite/red_comet_sheet.png`

### 1,000회 기준선

base seed `20260728`, `mix32-v1` 파생 seed로 실행했다.

| 지표 | 결과 |
|---|---:|
| P1 승 | 415 (41.5%) |
| P2 승 | 465 (46.5%) |
| 무승부 | 120 (12.0%) |
| KO | 880 (88.0%) |
| 평균 경기 시간 | 18.43초 |
| P1 명중률 | 72.06% |
| P2 명중률 | 72.58% |
| P1 평균 로프 드롭킥 명중 | 0.168 |
| P2 평균 로프 드롭킥 명중 | 0.199 |
| JavaScriptCore headless 실행 시간 | 약 0.49초 |

계획에서 제시한 임시 목표인 평균 35~50초보다 전투가 빠르고 KO율도 높다. 기능적 초기 버전은 완료됐지만 밸런스 기준선은 아직 승인 상태가 아니다.

## 6. 알려진 제한과 후속 작업

- 실제 브라우저 화면의 다양한 DPR·모바일 기기별 시각 회귀와 FPS 측정은 자동화되지 않았다.
- 프레임은 동일한 543×724 셀이지만 공중 드롭킥의 시각 피벗은 추가 수동 조정 여지가 있다.
- 로프 드롭킥 AI는 분노가 찬 뒤 의도적으로 로프를 찾지 않고, 넉백으로 로프 구역에 도달했을 때만 사용한다.
- 이벤트 로그는 관전 플로팅 효과와 선택적 디버그 용도로 제한하며 배치에는 저장하지 않는다.
- 1,000회는 main thread chunk 처리로 충분하지만 10,000회 이상은 Web Worker가 필요하다.
- 평균 경기 시간을 늘리려면 피해량, 명중 후 경직, 공격 recovery 또는 AI 재판단 주기를 한 축씩 동일 seed로 조정해야 한다.
- 시작 위치를 교환한 paired regression, 동시 KO scripted test, 제한 시간 마지막 tick scripted test를 추가하는 것이 우선이다.

## 7. 실행 및 재검증

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 연다.

Node.js 환경:

```bash
npm test
```

현재 검증에 사용한 macOS JavaScriptCore:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  -m tests/run-tests.js
```
