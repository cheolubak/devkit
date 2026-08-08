# Next.js를 위한 WCAG 2.2 체크리스트 및 접근성 테스트

Next.js 애플리케이션을 위한 WCAG 2.2 성공 기준, 테스트 도구 및 자동화 테스트 설정을 다루는 실용적인 체크리스트입니다.

---

## 목차

1. [WCAG 2.2 성공 기준](#wcag-22-성공-기준)
   - [인식의 용이성 (Perceivable)](#1-인식의-용이성-perceivable)
   - [운용의 용이성 (Operable)](#2-운용의-용이성-operable)
   - [이해의 용이성 (Understandable)](#3-이해의-용이성-understandable)
   - [견고성 (Robust)](#4-견고성-robust)
2. [테스트 도구 및 설정](#테스트-도구-및-설정)
3. [자동화 테스트](#자동화-테스트)
4. [수동 테스트 체크리스트](#수동-테스트-체크리스트)

---

## WCAG 2.2 성공 기준

### 1. 인식의 용이성 (Perceivable)

정보와 UI 컴포넌트는 사용자가 인식할 수 있는 방식으로 제공되어야 합니다.

#### 1.1 대체 텍스트 (Text Alternatives)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 1.1.1 텍스트가 아닌 콘텐츠 (Non-text Content) | A | 모든 이미지, 아이콘 및 텍스트가 아닌 콘텐츠에 대체 텍스트가 있어야 함 | 모든 `<img>`에 의미 있는 `alt`가 있는지, 장식용 이미지는 `alt=""`를 사용하는지, 아이콘 버튼에 `aria-label`이 있는지 확인 |

```tsx
// 올바른 예: 정보를 전달하는 이미지
<Image src="/chart.png" alt="Sales increased 25% in Q3 2025" width={600} height={400} />

// 올바른 예: 장식용 이미지
<Image src="/decorative-line.png" alt="" width={600} height={2} />

// 올바른 예: 아이콘 버튼
<button aria-label="Close dialog">
  <XIcon aria-hidden="true" />
</button>
```

#### 1.2 시간 기반 미디어 (Time-based Media)

| 기준 | 레벨 | 요구사항 |
|-----------|-------|-------------|
| 1.2.1 오디오 전용 및 비디오 전용 (사전 녹화) | A | 오디오에는 자막(transcript)을, 비디오에는 자막 또는 오디오 설명(audio description)을 제공 |
| 1.2.2 자막 (사전 녹화) (Captions) | A | 오디오가 포함된 사전 녹화 비디오에 자막을 제공 |
| 1.2.3 오디오 설명 또는 미디어 대안 (Audio Description) | A | 오디오 설명 또는 전체 텍스트 대안을 제공 |
| 1.2.4 자막 (실시간) (Captions, Live) | AA | 오디오가 포함된 실시간 비디오에 자막을 제공 |
| 1.2.5 오디오 설명 (사전 녹화) (Audio Description) | AA | 사전 녹화 비디오에 오디오 설명을 제공 |

#### 1.3 적응 가능 (Adaptable)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 1.3.1 정보와 관계 (Info and Relationships) | A | 시각적으로 전달되는 구조, 관계, 의미가 프로그래밍 방식으로도 제공되어야 함 | 시맨틱 HTML 사용: heading, list, table, landmark, label |
| 1.3.2 의미 있는 순서 (Meaningful Sequence) | A | 읽기 순서가 논리적이고 의미가 있어야 함 | DOM 순서가 시각적 순서와 일치하는지 확인; CSS를 비활성화한 상태에서 확인 |
| 1.3.3 감각적 특성 (Sensory Characteristics) | A | 안내가 모양, 크기, 위치 또는 소리에만 의존하지 않아야 함 | "둥근 버튼을 클릭하세요" 또는 "빨간 텍스트"라고 하지 말고 텍스트 레이블을 추가 |
| 1.3.4 방향 (Orientation) | AA | 콘텐츠가 단일 디스플레이 방향으로 제한되지 않아야 함 | 필수적인 경우가 아니면 세로 또는 가로 모드로 고정하지 않음 |
| 1.3.5 입력 목적 식별 (Identify Input Purpose) | AA | 사용자 데이터를 수집하는 입력 필드가 그 목적을 식별해야 함 | 개인 데이터 필드에 `autocomplete` 속성을 사용 |

```tsx
// 올바른 예: 일반 입력 필드에 autocomplete 사용
<input type="email" autoComplete="email" />
<input type="text" autoComplete="given-name" />
<input type="tel" autoComplete="tel" />
<input type="text" autoComplete="street-address" />
```

#### 1.4 구별 가능 (Distinguishable)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 1.4.1 색상 사용 (Use of Color) | A | 색상이 정보를 전달하는 유일한 수단이 되어서는 안 됨 | 색상과 함께 아이콘, 텍스트, 밑줄 또는 패턴을 추가 |
| 1.4.2 오디오 제어 (Audio Control) | A | 3초 이상 재생되는 오디오는 일시정지/중지가 가능해야 함 | 제어 장치를 제공하고 자동 재생하지 않음 |
| 1.4.3 명암비 (최소) (Contrast, Minimum) | AA | 텍스트의 명암비가 최소 4.5:1 이상이어야 함 (큰 텍스트는 3:1) | 명암비 검사 도구를 사용 |
| 1.4.4 텍스트 크기 조정 (Resize Text) | AA | 콘텐츠 손실 없이 텍스트를 200%까지 확대할 수 있어야 함 | 브라우저 줌 200%에서 테스트 |
| 1.4.5 텍스트 이미지 (Images of Text) | AA | 텍스트 이미지 대신 실제 텍스트를 사용해야 함 | 이미지 내 텍스트를 피하고 CSS로 스타일링 |
| 1.4.10 리플로우 (Reflow) | AA | 320px 너비에서 가로 스크롤 없이 콘텐츠가 리플로우 되어야 함 | 1280px 너비에서 400% 줌으로 테스트 |
| 1.4.11 비텍스트 명암비 (Non-text Contrast) | AA | UI 컴포넌트와 그래픽의 명암비가 최소 3:1 이상이어야 함 | 테두리, 아이콘, 포커스 표시자, 차트를 확인 |
| 1.4.12 텍스트 간격 (Text Spacing) | AA | 증가된 텍스트 간격에 콘텐츠가 적응해야 함 | 줄 높이 1.5배, 단락 간격 2배, 자간 0.12em, 어간 0.16em으로 테스트 |
| 1.4.13 호버 또는 포커스 시 콘텐츠 (Content on Hover or Focus) | AA | 호버/포커스로 나타나는 콘텐츠가 해제 가능, 호버 가능, 지속적이어야 함 | 툴팁과 팝오버는 Escape로 해제 가능해야 하고, 팝업 위로 호버할 수 있어야 하며, 해제할 때까지 지속되어야 함 |

---

### 2. 운용의 용이성 (Operable)

UI 컴포넌트와 내비게이션은 조작 가능해야 합니다.

#### 2.1 키보드 접근성 (Keyboard Accessible)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 2.1.1 키보드 (Keyboard) | A | 모든 기능이 키보드로 사용 가능해야 함 | 전체 페이지를 Tab으로 이동하며 모든 인터랙티브 요소를 테스트 |
| 2.1.2 키보드 트랩 없음 (No Keyboard Trap) | A | 모든 컴포넌트에서 포커스를 이동할 수 있어야 함 | 모달, 위젯, 임베디드 콘텐츠가 포커스를 가두지 않는지 확인 (Escape로 나갈 수 있는 의도적인 포커스 트랩 제외) |
| 2.1.4 문자 키 단축키 (Character Key Shortcuts) | A | 단일 문자 단축키를 끄거나 재매핑할 수 있어야 함 | 단축키를 구현하는 경우 커스터마이징을 허용 |

```tsx
// 올바른 예: 키보드 접근 가능한 커스텀 버튼
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Custom Button
</div>

// 더 나은 방법: 네이티브 버튼 사용
<button onClick={handleClick}>Real Button</button>
```

#### 2.2 충분한 시간 (Enough Time)

| 기준 | 레벨 | 요구사항 |
|-----------|-------|-------------|
| 2.2.1 타이밍 조절 가능 (Timing Adjustable) | A | 시간 제한을 연장, 조절 또는 해제할 수 있어야 함 |
| 2.2.2 일시정지, 중지, 숨기기 (Pause, Stop, Hide) | A | 자동 업데이트, 이동, 깜박이는 콘텐츠를 일시정지할 수 있어야 함 |

#### 2.3 발작 및 신체 반응 (Seizures and Physical Reactions)

| 기준 | 레벨 | 요구사항 |
|-----------|-------|-------------|
| 2.3.1 3회 깜박임 또는 임계값 이하 (Three Flashes or Below Threshold) | A | 초당 3회 이상 깜박이는 콘텐츠가 없어야 함 |

#### 2.4 탐색 가능 (Navigable)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 2.4.1 블록 건너뛰기 (Bypass Blocks) | A | 반복 콘텐츠를 건너뛸 수 있는 메커니즘을 제공 | "본문으로 건너뛰기(Skip to main content)" 링크를 추가 |
| 2.4.2 페이지 제목 (Page Titled) | A | 페이지에 설명적인 제목이 있어야 함 | 각 페이지에서 Next.js `metadata` 또는 `<title>` 사용 |
| 2.4.3 포커스 순서 (Focus Order) | A | 포커스 순서가 논리적이고 의미 있어야 함 | 페이지를 Tab으로 이동; 포커스가 읽기 순서를 따라야 함 |
| 2.4.4 링크 목적 (컨텍스트 내) (Link Purpose, In Context) | A | 링크 텍스트 또는 컨텍스트에서 링크의 목적을 결정할 수 있어야 함 | "여기를 클릭"을 피하고 설명적인 링크 텍스트를 사용 |
| 2.4.5 다양한 방법 (Multiple Ways) | AA | 페이지를 찾는 다양한 방법 (검색, 사이트맵, 내비게이션) 을 제공 | 최소 두 가지 내비게이션 메커니즘을 제공 |
| 2.4.6 제목과 레이블 (Headings and Labels) | AA | 제목과 레이블이 설명적이어야 함 | 각 heading이 해당 섹션을 설명하는지 확인 |
| 2.4.7 포커스 가시성 (Focus Visible) | AA | 키보드 포커스 표시자가 보여야 함 | Tab 키로 테스트; 포커스 스타일이 보이는지 확인 |
| 2.4.11 포커스 가림 방지 (최소) (Focus Not Obscured, Minimum) | AA | 포커스된 요소가 다른 콘텐츠에 의해 완전히 가려지지 않아야 함 | 고정 헤더, 푸터, 모달이 포커스된 요소를 가리지 않는지 확인 |

```tsx
// 본문으로 건너뛰기 링크
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black"
    >
      Skip to main content
    </a>
  );
}

// layout.tsx에서 사용
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <header>...</header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer>...</footer>
      </body>
    </html>
  );
}
```

```tsx
// Next.js metadata를 활용한 페이지 제목
export const metadata = {
  title: "Products - My Store",
  description: "Browse our product catalog",
};
```

#### 2.5 입력 방식 (Input Modalities)

| 기준 | 레벨 | 요구사항 |
|-----------|-------|-------------|
| 2.5.1 포인터 제스처 (Pointer Gestures) | A | 멀티포인트 제스처에 싱글 포인터 대안이 있어야 함 |
| 2.5.2 포인터 취소 (Pointer Cancellation) | A | down 이벤트로 동작을 실행하지 않아야 함 (click/up 이벤트 사용) |
| 2.5.3 이름 포함 레이블 (Label in Name) | A | 접근 가능한 이름에 눈에 보이는 레이블 텍스트가 포함되어야 함 |
| 2.5.4 모션 작동 (Motion Actuation) | A | 모션으로 실행되는 동작에 UI 대안이 있어야 함 |
| 2.5.7 드래그 동작 (Dragging Movements) | AA | 드래그 작업에 드래그 없는 대안이 있어야 함 |
| 2.5.8 타겟 크기 (최소) (Target Size, Minimum) | AA | 터치/클릭 타겟이 최소 24x24 CSS 픽셀이어야 함 |

---

### 3. 이해의 용이성 (Understandable)

정보와 UI 조작은 이해 가능해야 합니다.

#### 3.1 가독성 (Readable)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 3.1.1 페이지 언어 (Language of Page) | A | `<html>`에 기본 언어가 설정되어야 함 | `<html>`에 `lang` 속성을 추가 |
| 3.1.2 부분 언어 (Language of Parts) | AA | 콘텐츠 내 언어 변경이 표시되어야 함 | 다른 언어의 요소에 `lang` 속성을 사용 |

```tsx
// layout.tsx에서
<html lang="en">

// 다른 언어의 콘텐츠
<p>The French phrase <span lang="fr">c'est la vie</span> means "that's life."</p>
```

#### 3.2 예측 가능 (Predictable)

| 기준 | 레벨 | 요구사항 |
|-----------|-------|-------------|
| 3.2.1 포커스 시 (On Focus) | A | 포커스만으로 예상치 못한 컨텍스트 변경이 발생하지 않아야 함 |
| 3.2.2 입력 시 (On Input) | A | 입력만으로 예상치 못한 컨텍스트 변경이 발생하지 않아야 함 |
| 3.2.3 일관된 내비게이션 (Consistent Navigation) | AA | 페이지 간 내비게이션이 일관적이어야 함 |
| 3.2.4 일관된 식별 (Consistent Identification) | AA | 동일 기능의 컴포넌트가 일관되게 식별되어야 함 |
| 3.2.6 일관된 도움말 (Consistent Help) | A | 도움말 메커니즘이 일관된 위치에 있어야 함 |

#### 3.3 입력 지원 (Input Assistance)

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 3.3.1 오류 식별 (Error Identification) | A | 오류가 텍스트로 식별되고 설명되어야 함 | 입력 필드 근처에 명확한 오류 메시지를 표시 |
| 3.3.2 레이블 또는 안내 (Labels or Instructions) | A | 입력 필드에 레이블 또는 안내가 있어야 함 | 모든 입력 필드에 보이는 `<label>`이 있어야 함 |
| 3.3.3 오류 제안 (Error Suggestion) | AA | 오류 수정을 위한 제안이 제공되어야 함 | "잘못된 입력"이 아닌 구체적인 안내를 제공 |
| 3.3.4 오류 방지 (법률, 금융, 데이터) (Error Prevention) | AA | 제출이 되돌릴 수 있거나, 확인되거나, 검토되어야 함 | 되돌릴 수 없는 작업에 확인 절차를 추가 |
| 3.3.7 중복 입력 (Redundant Entry) | A | 이전에 제공한 정보를 다시 입력하도록 요구하지 않아야 함 | 이미 수집된 데이터로 필드를 자동 채움 |
| 3.3.8 접근 가능한 인증 (최소) (Accessible Authentication, Minimum) | AA | 인증에 인지 기능 테스트를 요구하지 않아야 함 | 비밀번호 관리자를 지원하고 붙여넣기를 차단하지 않음 |

```tsx
// 올바른 예: 오류 처리가 포함된 접근 가능한 폼
function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          autoComplete="email"
        />
        {errors.email && (
          <p id="email-error" role="alert">
            {errors.email}
          </p>
        )}
      </div>
      <button type="submit">Submit</button>
    </form>
  );
}
```

---

### 4. 견고성 (Robust)

콘텐츠는 보조 기술(assistive technologies)을 포함한 다양한 사용자 에이전트에서 해석할 수 있을 만큼 견고해야 합니다.

| 기준 | 레벨 | 요구사항 | 확인 방법 |
|-----------|-------|-------------|--------------|
| 4.1.2 이름, 역할, 값 (Name, Role, Value) | A | 커스텀 컴포넌트가 이름, 역할, 값을 노출해야 함 | 커스텀 위젯에 ARIA role과 속성을 사용 |
| 4.1.3 상태 메시지 (Status Messages) | AA | 상태 메시지가 포커스를 받지 않고도 알려져야 함 | `role="status"`, `role="alert"` 또는 `aria-live` 리전을 사용 |

```tsx
// 올바른 예: 스크린 리더에 의해 알려지는 상태 메시지
const [submitStatus, setSubmitStatus] = useState("");

<div role="status" aria-live="polite">
  {submitStatus && <p>{submitStatus}</p>}
</div>
```

---

## 테스트 도구 및 설정

### eslint-plugin-jsx-a11y

개발 중 일반적인 접근성 문제를 감지합니다.

**설치:**

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

**설정 (.eslintrc.json):**

```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:jsx-a11y/recommended"
  ],
  "plugins": ["jsx-a11y"],
  "rules": {
    "jsx-a11y/anchor-is-valid": [
      "error",
      {
        "components": ["Link"],
        "specialLink": ["hrefLeft", "hrefRight"],
        "aspects": ["invalidHref", "preferButton"]
      }
    ],
    "jsx-a11y/label-has-associated-control": [
      "error",
      {
        "labelComponents": [],
        "labelAttributes": [],
        "controlComponents": [],
        "assert": "either",
        "depth": 3
      }
    ]
  }
}
```

**감지하는 항목:**
- 이미지에 `alt` 속성이 누락된 경우
- 폼 컨트롤에 레이블이 누락된 경우
- 잘못된 ARIA 속성 및 역할
- 언어 속성 누락
- 클릭 핸들러가 있지만 키보드 지원이 없는 비인터랙티브 요소
- `tabIndex`의 잘못된 사용
- autofocus 사용

---

### axe-core / @axe-core/react

개발 중 브라우저 콘솔에서 접근성 위반 사항을 보고하는 런타임 접근성 테스트입니다.

**설치:**

```bash
npm install --save-dev @axe-core/react
```

**통합 (app/layout.tsx 또는 클라이언트 컴포넌트에서):**

```tsx
"use client";

import { useEffect } from "react";

export function AxeHelper() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("@axe-core/react").then((axe) => {
        import("react-dom").then((ReactDOM) => {
          axe.default(React, ReactDOM, 1000);
        });
      });
    }
  }, []);

  return null;
}
```

**감지하는 항목:**
- 색상 명암비 위반
- 폼 레이블 누락
- 잘못된 ARIA 사용
- 문서 구조 문제
- 랜드마크 리전 누락

---

### Lighthouse 접근성 감사

Chrome DevTools에 내장되어 있습니다.

**실행 방법:**
1. Chrome DevTools를 엽니다 (F12)
2. "Lighthouse" 탭으로 이동합니다
3. "Accessibility" 카테고리를 선택합니다
4. "Analyze page load"를 클릭합니다

**커맨드 라인에서:**

```bash
npx lighthouse http://localhost:3000 --only-categories=accessibility --output=html --output-path=./lighthouse-report.html
```

**Lighthouse가 확인하는 주요 항목:**
- ARIA 속성 유효성
- 버튼 및 링크 이름
- 색상 명암비
- 문서 제목
- 폼 레이블
- 이미지 alt 텍스트
- heading 순서
- tabIndex 값
- 랜드마크 구조

---

### 스크린 리더 테스트

#### VoiceOver (macOS)

| 동작 | 키 |
|--------|------|
| 켜기/끄기 | `Cmd + F5` |
| 다음 항목으로 이동 | `Ctrl + Option + Right Arrow` |
| 이전 항목으로 이동 | `Ctrl + Option + Left Arrow` |
| 요소 활성화 | `Ctrl + Option + Space` |
| 커서부터 전부 읽기 | `Ctrl + Option + A` |
| 로터 열기 (랜드마크, heading, 링크) | `Ctrl + Option + U` |
| heading별로 이동 | `Ctrl + Option + Cmd + H` |

**VoiceOver 테스트 체크리스트:**
- [ ] 모든 이미지의 적절한 alt 텍스트가 음성으로 전달되는지 확인
- [ ] 폼 필드가 레이블을 음성으로 전달하는지 확인
- [ ] 버튼과 링크가 목적을 음성으로 전달하는지 확인
- [ ] 오류 메시지가 나타날 때 음성으로 전달되는지 확인
- [ ] 내비게이션 시 페이지 제목이 음성으로 전달되는지 확인
- [ ] 로터에서 랜드마크가 사용 가능한지 확인
- [ ] heading 계층 구조가 논리적인지 확인
- [ ] 동적 콘텐츠 변경이 음성으로 전달되는지 확인

#### NVDA (Windows)

| 동작 | 키 |
|--------|------|
| 켜기 | `Ctrl + Alt + N` |
| 음성 중지 | `Ctrl` |
| 다음 항목으로 이동 | `Down Arrow` (탐색 모드에서) |
| 이전 항목으로 이동 | `Up Arrow` (탐색 모드에서) |
| 요소 활성화 | `Enter` |
| 탐색/포커스 모드 전환 | `Insert + Space` |
| heading 목록 | `Insert + F7` |
| 랜드마크 목록 | `Insert + F7` 후 Alt+L |

---

## 자동화 테스트

### Jest + jest-axe

유닛 테스트에서 자동화된 접근성 검증을 수행합니다.

**설치:**

```bash
npm install --save-dev jest-axe @testing-library/react @testing-library/jest-dom
```

**설정 (jest.setup.ts):**

```ts
import "jest-axe/extend-expect";
```

**테스트 예제:**

```tsx
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { ContactForm } from "@/components/ContactForm";

expect.extend(toHaveNoViolations);

describe("ContactForm", () => {
  it("접근성 위반 사항이 없어야 함", async () => {
    const { container } = render(<ContactForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("오류 표시 시에도 접근성 위반 사항이 없어야 함", async () => {
    const { container, getByText } = render(<ContactForm />);
    // 유효성 검증 트리거
    getByText("Submit").click();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**axe 규칙 설정:**

```tsx
const results = await axe(container, {
  rules: {
    // 필요한 경우 특정 규칙을 비활성화 (이유를 문서화할 것)
    "color-contrast": { enabled: false }, // 디자인 토큰으로 별도 테스트
  },
});
```

---

### Playwright 접근성 테스트

Playwright를 사용한 엔드투엔드(E2E) 접근성 테스트입니다.

**설치:**

```bash
npm install --save-dev @playwright/test @axe-core/playwright
```

**테스트 예제 (e2e/accessibility.spec.ts):**

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("접근성", () => {
  test("홈 페이지에 접근성 위반 사항이 없어야 함", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("내비게이션이 키보드로 접근 가능해야 함", async ({ page }) => {
    await page.goto("/");

    // 건너뛰기 링크 테스트
    await page.keyboard.press("Tab");
    const skipLink = page.getByText("Skip to main content");
    await expect(skipLink).toBeFocused();

    // 건너뛰기 링크가 작동하는지 테스트
    await page.keyboard.press("Enter");
    const main = page.locator("main");
    await expect(main).toBeFocused();
  });

  test("폼이 접근 가능한 오류 메시지를 표시해야 함", async ({ page }) => {
    await page.goto("/contact");

    // 빈 폼 제출
    await page.getByRole("button", { name: "Submit" }).click();

    // 오류 메시지가 입력 필드와 연결되어 있는지 확인
    const emailInput = page.getByRole("textbox", { name: "Email" });
    const describedBy = await emailInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorMessage = page.locator(`#${describedBy}`);
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(/email/i);
  });

  test("모달이 포커스를 가두어야 함", async ({ page }) => {
    await page.goto("/");

    // 모달 열기
    await page.getByRole("button", { name: "Open settings" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 모달 내 모든 포커스 가능 요소 가져오기
    const focusableElements = dialog.locator(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusableElements.count();

    // 모든 요소를 Tab으로 이동하며 포커스가 모달 안에 유지되는지 확인
    for (let i = 0; i < count + 1; i++) {
      await page.keyboard.press("Tab");
      const focusedElement = page.locator(":focus");
      await expect(dialog).toContainText(
        await focusedElement.textContent() ?? ""
      );
    }

    // Escape로 모달이 닫혀야 함
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
```

**특정 페이지 섹션만 스캔:**

```ts
const results = await new AxeBuilder({ page })
  .include("#main-content") // 메인 콘텐츠만 스캔
  .exclude(".third-party-widget") // 서드파티 콘텐츠 제외
  .withTags(["wcag2a", "wcag2aa"])
  .analyze();
```

---

### CI/CD 통합

**GitHub Actions 워크플로 (.github/workflows/accessibility.yml):**

```yaml
name: Accessibility Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  a11y-lint:
    name: 접근성 린트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx eslint . --ext .ts,.tsx --rule 'jsx-a11y/alt-text: error'

  a11y-unit:
    name: 유닛 접근성 테스트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx jest --testPathPattern="a11y|accessibility"

  a11y-e2e:
    name: E2E 접근성 테스트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test e2e/accessibility
        env:
          BASE_URL: http://localhost:3000

  lighthouse:
    name: Lighthouse 감사
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci && npm run build
      - name: Run Lighthouse
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            http://localhost:3000/
            http://localhost:3000/about
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```

**Lighthouse 예산 파일 (lighthouse-budget.json):**

```json
[
  {
    "path": "/*",
    "options": {
      "performance": 90,
      "accessibility": 95
    }
  }
]
```

---

## 수동 테스트 체크리스트

### 키보드 테스트

- [ ] **탭 순서**: 전체 페이지를 Tab으로 이동; 포커스 순서가 논리적이고 시각적 순서를 따르는지 확인
- [ ] **포커스 가시성**: 포커스된 모든 요소에 보이는 포커스 표시자가 있는지 확인
- [ ] **인터랙티브 요소**: 모든 버튼, 링크, 폼 컨트롤이 키보드로 접근 가능하고 활성화 가능한지 확인
- [ ] **커스텀 위젯**: 드롭다운, 모달, 탭, 아코디언이 적절한 키보드 지원을 가지는지 확인
- [ ] **키보드 트랩 없음**: 포커스가 요소에 갇히지 않는지 확인 (Escape로 나갈 수 있는 의도적인 포커스 트랩 제외)
- [ ] **건너뛰기 링크**: "Skip to main content" 링크가 Tab으로 나타나고 올바르게 작동하는지 확인
- [ ] **Escape 키**: 모달, 드롭다운, 툴팁이 Escape로 해제되는지 확인
- [ ] **Enter/Space**: 버튼이 Enter와 Space 모두로 활성화되는지 확인

### 줌 및 리플로우 테스트

- [ ] **200% 텍스트 줌**: 브라우저 줌 200%에서 콘텐츠가 읽기 가능하고 기능적인지 확인
- [ ] **400% 줌 / 320px**: 1280px 너비에서 400% 줌 시 가로 스크롤이 없는지 확인
- [ ] **텍스트 간격**: 줄 높이 (1.5배), 단락 간격 (2배), 자간 (0.12em), 어간 (0.16em) 증가에 콘텐츠가 적응하는지 확인
- [ ] **핀치 줌**: 모바일에서 비활성화되지 않은지 확인 (`user-scalable=no`가 설정되지 않아야 함)

### 색상 및 명암비 테스트

- [ ] **텍스트 명암비**: 일반 텍스트의 명암비가 최소 4.5:1인지 확인
- [ ] **큰 텍스트 명암비**: 큰 텍스트 (18pt / 14pt 볼드)의 명암비가 최소 3:1인지 확인
- [ ] **UI 컴포넌트 명암비**: 테두리, 아이콘, 포커스 표시자의 명암비가 최소 3:1인지 확인
- [ ] **색상 독립성**: 색상만으로 정보를 전달하지 않는지 확인 (텍스트, 아이콘, 패턴 추가)
- [ ] **고대비 모드**: Windows 고대비 모드 / 강제 색상(forced colors)으로 테스트
- [ ] **다크 모드**: 지원하는 경우 다크 모드에서 모든 명암비 요구사항을 확인

### 콘텐츠 및 구조 테스트

- [ ] **heading 계층 구조**: 페이지당 하나의 `<h1>`; heading이 레벨을 건너뛰지 않는지 확인
- [ ] **랜드마크 리전**: `<header>`, `<nav>`, `<main>`, `<footer>`가 존재하는지 확인
- [ ] **페이지 제목**: 각 페이지에 고유하고 설명적인 `<title>`이 있는지 확인
- [ ] **언어**: `<html lang="...">`이 올바르게 설정되어 있는지 확인
- [ ] **링크 텍스트**: 모든 링크에 설명적인 텍스트가 있는지 확인 ("여기를 클릭" 사용 금지)
- [ ] **폼 레이블**: 모든 폼 입력 필드에 보이는, 연결된 `<label>`이 있는지 확인
- [ ] **오류 메시지**: 폼 오류가 설명적이고, `aria-describedby`를 통해 입력 필드와 연결되며, 스크린 리더에 알려지는지 확인
- [ ] **이미지**: 모든 이미지에 적절한 `alt` 텍스트가 있는지; 장식용 이미지에 `alt=""`가 있는지 확인
- [ ] **테이블**: 데이터 테이블에 `<caption>`, `scope`가 있는 `<th>`가 있는지 확인
- [ ] **목록**: 관련 항목이 `<ul>`, `<ol>` 또는 `<dl>`을 사용하는지 확인

### 모션 및 애니메이션 테스트

- [ ] **감소된 모션(Reduced motion)**: 애니메이션이 `prefers-reduced-motion` 미디어 쿼리를 존중하는지 확인
- [ ] **자동 재생 없음**: 비디오/오디오가 자동 재생되지 않거나 일시정지 컨트롤이 있는지 확인
- [ ] **깜박임 없음**: 초당 3회 이상 깜박이는 콘텐츠가 없는지 확인

```tsx
// 감소된 모션 설정 존중
import { useReducedMotion } from "@/hooks/useReducedMotion";

function AnimatedComponent() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={prefersReducedMotion ? "no-animation" : "animated"}
    >
      Content
    </div>
  );
}
```

```css
/* CSS 방식 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
