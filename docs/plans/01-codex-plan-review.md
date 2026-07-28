# 01. Codex 구현 계획 검토

작성일: 2026-07-28  
검토 범위: `AGENTS.md`, `docs/prompts/01-plan-review.md`, 현재 프로젝트 구조와 에셋  
목표: 구현에 앞서 에셋 적합성, 규칙 모호성, 아키텍처, 밸런스 및 검증 전략을 확정한다.

## 1. 에셋 점검 결과

### 실제 프로젝트 구조

현재 저장소에는 실행 코드와 설정이 없고 다음 파일만 있다.

```text
/
├─ AGENTS.md
├─ README.md
├─ asset/
│  ├─ gameboard/
│  │  └─ arena_480x270.png
│  ├─ player_sprite/
│  │  └─ red_comet_sheet.png
│  └─ play_sample/
│     └─ sample_play.png
└─ docs/
   ├─ decisions/
   ├─ design/
   ├─ plans/
   └─ prompts/
      └─ 01-plan-review.md
```

요구사항에 맞춰 단수형 `asset/` 아래에 용도별 디렉터리를 구성했다. 이전의 평면 `assets/` 구조는 프로젝트에서 제거했으며, 원본은 복구를 위해 `/private/tmp/aislop-assets-backup-20260728`에 임시 보관했다. 구현에서는 위 실제 상대 경로를 asset manifest 한곳에 기록한다.

### 파일별 점검

| 요구상 분류 | 실제 파일 | 형식과 크기 | 투명도/구조 | 사용 가능성 및 문제 |
|---|---|---|---|---|
| 경기장 | `asset/gameboard/arena_480x270.png` | PNG, 480×270, 8-bit RGB | 알파 채널 없음, 정확한 16:9 단일 배경 | 링·로프·관중석·실내 조명을 포함한다. 1920×1080 논리 화면에 최근접 이웃으로 정확히 4배 확대할 수 있다. 링 매트의 실제 전투 경계는 이미지에서 자동 추론하지 않고 논리 좌표 설정으로 분리한다. |
| 선수 | `asset/player_sprite/red_comet_sheet.png` | PNG, 2172×724, 8-bit RGBA | 투명 배경. 가로 4등분 시 각 셀은 정확히 543×724. 왼쪽부터 스탠딩, 발차기, 밀기, 드롭킥 | 체크무늬가 제거된 알파 PNG이며 네 포즈와 오른쪽 방향이 유지되었다. 셀 크기는 동일하다. 포즈별 실제 점유 폭과 공중 드롭킥의 발 위치가 다르므로 공통 피벗/논리 바닥선은 프레임 메타데이터로 명시하고 렌더 검증해야 한다. |
| UI 참고 | `asset/play_sample/sample_play.png` | PNG, 1672×941, 8-bit RGB | 알파 채널 없음, UI와 전투 장면이 합쳐진 단일 이미지 | 이름, 양측 초상화, 체력 바, 중앙 타이머, 작은 게이지 칸, 하단 해설 패널의 분위기 참고용으로 적합하다. 동적 HUD의 소스로 직접 사용하거나 부분 크롭하지 않는다. 샘플에는 분노 게이지 의미가 명시되지 않았고 제한 시간이 87로 표현되어 있어 60초 규칙의 근거로 사용하면 안 된다. 하단 해설 영역은 범위 제외다. |

### 에셋 관련 결론

- 경기장과 UI 참고 이미지는 첫 구현에 사용할 수 있다.
- 선수 시트는 RGBA 변환과 배경 제거가 완료되어 첫 구현에 사용할 수 있다. 다만 네 포즈의 공통 피벗과 발바닥 기준선은 렌더 메타데이터 검증이 필요하다.
- 초상화 전용 에셋은 없다. 첫 버전은 투명화된 스탠딩 프레임을 오프스크린 캔버스에 크롭해 양측 초상화로 재사용하거나, 작업 전까지 문자 이니셜/색상 실루엣을 대체 표시한다.
- P2용 별도 선수 시트도 없다. 원본 프레임을 캔버스에서 좌우 반전하되, tint는 선택적 렌더 효과로만 취급한다.
- 픽셀 아트처럼 보이지만 원본 해상도가 크고 일부 경계가 부드럽다. `imageSmoothingEnabled = false`와 CSS `image-rendering: pixelated`는 추가 블러를 막을 뿐 원본을 더 저해상도 픽셀 아트로 바꾸지는 않는다.

## 에셋 해상도 및 투명도 규칙

### 선수 스프라이트

- `asset/player_sprite`의 선수 스프라이트 시트는 RGBA PNG를 사용한다.
- 선수 주변 배경은 완전히 투명해야 한다.
- 투명도를 지원하지 않는 RGB 이미지이거나 배경이 포함된 이미지라면, 우선 에셋 문제로 기록하고 투명 PNG 변환 또는 재생성이 필요하다고 보고한다.
- 스프라이트 시트는 가로 4프레임 구조이며 모든 프레임의 크기는 동일해야 한다.
- 각 프레임은 동일한 발바닥 기준선과 피벗을 가져야 한다.
- 스프라이트 렌더링 시 배경색 키잉 방식보다 PNG 알파 채널을 우선 사용한다.
- P2는 P1 스프라이트를 좌우 반전해 사용하며, tint가 불안정하면 원본 색상을 유지한다.

### 경기장 배경

