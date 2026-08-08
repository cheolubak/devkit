# ARIA 상태 및 속성 참고 자료

ARIA(Accessible Rich Internet Applications)의 state와 property에 대한 빠른 참고 가이드입니다. 사용 예제와 흔한 실수를 포함합니다.

---

## 목차

1. [위젯 속성 (Widget Attributes)](#위젯-속성-widget-attributes)
2. [라이브 리전 속성 (Live Region Attributes)](#라이브-리전-속성-live-region-attributes)
3. [관계 속성 (Relationship Attributes)](#관계-속성-relationship-attributes)
4. [드래그 앤 드롭 속성 (Drag-and-Drop Attributes)](#드래그-앤-드롭-속성-drag-and-drop-attributes)

---

## ARIA 상태 및 속성 (States & Properties)

### 위젯 속성 (Widget Attributes)

#### aria-expanded

**목적:** 접을 수 있는 요소가 현재 확장되었는지 접혀있는지를 나타냅니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** 확장 가능한 콘텐츠를 제어하는 버튼 (아코디언, 드롭다운, 트리 아이템).

```tsx
<button aria-expanded={isOpen} aria-controls="panel-1">
  Section Title
</button>
<div id="panel-1" hidden={!isOpen}>
  Panel content
</div>
```

**흔한 실수:**
- `"true"`와 `"false"` 사이를 토글하지 않는 경우 (정적으로 방치).
- 트리거 버튼 대신 콘텐츠 패널에 `aria-expanded`를 추가하는 경우.

---

#### aria-selected

**목적:** 선택 가능한 항목 목록에서 현재 선택 상태를 나타냅니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** `option`, `tab`, `row`, `gridcell`

```tsx
<button role="tab" aria-selected={activeTab === 0}>
  Tab 1
</button>
```

**흔한 실수:**
- 지원하지 않는 요소에 `aria-selected`를 사용하는 경우 (예: `menuitem`).
- 선택되지 않은 항목에 `aria-selected="false"`를 설정하지 않는 경우 (`option`과 `tab`의 경우 완전히 생략하는 것도 유효함).

---

#### aria-checked

**목적:** 체크박스, 라디오 버튼, 스위치의 체크 상태를 나타냅니다.

**유효한 값:** `"true"`, `"false"`, `"mixed"` (삼중 상태 체크박스용)

**사용 대상:** `checkbox`, `radio`, `switch`, `menuitemcheckbox`, `menuitemradio`

```tsx
<button role="switch" aria-checked={isEnabled}>
  Notifications
</button>
```

**흔한 실수:**
- 탭이나 옵션에 `aria-selected` 대신 `aria-checked`를 사용하는 경우.
- "전체 선택" 체크박스에 `"mixed"` 상태를 구현하지 않는 경우.

---

#### aria-disabled

**목적:** 요소가 인식 가능하지만 조작 불가능함을 나타냅니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** 모든 인터랙티브 요소.

```tsx
// aria-disabled는 요소를 접근성 트리와 포커스 가능 상태로 유지
<button aria-disabled={!isValid} onClick={isValid ? handleSubmit : undefined}>
  Submit
</button>
```

**흔한 실수:**
- HTML `disabled` 속성과 혼동하는 경우. `disabled`는 요소를 탭 순서에서 제거하고 비활성화 스타일을 적용합니다. `aria-disabled`는 포커스 가능 상태를 유지하므로 발견 가능성이 더 좋지만, 동작을 직접 방지해야 합니다.
- `aria-disabled="true"`일 때 동작을 방지하지 않는 경우 (ARIA는 동작을 변경하지 않음).

---

#### aria-hidden

**목적:** 시각적으로는 보이지만 보조 기술에서 요소를 숨깁니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** 장식용 요소, 텍스트 레이블이 있는 아이콘, 중복 콘텐츠.

```tsx
// 보이는 레이블이 있는 아이콘
<button>
  <svg aria-hidden="true">...</svg>
  Close
</button>

// 장식용 구분선
<hr aria-hidden="true" />
```

**흔한 실수:**
- 포커스 가능한 요소에 `aria-hidden="true"`를 사용하는 경우 (요소가 여전히 포커스를 받을 수 있지만 음성으로 전달되지 않음).
- 포커스 가능한 자식이 있는 부모에 `aria-hidden="true"`를 사용하는 경우 (일부 스크린 리더에서 해당 자식이 포커스 불가능해짐).
- `aria-hidden="true"` 조상 안의 콘텐츠를 "숨김 해제"하기 위해 `aria-hidden="false"`를 사용하는 경우 (작동하지 않음).

---

#### aria-pressed

**목적:** 토글 버튼의 눌림 상태를 나타냅니다.

**유효한 값:** `"true"`, `"false"`, `"mixed"`

**사용 대상:** 눌림과 안 눌림 상태 사이를 토글하는 버튼.

```tsx
<button aria-pressed={isBold} onClick={toggleBold}>
  Bold
</button>
```

**흔한 실수:**
- `aria-pressed`와 `aria-checked`를 혼동하는 경우. 토글 버튼에는 `aria-pressed`를, 체크박스, 스위치, 라디오 버튼에는 `aria-checked`를 사용하세요.
- 버튼이 아닌 요소에 `aria-pressed`를 사용하는 경우.

---

#### aria-required

**목적:** 제출 전에 사용자 입력이 필요함을 나타냅니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** 폼 입력, combobox, textbox.

```tsx
<label htmlFor="email">Email (required)</label>
<input id="email" type="email" aria-required="true" required />
```

**흔한 실수:**
- 필드가 필수임을 나타내는 시각적 표시 없이 `aria-required`를 사용하는 경우.
- 프로그래밍적 표시 없이 별표(*)에만 의존하는 경우.

---

#### aria-invalid

**목적:** 입력된 값이 기대 형식에 맞지 않음을 나타냅니다.

**유효한 값:** `"true"`, `"false"`, `"grammar"`, `"spelling"`

**사용 대상:** 유효성 검증 후의 폼 입력.

```tsx
<input
  id="email"
  type="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? "email-error" : undefined}
/>
{hasError && <span id="email-error" role="alert">Please enter a valid email address.</span>}
```

**흔한 실수:**
- 사용자가 필드와 상호작용하기 전에 `aria-invalid="true"`를 설정하는 경우 (blur 또는 submit 시에 검증).
- `aria-describedby`를 통해 연관된 오류 메시지를 제공하지 않는 경우.

---

#### aria-sort

**목적:** 테이블 열 또는 행의 정렬 방향을 나타냅니다.

**유효한 값:** `"ascending"`, `"descending"`, `"none"`, `"other"`

**사용 대상:** 정렬 가능한 테이블의 `<th>` 요소.

```tsx
<th scope="col" aria-sort={sortCol === "name" ? sortDir : undefined}>
  <button onClick={() => sortBy("name")}>Name</button>
</th>
```

**흔한 실수:**
- 현재 정렬된 열뿐만 아니라 모든 열에 `aria-sort`를 설정하는 경우.
- 정렬 가능하지만 현재 정렬되지 않은 열에 `"none"`을 제공하지 않는 경우 (`aria-sort`를 완전히 생략하는 것도 허용됨).

---

#### aria-valuenow / aria-valuemin / aria-valuemax / aria-valuetext

**목적:** 범위 위젯의 현재 값과 범위를 정의합니다.

**사용 대상:** `slider`, `progressbar`, `scrollbar`, `separator` (포커스 가능한 경우), `spinbutton`

```tsx
<div
  role="slider"
  aria-valuenow={50}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuetext="50 percent"
  aria-label="Volume"
  tabIndex={0}
/>
```

**흔한 실수:**
- 숫자 값이 의미가 없을 때 `aria-valuetext`를 생략하는 경우 (예: "낮음/중간/높음" 슬라이더는 `aria-valuetext`를 사용해야 함).
- 최소/최대 범위 밖의 `aria-valuenow`를 설정하는 경우.

---

#### aria-current

**목적:** 집합 또는 컨텍스트 내에서 현재 항목을 나타냅니다.

**유효한 값:** `"page"`, `"step"`, `"location"`, `"date"`, `"time"`, `"true"`, `"false"`

**사용 대상:** 내비게이션의 링크, 마법사의 단계, 캘린더의 날짜.

```tsx
// 내비게이션의 현재 페이지
<Link href="/about" aria-current={pathname === "/about" ? "page" : undefined}>
  About
</Link>

// 마법사의 현재 단계
<li aria-current={currentStep === 2 ? "step" : undefined}>
  Step 2: Payment
</li>
```

**흔한 실수:**
- 내비게이션 항목에 `aria-current` 대신 `aria-selected`를 사용하는 경우 (`aria-current="page"` 사용).
- 항목이 더 이상 현재가 아닐 때 `aria-current`를 제거하지 않는 경우.

---

#### aria-busy

**목적:** 요소가 수정 중이며 보조 기술이 변경 사항을 알리기 전에 기다려야 함을 나타냅니다.

**유효한 값:** `"true"`, `"false"`

**사용 대상:** 콘텐츠가 로딩 또는 업데이트 중인 컨테이너.

```tsx
<div role="feed" aria-busy={isLoading}>
  {isLoading ? <Skeleton /> : <ArticleList articles={articles} />}
</div>
```

**흔한 실수:**
- 로딩이 완료되었을 때 `aria-busy="false"`를 설정하지 않는 경우 (일부 스크린 리더가 이를 기다림).
- 컨테이너 대신 개별 항목에 `aria-busy`를 사용하는 경우.

---

### 라이브 리전 속성 (Live Region Attributes)

#### aria-live

**목적:** 영역이 동적으로 업데이트될 것임을 나타내고, 알림의 우선순위를 정의합니다.

**유효한 값:** `"off"`, `"polite"`, `"assertive"`

| 값 | 사용 시기 |
|-------|-------------|
| `"off"` | 기본값. 업데이트가 알려지지 않음. |
| `"polite"` | 사용자가 유휴 상태일 때 업데이트를 알림. 비긴급 메시지(상태, 결과 수)에 사용. |
| `"assertive"` | 현재 음성을 중단하고 즉시 업데이트를 알림. 긴급 메시지(오류, 알림)에 사용. |

```tsx
// polite: 검색 결과 수
<div aria-live="polite">
  {count} results found
</div>

// assertive: 오류 메시지
<div aria-live="assertive">
  {error && <p>Error: {error}</p>}
</div>
```

**흔한 실수:**
- 콘텐츠와 동시에 `aria-live`를 요소에 추가하는 경우 (영역이 먼저 DOM에 존재해야 하고, 그 후에 콘텐츠를 주입해야 함).
- 비긴급 업데이트에 `"assertive"`를 사용하는 경우 (사용자를 방해함).
- 많은 자식이 있는 컨테이너에 `aria-live`를 추가하는 경우 (과도한 알림 발생).

---

#### aria-atomic

**목적:** 보조 기술이 라이브 리전 내의 전체 또는 변경된 노드만 표시할지를 나타냅니다.

**유효한 값:** `"true"`, `"false"`

```tsx
// 일부가 변경되면 전체 영역을 알림
<div aria-live="polite" aria-atomic="true">
  Showing {start}-{end} of {total} results
</div>

// 변경된 부분만 알림
<div aria-live="polite" aria-atomic="false">
  <span>Message 1</span>
  <span>Message 2</span>  {/* 이 새로운 span만 알려짐 */}
</div>
```

**흔한 실수:**
- 채팅 로그에 `aria-atomic="true"`를 사용하는 경우 (매 메시지마다 전체 로그를 다시 읽게 됨).
- `aria-live` 없이 `aria-atomic`을 설정하는 경우 (라이브 리전 없이는 효과 없음).

---

#### aria-relevant

**목적:** 라이브 리전에서 어떤 유형의 변경을 알릴지를 지정합니다.

**유효한 값:** `"additions"`, `"removals"`, `"text"`, `"all"` (또는 공백으로 구분된 조합)

**기본값:** `"additions text"`

```tsx
// 항목이 추가되거나 제거될 때 알림
<ul aria-live="polite" aria-relevant="additions removals">
  {notifications.map((n) => <li key={n.id}>{n.text}</li>)}
</ul>
```

**흔한 실수:**
- 추가만 필요할 때 `aria-relevant="all"`을 사용하는 경우 (과도한 알림 발생).
- `aria-live` 없이 `aria-relevant`를 사용하는 경우.

---

### 관계 속성 (Relationship Attributes)

#### aria-label

**목적:** 요소에 접근 가능한 이름을 제공합니다 (보이는 텍스트를 대체).

**유효한 값:** 모든 문자열.

**사용 대상:** 보이는 텍스트 레이블이 없는 요소, 또는 보이는 텍스트가 충분하지 않은 경우.

```tsx
<button aria-label="Close dialog">
  <XIcon aria-hidden="true" />
</button>

<nav aria-label="Main navigation">
  <ul>...</ul>
</nav>
```

**흔한 실수:**
- 보이는 텍스트가 있을 때 `aria-label`을 사용하는 경우 (보이는 텍스트를 덮어쓰므로 음성 입력 사용자에게 불일치가 발생).
- 중복 레이블링: `<button>Search</button>`에 `aria-label="Search button"` -- 이름이 이미 "Search"임.
- 무시될 수 있는 비인터랙티브, 비랜드마크 요소에 `aria-label`을 사용하는 경우.

---

#### aria-labelledby

**목적:** 현재 요소에 레이블을 제공하는 요소를 식별합니다 (ID로 참조).

**유효한 값:** 공백으로 구분된 ID 목록.

```tsx
<h2 id="billing-heading">Billing Address</h2>
<form aria-labelledby="billing-heading">
  ...
</form>

{/* 여러 레이블 */}
<span id="row-name">John Smith</span>
<button aria-labelledby="row-name delete-label">
  <span id="delete-label">Delete</span>
</button>
{/* "John Smith Delete"로 알려짐 */}
```

**흔한 실수:**
- DOM에 존재하지 않는 ID를 참조하는 경우.
- 근처에 보이는 레이블이 이미 있을 때 `aria-labelledby`를 사용하는 경우 (폼 필드에는 `<label>`의 `htmlFor`를 대신 사용).

---

#### aria-describedby

**목적:** 현재 요소를 설명하는 요소를 식별합니다 (보충 정보).

**유효한 값:** 공백으로 구분된 ID 목록.

```tsx
<label htmlFor="password">Password</label>
<input
  id="password"
  type="password"
  aria-describedby="password-requirements"
/>
<p id="password-requirements">
  Must be at least 8 characters with one uppercase letter and one number.
</p>
```

**흔한 실수:**
- `aria-labelledby`와 혼동하는 경우. `aria-labelledby`는 접근 가능한 이름(기본 레이블)을 제공하고, `aria-describedby`는 보충 설명을 제공합니다.
- 오류 메시지에 `aria-describedby`를 사용하지 않는 경우 (스크린 리더는 레이블 후에 설명을 알림).

---

#### aria-controls

**목적:** 현재 요소가 제어하는 요소를 식별합니다.

**유효한 값:** 공백으로 구분된 ID 목록.

```tsx
<button aria-controls="settings-panel" aria-expanded={isOpen}>
  Settings
</button>
<div id="settings-panel" hidden={!isOpen}>
  Settings content
</div>
```

**흔한 실수:**
- DOM에 아직 존재하지 않는 요소를 참조하는 경우 (제어되는 요소는 숨겨져 있더라도 존재해야 함).
- 참고: 스크린 리더 간 `aria-controls` 지원이 일관적이지 않습니다. 주로 JAWS 사용자에게 유용합니다. 관계를 전달하는 유일한 방법으로 의존하지 마세요.

---

#### aria-owns

**목적:** 시각적/컨텍스트적으로는 자식이지만 DOM 자식이 아닌 요소를 식별합니다 (접근성 트리를 위한 부모 재지정).

**유효한 값:** 공백으로 구분된 ID 목록.

```tsx
{/* 메뉴가 포털로 렌더링되는 메뉴 버튼 */}
<button aria-owns="context-menu" aria-haspopup="true">
  Options
</button>

{/* 포털을 통해 DOM의 다른 곳에 렌더링됨 */}
<ul id="context-menu" role="menu">
  <li role="menuitem">Edit</li>
  <li role="menuitem">Delete</li>
</ul>
```

**흔한 실수:**
- DOM 구조를 수정할 수 있는데 `aria-owns`를 사용하는 경우 (ARIA 부모 재지정보다 DOM 순서를 수정하는 것이 좋음).
- 순환적이거나 충돌하는 소유권 (요소는 하나의 `aria-owns` 부모만 가질 수 있음).

---

#### aria-activedescendant

**목적:** DOM 포커스를 컨테이너에 유지하면서 복합 위젯 내에서 현재 활성 요소를 식별합니다.

**유효한 값:** 활성 자손 요소의 ID.

**사용 대상:** `combobox`, `listbox`, `grid`, `tree`, `tablist`

```tsx
<input
  role="combobox"
  aria-activedescendant={activeOptionId}
  aria-expanded={isOpen}
  aria-controls="listbox"
/>
<ul id="listbox" role="listbox">
  <li id="option-1" role="option" aria-selected={activeOptionId === "option-1"}>
    Option 1
  </li>
  <li id="option-2" role="option" aria-selected={activeOptionId === "option-2"}>
    Option 2
  </li>
</ul>
```

**흔한 실수:**
- `aria-activedescendant`를 사용하는 대신 DOM 포커스를 자손으로 이동하는 경우 (포커스는 복합 위젯 컨테이너에 유지되어야 함).
- 사용자가 옵션을 탐색할 때 값을 업데이트하지 않는 경우.
- 위젯이 소유한 요소 밖의 요소 ID를 참조하는 경우.

---

#### aria-errormessage

**목적:** 현재 요소에 대한 오류 메시지를 제공하는 요소를 식별합니다. 오류 상태에 대해 `aria-describedby`보다 더 구체적입니다.

**유효한 값:** 오류 메시지 요소의 ID.

```tsx
<input
  id="email"
  type="email"
  aria-invalid={hasError}
  aria-errormessage={hasError ? "email-error" : undefined}
/>
{hasError && (
  <span id="email-error" role="alert">
    Please enter a valid email address.
  </span>
)}
```

**흔한 실수:**
- `aria-invalid="true"` 설정 없이 `aria-errormessage`를 사용하는 경우 (입력이 invalid일 때만 오류 메시지가 노출됨).
- 참고: `aria-errormessage`에 대한 브라우저 및 스크린 리더 지원은 아직 확대 중입니다. 필요한 경우 `aria-describedby`를 폴백으로 사용하세요.

---

### 드래그 앤 드롭 속성 (Drag-and-Drop Attributes)

#### aria-grabbed (더 이상 사용되지 않음)

**목적:** 드래그 앤 드롭 작업에서 요소가 잡힌 상태인지를 나타내는 데 사용되었습니다. ARIA 1.1에서 더 이상 사용되지 않습니다.

**대체 방법:** `aria-roledescription`과 라이브 리전을 사용하여 드래그 상태를 설명합니다.

```tsx
// 현대적 접근 방식
<div
  role="listitem"
  aria-roledescription="draggable item"
  aria-label={`${item.name}, position ${index + 1} of ${total}`}
  tabIndex={0}
>
  {item.name}
</div>

<div aria-live="assertive">
  {dragStatus && <p>{dragStatus}</p>}
</div>
```

---

#### aria-dropeffect (더 이상 사용되지 않음)

**목적:** 객체가 대상에 드롭될 때 무슨 일이 일어나는지 설명하는 데 사용되었습니다. ARIA 1.1에서 더 이상 사용되지 않습니다.

**대체 방법:** 라이브 리전을 사용하여 드롭 결과와 사용 가능한 동작을 알립니다.

---

## 빠른 참고: 어떤 속성을 사용할까?

| 필요한 기능 | 속성 |
|------|-----------|
| 요소에 이름 지정 (보이는 텍스트 없음) | `aria-label` |
| 요소에 이름 지정 (보이는 텍스트가 다른 곳에 존재) | `aria-labelledby` |
| 보충 설명 추가 | `aria-describedby` |
| 입력에 오류 메시지 표시 | `aria-errormessage` + `aria-invalid` |
| 열림/닫힘 상태 표시 | `aria-expanded` |
| 켜짐/꺼짐 상태 표시 (토글 버튼) | `aria-pressed` |
| 켜짐/꺼짐 상태 표시 (체크박스/스위치) | `aria-checked` |
| 선택된 항목 표시 (탭, 옵션) | `aria-selected` |
| 현재 페이지/단계 표시 | `aria-current` |
| 정중하게 동적 변경 알림 | `aria-live="polite"` |
| 긴급하게 즉시 변경 알림 | `aria-live="assertive"` 또는 `role="alert"` |
| 장식 콘텐츠를 보조 기술에서 숨기기 | `aria-hidden="true"` |
| 입력을 필수로 표시 | `aria-required="true"` |
| 입력을 잘못됨으로 표시 | `aria-invalid="true"` |
| 로딩 상태 표시 | `aria-busy="true"` |
| 포커스를 이동하지 않고 활성 옵션 추적 | `aria-activedescendant` |
| 버튼을 제어하는 패널에 연결 | `aria-controls` |
| 정렬 방향 표시 | `aria-sort` |
| 범위 위젯의 값 제공 | `aria-valuenow` / `aria-valuemin` / `aria-valuemax` |
