# eslint-plugin-fsd — React/Next 프리셋 설계 문서

- 날짜: 2026-07-29
- 상태: 확정 (구현 대기)
- 목표: `eslint-plugin-fsd`가 consumer(React/Next.js 앱)용 flat config 프리셋을 서브패스로 제공한다. FSD 규칙과 React 생태계 규칙을 한 번에 켜되, React를 쓰지 않는 consumer에게는 어떤 부담도 지우지 않는다.

---

## 1. 배경 & 범위

FSD는 프론트엔드 아키텍처이고 실사용 대상은 대부분 React/Next.js 앱이다. 현재 consumer는 `fsd.configs.recommended`로 FSD 규칙만 켜고, React 린팅은 별도로 네 개의 플러그인을 직접 조립해야 한다. 이 조립에는 실수하기 쉬운 지점이 있다(3절 참조).

### 범위

- 서브패스 `eslint-plugin-fsd/react` — FSD + `eslint-plugin-react` + `eslint-plugin-react-hooks`
- 서브패스 `eslint-plugin-fsd/next` — 위 + `eslint-plugin-jsx-a11y` + `@next/eslint-plugin-next`
- 네 플러그인은 모두 **optional peerDependency**
- README 갱신 (서브패스별 필요 peer, 사용 예시, peer 경고 안내)

### 명시적 비범위

- 기존 `configs.recommended`의 형태 변경 (단일 객체 유지, 하위 호환)
- 루트 진입점(`.`)에 React 프리셋 노출
- 플러그인 미설치 시 에러 메시지 가공 (5절)
- Vue/Svelte 등 다른 프레임워크 프리셋

---

## 2. 상류 생태계 조사 결과 (2026-07-29 기준)

설계의 전제이므로 실물 tarball을 받아 확인했다.

| 플러그인 | 버전 | flat config 접근 경로 | 플러그인 키 | ESLint 10 peer |
|---|---|---|---|---|
| `eslint-plugin-react-hooks` | 7.1.1 | `configs.flat.recommended`, `configs.flat['recommended-latest']` | `react-hooks` | ✅ `^10.0.0` 포함 |
| `eslint-plugin-react` | 7.37.5 | `configs.flat.recommended`, `configs.flat['jsx-runtime']` | `react` | ❌ `^9.7`까지 |
| `eslint-plugin-jsx-a11y` | 6.10.2 | **`flatConfigs.recommended`** (최상위) | `jsx-a11y` | ❌ `^9`까지 |
| `@next/eslint-plugin-next` | 16.2.12 | `configs['core-web-vitals']`, `configs.recommended` | `@next/next` | peer 선언 없음 |

확인된 사실 세 가지:

1. **네 패키지가 네 가지 다른 규약을 쓴다.** 이걸 감싸주는 것이 프리셋의 실질적 가치다.
2. `eslint-plugin-react-hooks`의 `.d.ts`는 flat config 타입을 `plugins: { react: any }`로 적어두었으나 **실제 구현은 `react-hooks` 키로 등록**한다. 타입이 부정확하므로 `eslint-plugin-react`와의 키 충돌은 없다.
3. `eslint-plugin-react-hooks` v7은 `@babel/core`, `@babel/parser`, `hermes-parser`, `zod`, `zod-validation-error`를 런타임 의존성으로 가진다(React Compiler 분석용). 무거우므로 optional peer가 타당하다.

`eslint-plugin-react`와 `jsx-a11y`가 ESLint 10을 peer로 선언하지 않는 것은 상류 문제이며 우리가 고칠 수 없다. 규칙 자체는 동작하므로 **README에 "경고는 예상된 것"이라고 명시**한다.

---

## 3. 핵심 설계 결정

### 3.1 서브패스 export (의존성 격리)