- `asset/gameboard`의 경기장 배경은 16:9 비율을 유지한다.
- 게임의 논리 해상도는 1920×1080이지만, 픽셀 아트 스타일과 성능을 위해 경기장 배경 에셋은 480×270 크기의 저해상도 PNG를 기본 목표로 한다.
- 480×270 배경은 1920×1080 논리 해상도에서 정확히 4배 확대해 사용한다.
- 축소·확대 시 최근접 이웃 보간을 사용하고 이미지 보간을 비활성화한다.
- 기존 1920×1080 배경을 임시로 사용할 수 있으나, 최종적으로는 480×270 저해상도 배경 에셋을 별도 파일로 관리한다.
- 배경 이미지의 링 바닥, 좌우 경계, 로프 구역은 이미지와 분리된 설정 데이터로 관리한다.

## 2. 요구사항 모호성

다음 항목은 영구 규칙을 임의로 만들지 않고 구현 전에 결정 기록으로 남겨야 한다.

### 권장 기본 결정

1. **`maxHealth`와 체력 100의 충돌**
   - `DEFAULT_STATS.maxHealth = 100`을 현재 기본 규칙으로 해석하고 시작 체력은 항상 `player.stats.maxHealth`로 설정한다.
   - HUD 체력 바는 현재 체력/해당 선수의 `maxHealth` 비율로 표시한다.
   - “100 시작”은 기본 설정값일 뿐 고정 전투 상수로 두지 않는다. 향후 스탯 투자와 자연스럽게 연결된다.

2. **`insight`**
   - 첫 버전 계산과 AI 판단에는 적용하지 않는다. 스키마와 결과 JSON에는 원래 값 그대로 보존하고 `unusedInRulesVersion: ["insight"]` 또는 규칙 문서로 비활성 상태를 명시한다.
   - 역할이 정해질 때 `rulesVersion`을 올린다. 임의로 명중률이나 예측 능력에 연결하지 않는다.

3. **동시 공격과 동시 KO**
   - 한 tick의 시작 상태를 기준으로 양측 히트 여부와 피해 이벤트를 먼저 수집한 뒤 한 번에 적용한다. 배열 순서나 P1 선처리로 승패가 바뀌지 않게 한다.
   - 같은 tick에 양측 체력이 0 이하이면 `winner: "DRAW"`, `resultType: "DRAW"`로 권장한다. 비동시 KO는 즉시 종료한다.
   - 피격 경직은 이미 같은 tick에 유효해진 상대 공격을 취소하지 않지만, 다음 tick부터 행동을 중단시킨다.

4. **상태 우선순위**
   - `KO/TIMEOUT > HIT_STUN > 공격 회복/특수 행동 > 일반 행동 > 이동/IDLE` 순으로 둔다.
   - 공격 상태와 AI 상태를 하나의 열거형에 섞지 않는다. 선수의 물리/행동 상태와 AI 의사결정 상태를 분리한다.

5. **로프 드롭킥 조건**
   - 링 전투 경계 `[ringMinX, ringMaxX]`, 로프 구역 폭 `ropeZoneWidth`, 최소 상대 거리 `ropeMinTargetDistance`, 최대 돌진 거리/시간을 설정값으로 둔다.
   - 선수 중심점이 자기 뒤쪽 로프 구역 안에 있고, 상대가 링 안쪽 방향에 있으며, 두 선수의 부호 있는 x 차가 바라보는 방향과 일치하고, 거리가 최소값 이상일 때만 준비 가능하다.
   - 권장 초기값은 전체 링 전투 폭을 실측한 뒤 비율로 확정한다. 임시 출발점은 로프 구역 폭 8%, 최소 상대 거리 35%이며 검증 결과 없이 영구값으로 승인하지 않는다.

6. **P2 tint 실패**
   - 좌우 반전과 파란 HUD/이름/외곽선만 필수로 한다. tint는 시작 시 오프스크린 캔버스에 한 번 캐시하는 선택 기능으로 구현한다.
   - 마스킹 품질, 브라우저 합성 차이, 흰색 영역 오염이 발생하면 원본 색상을 유지한다. tint 성공 여부는 전투 상태나 시드 결과에 절대 관여하지 않는다.

7. **초상화 부재**
   - 투명 스탠딩 프레임의 얼굴 영역을 설정 기반 source rect로 잘라 사용한다. 에셋 정리가 지연되면 RED/BLUE 이니셜이 있는 색상 패널로 대체한다.

8. **대량 결과 보관**
   - 1회 실행은 상세 결과와 필요 시 제한된 이벤트 로그를 가진다.
   - 100/1,000회는 집계값과 각 경기의 compact summary(시드, 승자, 결과 유형, 시간, 최종 체력, 핵심 카운터)만 기본 보관한다. tick별 상태와 렌더 이벤트는 저장하지 않는다.
   - UI에는 최근/선택된 상세 경기만 유지하고 다운로드 옵션에서 `summary-only`를 기본값으로 한다.

### 추가 결정이 필요한 항목

