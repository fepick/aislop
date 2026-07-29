# AI Slop Wrestling Simulator

브라우저에서 실행되는 1대1 프로레슬링 자동 전투 시뮬레이터다. 관전 모드와 렌더링 없는 대량 시뮬레이션 모드가 동일한 전투 규칙, FSM AI, seed RNG를 공유한다.

## 실행

외부 라이브러리나 빌드 과정은 필요 없다. ES 모듈을 사용하므로 저장소 루트에서 정적 서버를 실행한다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 연다. 모든 경로는 상대 경로이므로 GitHub Pages 하위 경로에서도 동작하도록 구성했다.

## 실행 모드

- **관전 모드:** Canvas에서 RED COMET과 BLUE BULL의 AI 전투를 실시간 표시한다.
- **결과 전용 모드:** 렌더링 없이 1회, 100회 또는 1,000회를 실행하고 집계를 표시한다.
- **JSON 다운로드:** 마지막 단일/배치 결과를 파일로 내려받는다.

## 조작

- `관전 시작`: 입력한 seed로 새 경기 시작
- `일시정지` / `재개`: 관전 시간 제어
- `재시작 (R)` 또는 키보드 `R`: 같은 입력 seed로 경기 초기화
- `취소`: 실행 중인 배치를 현재 경기 이후 중단

## 에셋

```text
asset/
├─ gameboard/
│  └─ arena_480x270.png
├─ player_sprite/
│  ├─ red_comet_sheet.png
│  └─ blue_bull_sheet.png
├─ sound/
│  ├─ attack-shout.wav
│  └─ hit-impact.wav
└─ play_sample/
   └─ sample_play.png
```

- 경기장은 480×270이며 1920×1080 논리 화면에 정확히 4배 확대한다.
- 선수 시트는 RGBA PNG이고 543×724 프레임 4개가 가로로 배치되어 있다. P1은 빨간색, P2는 파란색 전용 시트를 사용한다.
- 관전 시작 버튼을 누르면 공격·피격 사운드가 활성화된다. 브라우저 오디오 정책상 최초 사용자 입력 전에는 소리가 재생되지 않는다.
- Canvas 이미지 보간과 CSS 이미지 보간을 비활성화한다.
- `sample_play.png`는 HUD 분위기 참고 자료이며 런타임 화면에 사용하지 않는다.

## 결정성과 버전

- 고정 timestep: 1/60초
- 제한 시간: 3,600 tick
- RNG: Mulberry32 기반 seed RNG
- 매치별 seed: `mix32-v1` 파생 정책
- 전투 규칙: `0.2.0`
- AI 프로필: `0.2.0`

전투, AI, 치명타 판정에서는 `Math.random()`을 사용하지 않는다. 같은 seed와 설정의 관전/headless 결과는 `mode` 필드를 제외하고 동일하다.

## 결과 데이터

단일 결과에는 seed, 실행 모드, 버전, 승자, 결과 유형, 경과 tick/초, 양측 stats와 최종 체력·분노, 피해량, 행동별 공격/명중/치명타, 로프 드롭킥 및 카운터 지표가 포함된다.

배치 결과에는 실행 metadata, 집계 지표와 compact match summary가 포함된다. tick별 이벤트는 대량 결과에 저장하지 않는다.

## 테스트

Node.js가 있으면:

```bash
npm test
```

macOS 시스템 JavaScriptCore로도 외부 의존성 없이 실행할 수 있다.

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  -m tests/run-tests.js
```

테스트는 RNG 골든 시퀀스, seed 파생, 피해 공식, 재현성, 관전/headless 일치, 제한 시간, 링 경계, 단일 hit와 집계 불변식을 확인한다.