루트 진입점에서 React 플러그인을 static import하면, `configs.recommended`만 쓰려는 consumer도 네 패키지를 설치해야 하고 없으면 `import fsd from 'eslint-plugin-fsd'`가 모듈 로드 시점에 크래시한다. FSD는 본래 프레임워크 중립 아키텍처이므로 이는 받아들일 수 없다.

`peerDependenciesMeta.optional`만 선언하고 루트에서 static import하면 "선언은 optional인데 실제로는 필수"인 거짓말이 된다. 서브패스로 나누면 **모듈 경계가 optional을 실제로 보증**한다.

```
src/index.ts   → "."        React 의존 0 (현행 유지)
src/react.ts   → "./react"
src/next.ts    → "./next"
src/lib/preset.ts           엔트리가 공유하는 조립 헬퍼
```

### 3.2 프리셋은 배열이다

현행 `configs.recommended`는 `ignores: ['app/**', 'pages/**']`를 가진 단일 config 객체다. 이 `ignores`는 프로젝트 루트의 Next.js 라우팅 폴더가 FSD `pages` 레이어로 오인되는 것을 막는 장치다(2026-07-26 설계 문서 참조).

같은 방식으로 Next 프리셋을 단일 객체로 만들면, flat config에서 `ignores`가 그 객체의 **모든 규칙**에 걸리므로 `@next/next` 규칙이 `app/`·`pages/`에서 꺼진다. Next.js 규칙이 가장 필요한 바로 그 위치에서 무력화되는 것이다.

따라서 프리셋은 config **배열**로 만들고, `ignores`는 FSD config 객체에만 둔다.

```js
// eslint-plugin-fsd/next 의 default export
[
  fsdConfig,          // = configs.recommended 객체를 그대로 재사용 (규칙 정의 중복 금지)
                      // ignores: ['app/**', 'pages/**']   ← FSD 규칙만 제외
  reactConfig,        // files: ['**/*.{jsx,tsx}']
  reactHooksConfig,   // files: ['**/*.{js,jsx,ts,tsx}']
  jsxA11yConfig,      // files: ['**/*.{jsx,tsx}']
  nextConfig,         // 스코프 없음 — app/·pages/에도 적용된다
]
```

`react-hooks`만 `.js`/`.ts`까지 포함하는 이유: 커스텀 훅은 JSX 없는 `.ts` 파일에도 존재하며, `rules-of-hooks`는 거기서도 유효하다.

### 3.3 JSX 런타임

`react`와 `next` **양쪽 프리셋 모두** React 17+ 자동 런타임을 기본 가정으로 삼아, `react.configs.flat['jsx-runtime']`을 겹쳐 `react/react-in-jsx-scope`와 `react/jsx-uses-react`를 끈다. 클래식 런타임을 쓰는 consumer는 프리셋 뒤에 해당 규칙을 다시 켜면 된다. `settings.react.version`은 `'detect'`로 둔다.

### 3.4 기존 API 불변

`configs.recommended`는 단일 객체 그대로 둔다. 배열로 바꾸면 `[fsd.configs.recommended]`로 쓰던 기존 consumer의 설정이 깨진다.

---

## 4. 패키지 매니페스트 변경

```jsonc
{
  "exports": {
    ".":       { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./react": { "types": "./dist/react.d.ts", "import": "./dist/react.js" },
    "./next":  { "types": "./dist/next.d.ts",  "import": "./dist/next.js"  }
  },
  "peerDependencies": {
    "eslint": "^9.0.0 || ^10.0.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^7.0.0",
    "eslint-plugin-jsx-a11y": "^6.10.0",
    "@next/eslint-plugin-next": "^16.0.0"
  },
  "peerDependenciesMeta": {
    "eslint-plugin-react":       { "optional": true },
    "eslint-plugin-react-hooks": { "optional": true },
    "eslint-plugin-jsx-a11y":    { "optional": true },
    "@next/eslint-plugin-next":  { "optional": true }
  }
}
```