- 각 공격의 `attackBaseDamage`, startup/active/recovery, 사거리, 쿨다운, 이동량과 넉백 수치가 없다. 이 값 없이는 KO율을 신뢰성 있게 예측할 수 없다.
- 푸시가 피해를 주는지, 드롭킥이 일반 치명타 대상인지, 빗나간 일반 공격의 회복 경직이 얼마인지 불명확하다.
- 공격 충돌 시 상쇄/clash가 있는지 불명확하다. 첫 버전은 상쇄 없이 양측 판정을 독립 적용하는 것이 단순하고 결정적이다.
- 제한 시간 tick과 KO가 같은 tick에 발생할 때 우선순위가 필요하다. 해당 tick의 유효 공격과 KO를 처리한 뒤 시간 종료 판정을 하는 것을 권장한다.
- 분노가 명중과 치명타에서 중복 증가하는지 불명확하다. 표의 “치명타 명중 +14”는 일반 +8에 추가가 아니라 대체값으로 해석한다.
- 로프 드롭킥의 `normalDamage + 22`에서 `normalDamage`가 어떤 기본 공격의 base를 쓰는지 없다. 특수기 전용 base damage를 설정하고 동일 일반 피해 공식에 넣은 뒤 bonus를 더하는 방식으로 명확히 해야 한다.
- 분노 100 도달 후 로프까지 이동하는 AI 행동, 시도 시점의 게이지 소비(시작/발사), 피격으로 취소될 때 환불 여부가 없다. 별도 결정이 필요하다.
- 같은 seed의 “관전/결과 일치”에서 결과의 `mode` 필드는 의도적으로 다르므로, 일치 비교 대상에서 `mode`와 표현 전용 이벤트를 제외해야 한다.
- 난이도 목표는 사람이 조작하는 P1 난이도가 아니다. 첫 버전에서는 `기준 P1 스탯+normal AI` 대 `난이도별 P2 스탯/AI 프로필`의 승률로 정의한다. AI 차이와 스탯 차이의 효과를 분석하려면 한 실험에서 둘 중 하나만 바꾸는 대조군도 제공해야 한다.

## 3. 권장 아키텍처

### 디렉터리와 모듈

희망 구조는 책임 구분 방향은 맞지만 작은 프로젝트에서 파일이 지나치게 쪼개질 수 있다. 아래처럼 순수 시뮬레이션 코어, 표현, 애플리케이션을 상위 폴더로 먼저 구분하는 편이 headless 검증과 향후 Worker 이전에 유리하다.

```text
/
├─ index.html
├─ style.css
├─ README.md
├─ asset/
│  ├─ gameboard/
│  │  └─ arena_480x270.png
│  ├─ player_sprite/
│  │  └─ red_comet_sheet.png
│  └─ play_sample/
│     └─ sample_play.png
├─ src/
│  ├─ config/
│  │  ├─ game-config.js
│  │  ├─ combat-config.js
│  │  ├─ ai-profiles.js
│  │  └─ asset-manifest.js
│  ├─ core/
│  │  ├─ rng.js
│  │  ├─ game-state.js
│  │  ├─ player.js
│  │  ├─ combat-rules.js
│  │  ├─ ai-controller.js
│  │  └─ game.js
│  ├─ simulation/
│  │  ├─ simulation-runner.js
│  │  ├─ results-aggregator.js
│  │  └─ result-schema.js
│  ├─ presentation/
│  │  ├─ renderer.js
│  │  ├─ hud.js
│  │  └─ asset-loader.js
│  └─ main.js
└─ tests/
   ├─ test-runner.html
   └─ *.test.js
```

브라우저 네이티브 ES 모듈만 사용하며 모든 URL은 `new URL(relativePath, import.meta.url)` 또는 문서 기준 상대 경로로 해석해 GitHub Pages 하위 경로에서도 루트 절대 경로를 피한다.

### 책임 경계

- **GameState**: 현재 tick, 남은 tick, 경기 상태, 선수 상태, 결과 직전의 결정적 데이터만 소유한다. Canvas/DOM 객체를 포함하지 않는다.
- **Player**: 독립 stats, health, rage, 위치/속도, facing, hurtbox, cooldown, 현재 action과 action elapsed ticks를 가진다.
- **CombatRules**: 행동 가능성, 히트박스, 피해/치명타, 넉백, 경직, 분노, 경계/겹침 해소, 종료 판정을 순수하게 처리한다.
- **AIController**: 읽기 전용 상태 스냅샷과 프로필 및 RNG로 다음 의도를 만든다. 직접 위치/체력을 변경하지 않는다.
- **RNG**: 부호 없는 32-bit seed 상태, `nextUint32`, `[0,1)` 값, 정수 범위 선택, 배열 선택, 매치 seed 파생만 제공한다.
- **Game**: 한 fixed tick의 단계 순서를 조정한다. 입력 스냅샷 → AI 의도 → 행동 전이 → 이동 → 충돌/공격 후보 수집 → 동시 피해 적용 → 종료 판정 → 이벤트 생성 순서를 고정한다.
- **Renderer/HUD**: GameState와 표현 이벤트의 읽기 전용 view를 그린다. 시뮬레이션 RNG를 호출하거나 상태를 수정하지 않는다.
- **SimulationRunner**: Game 인스턴스를 결과가 날 때까지 fixed tick으로 실행하며 단일/배치 실행, 진행률, 취소를 관리한다.
- **ResultsAggregator**: 완료된 MatchResult만 소비해 누적 통계를 계산한다. GameState를 참조하거나 변경하지 않는다.

### 시간과 좌표

