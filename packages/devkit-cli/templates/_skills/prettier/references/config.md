# Prettier 설정 (config.md)

## 옵션표와 실무 권장값

| 옵션 | 권장값 | 설명 |
| --- | --- | --- |
| `semi` | `true` | 문장 끝 세미콜론 추가 |
| `singleQuote` | `true` | 문자열에 작은따옴표 사용 |
| `jsxSingleQuote` | `false` | JSX 속성은 큰따옴표 유지 (HTML 관례) |
| `trailingComma` | `'all'` | 가능한 모든 곳에 후행 쉼표 (diff 최소화, ES2017+) |
| `printWidth` | `100` | 줄 바꿈 기준 폭 (팀에 따라 80/100/120) |
| `tabWidth` | `2` | 들여쓰기 칸 수 |
| `useTabs` | `false` | 스페이스로 들여쓰기 |
| `arrowParens` | `'always'` | 화살표 함수 인자 괄호 항상 (`(x) => x`) |
| `bracketSpacing` | `true` | 객체 리터럴 중괄호 안쪽 공백 (`{ foo }`) |
| `bracketSameLine` | `false` | 여러 줄 JSX의 `>`를 다음 줄로 내림 |
| `endOfLine` | `'lf'` | 줄바꿈 문자 LF 고정 (OS 간 diff 방지) |
| `quoteProps` | `'as-needed'` | 필요한 객체 키에만 따옴표 |
| `singleAttributePerLine` | `false` | JSX 속성을 한 줄에 하나씩 강제하지 않음 |

`endOfLine: 'lf'`는 Windows/macOS 혼용 팀에서 CRLF/LF 충돌을 막아 준다. `.gitattributes`에 `* text=auto eol=lf`를 함께 두면 확실하다.

## 전체 설정 예시 (prettier.config.mjs)

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  bracketSameLine: false,
  endOfLine: 'lf',
  quoteProps: 'as-needed',
  plugins: ['prettier-plugin-tailwindcss'],
};
```

## overrides로 파일별 옵션

특정 파일 패턴에만 다른 옵션을 적용한다. 예: Markdown은 공백이 의미를 갖는 경우가 있어 `proseWrap`을 보존으로 두고, 설정 파일은 폭을 넓힌다.

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  printWidth: 100,
  overrides: [
    {
      files: '*.md',
      options: {
        proseWrap: 'preserve',
        printWidth: 80,
      },
    },
    {
      files: ['*.json', '*.jsonc'],
      options: {
        trailingComma: 'none',
      },
    },
  ],
};
```

## .prettierignore

Prettier가 건드리면 안 되는 생성물·잠금 파일·산출물을 제외한다. 형식은 `.gitignore`와 동일하다.

```gitignore
# .prettierignore
pnpm-lock.yaml
node_modules
.next
dist
build
out
coverage
.turbo
.vercel
*.min.js
*.min.css
CHANGELOG.md
```

`pnpm-lock.yaml`은 반드시 제외한다. Prettier가 재포맷하면 lockfile이 손상되어 pnpm이 재생성하게 된다.

## 에디터 통합 · 포맷 온 세이브 (VS Code)

프로젝트에 확장 추천과 설정을 커밋해 팀 전체가 동일하게 저장 시 자동 포맷하도록 한다.

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

```json
// .vscode/extensions.json
{
  "recommendations": ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]
}
```

`editor.codeActionsOnSave`로 ESLint 자동 수정까지 걸고 싶다면 ESLint와의 역할 분리를 먼저 확인한다 ([integration.md](integration.md)).

## 설정 확인 명령

특정 파일에 어떤 옵션이 적용되는지 확인:

```bash
pnpm prettier --check .
pnpm prettier path/to/file.tsx --debug-check
```
