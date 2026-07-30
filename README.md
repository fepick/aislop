# AI Slop Wrestling Simulator

브라우저에서 실행되는 1대1 프로레슬링 자동 전투 시뮬레이터다. 관전 모드와 렌더링 없는 대량 시뮬레이션 모드가 동일한 전투 규칙, FSM AI, seed RNG를 공유한다.

## 실행

외부 라이브러리나 빌드 과정은 필요 없다. ES 모듈을 사용하므로 저장소 루트에서 정적 서버를 실행한다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 연다. 모든 경로는 상대 경로이므로 GitHub Pages 하위 경로에서도 동작하도록 구성했다.

## 실행 모드

- **선수 설정:** 10점 예산을 공격 속도, 이동 속도, 파워, 최대 체력, 방어, 예리함, 간파에 배분하고 전투 미리보기와 상대 전투력을 확인한다.
- **관전 모드:** Canvas에서 RED COMET과 BLUE BULL의 AI 전투를 실시간 표시한다. 페이지 로드 후 `관전 시작`을 눌러 전투와 사운드를 함께 시작한다.
- **결과 전용 모드:** 렌더링 없이 1회, 100회 또는 1,000회를 실행하고 집계를 표시한다.
- **JSON 다운로드:** 마지막 단일/배치 결과를 파일로 내려받는다.

## 조작

- `+` / `−`: 남은 예산 안에서 해당 스탯을 올리거나 기준값까지 되돌림
- `초기화`: 배분을 취소하고 예산 10과 기준 스탯으로 복원
- `전투 시작`: 현재 스탯 snapshot으로 관전 화면 진입
- `설정으로 돌아가기`: 현재 배분을 유지한 채 설정 화면 복귀
- `관전 시작`: 사운드를 준비하고 입력한 seed로 새 경기 시작
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
   ├─ sample_play.png
   └─ sample_setting.png
```

- 경기장은 480×270이며 1920×1080 논리 화면에 정확히 4배 확대한다.
- 선수 시트는 RGBA PNG이고 543×724 프레임 4개가 가로로 배치되어 있다. P1은 빨간색, P2는 파란색 전용 시트를 사용한다.
- 관전 시작 버튼을 누르면 공격·피격 사운드가 활성화된다. 브라우저 오디오 정책상 최초 사용자 입력 전에는 소리가 재생되지 않는다.
- Canvas 이미지 보간과 CSS 이미지 보간을 비활성화한다.
- `sample_play.png`와 `sample_setting.png`는 UI 분위기 참고 자료이며 런타임 화면에 직접 사용하지 않는다.

## 스테이터스

원본 스탯의 기준값은 모두 10이다. 최대 체력은 `50 + maxHealth × 5`, 공격 주기 배율은 `clamp(1 - 0.035 × (attackSpeed - 10), 0.65, 1.35)`, 이동 배율은 `clamp(1 + 0.04 × (moveSpeed - 10), 0.60, 1.60)`으로 계산한다.

피해는 `floor(baseDamage + power × 0.60 - defense × 0.35)`이며 최소 1이다. 치명타 확률은 12%, 배율은 `clamp(1.25 + sharpness × 0.025, 1.25, 2.00)`, 카운터 확률은 `clamp(0.05 + insight × 0.01, 0.05, 0.45)`이다. luck는 현재 결과에 보존되지만 전투 규칙과 예산 배분에는 사용하지 않는다.

## 결정성과 버전

- 고정 timestep: 1/60초
- 제한 시간: 3,600 tick
- RNG: Mulberry32 기반 seed RNG
- 매치별 seed: `mix32-v1` 파생 정책
- 전투 규칙: `0.4.0`
- AI 프로필: `0.2.0`
- 스탯 규칙: `1.0.0`

전투, AI, 치명타 판정에서는 `Math.random()`을 사용하지 않는다. 같은 seed와 설정의 관전/headless 결과는 `mode` 필드를 제외하고 동일하다.

카운터는 일반 공격을 무효화한 뒤 18 tick(0.3초) 후 밀기 반격을 적용한다. 로프 드롭킥은 카운터 대상이 아니며, 사용 시 선수 머리 위에 안내 문구가 표시된다.

## 결과 데이터

단일 결과에는 seed, 실행 모드, 버전, 승자, 결과 유형, 경과 tick/초, 양측 `rawStats`와 `derivedStats`, 최종 체력·분노, 피해량, 행동별 공격/명중/치명타, 로프 드롭킥 및 카운터 지표가 포함된다.

배치 결과에는 실행 metadata, 양측 스탯 snapshot, 집계 지표와 compact match summary가 포함된다. tick별 이벤트는 대량 결과에 저장하지 않는다.

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

테스트는 RNG 골든 시퀀스, seed 파생, 스탯 공식과 예산 불변식, 피해 공식, 재현성, 관전/headless 일치, 제한 시간, 링 경계, 단일 hit와 집계 불변식을 확인한다.