- 시간의 정본은 부동소수 초가 아니라 정수 tick으로 둔다. `FIXED_DT = 1/60`, 60초 제한은 3,600 tick이다. 행동 구간도 설정 입력 시 tick으로 정규화한다.
- 관전 루프만 `requestAnimationFrame`, accumulator, 한 프레임 최대 5 step과 elapsed clamp를 사용한다. step 상한에 걸려 남은 accumulator를 어떻게 처리했는지는 렌더 지연 문제일 뿐 게임 tick 결과에는 영향을 주지 않아야 한다.
- 결과 모드는 wall-clock과 무관하게 `game.step()`을 연속 호출한다.
- 모든 세계 좌표, 링 경계, hurtbox/hitbox, HUD는 1920×1080 논리 좌표다. 실제 Canvas backing size와 CSS box를 분리하고 16:9 contain 스케일 및 레터박스를 적용한다.
- 픽셀 스냅은 렌더 좌표에서만 수행하며 물리 좌표를 반올림하지 않는다. 렌더 보간은 시각 전용이고 규칙 상태에 되쓰지 않는다.

### 공통 코드와 분리 지점

관전과 결과 전용 모드는 동일한 config snapshot, RNG, Game, AIController, CombatRules, fixed tick을 사용한다. 관전 모드만 Renderer/HUD와 wall-clock scheduler를 붙인다. 결과 모드는 Game을 가능한 빠르게 호출하되 여러 경기 사이에 UI thread를 양보한다. 결과를 만들 때 config를 깊은 복사/정규화해 실행 중 UI 변경이 진행 중인 배치에 영향을 주지 않게 한다.

### 최소 이벤트 구조

이벤트는 규칙 결과를 관찰하기 위한 불변 레코드이며 렌더 효과가 규칙을 역으로 변경하지 않는다.

```js
{
  tick,
  type,            // ACTION_STARTED, HIT, CRITICAL, RAGE_CHANGED, KO, TIMEOUT
  actorId,
  targetId,
  actionType,
  value,
  position: { x, y }
}
```

코어는 결과 집계에 필요한 누적 카운터를 직접 결정적으로 관리하고, 이벤트는 플로팅 텍스트와 디버깅에 사용한다. 관전 모드는 짧은 ring buffer, 배치 모드는 이벤트 미수집 또는 선택 경기만 수집한다.

## 4. 전투 및 AI 설계 평가

### 피해 공식과 60초 KO 가능성

기본 스탯 10에서는 방어 보정 전후가 `+6 - 3.5 = +2.5`이므로, 정수 `attackBaseDamage = B`일 때 일반 피해는 대체로 `B + 2`다. 치명타 확률은 `0.05 + 0.10 + 0.03 = 18%`이며 후보 설명에서 흔히 놓치기 쉬운 수치다. 치명타 배율 1.5를 적용한 기대 피해는 반올림에 따라 일반 피해의 약 1.09배다.

예시:

| B | 일반 | 치명타 | 1회 명중 기대 피해 | 100 HP를 줄이는 기대 명중 수 |
|---:|---:|---:|---:|---:|
| 4 | 6 | 9 | 6.54 | 약 15.3 |
| 6 | 8 | 12 | 8.72 | 약 11.5 |
| 8 | 10 | 15 | 10.90 | 약 9.2 |
| 10 | 12 | 18 | 13.08 | 약 7.6 |

이는 모든 공격의 base가 같다고 가정한 단순 계산이며 실제 KO율은 startup/recovery, 명중률, 거리, 넉백 재접근, 로프 특수기 때문에 크게 달라진다. 현재 공격별 수치가 없어 “60초 평균 KO 가능성”을 확정할 수 없다. 초기 목표는 대칭 기본전 1,000회에서 KO율 50~75%, 평균 시간 35~50초 정도의 관전 가능한 구간을 임시 튜닝 목표로 잡되, 제품 목표가 승인되기 전 영구 규칙으로 간주하지 않는다.

공식의 위험은 다음과 같다.

- `floor`와 최소 피해 1 때문에 낮은 수치 구간에서 스탯 1 변화가 계단식으로 작동하고, 높은 방어도도 무조건 피해를 받는다.
- power 계수 0.6은 defense 0.35보다 강해 동일 투자 비용이라면 공격력 인플레이션이 생길 수 있다.
- sharpness와 luck가 모두 치명타율을 올려 역할이 겹치며 기본 18%도 꽤 높다.
- 45% 상한 근처에서는 두 스탯의 추가 가치가 사라진다.
- 특수기에 `+22`를 방어 계산 뒤 더하면 방어 스탯을 크게 우회한다.

첫 구현에서는 공식을 유지해 기준선을 만들되, 입력/중간값/최종값을 분리하고 clamp 범위와 반올림 순서를 테스트로 고정한다. 이후 민감도 실험에서 power/defense 대칭성, 치명타 기여, 최소 피해 정책을 검토한다.

### 분노와 로프 드롭킥

비치명 일반 교환에서 공격자는 +8, 피격자는 +12이므로 각각 약 13회, 9회 사건으로 100에 도달한다. 치명타 대체 증가량이면 공격자는 최소 8회, 피격자는 6회 정도다. 양측이 공격과 피격을 번갈아 경험하면 선수당 대략 5회의 전체 교환만으로도 합산 분노가 100에 근접한다. 따라서 한 경기에서 여러 차례 특수기 기회가 생길 수 있으나, “로프 근처” 조건 때문에 실제 사용 빈도는 AI의 로프 이동 정책에 좌우된다.

