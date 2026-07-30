# 06. 화면 전환 회귀 수정 및 이동 속도 회피 구현 계획

작성일: 2026-07-30  
관련 문서: `docs/todo.md`, `docs/plans/05-match-consistency-and-counter-priority-plan.md`  
대상: 버그 픽스 2건, 개발 확정 1건  
목표: 설정/전투 화면이 언제나 같은 프레임에서 하나씩만 표시되도록 회귀를 수정하고, 샘플 이미지의 데스크톱 2열 구성을 복원하며, `moveSpeed` 투자에 결정적인 완전 회피 효과를 추가한다.

## 1. 요구사항 요약

- 스테이터스 설정 화면과 전투 시뮬레이션 화면을 동시에 표시하지 않고, 동일한 크기와 비율의 영역에서 자연스럽게 전환한다.
- 설정 화면을 `asset/play_sample/sample_setting.png`처럼 데스크톱 좌우 2열 카드 UI로 표시하고, 스타일이 없는 것처럼 보이는 1열 회귀를 수정한다.
- 피격 시 상대 공격의 피해를 0으로 만드는 완전 회피 효과를 `moveSpeed`의 부가 효과로 구현한다.
- 버그 픽스 2건을 먼저 안정화한 뒤 회피 규칙을 추가하며, `검토 불필요` 항목은 다루지 않는다.

## 2. 우선 버그 픽스

### 설정 화면과 전투 화면의 단일 표시 보장

**관련 TODO:** 버그 픽스 1

**재현 조건과 원인 가설**

- 현재 `index.html`은 설정과 전투 layer를 모두 DOM에 상시 두고 `hidden` 속성을 제거한 상태다. 어느 화면을 숨길지는 `style.css`의 `opacity`, 절대 배치, `pointer-events`에 전적으로 의존한다.
- 새 HTML과 이전 CSS가 브라우저 캐시 때문에 조합되거나 CSS 로딩이 늦거나 실패하면 두 section이 일반 문서 흐름에 함께 표시된다. 이 경우 설정 화면 아래에 Canvas가 나타나는 TODO 현상과 일치한다.
- `aria-hidden`과 `inert`는 접근성과 입력을 제한하지만 시각적 표시를 보장하지 않으므로 CSS 실패에 대한 fallback이 아니다.
- 전환 중 `battle-only` 패널의 `hidden` 상태와 layer의 표시 상태가 별도로 갱신되어 빠른 왕복이나 초기화 실패 시 UI 상태가 어긋날 가능성도 있다.

**수정 방안**

- 화면 상태의 단일 기준을 `experience-frame.dataset.view`와 `setView()`로 유지하되, 활성 layer에만 `data-active="true"`를 부여한다.
- 초기 HTML에서는 전투 layer에 네이티브 `hidden`을 적용해 CSS 로드 전에도 설정 화면 아래에 Canvas가 노출되지 않도록 한다.
- 전환 시작 시 새 layer의 `hidden`을 먼저 해제하고 animation frame에서 활성 class를 교체한다. 180ms 전환 종료 후 이전 layer에 `hidden`을 적용한다.
- 전환 도중 새 전환 요청이 들어오면 기존 timer/listener를 취소하고 최종 `data-view`에 맞춰 상태를 정규화한다.
- 비활성 layer에는 `hidden`, `aria-hidden="true"`, `inert`를 함께 적용하고, 활성 layer에는 세 속성을 함께 해제해 시각·포커스·입력 상태가 분리되지 않게 한다.
- `battle-only` 제어/결과 패널도 별도 임의 토글 대신 같은 view 상태에서 파생해 전투 view에서만 표시한다.
- stylesheet URL에 규칙/UI 버전 기반 cache-busting query를 적용해 배포 직후 새 HTML과 이전 CSS가 섞이는 위험을 줄인다. 상대 경로는 유지해 GitHub Pages 하위 경로 호환성을 보존한다.

**영향 범위**

- `index.html`: 초기 `hidden` fallback과 stylesheet 버전 식별자
- `src/main.js`: 취소 가능한 layer 전환 상태 관리
- `style.css`: active/leaving layer 전환과 `[hidden]` 규칙
- 전투 규칙, RNG, Canvas 렌더링 결과에는 영향 없음

**위험과 검증**

- `hidden`을 너무 일찍 적용하면 fade-out이 보이지 않으므로 transition 종료 시점과 reduced-motion 분기를 각각 검증한다.
- 빠른 설정↔전투 왕복, 전투 시작 직후 돌아가기, 배치 실행 중 돌아가기에서 최종적으로 한 layer만 visible/focusable인지 확인한다.
- CSS를 차단한 상태에서도 초기 Canvas가 설정 화면 아래 노출되지 않는지 확인한다.
- desktop 1440/1024px에서 두 view의 `experience-frame.getBoundingClientRect()`가 동일하고 16:9인지 DOM 테스트로 확인한다.
- 가로 모바일에서는 16:9를 유지하고 세로 760px 이하에서는 설정 접근성을 위한 최소 높이와 내부 스크롤이 정상인지 육안 검증한다.