`eslint`는 optional이 아니다(플러그인의 본질적 요구사항). tsup `entry`를 `['src/index.ts', 'src/react.ts', 'src/next.ts']`로 확장한다.

네 플러그인은 테스트를 위해 **`packages/eslint-plugin-fsd`의 `devDependencies`**에 설치한다(루트가 아니다). 테스트 파일이 패키지 디렉토리에 있어 모듈 해석이 거기서 시작되기 때문이며, `eslint` devDependency를 그 위치에 둔 것과 같은 이유다.

---

## 5. 에러 처리 — 가공하지 않는다

서브패스를 import했는데 해당 플러그인이 없으면 Node가 `ERR_MODULE_NOT_FOUND`를 던지며, 메시지에 누락된 패키지명이 담긴다. 이를 try/catch로 감싸 친절한 안내로 바꾸려면 static import를 포기하고 동적 로딩으로 가야 하는데, 그러면 3.1에서 서브패스 방식을 고른 이유가 무너진다.

기본 에러를 그대로 두고 README의 설치 표로 대응한다.

---

## 6. 테스트 전략

우리 규칙이 아니라 **우리 조립**을 검증한다. 남의 플러그인 규칙 동작은 테스트하지 않으므로 `RuleTester`는 쓰지 않는다. 기존 `tests/index.test.ts`의 구조 검증 스타일을 따른다.

| 검증 항목 | 무엇을 지키는가 |
|---|---|
| `react`/`next` 기본 export가 배열이다 | 3.2 |
| FSD config에만 `ignores`가 있고, Next config에는 없다 | 3.2 — 회귀하면 Next 규칙이 조용히 꺼진다 |
| `react-hooks`·`react`·`jsx-a11y`·`@next/next` 네임스페이스가 충돌 없이 등록된다 | 2절의 키 충돌 우려 해소를 고정 |
| `react` 프리셋에 `@next/next` 규칙이 없다 | react와 next 프리셋의 경계 |
| `react/react-in-jsx-scope`가 off다 | 3.3 |
| **루트 진입점이 React 플러그인을 로드하지 않는다** | 3.1 — A안의 존재 이유 자체 |

마지막 항목의 구현 방법: `src/index.ts`를 시작점으로 **상대 경로 import를 재귀적으로 따라가며** 각 파일의 bare specifier(상대 경로가 아닌 import 대상)를 수집하고, 그 집합에 네 React 패키지가 하나도 없음을 단언한다. 소스는 모두 정적 ESM import만 쓰므로 정규식 기반 그래프 순회로 충분하다.

빌드 산출물(`dist/index.js`) 검사 방식은 쓰지 않는다. 테스트가 빌드 선행에 의존하게 되어 `pnpm test` 단독 실행이 깨지기 때문이다.

---

## 7. 문서 변경

README에 다음을 추가한다.

- 서브패스별 필요한 peer 표 (`/react`는 2개, `/next`는 4개)
- Next.js 앱 사용 예시 (`import fsdNext from 'eslint-plugin-fsd/next'; export default [...fsdNext];`)
- 순수 React 앱 사용 예시
- `eslint-plugin-react`·`jsx-a11y`가 ESLint 10을 peer로 선언하지 않아 경고가 나올 수 있으며 **예상된 동작**이라는 안내
- 자동 런타임 가정(3.3)과 클래식 런타임에서 되돌리는 법

---

## 8. 미결 사항 / 향후

- `eslint-plugin-react`·`jsx-a11y`가 ESLint 10 peer를 선언하면 README의 경고 안내를 제거한다.
- `react-hooks`의 `recommended` 대신 `recommended-latest`(최신 React Compiler 규칙)를 쓸지는 v0.2에서 재검토한다. 초기 릴리스는 보수적으로 `recommended`를 쓴다.
- Vue/Svelte 프리셋은 요청이 있을 때 같은 서브패스 패턴으로 추가한다.