`ROPE_SETUP → ROPE_REBOUND → ROPE_CHARGE → DROP_KICK_ACTIVE → RECOVERY`의 별도 행동 단계가 필요하다. AI 상태를 불필요하게 늘리기보다 현재 특수 행동의 phase로 모델링한다. 각 phase에 최대 tick, 목표점, 속도, 취소 가능 여부를 두며 다음 안전장치를 둔다.

- 반동/돌진의 최대 거리와 최대 tick 후 강제 회복
- 위치를 링 경계로 clamp하고 경계 충돌 시 속도 제거
- 돌진 중 상대를 한 번만 맞히는 `hasHit`
- swept x interval 또는 이전/현재 hitbox 합집합으로 고속 통과 누락 방지
- 겹침 해소는 양측 질량이 같으면 대칭 이동하되 경계에 막힌 쪽의 잔여 보정을 반대쪽에 적용
- 분노는 특수 행동을 확정해 시작할 때 소비하며, 이후 피격 취소에도 환불하지 않는 단순 규칙
- 특수기 실패 시 명시된 recovery를 적용하고 즉시 재선택 금지

AI는 분노 100, 쿨다운 없음, 자기 로프 구역, 올바른 방향, 최소 거리, 상대가 KO/특수 무적 상태 아님을 모두 만족할 때만 확률 판정을 한다. 분노가 찼지만 로프 밖이면 첫 버전 AI가 일부러 후퇴할지 결정이 필요하다. 단순 FSM 범위를 지키려면 자연스러운 넉백 등으로 로프 조건이 생겼을 때만 사용하고, 의도적 로프 탐색은 후속 튜닝으로 미루는 것이 안전하다.

### 단순 FSM AI 평가와 최소 보정

균등 선택은 구현과 재현이 쉽지만 사거리 차이를 무시해 헛손질이 많고, 양측이 같은 판단 구조면 대칭 교착·동시 행동 반복·경계 압박이 발생할 수 있다. 판단 주기 0.20~0.50초는 12~30 tick으로 적절한 출발점이나 공격 recovery보다 짧으면 타이머가 사실상 소모만 되고, 길면 근거리에서 멈춰 보일 수 있다.

첫 버전의 최소 보정은 Utility AI 없이도 가능하다.

- “현재 사거리와 쿨다운에서 실행 가능한 공격”만 균등 후보에 포함
- 공격 사거리보다 약간 먼 경우 APPROACH, 너무 겹친 경우 PUSH 또는 짧은 separation
- 행동 완료 시 다음 decision timer를 다시 설정하고 busy 중에는 RNG를 소비하지 않음
- 후보 목록 순서를 고정해 객체 키 순서 변경이 RNG 결과에 영향을 주지 않게 함
- 모든 일반 공격이 불가하면 IDLE보다 APPROACH를 우선하되 경계/겹침에서는 안전한 짧은 대기
- 동일 seed 대칭 편향을 피하려고 선수별 독립 RNG 스트림을 쓰기보다, 한 경기의 단일 고정 호출 순서를 우선한다. 독립 스트림이 필요하면 P1/P2 태그로 파생하고 버전으로 고정한다.

향후 프로필에는 `decisionIntervalTicks`, `reactionDelayTicks`, 고정 순서의 `actionWeights`, `actionFailureRate`, `ropeDropkickChance`, `rangeError`, `cooldownMultiplier`, `reengageBias`를 둔다. 첫 버전은 가중치 필드를 스키마에 두더라도 모두 1로 설정한다. 난이도 실험은 기준 AI 대비 프로필 하나만 변경하고 동일 seed 세트를 사용한다.

## 5. 시뮬레이션 및 검증 계획

### RNG와 seed 정책

- 브라우저용으로 구현이 작고 32-bit 연산이 명확한 Mulberry32를 권장한다. 암호학적 난수는 필요 없으며 상태를 unsigned 32-bit로 강제한다.
- 외부 seed 입력을 정규화하고 `0`도 유효 seed로 처리한다.
- 배치의 `baseSeed`에서 매치 인덱스를 정수 혼합 함수로 파생해 `matchSeed = mix32(baseSeed, index)`로 만든다. 단순 `baseSeed + index`보다 인접 seed 상관을 줄인다.
- RNG 알고리즘 ID/버전과 seed 파생 정책 버전을 결과 metadata에 기록한다.
- RNG 호출 위치와 순서를 규칙의 일부로 보고 불필요한 호출도 회귀 변경으로 취급한다. 렌더링과 UI에서는 시뮬레이션 RNG를 절대 공유하지 않는다.

### 실행 방식과 UI 응답성

- **1회**: 동기 실행으로 완료하되 tick 상한(예: 3,600 + 종료 처리 여유)을 검증한다. 관전 모드는 같은 seed로 실시간 step한다.
- **100회**: 한 chunk에 소수 경기 또는 시간 예산(약 8ms)만 처리하고 `setTimeout(0)`으로 UI에 양보한다.
- **1,000회**: 같은 chunk runner를 사용하며 완료 수/전체 수/경과 시간/취소 버튼을 제공한다. `requestIdleCallback`은 지원과 호출 시점이 일관되지 않으므로 최적화 선택지일 뿐 필수 경로로 삼지 않는다.
- 취소 플래그는 경기 사이 및 일정 tick마다 확인한다. 취소 결과는 `status: "cancelled"`, 완료 경기 수와 부분 집계를 보존하되 정상 완료 데이터와 명확히 구분한다.
- 예외 발생 시 실패한 index/seed/error code를 기록하고 전체 진행을 중지하는 것을 첫 버전 기본 정책으로 한다.
- 10,000회 이상은 core가 DOM/Canvas에 의존하지 않는다는 전제에서 ES module Web Worker로 이전한다.