### 샘플 기준 데스크톱 2열 설정 UI 복원

**관련 TODO:** 버그 픽스 2

**재현 조건과 원인 가설**

- 샘플 이미지는 좌측에 `STAT BUDGET/선수 스탯/COMBAT PREVIEW`, 우측에 `NEXT OPPONENT/TOTAL FIGHT POWER/버튼`이 배치된 명확한 2열 구조다.
- 현재 CSS에는 기본 2열 grid가 있지만 `@media (max-width: 760px)`에서 1열로 바뀐다. 브라우저 viewport가 좁거나 페이지가 축소된 embedded 환경에서는 데스크톱 의도와 다르게 1열 규칙이 적용될 수 있다.
- 스타일시트가 이전 버전이거나 로드되지 않은 경우 section/div의 기본 block layout 때문에 동일하게 1열 무스타일 형태가 된다. 따라서 CSS 요청 성공 여부와 실제 computed style을 함께 확인해야 한다.
- 공통 프레임의 고정 16:9 높이에 현재 카드 콘텐츠가 들어가므로, 화면 폭에 따라 내부 overflow와 카드 축소가 샘플과 다른 인상을 만들 수 있다.

**수정 방안**

- 샘플의 정보 계층을 기준으로 desktop 설정 layer를 두 개의 명시적 grid area(`fighter`, `preview`, `opponent`, `power`, `actions`)로 정의한다.
- 761px 이상에서는 반드시 두 열을 사용하고, 좌우 column 내부 카드 폭과 간격, 버튼 높이 44px 이상을 유지한다.
- breakpoint는 단순 viewport만 보지 않고 실제 사용 가능한 프레임 폭을 기준으로 정리한다. container query 지원 여부에 의존하지 않도록 기본 media-query fallback도 유지한다.
- 샘플처럼 좌측은 스탯과 미리보기, 우측은 상대·전투력·행동 버튼 순서로 고정하며 좁은 화면에서만 한 열로 재배치한다.
- 프레임 안에서만 세로 스크롤하고 제목과 프레임 자체의 위치·크기는 전환 시 움직이지 않게 한다.
- stylesheet 로드 확인용 정적 경로 테스트와 핵심 selector(`display:grid`, 열 개수, layer position)의 computed-style 브라우저 테스트를 추가한다.

**영향 범위**

- `index.html`: 필요하면 grid area용 의미 class 추가
- `style.css`: 데스크톱 grid areas, breakpoint, overflow, 카드 밀도 조정
- `asset/play_sample/sample_setting.png`: 비교 기준으로만 사용하고 런타임 배경으로 삽입하거나 수정하지 않음

**위험과 검증**

- 샘플은 1686×1050으로 정확한 16:9가 아니므로 픽셀 복제보다 좌우 2열 구조, 정보 순서, 색상 위계와 버튼 배치를 기준으로 삼는다.
- 1440×900, 1024×768에서 2열인지 확인하고 760px 경계의 양쪽에서 의도한 레이아웃 전환을 검사한다.
- 스탯 이름 8개와 미리보기 항목이 잘리거나 버튼과 겹치지 않는지 확인한다.
- CSS/JS 정적 경로가 GitHub Pages 형태의 하위 경로에서도 상대 URL로 정상 해석되는지 확인한다.

## 3. 개발 확정 — `moveSpeed` 완전 회피

**관련 TODO:** 개발 확정 1

**규칙 정의**

- 기준값 10까지는 회피율 0%로 두어 기존 기본 스탯 경기 결과를 가능한 한 보존한다.
- 10을 초과한 `moveSpeed` 1점마다 회피율을 0.5%p 부여하고 최대 5%로 제한한다.
- 공식은 `dodgeChance = clamp((moveSpeed - 10) × 0.005, 0, 0.05)`로 정의한다.
- 회피에 성공하면 해당 hit의 피해, 경직, 넉백, 양측 분노 증가를 모두 적용하지 않는다.
- 회피된 공격은 `attacksAttempted`에는 남지만 `attacksHit`, 행동별 hit, 치명타 hit, 로프 드롭킥 hit에는 포함하지 않는다.
- 회피는 일반 공격과 로프 드롭킥 모두에 적용한다. 로프 드롭킥은 카운터 면역 규칙만 유지하며 회피 면역으로 만들지 않는다.
- 동일 hit에서는 기존 카운터를 먼저 판정하고 카운터가 실패하거나 불가능할 때만 회피를 판정한다. 카운터 성공 시 회피 RNG를 소비하지 않는다.
- 회피한 선수의 같은 tick 일반 공격은 취소하지 않는다. 피해를 피하는 방어 효과이며 반격 행동을 선택하는 카운터와 역할을 구분한다.

