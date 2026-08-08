# ARIA Role 참고 자료

ARIA(Accessible Rich Internet Applications)의 role에 대한 빠른 참고 가이드입니다. 사용 예제와 흔한 실수를 포함합니다.

---

## 목차

1. [ARIA 사용 규칙](#aria-사용-규칙)
2. [랜드마크 Role (Landmark Roles)](#랜드마크-role-landmark-roles)
3. [위젯 Role (Widget Roles)](#위젯-role-widget-roles)
4. [문서 구조 Role (Document Structure Roles)](#문서-구조-role-document-structure-roles)

---

## ARIA 사용 규칙

이 다섯 가지 규칙은 기본 원칙입니다. 이를 위반하는 것이 ARIA 관련 접근성 문제의 가장 흔한 원인입니다.

### 규칙 1: 네이티브 HTML로 충분하면 ARIA를 사용하지 마세요

네이티브 HTML 요소에는 내장된 의미론(semantics), 키보드 동작, 포커스 관리가 있습니다. ARIA는 의미론만 추가하며, 동작은 추가하지 않습니다.

```tsx
// 나쁜 예: div에 ARIA role 사용
<div role="button" tabIndex={0} onClick={handleClick} onKeyDown={handleKeyDown}>
  Submit
</div>

// 좋은 예: 네이티브 HTML 버튼
<button onClick={handleClick}>Submit</button>
```

### 규칙 2: 반드시 필요한 경우가 아니면 네이티브 의미론을 변경하지 마세요

```tsx
// 나쁜 예: heading을 버튼으로 변경
<h2 role="button">Section Title</h2>

// 좋은 예: heading 안에 버튼 배치
<h2><button>Section Title</button></h2>
```

### 규칙 3: 모든 인터랙티브 ARIA 컨트롤은 키보드로 접근 가능해야 합니다

`role="button"`을 사용하면 요소는 포커스 가능해야 하고 `Enter`와 `Space`에 반응해야 합니다. `role="slider"`를 사용하면 화살표 키에 반응해야 합니다. ARIA는 키보드 동작을 제공하지 않으므로 직접 구현해야 합니다.

### 규칙 4: 포커스 가능한 요소에 role="presentation" 또는 aria-hidden="true"를 사용하지 마세요

```tsx
// 나쁜 예: 보조 기술에서 숨겨졌지만 여전히 포커스 가능
<button aria-hidden="true">Close</button>

// 나쁜 예: 포커스 가능한 요소에 presentation role
<button role="presentation">Close</button>

// 좋은 예: 숨겨야 한다면 탭 순서에서도 제거
<button aria-hidden="true" tabIndex={-1} style={{ display: "none" }}>Close</button>
```

### 규칙 5: 모든 인터랙티브 요소에는 접근 가능한 이름이 있어야 합니다

모든 인터랙티브 요소는 보조 기술로 식별 가능해야 합니다.

```tsx
// 나쁜 예: 접근 가능한 이름 없음
<button><svg>...</svg></button>

// 좋은 예: aria-label 사용
<button aria-label="Close dialog"><svg aria-hidden="true">...</svg></button>

// 좋은 예: 보이는 텍스트
<button><svg aria-hidden="true">...</svg> Close</button>

// 좋은 예: aria-labelledby 사용
<button aria-labelledby="close-label"><span id="close-label" className="sr-only">Close dialog</span><svg aria-hidden="true">...</svg></button>
```

---

## 랜드마크 Role (Landmark Roles)

랜드마크 role은 페이지의 대규모 영역을 식별합니다. 스크린 리더 사용자는 랜드마크 간에 직접 이동할 수 있습니다.

### banner

**목적:** 사이트 전체 헤더 콘텐츠 (로고, 사이트 제목, 글로벌 내비게이션).

**HTML 동등 요소:** `<header>` (`<article>`, `<aside>`, `<main>`, `<nav>`, `<section>` 안에 중첩되지 않은 경우)

**유효한 값:** 해당 없음 (불리언 role)

**사용법:**

```tsx
// 권장: 시맨틱 HTML 사용
<header>
  <h1>My Site</h1>
  <nav>...</nav>
</header>

// ARIA 동등 표현 (<header>를 사용할 수 없는 경우에만)
<div role="banner">
  <h1>My Site</h1>
</div>
```

**흔한 실수:**
- 페이지당 두 개 이상의 `banner` 랜드마크를 사용하는 경우.
- `<article>` 안에 `<header>`를 중첩하고 `banner`가 될 것으로 기대하는 경우 (되지 않음).

---

### navigation

**목적:** 내비게이션 링크의 모음.

**HTML 동등 요소:** `<nav>`

**사용법:**

```tsx
// 여러 nav 랜드마크는 구별되는 레이블이 필요
<nav aria-label="Main navigation">
  <ul>...</ul>
</nav>

<nav aria-label="Footer navigation">
  <ul>...</ul>
</nav>
```

**흔한 실수:**
- 여러 `<nav>` 요소에 구별되는 `aria-label` 값이 없는 경우.
- 내비게이션이 아닌 콘텐츠에 `<nav>`를 사용하는 경우 (예: 태그 목록).

---

### main

**목적:** 페이지의 주요 콘텐츠.

**HTML 동등 요소:** `<main>`

**사용법:**

```tsx
<main id="main-content" tabIndex={-1}>
  {/* tabIndex={-1}은 건너뛰기 링크를 위한 프로그래밍적 포커스를 허용 */}
  {children}
</main>
```

**흔한 실수:**
- 한 번에 두 개 이상의 `<main>` 요소가 보이는 경우.
- 건너뛰기 링크 타겟을 위한 `id`를 포함하지 않는 경우.

---

### complementary

**목적:** 주요 콘텐츠를 보충하는 콘텐츠 (사이드바, 관련 링크).

**HTML 동등 요소:** `<aside>`

**사용법:**

```tsx
<aside aria-label="Related articles">
  <h2>Related Articles</h2>
  <ul>...</ul>
</aside>
```

**흔한 실수:**
- 주요 콘텐츠와 보완적이지 않은 콘텐츠에 `<aside>`를 사용하는 경우.
- 레이블 없이 `<aside>`를 깊이 중첩하는 경우.

---

### contentinfo

**목적:** 푸터 정보 (저작권, 법적 링크, 연락처 정보).

**HTML 동등 요소:** `<footer>` (`<article>`, `<aside>`, `<main>`, `<nav>`, `<section>` 안에 중첩되지 않은 경우)

**사용법:**

```tsx
<footer>
  <p>&copy; 2025 My Company</p>
  <nav aria-label="Footer links">...</nav>
</footer>
```

**흔한 실수:**
- 페이지당 두 개 이상의 `contentinfo` 랜드마크를 사용하는 경우.
- 섹션 안에서 `<footer>`를 사용하고 `contentinfo` 랜드마크가 될 것으로 기대하는 경우.

---

### search

**목적:** 검색 기능이 포함된 영역.

**HTML 동등 요소:** `<search>` (HTML5.2+)

**사용법:**

```tsx
// 최신 HTML
<search>
  <form role="search">
    <label htmlFor="site-search">Search</label>
    <input id="site-search" type="search" />
    <button type="submit">Search</button>
  </form>
</search>

// 폴백
<form role="search" aria-label="Site search">
  <label htmlFor="site-search">Search</label>
  <input id="site-search" type="search" />
  <button type="submit">Search</button>
</form>
```

**흔한 실수:**
- 여러 검색 영역이 있을 때 검색 폼에 레이블을 제공하지 않는 경우.
- 폼 컨테이너 대신 input에 `role="search"`를 사용하는 경우.

---

### form

**목적:** 접근 가능한 이름이 있는 폼을 포함하는 영역.

**HTML 동등 요소:** `<form>` (`aria-label` 또는 `aria-labelledby`가 있는 경우)

**사용법:**

```tsx
<form aria-labelledby="form-title">
  <h2 id="form-title">Contact Us</h2>
  <label htmlFor="name">Name</label>
  <input id="name" type="text" />
</form>
```

**흔한 실수:**
- 접근 가능한 이름이 없는 `<form>`은 랜드마크로 노출되지 않음.
- `<form>` 요소에 중복으로 `role="form"`을 사용하는 경우.

---

### region

**목적:** 사용자가 내비게이션할 수 있을 만큼 중요한 콘텐츠 섹션을 위한 범용 랜드마크.

**HTML 동등 요소:** `<section>` (접근 가능한 이름이 있는 경우)

**사용법:**

```tsx
<section aria-labelledby="section-title">
  <h2 id="section-title">Latest News</h2>
  <ul>...</ul>
</section>
```

**흔한 실수:**
- `aria-label` 또는 `aria-labelledby`가 없는 `<section>`은 랜드마크가 아님.
- `region` 랜드마크를 과도하게 사용하는 경우 -- 정말 중요한 페이지 섹션에만 사용해야 함.

---

## 위젯 Role (Widget Roles)

위젯 role은 인터랙티브 UI 컴포넌트를 식별합니다. 이러한 role을 사용할 때는 기대되는 키보드 동작을 직접 구현해야 합니다.

### button

**목적:** 동작을 실행하는 클릭 가능한 요소.

**HTML 동등 요소:** `<button>`

**기대되는 키보드 동작:** `Enter`와 `Space`로 활성화.

```tsx
// <button>을 사용할 수 없는 경우에만 role="button" 사용
<span role="button" tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Action
</span>
```

---

### checkbox

**목적:** 이중 상태(또는 삼중 상태)의 체크 가능한 입력.

**HTML 동등 요소:** `<input type="checkbox">`

**기대되는 키보드 동작:** `Space`로 토글.

**주요 속성:** `aria-checked` ("true", "false", 또는 "mixed")

```tsx
<span
  role="checkbox"
  aria-checked={isChecked}
  tabIndex={0}
  onClick={toggle}
  onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); toggle(); } }}
>
  Accept terms
</span>
```

---

### dialog

**목적:** 페이지 위에 겹쳐지는 다이얼로그 창.

**HTML 동등 요소:** `<dialog>`

**기대되는 키보드 동작:** `Escape`로 닫기; `Tab`이 내부에 갇힘.

**주요 속성:** `aria-modal`, `aria-labelledby`

```tsx
<dialog aria-labelledby="dialog-title" aria-modal="true">
  <h2 id="dialog-title">Confirm Action</h2>
  <p>Are you sure?</p>
  <button>Confirm</button>
  <button>Cancel</button>
</dialog>
```

---

### link

**목적:** 내비게이션 하이퍼링크.

**HTML 동등 요소:** `<a href="...">`

**기대되는 키보드 동작:** `Enter`로 활성화.

```tsx
// <a>를 사용할 수 없는 경우에만 사용
<span role="link" tabIndex={0} onClick={() => router.push("/page")}>
  Go to page
</span>
```

---

### menuitem

**목적:** 메뉴(드롭다운 또는 컨텍스트 메뉴)의 항목.

**기대되는 키보드 동작:** `Enter`로 활성화; `ArrowUp`/`ArrowDown`으로 내비게이션.

**관련 role:** `menu`, `menubar`, `menuitemcheckbox`, `menuitemradio`

```tsx
<ul role="menu">
  <li role="menuitem" tabIndex={-1}>Cut</li>
  <li role="menuitem" tabIndex={-1}>Copy</li>
  <li role="menuitem" tabIndex={-1}>Paste</li>
</ul>
```

---

### option

**목적:** listbox 내의 선택 가능한 항목.

**기대되는 키보드 동작:** `ArrowUp`/`ArrowDown`으로 내비게이션; `Enter`로 선택.

**주요 속성:** `aria-selected`

**관련 role:** `listbox`

```tsx
<ul role="listbox" aria-label="Choose a color">
  <li role="option" aria-selected={selected === "red"}>Red</li>
  <li role="option" aria-selected={selected === "blue"}>Blue</li>
  <li role="option" aria-selected={selected === "green"}>Green</li>
</ul>
```

---

### radio

**목적:** 라디오 그룹 내의 선택 가능한 항목 (하나만 선택 가능).

**HTML 동등 요소:** `<input type="radio">`

**기대되는 키보드 동작:** `ArrowUp`/`ArrowDown` 또는 `ArrowLeft`/`ArrowRight`로 내비게이션; 선택이 포커스를 따름.

**주요 속성:** `aria-checked`

**관련 role:** `radiogroup`

```tsx
<div role="radiogroup" aria-label="Delivery method">
  <span role="radio" aria-checked={method === "standard"} tabIndex={method === "standard" ? 0 : -1}>Standard</span>
  <span role="radio" aria-checked={method === "express"} tabIndex={method === "express" ? 0 : -1}>Express</span>
</div>
```

---

### slider

**목적:** 사용자가 범위에서 값을 선택할 수 있는 입력.

**HTML 동등 요소:** `<input type="range">`

**기대되는 키보드 동작:** `ArrowLeft`/`ArrowDown`으로 감소; `ArrowRight`/`ArrowUp`으로 증가; `Home`/`End`로 최소/최대.

**주요 속성:** `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`

```tsx
<div
  role="slider"
  aria-valuenow={volume}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuetext={`${volume}%`}
  aria-label="Volume"
  tabIndex={0}
>
  <div style={{ width: `${volume}%` }} className="slider-fill" />
</div>
```

---

### switch

**목적:** 켜짐과 꺼짐 상태 사이의 토글.

**기대되는 키보드 동작:** `Space` 또는 `Enter`로 토글.

**주요 속성:** `aria-checked` ("true" 또는 "false")

```tsx
<button
  role="switch"
  aria-checked={isDarkMode}
  onClick={toggleDarkMode}
>
  Dark mode
</button>
```

---

### tab

**목적:** tablist 내의 탭.

**기대되는 키보드 동작:** `ArrowLeft`/`ArrowRight`로 내비게이션; `Home`/`End`로 처음/마지막.

**주요 속성:** `aria-selected`, `aria-controls`

**관련 role:** `tablist`, `tabpanel`

전체 예제는 [patterns.md의 Tabs 패턴](./patterns.md#tabs)을 참조하세요.

---

### textbox

**목적:** 텍스트 입력 필드.

**HTML 동등 요소:** `<input type="text">`, `<textarea>`

**주요 속성:** `aria-multiline`, `aria-placeholder`, `aria-required`, `aria-invalid`

```tsx
// 네이티브 요소를 권장
<textarea aria-label="Comments" />

// ARIA textbox (네이티브 요소를 사용할 수 없는 경우에만)
<div role="textbox" aria-multiline="true" contentEditable="true" aria-label="Comments" tabIndex={0} />
```

---

### tooltip

**목적:** 요소에 대한 설명 텍스트를 표시하는 팝업.

**주요 속성:** 트리거에 `aria-describedby`를 사용.

전체 예제는 [patterns.md의 Tooltip 패턴](./patterns.md#tooltip)을 참조하세요.

---

### combobox

**목적:** 텍스트 입력과 팝업 listbox를 결합한 복합 위젯.

**주요 속성:** `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant`

**관련 role:** `listbox`, `option`

전체 예제는 [patterns.md의 Combobox 패턴](./patterns.md#combobox--autocomplete)을 참조하세요.

---

### alertdialog

**목적:** 중요한 메시지와 함께 즉각적인 주의가 필요한 다이얼로그.

**기대되는 키보드 동작:** `dialog`와 동일 -- `Escape`로 닫기, 포커스 갇힘.

**주요 속성:** `aria-labelledby`, `aria-describedby`, `aria-modal`

```tsx
<div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-desc">
  <h2 id="alert-title">Delete Account</h2>
  <p id="alert-desc">This action cannot be undone. All data will be permanently deleted.</p>
  <button>Cancel</button>
  <button>Delete</button>
</div>
```

---

### progressbar

**목적:** 장시간 실행 작업의 진행 상태를 표시함.

**HTML 동등 요소:** `<progress>`

**주요 속성:** `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`

```tsx
// 확정적 (Determinate)
<div role="progressbar" aria-valuenow={75} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
  <div style={{ width: "75%" }} />
</div>

// 불확정적 (Indeterminate, aria-valuenow 없음)
<div role="progressbar" aria-label="Loading content">
  <div className="spinner" />
</div>
```

---

### separator (포커스 가능)

**목적:** 섹션 크기를 조절하는 데 사용할 수 있는 포커스 가능한 구분선 (스플리터).

**기대되는 키보드 동작:** `ArrowLeft`/`ArrowRight` 또는 `ArrowUp`/`ArrowDown`으로 크기 조절.

**주요 속성:** `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-orientation`

```tsx
<div
  role="separator"
  aria-valuenow={50}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-orientation="vertical"
  aria-label="Resize panels"
  tabIndex={0}
/>
```

---

### tree / treeitem

**목적:** 계층적 목록 (파일 탐색기, 중첩 메뉴).

**기대되는 키보드 동작:** `ArrowUp`/`ArrowDown`으로 내비게이션; `ArrowRight`로 확장; `ArrowLeft`로 축소.

**주요 속성:** `aria-expanded` (확장 가능한 treeitem에서)

**관련 role:** `tree`, `treeitem`, `group`

```tsx
<ul role="tree" aria-label="File explorer">
  <li role="treeitem" aria-expanded={true}>
    src
    <ul role="group">
      <li role="treeitem">index.ts</li>
      <li role="treeitem">utils.ts</li>
    </ul>
  </li>
  <li role="treeitem" aria-expanded={false}>
    public
  </li>
</ul>
```

---

## 문서 구조 Role (Document Structure Roles)

이 role은 문서 콘텐츠의 구조를 설명합니다.

### article

**목적:** 독립적인 구성물 (블로그 포스트, 뉴스 기사, 댓글, 포럼 글).

**HTML 동등 요소:** `<article>`

```tsx
<article aria-labelledby="post-title">
  <h2 id="post-title">Blog Post Title</h2>
  <p>Content...</p>
</article>
```

---

### heading

**목적:** 페이지 섹션의 heading.

**HTML 동등 요소:** `<h1>`부터 `<h6>`

**주요 속성:** `aria-level` (1-6)

```tsx
// 시맨틱 HTML 권장
<h1>Page Title</h1>
<h2>Section Title</h2>

// ARIA heading (필요한 경우에만)
<div role="heading" aria-level={2}>Section Title</div>
```

---

### list / listitem

**목적:** 항목의 그룹.

**HTML 동등 요소:** `<ul>`/`<ol>` 및 `<li>`

```tsx
// 시맨틱 HTML 권장
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>

// ARIA 동등 표현 (필요한 경우에만)
<div role="list">
  <div role="listitem">Item 1</div>
  <div role="listitem">Item 2</div>
</div>
```

**흔한 실수:** 일부 CSS 리셋(예: Safari에서 `list-style: none`)은 목록 의미론을 제거합니다. 이를 복원하려면 `role="list"`를 추가하세요.

---

### table / row / cell / rowheader / columnheader

**목적:** 행과 열로 구성된 데이터.

**HTML 동등 요소:** `<table>`, `<tr>`, `<td>`, `<th>`

```tsx
// 시맨틱 HTML 권장
<table>
  <caption>Quarterly Revenue</caption>
  <thead>
    <tr>
      <th scope="col">Quarter</th>
      <th scope="col">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Q1</th>
      <td>$1.2M</td>
    </tr>
  </tbody>
</table>
```

---

### img

**목적:** 이미지 콘텐츠의 컨테이너 (SVG 또는 이미지 그룹에 유용).

**주요 속성:** `aria-label` 또는 `aria-labelledby`

```tsx
<svg role="img" aria-label="Company logo">
  <title>Company Logo</title>
  {/* SVG paths */}
</svg>
```

---

### figure

**목적:** 선택적 캡션이 있는 콘텐츠, 일반적으로 이미지, 코드 스니펫 또는 다이어그램.

**HTML 동등 요소:** `<figure>` 및 `<figcaption>`

```tsx
<figure>
  <Image src="/chart.png" alt="Sales trend showing 25% growth" width={600} height={400} />
  <figcaption>Figure 1: Quarterly sales trend</figcaption>
</figure>
```

---

### group

**목적:** 페이지 요약의 일부가 되지 않는 UI 객체의 집합 (복합 위젯 내부에서 사용).

```tsx
<div role="radiogroup" aria-label="Size">
  <div role="group" aria-label="Standard sizes">
    <span role="radio" aria-checked="false">Small</span>
    <span role="radio" aria-checked="true">Medium</span>
    <span role="radio" aria-checked="false">Large</span>
  </div>
</div>
```

---

### presentation / none

**목적:** 요소의 암묵적 ARIA 의미론을 제거합니다. 레이아웃 테이블이나 장식용 컨테이너에 주로 사용됩니다.

```tsx
// 레이아웃 테이블 (데이터 테이블이 아님)
<table role="presentation">
  <tr>
    <td>Left column</td>
    <td>Right column</td>
  </tr>
</table>
```

**흔한 실수:** 포커스 가능하거나 인터랙티브한 요소에는 절대 사용하지 마세요.