### 결과 데이터 보완

최상위에 다음 metadata를 추가한다.

- `schemaVersion`, `createdAt`(재현 비교 대상 밖), `status`
- `baseSeed`, `seedDerivation`, `rngAlgorithmVersion`
- `rulesVersion`, `aiProfileVersion` 외에 실제 `configSnapshot` 또는 안정적 config hash
- `fixedDt`, `timeLimitTicks`, 요청/완료/실패 경기 수
- P1/P2의 캐릭터 ID, stats snapshot, AI profile ID와 실제 profile snapshot

집계에는 승률뿐 아니라 표본 수, 동시 KO 수, 평균/중앙값/최소/최대 경기 시간, 공격 명중률, 치명타율(명중 대비), 로프 드롭킥 성공률(시도 대비), 평균 잔여 체력, P1/P2 위치 교환 대조 결과를 추가한다. `totalDamageDealt`와 상대의 `totalDamageTaken`은 검증에 유용하므로 중복처럼 보여도 유지할 수 있으나 불일치 시 데이터 오류로 처리한다. `matchSeeds`와 compact match summaries가 모두 seed를 담으면 중복이므로 summaries가 있을 때 별도 `matchSeeds`는 생략한다.

JSON 다운로드는 Blob/Object URL로 만들고 사용 직후 URL을 revoke한다. 숫자는 tick 기반 원본과 표시용 초를 구분하며, 집계 반올림은 UI에서만 한다.

### 최소 회귀 테스트

1. 동일 seed/config를 두 번 headless 실행해 결과 객체(비결정 metadata 제외)가 완전히 같은지 검사한다.
2. 같은 seed/config의 관전 step과 headless step 결과가 `mode` 및 표현 이벤트를 제외하고 같은지 검사한다.
3. 기본 stats에서 피해 공식 경계, 치명타/비치명타, 최소 피해 1, 치명타 확률 clamp를 검사한다.
4. active frame이 여러 tick 겹쳐도 `hasHit`로 한 번만 피해가 발생하는지 검사한다.
5. 같은 tick 양측 명중이 모두 적용되고 동시 KO가 DRAW가 되는지 검사한다.
6. 3,600번째 tick의 공격/KO와 TIMEOUT 우선순위, 체력 동률 DRAW, 체력 차 판정승을 검사한다.
7. 넉백·접근·로프 돌진 후 선수들이 링 경계를 넘거나 서로 관통 상태로 남지 않는지 검사한다.
8. 로프 조건이 하나라도 부족하면 특수기가 시작되지 않고, 성공/실패 모두 분노 소비 및 recovery 규칙을 지키는지 검사한다.
9. 100/1,000회 배치에서 파생 seed가 중복되지 않고 단일 실행 결과와 해당 배치 항목이 일치하는지 검사한다.
10. P1/P2가 동일 stats/profile일 때 다수 seed와 시작 위치를 서로 바꾼 대조 실험에서 통계적으로 큰 슬롯 편향이 없는지 검사한다.
11. pause/resume과 렌더 FPS 패턴을 바꿔도 실행된 tick 수와 최종 결과가 같은지 검사한다.
12. 결과 집계의 승/패/무 합계, 피해 dealt/taken 교차 합계, 명중/시도 비율 분모 0 처리를 검사한다.

관전/결과 일치 검증은 하나의 “step trace hash”도 선택적으로 사용한다. 매 tick의 결정적 필드만 안정된 순서로 직렬화해 누적 해시하고, 최초 불일치 tick을 보고하면 원인 추적이 쉽다. 이미지 로드, 렌더 interpolation, wall-clock, DOM 상태는 해시에서 제외한다.

### 밸런스 검증 루프

1. 승인된 config snapshot과 고정 seed 세트(최소 1,000개)를 기준선으로 저장한다.
2. 대칭 P1/P2로 슬롯 공정성, KO율, 평균 시간, 명중률을 측정한다.
3. 한 번에 공격 수치, stats, AI 프로필 중 한 축만 변경한다.
4. 동일 seed의 paired difference와 전체 분포를 비교한다.
5. 쉬움/보통/어려움은 기준 P1 대 난이도 P2의 목표 P1 승률로 정의한다.
6. 통계 목표를 만족한 뒤 대표 seed와 극단 seed를 관전해 시각적으로 자연스러운지 확인한다.

## 6. 단계별 구현 순서

실제 구현 단계이며, 이 문서 작성 시점에는 어떤 단계도 수행하지 않는다.

### 0단계: 에셋 메타데이터 및 규칙 결정 확정

- **목표:** 현재 RGBA 선수 시트의 프레임 메타데이터와 누락된 전투 수치, 동시 KO/로프 규칙을 승인한다.
- **수정 예상 파일:** `docs/decisions/*.md`, 추후 `src/config/*`
- **완료 기준:** 각 543×724 프레임의 source rect/pivot/발바닥 기준선, 링 경계, 모든 행동 수치와 모호성 항목의 결정이 문서화됨
- **검증 방법:** 이미지 알파 채널·투명 모서리 검사, 프레임별 단독 미리보기와 공통 피벗 오버레이, 규칙표 리뷰
- **진행 조건:** 현재 투명 캐릭터 시트가 공통 피벗으로 흔들림 없이 렌더되고 영구 규칙의 승인자가 확인함