**데이터와 RNG 설계**

- `deriveStats()`에 `dodgeChance`를 추가하고 설정 미리보기에서 회피 확률을 표시한다.
- `Game`에 P1/P2 독립 `dodgeRng` stream을 추가하며 기존 AI·치명타·카운터 stream과 다른 salt를 사용한다.
- 회피 추가가 기존 카운터와 치명타의 난수 소비 순서를 바꾸지 않도록 `applyHits()`에 별도 RNG map을 전달한다.
- player metrics에 `dodgesAttempted`, `dodgesSucceeded`를 추가하고 결과 JSON과 batch aggregate에 양측 평균 회피와 회피 성공률을 기록한다.
- `DODGE` 이벤트를 actor=defender, target=attacker로 발생시키고 피해 값은 0으로 기록한다. renderer에는 선수 머리 위 짧은 `회피!` 피드백을, audio에는 신규 에셋 없이 무음 처리를 적용한다.
- 전투 의미와 결과 shape이 바뀌므로 `RULES_VERSION`, `STAT_RULES_VERSION`, `RESULT_SCHEMA_VERSION`을 각각 갱신한다.
- `combatPower()`에는 기대 피해 감소량을 반영한 낮은 가중치를 추가하되, 상한 5% 때문에 이동 성능과 합쳐 과대평가되지 않도록 1,000 seed 승률 분석 후 확정한다.

**영향 범위**

- 설정: `src/config/game-config.js`
- 스탯 공식/미리보기: `src/core/stat-rules.js`
- 전투 판정/RNG: `src/core/combat-rules.js`, `src/core/game.js`
- 지표: `src/core/player.js`, `src/simulation/results-aggregator.js`, 결과 schema
- 표시: `src/main.js`, `src/presentation/feedback.js`, `src/presentation/renderer.js`
- 문서: `README.md`

**위험과 검증**

- 기본 `moveSpeed=10`에서는 회피 RNG가 판정 대상마다 소비되더라도 다른 stream에 영향을 주지 않으며 회피 성공은 항상 0인지 확인한다.
- `moveSpeed=20`은 약 5% 방향의 성공률을 보이는지 1,000 seed 민감도 테스트로 확인한다.
- 고정 RNG 단위 테스트로 회피 성공 시 체력·경직·속도·분노가 모두 변하지 않고 `DODGE` 이벤트만 1회 발생하는지 확인한다.
- 카운터 성공 시 회피 판정 0회, 카운터 실패 후 회피 성공, 로프 드롭킥 회피, 양측 동시 회피를 각각 테스트한다.
- 회피된 치명타가 `criticalHits`에 포함되지 않고 회피된 공격이 `attacksHit`에 포함되지 않는지 확인한다.
- 같은 seed·스탯의 spectator/headless canonical 결과가 100개 seed에서 일치하는지 재검증한다.
- 1,000경기에서 기본값과 `moveSpeed=20`의 승률, 평균 피해, 경기 시간, 회피율을 비교해 5% 상한이 지나치게 큰 승률 변화를 만들지 않는지 기록한다.

## 4. 구현 순서

1. 화면 layer에 네이티브 `hidden` fallback과 단일 전환 상태를 적용한다.
2. 샘플 기준 desktop grid와 반응형 breakpoint를 수정하고 실제 computed style을 검증한다.
3. 회피 공식, 독립 RNG stream, 카운터 이후 회피 판정 순서를 구현한다.
4. 결과 schema·집계·단일/배치 UI·전투 피드백을 확장한다.
5. 규칙/스탯/schema 버전과 README를 갱신한다.
6. 단위·결정성·통계·정적 경로·화면 크기 회귀 테스트를 실행한다.

## 5. 완료 기준

- CSS 로드 전·실패·정상 상태 모두에서 설정과 전투 화면이 동시에 표시되지 않는다.
- 설정과 전투가 desktop에서 동일한 16:9 외곽 프레임을 사용하고 180ms 전환 후 비활성 화면은 `hidden`, `aria-hidden`, `inert` 상태다.
- 761px 이상 설정 화면은 샘플과 같은 좌우 2열 정보 구조이고, 좁은 화면에서만 접근 가능한 1열로 전환된다.
- `moveSpeed` 10은 회피율 0%, 20은 5%이며 설정 미리보기와 결과 데이터에서 같은 공식을 사용한다.
- 회피 성공 시 피해·경직·넉백·분노가 모두 0이고 기존 카운터 우선순위와 로프 드롭킥 카운터 면역이 유지된다.
- 기존 28개 테스트와 새 화면·회피 테스트가 모두 통과하고 spectator/headless 결정성이 유지된다.
- 변경된 화면 전환, 회피 공식, 지표와 버전을 `README.md`에 기록한다.
- `docs/todo.md`와 `asset/play_sample/sample_setting.png`는 수정하지 않는다.