### 1단계: 정적 셸과 설정 스키마

- **목표:** 1920×1080 Canvas, 16:9 반응형 컨테이너, 모드 UI와 중앙 설정 객체를 만든다.
- **수정 예상 파일:** `index.html`, `style.css`, `src/main.js`, `src/config/*`, `README.md`
- **완료 기준:** GitHub Pages 하위 경로와 로컬 정적 서버에서 상대 경로 로드, 세로 안내/레터박스 표시
- **검증 방법:** 여러 viewport와 DPR에서 수동 검사, 에셋 로드 실패 UI 검사
- **진행 조건:** config 외부에 경로·규칙 수치 하드코딩이 없음

### 2단계: 결정적 코어와 RNG

- **목표:** Canvas 없이 생성/step 가능한 GameState, Player, RNG, tick clock을 만든다.
- **수정 예상 파일:** `src/core/rng.js`, `game-state.js`, `player.js`, `game.js`, 관련 config와 tests
- **완료 기준:** 동일 seed와 입력으로 상태 trace가 반복 일치하고 3,600 tick 시간이 정확함
- **검증 방법:** RNG golden sequence, seed 파생, clock/초기 상태 자동 테스트
- **진행 조건:** 코어 모듈이 DOM, Canvas, wall-clock에 의존하지 않음

### 3단계: 이동·충돌·행동 상태

- **목표:** 접근, 경계, 비관통, action phase, cooldown, 경직, 넉백을 구현한다.
- **수정 예상 파일:** `src/core/game.js`, `player.js`, `combat-rules.js`, `src/config/combat-config.js`, tests
- **완료 기준:** IDLE/APPROACH/KICK/PUSH/DROP_KICK의 phase와 상태 우선순위가 tick 단위로 동작
- **검증 방법:** 경계·겹침·startup/active/recovery·중단 우선순위 테스트
- **진행 조건:** 장시간 step에도 NaN, 경계 탈출, 영구 겹침이 없음

### 4단계: 피해·분노·종료 및 결과

- **목표:** 동시 hit 수집/적용, 치명타, 분노, KO/TIMEOUT/DRAW와 카운터를 완성한다.
- **수정 예상 파일:** `combat-rules.js`, `game.js`, `src/simulation/result-schema.js`, tests
- **완료 기준:** 중복 hit 방지, 동시 KO, 판정승, 모든 필수 결과 필드 생성
- **검증 방법:** 피해 경계와 종료 우선순위, dealt/taken 불변식 자동 테스트
- **진행 조건:** 하나의 고정 scripted 입력 경기 결과가 golden result와 일치

### 5단계: 기본 AI

- **목표:** 동일 프레임워크의 결정적 FSM AI로 양측 자동 전투를 실행한다.
- **수정 예상 파일:** `src/core/ai-controller.js`, `src/config/ai-profiles.js`, `game.js`, tests
- **완료 기준:** 결정 주기, 가능 공격 균등 선택, 안전 대체 행동, busy 상태 판단 금지가 동작
- **검증 방법:** 고정 RNG sequence의 행동 trace, 대칭 슬롯 편향 smoke test
- **진행 조건:** 1,000개 seed가 모두 60초 이내 정상 종료하고 무한 상태가 없음

### 6단계: 로프 드롭킥

- **목표:** 분노 조건, 로프 반동, 돌진, 명중/실패 회복을 추가한다.
- **수정 예상 파일:** `combat-rules.js`, `ai-controller.js`, `combat-config.js`, `player.js`, tests
- **완료 기준:** 단계별 timeout, 단일 hit, rage 소비, 경계 안전장치가 모두 적용됨
- **검증 방법:** 각 전제조건과 취소/빗나감/고속 통과/경계 사례 자동 테스트
- **진행 조건:** 10,000 scripted steps에서 무한 왕복·경계 탈출·다중 피해 없음

### 7단계: 관전 렌더링과 HUD

- **목표:** 경기장/선수 포즈, 동적 HUD, 피해 텍스트, 결과 오버레이, 시작/일시정지/재개/R을 구현한다.
- **수정 예상 파일:** `src/presentation/*`, `src/main.js`, `style.css`, `README.md`
- **완료 기준:** 1920×1080 논리 화면과 반응형 표시, P2 좌우 반전, 선택적 tint fallback, 30 FPS 목표
- **검증 방법:** desktop/mobile landscape/portrait, DPR별 시각 검사와 렌더 FPS 측정
- **진행 조건:** 렌더러를 끄거나 FPS를 바꿔도 동일 seed 결과가 같음

### 8단계: 단일 및 배치 시뮬레이션

- **목표:** 결과 1/100/1,000회, 진행률, 취소, 집계, JSON 다운로드를 구현한다.
- **수정 예상 파일:** `src/simulation/*`, `src/main.js`, `index.html`, `style.css`, tests, `README.md`
- **완료 기준:** UI가 응답 가능한 상태로 배치 완료/취소되고 메모리가 summary 정책 안에 머묾
- **검증 방법:** 단일 대 배치 항목 일치, 집계 불변식, 취소/실패, JSON schema 검사
- **진행 조건:** 1,000회 성능·메모리 예산을 실제 desktop과 mobile에서 기록

### 9단계: 재현성·밸런스 기준선

- **목표:** 관전/headless parity와 고정 seed 기준선을 확립하고 초기 수치를 조정한다.
- **수정 예상 파일:** `tests/*`, `src/config/*`, `docs/decisions/*`, `README.md`
- **완료 기준:** 회귀 테스트 통과, rules/AI/RNG/schema 버전 기록, 목표 지표와 실제 분포 문서화
- **검증 방법:** 고정 1,000 seed paired run, 슬롯 교환 실험, 대표 경기 관전
- **진행 조건:** 승인된 기준선과 버전 변경 정책이 있어야 첫 구현 완료로 판정

## 7. 위험 요소와 완화책

| 위험 | 영향 | 완화책 |
|---|---|---|
| 에셋 디렉터리나 파일명의 후속 변경 | 로드 실패, 문서/배포 경로 혼선 | 현재 `asset/...` 경로를 asset manifest 한곳에 기록하고 GitHub Pages 하위 경로에서 상대 URL 테스트 |
| 향후 선수 PNG가 RGB이거나 배경을 포함함 | 게임 화면에 사각형 노출, tint/초상화 실패 | 가져오기 단계에서 RGBA·투명 모서리를 검사하고 에셋 문제로 보고. 알파 PNG 변환 또는 재생성 후에만 채택하며 런타임 색상 키는 사용하지 않음 |
| 프레임별 피벗·점유 폭 차이 | 포즈 전환 시 순간이동, 히트박스 불일치 | 프레임 metadata에 source rect, pivot, feet baseline, draw offset 저장. 물리 hurtbox는 렌더 프레임과 분리 |
| 모바일 GPU/CPU 성능 | 30 FPS 미달, 배치 중 UI 정지 | 이미지/tint 캐시, draw call 최소화, 플로팅 텍스트 상한, chunk 배치와 추후 Worker. 실제 저사양 기기 측정 |
| 큰 Canvas와 높은 DPR | 메모리 증가, 흐림 또는 과도한 backing buffer | 논리 좌표는 1920×1080 유지하되 backing size 상한을 두고 CSS contain. smoothing off와 픽셀 스냅은 렌더 전용 |
| 모바일 세로/터치/키보드 제약 | R 키 사용 불가, 화면 일부 손실 | 세로 안내, 동일 기능의 재시작 버튼 제공, 회전 강제 API 미사용, safe-area 고려 |
| 부동소수 및 RNG 호출 순서 | 브라우저/리팩터 후 재현성 손실 | 시간/phase는 정수 tick, 32-bit RNG와 golden sequence, 호출 위치 고정, RNG/규칙 버전 기록 |
| P1 우선 업데이트 | 대칭전 슬롯 편향, 난이도 데이터 왜곡 | tick 시작 snapshot에서 hit를 수집해 동시 적용, 시작 위치 교환 paired test |
| 공격/피격/특수기 상태 충돌 | 이중 피해, 행동 잠김, 경계 탈출 | 상태 우선순위, phase timeout, `hasHit`, 전이표와 불변식 테스트 |
| 고속 로프 돌진의 tunneling | 시각상 통과했는데 미명중 | swept collision 또는 보수적 hitbox 합집합, 최대 속도/step 테스트 |
| 분노 증가가 너무 빠르거나 로프 조건이 희박함 | 특수기 남발 또는 사실상 미사용 | attempts/opportunities/hits를 각각 계측하고 1,000회 빈도 기반 조정. 증가량과 AI 이동 정책을 분리 실험 |
| 1,000회 실행 UI 정지 | 브라우저 무응답, 취소 불가 | 시간 예산 chunk, 진행률/취소 플래그, 상세 이벤트 미보관. 10,000회 이상 Worker |
| 상세 결과 무제한 보관 | 메모리/다운로드 파일 급증 | compact summary 기본, 이벤트 ring buffer, 상세 로그 opt-in 및 경기 수 상한 |
| 평균만으로 밸런스 판단 | 극단값·교착·슬롯 편향 은폐 | 중앙값/분포/KO율/명중률/표본 수와 paired seed 비교, 대표·극단 seed 관전 |
| stats와 AI를 동시에 변경 | 난이도 원인 해석 불가 | 기준 대조군에서 한 축만 변경하고 config snapshot/hash 기록 |
| tint가 시뮬레이션 경로에 섞임 | 시각 기능 실패가 결과를 변경 | tint/오프스크린 캐시는 presentation에만 두고 실패 시 원본 렌더. 코어에는 팀 색상 문자열 외 표현 객체 금지 |

## 계획 승인 전 핵심 체크리스트

- 현재 RGBA 선수 시트의 프레임별 공통 피벗과 발바닥 기준선이 승인되었는가?
- 공격별 모든 시간/거리/피해/넉백/쿨다운 값이 정의되었는가?
- 동시 KO, 시간 종료 tick, 분노 소비/취소 규칙이 승인되었는가?
- `asset/gameboard/arena_480x270.png`, `asset/player_sprite/red_comet_sheet.png`, `asset/play_sample/sample_play.png`가 asset manifest와 일치하는가?
- 초기 KO율/평균 경기 시간/로프 특수기 빈도의 목표 범위가 합의되었는가?
- `rulesVersion`, `aiProfileVersion`, RNG 및 결과 schema 버전의 변경 기준이 정해졌는가?
