# 프로젝트 템플릿(`devkit create`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 명령으로 `@devbak` 표준이 적용된 NestJS · Next.js · Turborepo 모노레포 프로젝트를 생성하는 CLI와, 그것이 소비할 설정 패키지 3종을 만든다.

**Architecture:** 프로젝트 뼈대는 공식 CLI(`nest new`, `create-next-app`)에 위임하고 그 위에 devkit 표준을 얹는다. 각 프로젝트 유형은 **원자 연산 6종의 순서 목록**(레시피)으로 선언되며, 모노레포 레시피는 Next 레시피를 그대로 합성한다. 설정 패키지 3종은 빌드가 없어 `link:` 소비에서 산출물이 낡을 수 없다.

**Tech Stack:** TypeScript 5.6+, ESLint 10 flat config, tsup, vitest, pnpm workspace, Node `^20.19 || ^22.13 || >=24`

**설계 문서:** `docs/superpowers/specs/2026-08-01-devkit-template-design.md` (커밋 `41c2593`). 이 계획의 절 참조는 전부 그 문서를 가리킨다.

## Global Constraints

- 패키지 매니저는 **pnpm만** 쓴다. `npm`/`yarn` 명령을 쓰지 않는다.
- 새 패키지는 전부 `@devbak/` 스코프. `license: "MIT"`, `description`, `keywords`, `engines`, `publishConfig.access: "public"`을 **전부** 갖는다 (로드맵이 `eslint-plugin-fsd`에서 누락을 지적했다).
- `engines.node`는 `"^20.19.0 || ^22.13.0 || >=24"` — `eslint-config-nest`와 동일 문자열.
- **배포하지 않는다.** 그러나 `publishConfig`·`files`는 남긴다 (스펙 3.1, 로드맵 2.1절).
- 설정 패키지 3종(`tsconfig`·`jest-config`·`vitest-config`)은 **빌드 스크립트를 두지 않는다** (스펙 4.3절). `devkit-cli`만 tsup으로 빌드한다.
- 코드 스타일: TypeScript strict, 2-space 들여쓰기, `singleQuote: true`, `trailingComma: 'all'`, `async/await`(`.then()` 금지).
- ESLint peer는 `^10.0.0` 전용. `^9`를 넣지 않는다.
- 테스트는 루트 `vitest.config.ts`의 `include: ['packages/*/tests/**/*.test.ts']`가 자동 수집한다. 새 패키지의 테스트는 반드시 `packages/<name>/tests/*.test.ts`에 둔다.
- 각 패키지의 `tests/tsconfig.json`은 `{"extends": "../../../tsconfig.base.json", "compilerOptions": {"noEmit": true, "declaration": false, "resolveJsonModule": true}, "include": ["."]}` 형태를 따른다. 없으면 `projectService`가 실패해 루트 `pnpm lint`가 깨진다.
- 커밋 메시지는 한글 imperative mood. 각 태스크 끝에 커밋한다.

---

## File Structure

```
packages/
├── tsconfig/                       ← Task 1
│   ├── package.json  README.md
│   ├── base.json  nest.json  next.json  lib.json
│   └── tests/{config.test.ts, tsconfig.json, fixtures/}
├── jest-config/                    ← Task 2
│   ├── package.json  README.md
│   ├── nest.js  nest-e2e.js
│   └── tests/{config.test.ts, tsconfig.json}
├── vitest-config/                  ← Task 3
│   ├── package.json  README.md
│   ├── next.js  node.js
│   └── tests/{config.test.ts, tsconfig.json}
└── devkit-cli/                     ← Task 4~11
    ├── package.json  tsconfig.json  tsup.config.ts  README.md
    ├── src/
    │   ├── types.ts                Ctx · Step · Recipe          (Task 4)
    │   ├── bin.ts                  진입점 · dist 신선도 검사      (Task 4)
    │   ├── run.ts                  레시피 실행기                 (Task 8)
    │   ├── ops/
    │   │   ├── index.ts            재export                     (Task 8)
    │   │   ├── merge-json.ts                                    (Task 5)
    │   │   ├── remove-files.ts                                  (Task 6)
    │   │   ├── copy-overlay.ts                                  (Task 6)
    │   │   ├── make-dirs.ts                                     (Task 6)
    │   │   ├── link-deps.ts                                     (Task 7)
    │   │   └── delegate.ts                                      (Task 8)
    │   └── recipes/{nest.ts, next.ts, monorepo.ts}   (Task 9·10·11)
    ├── templates/{nest,next,monorepo}/               (Task 9·10·11)
    └── tests/
        ├── *.test.ts               1·2층 (빠름)
        └── e2e/*.e2e.test.ts       3층 (느림, 별도 실행)  (Task 12)
```

**루트 변경**: `package.json`(scripts), `eslint.config.mjs`(ignores), `.oxlintrc.json`(ignorePatterns) — Task 4에서 함께.

---

## Task 순서와 근거

1. **설정 패키지 3종 먼저**(Task 1~3) — 템플릿이 이들을 참조한다. 스펙 1.2절이 순서를 앞당긴 근거 그 자체다.
2. **CLI 뼈대 + 원자 연산**(Task 4~8) — 레시피는 연산 위에 선다.
3. **레시피 3종**(Task 9~11) — `nest` → `next` → `monorepo`. 모노레포가 next를 합성하므로 순서가 강제된다.
4. **통합 검증**(Task 12~13).

---

### Task 1: `@devbak/tsconfig` 패키지

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`, `nest.json`, `next.json`, `lib.json`
- Create: `packages/tsconfig/README.md`
- Test: `packages/tsconfig/tests/config.test.ts`, `packages/tsconfig/tests/tsconfig.json`
- Test fixtures: `packages/tsconfig/tests/fixtures/{nest,next,lib}/`

**Interfaces:**
- Consumes: 없음
- Produces: 서브패스 `@devbak/tsconfig/base` · `/nest` · `/next` · `/lib`. 다른 태스크는 `"extends": "@devbak/tsconfig/<sub>"` 형태로만 참조한다.

**배경 — 값의 출처**

이 파일들의 내용은 상상하지 않는다. 출처는 셋이다.

| 프리셋 | 출처 |
| --- | --- |
| `nest.json` | `nest new --strict` 실측 산출물 (스펙 2.1절) |
| `next.json` | `create-next-app` 실측 산출물 (스펙 2.2절) |
| `base.json`/`lib.json` | `~/Documents/develop/nextjs-monorepo/packages/typescript-config/base.json` (스펙 2.4절) |

- [ ] **Step 1: 패키지 매니페스트 작성**

`packages/tsconfig/package.json`:

```json
{
  "name": "@devbak/tsconfig",
  "version": "0.1.0",
  "description": "개인 프로젝트 공용 TypeScript 설정 프리셋 (빌드 없음, JSON)",
  "license": "MIT",
  "keywords": ["tsconfig", "typescript", "config"],
  "exports": {
    "./base": "./base.json",
    "./nest": "./nest.json",
    "./next": "./next.json",
    "./lib": "./lib.json"
  },
  "files": ["base.json", "nest.json", "next.json", "lib.json"],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

`build` 스크립트를 두지 않는다 (Global Constraints, 스펙 4.3절).

- [ ] **Step 2: 프리셋 4개 작성**

`packages/tsconfig/base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**`exclude`를 두지 않는다.** TypeScript는 `extends`로 상속된 상대 경로를 그 값이 **선언된 파일 위치** 기준으로 해석하므로, 여기 적은 `"exclude": ["dist"]`는 소비자의 `dist`가 아니라 `packages/tsconfig/dist`를 가리킨다. 보호하는 척하면서 실제로는 아무것도 하지 않는다(2026-08-01 실측: `dist/stale.ts`가 소비자 프로그램에 포함되어 타입 에러 발생). 대상 파일 범위는 소비자가 자신의 `include`로 정한다.

`packages/tsconfig/nest.json` — `base.json`을 extends하지 **않는다**. NestJS는 `module: nodenext`와 데코레이터가 필요해 base와 근본적으로 다르고, 억지로 extends하면 상속받은 값을 절반 이상 덮어쓰게 된다:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "target": "ES2023",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "incremental": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

`base.json`과 같은 이유로 `exclude`를 두지 않는다.

`nest new --strict`가 내는 값은 `strictNullChecks`·`noImplicitAny`·`strictBindCallApply` 3개를 개별로 켠다. 여기서는 `strict: true` 하나로 대체한다 — 상위집합이며, 개별 나열은 새 strict 플래그가 추가될 때 빠진다.

`packages/tsconfig/next.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  }
}
```

`packages/tsconfig/lib.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

- [ ] **Step 3: 테스트 tsconfig 작성**

`packages/tsconfig/tests/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

- [ ] **Step 4: 실패하는 테스트 작성**

형식만 단언하지 않고 **실제 `tsc`를 돌린다** (스펙 7절). `packages/tsconfig/tests/config.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const PKG_DIR = resolve(import.meta.dirname, '..');
const TSC = resolve(import.meta.dirname, '../../../node_modules/.bin/tsc');

const created: string[] = [];

/** 임시 프로젝트를 만들고 tsc --noEmit을 돌린 뒤 { code, output }을 반환한다. */
function typecheck(preset: string, files: Record<string, string>, extra: object = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-tsconfig-'));
  created.push(dir);

  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ extends: join(PKG_DIR, `${preset}.json`), ...extra }, null, 2),
  );
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }

  try {
    execFileSync(TSC, ['--noEmit', '-p', dir], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output: '' };
  } catch (error) {
    const err = error as { status: number; stdout: string };
    return { code: err.status, output: err.stdout };
  }
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@devbak/tsconfig/nest', () => {
  it('데코레이터가 붙은 클래스를 통과시킨다', () => {
    const result = typecheck('nest', {
      'src/app.service.ts': [
        'declare function Injectable(): ClassDecorator;',
        '@Injectable()',
        'export class AppService {',
        '  getHello(): string {',
        "    return 'hello';",
        '  }',
        '}',
      ].join('\n'),
    });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });

  it('strict 위반을 잡는다', () => {
    const result = typecheck('nest', {
      'src/bad.ts': 'export function f(x) { return x; }',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('implicitly has an');
  });
});

describe('@devbak/tsconfig/next', () => {
  it('JSX를 통과시키고 emit하지 않는다', () => {
    const result = typecheck('next', {
      'src/page.tsx': 'export default function Page() { return <div>hi</div>; }',
    });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });
});

describe('@devbak/tsconfig/lib', () => {
  it('noUncheckedIndexedAccess를 켜서 배열 인덱싱을 undefined로 본다', () => {
    // eslint-plugin-fsd가 이 옵션 부재로 무의미한 non-null 단언을 갖게 된
    // 전례가 있다(work-log 2026-07-29). base가 이를 켜는지 고정한다.
    const result = typecheck('lib', {
      'src/index.ts': ['export function first(xs: string[]): string {', '  return xs[0];', '}'].join('\n'),
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('undefined');
  });
});
```

- [ ] **Step 5: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/tsconfig`
Expected: FAIL — 아직 `nest.json` 등이 없거나 경로가 안 맞는다.

- [ ] **Step 6: 테스트가 통과할 때까지 프리셋 수정**

Run: `pnpm vitest run packages/tsconfig`
Expected: PASS (4개 테스트)

실패하면 프리셋을 고친다. 테스트를 느슨하게 만들지 않는다.

- [ ] **Step 7: README 작성**

`packages/tsconfig/README.md`에 프리셋 4개의 용도, 사용법(`"extends": "@devbak/tsconfig/nest"`), **빌드가 없다는 사실과 그 이유**(스펙 4.3절)를 적는다.

- [ ] **Step 8: 워크스페이스 검증**

Run: `pnpm install && pnpm lint && pnpm test`
Expected: 전부 exit 0

- [ ] **Step 9: 커밋**

```bash
git add packages/tsconfig pnpm-lock.yaml
git commit -m "feat: @devbak/tsconfig 패키지 추가"
```

---

### Task 2: `@devbak/jest-config` 패키지

**Files:**
- Create: `packages/jest-config/package.json`, `nest.js`, `nest-e2e.js`, `README.md`
- Test: `packages/jest-config/tests/config.test.ts`, `packages/jest-config/tests/tsconfig.json`

**Interfaces:**
- Consumes: 없음
- Produces: `require('@devbak/jest-config/nest')` → jest 설정 객체. `require('@devbak/jest-config/nest-e2e')` → e2e용 설정 객체. **CJS `module.exports`다** — Task 9의 `templates/nest/jest.config.js`가 이 형식에 의존한다.

**왜 CJS `.js`인가**

`nest new`가 만드는 프로젝트는 `package.json`에 `"type"` 필드가 없다 → `.js`는 CJS다. 그리고 이것이 중요한 이유는 따로 있다: `@devbak/eslint-config-nest`는 `**/*.{ts,mts,cts}`에 `projectService: true`를 걸므로, 생성물에 `jest.config.ts`를 두면 그 파일이 tsconfig `include` 밖일 때 **ESLint가 크래시한다**. `eslint-config-nest` 최종 리뷰가 잡은 Critical과 같은 부류다. `.js`로 두면 그 설정의 `disableTypeChecked` 스코프(`**/*.{js,mjs,cjs}`)에 들어가 구조적으로 회피된다.

- [ ] **Step 1: 패키지 매니페스트 작성**

`packages/jest-config/package.json`:

```json
{
  "name": "@devbak/jest-config",
  "version": "0.1.0",
  "description": "NestJS 프로젝트 공용 Jest 설정 (빌드 없음, CJS)",
  "license": "MIT",
  "keywords": ["jest", "jest-config", "nestjs"],
  "exports": {
    "./nest": "./nest.js",
    "./nest-e2e": "./nest-e2e.js"
  },
  "files": ["nest.js", "nest-e2e.js"],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "jest": "^30.0.0",
    "ts-jest": "^29.2.0"
  }
}
```

- [ ] **Step 2: 설정 2종 작성**

`packages/jest-config/nest.js` — 출처는 `nest new` 산출물의 `package.json` 인라인 `jest` 블록(스펙 2.1절):

```js
/**
 * NestJS 유닛 테스트용 Jest 설정.
 *
 * rootDir이 'src'인 것은 nest new의 기본값을 그대로 따른 것이다.
 * 소비자는 이 객체를 spread해 덮어쓸 수 있다.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

`packages/jest-config/nest-e2e.js` — 출처는 `nest new` 산출물의 `test/jest-e2e.json`:

```js
/**
 * NestJS e2e 테스트용 Jest 설정.
 *
 * rootDir이 '.'인 것은 이 설정이 프로젝트 루트에서 참조되기 때문이다.
 * nest new의 test/jest-e2e.json은 그 파일 위치를 기준으로 '.'을 썼으나,
 * 여기서는 소비자가 루트의 jest-e2e.config.js에서 참조하므로 동일하게 '.'이다.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
```

- [ ] **Step 3: 테스트 tsconfig 작성**

`packages/jest-config/tests/tsconfig.json` — Task 1 Step 3과 동일 내용:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

- [ ] **Step 4: 실패하는 테스트 작성**

형식 단언에 그치지 않고 **실제 jest를 픽스처에 돌린다**. `packages/jest-config/tests/config.test.ts`:

```ts
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const PKG_DIR = resolve(import.meta.dirname, '..');
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@devbak/jest-config/nest', () => {
  it('nest new의 인라인 jest 블록과 같은 값을 갖는다', () => {
    const config = require_(join(PKG_DIR, 'nest.js')) as Record<string, unknown>;
    expect(config).toEqual({
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      collectCoverageFrom: ['**/*.(t|j)s'],
      coverageDirectory: '../coverage',
      testEnvironment: 'node',
    });
  });

  it('실제 jest가 이 설정으로 spec 파일을 찾아 통과시킨다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-jest-'));
    created.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });

    writeFileSync(
      join(dir, 'src', 'sample.spec.ts'),
      "it('runs', () => { expect(1 + 1).toBe(2); });\n",
    );
    writeFileSync(
      join(dir, 'jest.config.js'),
      `module.exports = require(${JSON.stringify(join(PKG_DIR, 'nest.js'))});\n`,
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', private: true }));

    const jestBin = resolve(import.meta.dirname, '../../../node_modules/.bin/jest');
    const output = execFileSync(jestBin, ['--config', join(dir, 'jest.config.js'), '--rootDir', join(dir, 'src')], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: dir,
    });
    expect(output).toBeDefined();
  });
});

describe('@devbak/jest-config/nest-e2e', () => {
  it('e2e-spec 파일만 대상으로 하는 testRegex를 갖는다', () => {
    const config = require_(join(PKG_DIR, 'nest-e2e.js')) as { testRegex: string };
    const re = new RegExp(config.testRegex);
    expect(re.test('test/app.e2e-spec.ts')).toBe(true);
    expect(re.test('src/app.service.spec.ts')).toBe(false);
  });
});
```

- [ ] **Step 5: jest·ts-jest를 루트 devDependencies에 추가**

peer로 선언했으나 테스트가 실제로 실행하므로 워크스페이스에 필요하다.

Run: `pnpm add -D -w jest@^30 ts-jest@^29.2 @types/jest@^30`

- [ ] **Step 6: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/jest-config`
Expected: FAIL

- [ ] **Step 7: 통과할 때까지 수정**

Run: `pnpm vitest run packages/jest-config`
Expected: PASS (3개 테스트)

두 번째 테스트가 ts-jest의 tsconfig 부재로 실패하면, 픽스처에 최소 `tsconfig.json`(`{"extends": "<PKG>/../tsconfig/nest.json"}`)을 추가한다. **테스트를 지우지 않는다** — 소비자가 겪을 문제를 여기서 겪는 것이 목적이다.

- [ ] **Step 8: README 작성**

용도, 사용법(`module.exports = require('@devbak/jest-config/nest')`), **왜 `.ts`가 아니라 `.js`인지**(위 배경 절)를 적는다. 이 이유를 적지 않으면 나중에 누군가 `.ts`로 바꾼다.

- [ ] **Step 9: 검증 후 커밋**

Run: `pnpm lint && pnpm test`

```bash
git add packages/jest-config package.json pnpm-lock.yaml
git commit -m "feat: @devbak/jest-config 패키지 추가"
```

---

### Task 3: `@devbak/vitest-config` 패키지

**Files:**
- Create: `packages/vitest-config/package.json`, `next.js`, `node.js`, `README.md`
- Test: `packages/vitest-config/tests/config.test.ts`, `packages/vitest-config/tests/tsconfig.json`

**Interfaces:**
- Consumes: 없음
- Produces: `import nextConfig from '@devbak/vitest-config/next'` → vitest `UserConfig` 객체 (ESM default export). Task 10의 `templates/next/vitest.config.ts`가 이를 import한다.

**왜 ESM인가**

vitest는 ESM 기반이고 `vitest.config.ts`는 ESM으로 로드된다. Task 2의 jest-config가 CJS인 것과 대칭이 아니지만, 각 도구의 실제 로딩 방식을 따른 것이다. 억지로 통일하지 않는다.

- [ ] **Step 1: 패키지 매니페스트 작성**

```json
{
  "name": "@devbak/vitest-config",
  "version": "0.1.0",
  "description": "프론트엔드/Node 프로젝트 공용 Vitest 설정 (빌드 없음, ESM)",
  "license": "MIT",
  "keywords": ["vitest", "vitest-config", "nextjs"],
  "type": "module",
  "exports": {
    "./next": "./next.js",
    "./node": "./node.js"
  },
  "files": ["next.js", "node.js"],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "vitest": "^2.1.0 || ^3.0.0"
  }
}
```

- [ ] **Step 2: 설정 2종 작성**

`packages/vitest-config/next.js`:

```js
/**
 * Next.js 앱용 Vitest 설정.
 *
 * `passWithNoTests: true`는 의도적이다. create-next-app은 테스트를 하나도
 * 만들지 않으므로, 갓 생성된 프로젝트에서 `pnpm test`가 exit 1로 실패한다.
 * 이 저장소 루트도 같은 이유로 --passWithNoTests를 쓴다(work-log 2026-07-26).
 *
 * 단 이 플래그 때문에 devkit의 자가검증은 `pnpm test`를 돌리지 않는다
 * (설계 5.4절) — 실패를 감춘 상태를 통과로 읽지 않기 위해서다.
 */
export default {
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
};
```

`packages/vitest-config/node.js`:

```js
/** Node 라이브러리/서버용 Vitest 설정. DOM이 필요 없다. */
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    passWithNoTests: true,
  },
};
```

- [ ] **Step 3: 테스트 tsconfig 작성**

Task 1 Step 3과 동일 내용의 `packages/vitest-config/tests/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

- [ ] **Step 4: 실패하는 테스트 작성**

`packages/vitest-config/tests/config.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import nextConfig from '../next.js';
import nodeConfig from '../node.js';

const PKG_DIR = resolve(import.meta.dirname, '..');
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@devbak/vitest-config/next', () => {
  it('jsdom 환경을 쓰고 테스트 0개를 통과시킨다', () => {
    expect(nextConfig.test.environment).toBe('jsdom');
    expect(nextConfig.test.passWithNoTests).toBe(true);
  });
});

describe('@devbak/vitest-config/node', () => {
  it('node 환경을 쓴다 — DOM을 요구하지 않는다', () => {
    expect(nodeConfig.test.environment).toBe('node');
  });
});

describe('실제 vitest 실행', () => {
  it('node 프리셋으로 픽스처 테스트가 통과한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-vitest-'));
    created.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });

    writeFileSync(
      join(dir, 'src', 'sample.test.ts'),
      "import { it, expect } from 'vitest';\nit('runs', () => { expect(1).toBe(1); });\n",
    );
    writeFileSync(
      join(dir, 'vitest.config.mjs'),
      `import config from ${JSON.stringify(join(PKG_DIR, 'node.js'))};\nexport default config;\n`,
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', private: true, type: 'module' }));

    const bin = resolve(import.meta.dirname, '../../../node_modules/.bin/vitest');
    const output = execFileSync(bin, ['run', '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
    expect(output).toContain('1 passed');
  });
});
```

- [ ] **Step 5: jsdom 의존성 추가**

`environment: 'jsdom'`은 `jsdom` 패키지를 요구한다. 소비자가 설치해야 하므로 `peerDependencies`에 추가하고 워크스페이스에도 넣는다.

`package.json`의 `peerDependencies`에 `"jsdom": "^25.0.0"`를 추가하고, `peerDependenciesMeta`로 optional 처리한다 (Node 프리셋만 쓰는 소비자에게 강요하지 않는다):

```json
"peerDependencies": {
  "vitest": "^2.1.0 || ^3.0.0",
  "jsdom": "^25.0.0"
},
"peerDependenciesMeta": {
  "jsdom": { "optional": true }
}
```

Run: `pnpm add -D -w jsdom@^25`

- [ ] **Step 6: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/vitest-config`
Expected: FAIL

- [ ] **Step 7: 통과할 때까지 수정**

Run: `pnpm vitest run packages/vitest-config`
Expected: PASS (3개 테스트)

- [ ] **Step 8: README 작성 후 검증·커밋**

README에 프리셋 2종, 사용법, `passWithNoTests`가 켜져 있다는 사실과 그것이 자가검증에서 `pnpm test`를 제외한 이유(설계 5.4절)를 적는다.

Run: `pnpm lint && pnpm test`

```bash
git add packages/vitest-config package.json pnpm-lock.yaml
git commit -m "feat: @devbak/vitest-config 패키지 추가"
```

---

### Task 4: `devkit-cli` 스캐폴딩 + 타입 + 진입점

**Files:**
- Create: `packages/devkit-cli/package.json`, `tsconfig.json`, `tsup.config.ts`
- Create: `packages/devkit-cli/src/types.ts`, `packages/devkit-cli/src/bin.ts`
- Modify: `package.json` (루트 scripts)
- Modify: `eslint.config.mjs` (ignores)
- Modify: `.oxlintrc.json` (ignorePatterns)
- Test: `packages/devkit-cli/tests/bin.test.ts`, `packages/devkit-cli/tests/tsconfig.json`

**Interfaces:**
- Consumes: 없음
- Produces:
  ```ts
  export interface Ctx {
    targetDir: string;    // 생성될 프로젝트의 절대경로
    toolkitRoot: string;  // 이 저장소 루트의 절대경로
    name: string;         // 프로젝트 이름 (= basename(targetDir))
    log: (message: string) => void;
  }

  export type StepKind =
    | 'delegate' | 'removeFiles' | 'copyOverlay'
    | 'mergeJson' | 'linkDeps' | 'makeDirs' | 'compose';

  export interface Step {
    kind: StepKind;
    label: string;
    /** 스냅샷 테스트용 직렬화. 실행하지 않고 레시피를 검사할 수 있게 한다. */
    describe: () => unknown;
    run: (ctx: Ctx) => Promise<void>;
  }

  export type ProjectType = 'nest' | 'next' | 'monorepo';

  export interface RecipeOptions {
    skipInstall?: boolean;
    skipVerify?: boolean;
  }

  export type Recipe = (options?: RecipeOptions) => Step[];

  export function findToolkitRoot(from: string): string;
  ```

**핵심 설계 — `Step.describe()`가 스텁을 없앤다**

스펙 7절의 2층(레시피 스냅샷)은 보통 `delegate`를 목으로 갈아끼워 구현한다. 여기서는 그러지 않는다. 각 Step이 자신을 직렬화할 수 있으므로, 스냅샷 테스트는 **레시피를 실행하지 않고** `recipe().map(s => s.describe())`만 찍으면 된다. 목 프레임워크도, 의존성 주입도 필요 없다.

- [ ] **Step 1: 패키지 매니페스트·빌드 설정 작성**

`packages/devkit-cli/package.json`:

```json
{
  "name": "@devbak/devkit-cli",
  "version": "0.1.0",
  "description": "@devbak 표준이 적용된 프로젝트를 생성하는 CLI",
  "license": "MIT",
  "keywords": ["scaffold", "template", "cli", "nestjs", "nextjs"],
  "type": "module",
  "bin": {
    "devbak": "./dist/bin.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "templates"],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup",
    "prepublishOnly": "pnpm build"
  }
}
```

`packages/devkit-cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`packages/devkit-cli/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 2: 루트 설정 3개 수정**

루트 `package.json`의 `scripts`에 추가:

```json
"devbak": "node packages/devkit-cli/dist/bin.js",
"test:e2e": "vitest run --config vitest.e2e.config.ts"
```

`eslint.config.mjs`의 `ignores` 배열에 `'**/templates/**'`를 추가한다. 이유를 주석으로 남긴다:

```js
ignores: [
  '**/dist/**',
  'coverage/**',
  '.superpowers/**',
  '**/tests/fixtures/**',
  // devkit-cli/templates/는 생성물에 복사될 파일들이다. 이 저장소의
  // tsconfig 어디에도 속하지 않으므로 projectService가 실패해 ESLint가
  // 크래시한다(eslint-config-nest 최종 리뷰가 잡은 Critical과 같은 부류).
  '**/templates/**',
],
```

`.oxlintrc.json`의 `ignorePatterns`에도 `"**/templates/**"`를 추가한다.

- [ ] **Step 3: 타입 정의 작성**

`packages/devkit-cli/src/types.ts` — 위 Interfaces 블록의 타입을 그대로 작성한다(`findToolkitRoot` 제외, 그것은 Step 4).

- [ ] **Step 4: 실패하는 테스트 작성**

`packages/devkit-cli/tests/tsconfig.json`은 Task 1 Step 3과 동일 내용으로 만든다.

`packages/devkit-cli/tests/bin.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findToolkitRoot } from '../src/bin.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('findToolkitRoot', () => {
  it('pnpm-workspace.yaml이 있는 상위 디렉토리를 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'devbak-root-'));
    created.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const deep = join(root, 'packages', 'devkit-cli', 'dist');
    mkdirSync(deep, { recursive: true });

    expect(findToolkitRoot(deep)).toBe(root);
  });

  it('찾지 못하면 던진다 — 조용히 cwd로 폴백하지 않는다', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'devbak-orphan-'));
    created.push(orphan);
    expect(() => findToolkitRoot(orphan)).toThrow(/pnpm-workspace\.yaml/);
  });
});
```

두 번째 테스트가 중요하다. 못 찾았을 때 `process.cwd()`로 폴백하면 `linkDeps`가 엉뚱한 상대경로를 계산하고 **아무 에러 없이 잘못된 프로젝트가 생성된다** — 설계 6.1절이 지목한 "조용한 성공"이다.

- [ ] **Step 5: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli`
Expected: FAIL — `findToolkitRoot`가 없다

- [ ] **Step 6: `bin.ts` 구현**

`packages/devkit-cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * pnpm-workspace.yaml을 상위로 탐색해 툴킷 저장소 루트를 찾는다.
 *
 * 못 찾으면 던진다. cwd로 폴백하면 linkDeps가 엉뚱한 상대경로를 계산해
 * 아무 에러 없이 잘못된 프로젝트가 생성된다(설계 6.1절).
 */
export function findToolkitRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `툴킷 저장소 루트를 찾지 못했습니다 (${from}에서 위로 탐색하며 pnpm-workspace.yaml을 찾았습니다).`,
      );
    }
    dir = parent;
  }
}

/** 디렉토리 트리에서 가장 최근 mtime을 반환한다. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * dist가 src보다 오래됐으면 중단한다.
 *
 * link: 소비에서는 어떤 라이프사이클 스크립트도 돌지 않아, 빌드를 잊으면
 * 옛 코드가 조용히 실행된다(로드맵 4.2절). CLI만은 스스로 이를 막는다.
 */
export function assertDistFresh(pkgDir: string): void {
  const distBin = join(pkgDir, 'dist', 'bin.js');
  if (!existsSync(distBin)) return;
  if (newestMtime(join(pkgDir, 'src')) > statSync(distBin).mtimeMs) {
    throw new Error('devkit-cli의 dist가 src보다 오래됐습니다. `pnpm build`를 먼저 실행하세요.');
  }
}
```

`main()`은 Task 8에서 레시피 실행기가 준비된 뒤 붙인다. 지금은 export 두 개만 있으면 된다.

- [ ] **Step 7: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli`
Expected: PASS (2개 테스트)

- [ ] **Step 8: 빌드·린트 검증**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: 전부 exit 0

`pnpm build`가 `src/index.ts` 부재로 실패하면 `packages/devkit-cli/src/index.ts`에 `export * from './types.js';`만 넣는다.

- [ ] **Step 9: 커밋**

```bash
git add packages/devkit-cli package.json eslint.config.mjs .oxlintrc.json pnpm-lock.yaml
git commit -m "feat: devkit-cli 패키지 뼈대와 툴킷 루트 탐색 추가"
```

---

### Task 5: `mergeJson` 연산

**Files:**
- Create: `packages/devkit-cli/src/ops/merge-json.ts`
- Test: `packages/devkit-cli/tests/merge-json.test.ts`

**Interfaces:**
- Consumes: `Ctx`, `Step` (Task 4)
- Produces:
  ```ts
  export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
  export type JsonObject = { [k: string]: Json };

  /** 순수 함수. 파일시스템을 건드리지 않으므로 단독 테스트가 가능하다. */
  export function applyPatch(target: JsonObject, patch: JsonObject): JsonObject;

  /** 점 표기 경로가 객체 안에 존재하는지. 'a.b.c' 형태를 지원한다. */
  export function hasPath(obj: JsonObject, path: string): boolean;

  export interface MergeJsonOptions {
    /** 패치 적용 **전에** 반드시 존재해야 하는 점 표기 경로들 */
    required?: string[];
    /** targetDir 기준 상대 경로. 기본값 'package.json' */
    file?: string;
  }

  export function mergeJson(patch: JsonObject, options?: MergeJsonOptions): Step;
  ```

**규약**

- 값이 `null`이면 **키를 삭제한다**
- 값이 객체면 재귀 병합
- 값이 배열이면 **교체**(병합하지 않는다)
- `required` 경로가 없으면 던진다 (설계 6.2절)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/merge-json.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyPatch, hasPath } from '../src/ops/merge-json.js';

describe('applyPatch', () => {
  it('중첩 객체를 재귀 병합한다', () => {
    const result = applyPatch(
      { scripts: { build: 'nest build', lint: 'old' }, name: 'x' },
      { scripts: { lint: 'eslint .' } },
    );
    expect(result).toEqual({ scripts: { build: 'nest build', lint: 'eslint .' }, name: 'x' });
  });

  it('null 값은 키를 삭제한다', () => {
    const result = applyPatch(
      { devDependencies: { eslint: '^9.18.0', 'eslint-plugin-prettier': '^5.2.2' } },
      { devDependencies: { 'eslint-plugin-prettier': null, eslint: '^10.8.0' } },
    );
    expect(result).toEqual({ devDependencies: { eslint: '^10.8.0' } });
    expect(result.devDependencies).not.toHaveProperty('eslint-plugin-prettier');
  });

  it('최상위 키도 null로 삭제한다 — nest new의 인라인 jest 블록 제거용', () => {
    const result = applyPatch({ name: 'x', jest: { rootDir: 'src' } }, { jest: null });
    expect(result).toEqual({ name: 'x' });
  });

  it('배열은 병합하지 않고 교체한다', () => {
    const result = applyPatch({ files: ['dist', 'old'] }, { files: ['dist'] });
    expect(result).toEqual({ files: ['dist'] });
  });

  it('원본을 변경하지 않는다', () => {
    const original = { scripts: { lint: 'old' } };
    applyPatch(original, { scripts: { lint: 'new' } });
    expect(original.scripts.lint).toBe('old');
  });

  it('없는 키에 null을 줘도 던지지 않는다', () => {
    expect(applyPatch({ a: 1 }, { b: null })).toEqual({ a: 1 });
  });
});

describe('hasPath', () => {
  it('점 표기 경로를 따라간다', () => {
    const obj = { devDependencies: { 'eslint-plugin-prettier': '^5.2.2' } };
    expect(hasPath(obj, 'devDependencies.eslint-plugin-prettier')).toBe(true);
    expect(hasPath(obj, 'devDependencies.nonexistent')).toBe(false);
    expect(hasPath(obj, 'jest')).toBe(false);
  });

  it('중간 경로가 객체가 아니면 false다', () => {
    expect(hasPath({ a: 'string' }, 'a.b')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/merge-json.test.ts`
Expected: FAIL — 모듈이 없다

- [ ] **Step 3: 구현**

`packages/devkit-cli/src/ops/merge-json.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

function isPlainObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 패치를 재귀 병합한 새 객체를 반환한다. 원본은 변경하지 않는다.
 *
 * - null 값 → 키 삭제
 * - 객체 값 → 재귀 병합
 * - 배열 값 → 교체
 */
export function applyPatch(target: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }
    const current = result[key];
    result[key] =
      isPlainObject(value) && current !== undefined && isPlainObject(current)
        ? applyPatch(current, value)
        : value;
  }

  return result;
}

export function hasPath(obj: JsonObject, path: string): boolean {
  let cursor: Json = obj;
  for (const segment of path.split('.')) {
    if (!isPlainObject(cursor) || !(segment in cursor)) return false;
    cursor = cursor[segment] as Json;
  }
  return true;
}

export interface MergeJsonOptions {
  required?: string[];
  file?: string;
}

export function mergeJson(patch: JsonObject, options: MergeJsonOptions = {}): Step {
  const file = options.file ?? 'package.json';
  const required = options.required ?? [];

  return {
    kind: 'mergeJson',
    label: `${file} 병합`,
    describe: () => ({ file, patch, required }),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;

      for (const key of required) {
        if (!hasPath(parsed, key)) {
          throw new Error(
            `${file}에 '${key}'가 없습니다. 위임 대상(공식 CLI)의 산출물이 바뀌었을 수 있습니다. ` +
              `해당 레시피를 재검증하세요 (설계 6.2절).`,
          );
        }
      }

      const merged = applyPatch(parsed, patch);
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      ctx.log(`  병합: ${file}`);
    },
  };
}
```

- [ ] **Step 4: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/merge-json.test.ts`
Expected: PASS (8개 테스트)

- [ ] **Step 5: 검증 후 커밋**

Run: `pnpm lint && pnpm test`

```bash
git add packages/devkit-cli
git commit -m "feat: mergeJson 연산 추가 (null은 키 삭제, required로 기대 선언)"
```

---

### Task 6: `removeFiles` · `copyOverlay` · `makeDirs` 연산

**Files:**
- Create: `packages/devkit-cli/src/ops/remove-files.ts`, `copy-overlay.ts`, `make-dirs.ts`
- Test: `packages/devkit-cli/tests/fs-ops.test.ts`

**Interfaces:**
- Consumes: `Ctx`, `Step` (Task 4)
- Produces:
  ```ts
  /** targetDir 밖 경로면 던진다. 반환값은 검증된 절대경로. */
  export function assertInside(targetDir: string, relativePath: string): string;

  export interface RemoveFilesOptions { required?: boolean }
  export function removeFiles(paths: string[], options?: RemoveFilesOptions): Step;

  /** '_'로 시작하는 파일명은 '.'으로 바꿔 복사한다 (_gitignore → .gitignore). */
  export function templateFileName(name: string): string;
  export function copyOverlay(template: string, vars?: Record<string, string>): Step;

  export function makeDirs(paths: string[]): Step;
  ```

**`_` 접두어 규약**

템플릿 안에 `.gitignore`를 그대로 두면 도구들이 이를 무시 규칙으로 해석하거나(일부 번들러) npm publish 시 `.npmignore`로 개명한다. `templates/nest/_gitignore` → 생성물의 `.gitignore`로 매핑해 이 부류를 통째로 없앤다.

**`__NAME__` 치환**

파일 **내용**에서만 치환한다. 파일명 치환은 지원하지 않는다 — 필요해진 적이 없고(YAGNI), 파일명 치환은 `_` 규약과 충돌하기 쉽다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/fs-ops.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertInside, removeFiles } from '../src/ops/remove-files.js';
import { templateFileName } from '../src/ops/copy-overlay.js';
import { makeDirs } from '../src/ops/make-dirs.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-fs-'));
  created.push(dir);
  return { targetDir: dir, toolkitRoot: '/toolkit', name: 'fx', log: () => {} };
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('assertInside', () => {
  it('targetDir 안의 경로를 절대경로로 돌려준다', () => {
    expect(assertInside('/a/b', 'src/main.ts')).toBe('/a/b/src/main.ts');
  });

  it('상위로 탈출하는 경로를 거부한다', () => {
    expect(() => assertInside('/a/b', '../../etc/passwd')).toThrow(/밖/);
  });

  it('절대경로를 거부한다', () => {
    expect(() => assertInside('/a/b', '/etc/passwd')).toThrow(/밖/);
  });

  it('targetDir 자기 자신을 거부한다', () => {
    expect(() => assertInside('/a/b', '.')).toThrow(/밖/);
  });
});

describe('removeFiles', () => {
  it('파일을 지운다', async () => {
    const ctx = makeCtx();
    writeFileSync(join(ctx.targetDir, '.prettierrc'), '{}');
    await removeFiles(['.prettierrc']).run(ctx);
    expect(existsSync(join(ctx.targetDir, '.prettierrc'))).toBe(false);
  });

  it('required가 아니면 없는 파일에 조용히 통과한다', async () => {
    const ctx = makeCtx();
    await expect(removeFiles(['nope']).run(ctx)).resolves.toBeUndefined();
  });

  it('required면 없는 파일에 던진다 — 위임 대상 변화를 침묵시키지 않는다', async () => {
    const ctx = makeCtx();
    await expect(removeFiles(['pnpm-workspace.yaml'], { required: true }).run(ctx)).rejects.toThrow(
      /pnpm-workspace\.yaml/,
    );
  });

  it('디렉토리도 지운다', async () => {
    const ctx = makeCtx();
    mkdirSync(join(ctx.targetDir, 'public'));
    writeFileSync(join(ctx.targetDir, 'public', 'a.svg'), '<svg/>');
    await removeFiles(['public']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'public'))).toBe(false);
  });
});

describe('templateFileName', () => {
  it('_ 접두어를 .으로 바꾼다', () => {
    expect(templateFileName('_gitignore')).toBe('.gitignore');
    expect(templateFileName('_npmrc')).toBe('.npmrc');
  });

  it('_가 없으면 그대로 둔다', () => {
    expect(templateFileName('eslint.config.mjs')).toBe('eslint.config.mjs');
  });

  it('파일명 중간의 _는 건드리지 않는다', () => {
    expect(templateFileName('jest_e2e.js')).toBe('jest_e2e.js');
  });
});

describe('makeDirs', () => {
  it('중첩 디렉토리와 .gitkeep을 만든다', async () => {
    const ctx = makeCtx();
    await makeDirs(['src/features', 'src/entities']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'src/features/.gitkeep'))).toBe(true);
    expect(existsSync(join(ctx.targetDir, 'src/entities/.gitkeep'))).toBe(true);
  });

  it('이미 파일이 있는 디렉토리에는 .gitkeep을 넣지 않는다', async () => {
    const ctx = makeCtx();
    mkdirSync(join(ctx.targetDir, 'src'), { recursive: true });
    writeFileSync(join(ctx.targetDir, 'src', 'main.ts'), '');
    await makeDirs(['src']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'src/.gitkeep'))).toBe(false);
  });

  it('탈출 경로를 거부한다', async () => {
    const ctx = makeCtx();
    await expect(makeDirs(['../evil']).run(ctx)).rejects.toThrow(/밖/);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/fs-ops.test.ts`
Expected: FAIL

- [ ] **Step 3: `remove-files.ts` 구현**

```ts
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Ctx, Step } from '../types.js';

/**
 * relativePath가 targetDir 안에 있는지 검증하고 절대경로를 반환한다.
 * 절대경로 입력·상위 탈출·targetDir 자기 자신은 전부 거부한다.
 */
export function assertInside(targetDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`'${relativePath}'는 절대경로입니다. 대상 디렉토리 밖은 건드릴 수 없습니다.`);
  }
  const root = resolve(targetDir);
  const full = resolve(root, relativePath);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
    throw new Error(`'${relativePath}'가 대상 디렉토리(${root}) 밖을 가리킵니다.`);
  }
  return full;
}

export interface RemoveFilesOptions {
  required?: boolean;
}

export function removeFiles(paths: string[], options: RemoveFilesOptions = {}): Step {
  const required = options.required ?? false;

  return {
    kind: 'removeFiles',
    label: `삭제: ${paths.join(', ')}`,
    describe: () => ({ paths, required }),
    run: async (ctx: Ctx) => {
      for (const path of paths) {
        const full = assertInside(ctx.targetDir, path);
        const exists = await stat(full).then(
          () => true,
          () => false,
        );
        if (!exists) {
          if (required) {
            throw new Error(
              `'${path}'가 없습니다. 위임 대상(공식 CLI)이 이 파일을 더 이상 만들지 않는 것 같습니다. ` +
                `해당 레시피를 재검증하세요 (설계 6.2절).`,
            );
          }
          continue;
        }
        await rm(full, { recursive: true, force: true });
        ctx.log(`  삭제: ${path}`);
      }
    },
  };
}
```

`join`은 위 구현에서 쓰이지 않으므로 import에서 제거한다 — 남기면 `no-unused-vars`가 잡는다.

- [ ] **Step 4: `copy-overlay.ts` 구현**

```ts
import { cp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx, Step } from '../types.js';
import { assertInside } from './remove-files.js';

/** '_' 접두어를 '.'으로 바꾼다. _gitignore → .gitignore */
export function templateFileName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

/** dist/ 기준으로 templates/ 디렉토리를 찾는다. */
function templatesRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
}

async function copyTree(from: string, to: string, vars: Record<string, string>): Promise<string[]> {
  const written: string[] = [];
  await mkdir(to, { recursive: true });

  for (const entry of await readdir(from, { withFileTypes: true })) {
    const target = join(to, templateFileName(entry.name));
    const source = join(from, entry.name);

    if (entry.isDirectory()) {
      written.push(...(await copyTree(source, target, vars)));
      continue;
    }

    let content = await readFile(source, 'utf8');
    for (const [key, value] of Object.entries(vars)) {
      content = content.replaceAll(`__${key}__`, value);
    }
    await writeFile(target, content);
    written.push(target);
  }

  return written;
}

/**
 * templates/<template>/ 을 targetDir에 복사한다. 기존 파일은 덮어쓴다.
 * 파일 내용의 __KEY__ 를 vars[KEY]로 치환한다. 파일명은 치환하지 않는다.
 */
export function copyOverlay(template: string, vars: Record<string, string> = {}): Step {
  return {
    kind: 'copyOverlay',
    label: `오버레이 복사: templates/${template}`,
    describe: () => ({ template, vars: Object.keys(vars) }),
    run: async (ctx: Ctx) => {
      const from = join(templatesRoot(), template);
      const allVars = { NAME: ctx.name, ...vars };
      const written = await copyTree(from, ctx.targetDir, allVars);
      for (const file of written) ctx.log(`  복사: ${file.slice(ctx.targetDir.length + 1)}`);
    },
  };
}
```

`cp`와 `assertInside`가 쓰이지 않으면 import에서 제거한다.

- [ ] **Step 5: `make-dirs.ts` 구현**

```ts
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { assertInside } from './remove-files.js';

/**
 * 디렉토리를 만들고, 비어 있으면 .gitkeep을 넣는다.
 * 빈 디렉토리는 git에 남지 않으므로 FSD 레이어가 커밋되지 않는다.
 */
export function makeDirs(paths: string[]): Step {
  return {
    kind: 'makeDirs',
    label: `디렉토리 생성: ${paths.join(', ')}`,
    describe: () => ({ paths }),
    run: async (ctx: Ctx) => {
      for (const path of paths) {
        const full = assertInside(ctx.targetDir, path);
        await mkdir(full, { recursive: true });
        if ((await readdir(full)).length === 0) {
          await writeFile(join(full, '.gitkeep'), '');
        }
        ctx.log(`  생성: ${path}/`);
      }
    },
  };
}
```

- [ ] **Step 6: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/fs-ops.test.ts`
Expected: PASS (13개 테스트)

- [ ] **Step 7: 검증 후 커밋**

Run: `pnpm lint && pnpm test`

```bash
git add packages/devkit-cli
git commit -m "feat: removeFiles·copyOverlay·makeDirs 연산 추가 (경로 탈출 가드 포함)"
```

---

### Task 7: `linkDeps` 연산

**Files:**
- Create: `packages/devkit-cli/src/ops/link-deps.ts`
- Test: `packages/devkit-cli/tests/link-deps.test.ts`

**Interfaces:**
- Consumes: `Ctx`, `Step` (Task 4), `applyPatch` (Task 5)
- Produces:
  ```ts
  /** targetDir에서 toolkitRoot/packages/<pkg>까지의 POSIX 상대경로. */
  export function linkSpec(targetDir: string, toolkitRoot: string, pkg: string): string;

  export interface LinkDepsOptions { file?: string }
  export function linkDeps(packages: string[], options?: LinkDepsOptions): Step;
  ```

**왜 계산해야 하는가**

`pnpm catalog:`가 `link:`를 거부하므로(스펙 2.3절 실측) 모노레포의 각 `package.json`이 직접 선언해야 하는데, 루트와 `apps/web`은 툴킷까지의 깊이가 다르다. 하드코딩하면 둘 중 하나가 반드시 틀린다.

| 위치 | 기대 |
| --- | --- |
| `~/develop/my-api` | `link:../eslint/packages/tsconfig` |
| `~/develop/mono/apps/web` | `link:../../../eslint/packages/tsconfig` |

Windows에서 `path.relative`는 `\`를 쓰므로 POSIX 구분자로 정규화한다. `package.json`의 의존 스펙은 플랫폼 무관해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/link-deps.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { linkSpec, linkDeps } from '../src/ops/link-deps.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('linkSpec', () => {
  it('단일 앱 — 형제 디렉토리로 한 단계', () => {
    expect(linkSpec('/Users/d/develop/my-api', '/Users/d/develop/eslint', 'tsconfig')).toBe(
      'link:../eslint/packages/tsconfig',
    );
  });

  it('모노레포 내부 — apps/web은 세 단계', () => {
    expect(linkSpec('/Users/d/develop/mono/apps/web', '/Users/d/develop/eslint', 'tsconfig')).toBe(
      'link:../../../eslint/packages/tsconfig',
    );
  });

  it('모노레포 루트 — 단일 앱과 같은 깊이', () => {
    expect(linkSpec('/Users/d/develop/mono', '/Users/d/develop/eslint', 'eslint-plugin-fsd')).toBe(
      'link:../eslint/packages/eslint-plugin-fsd',
    );
  });

  it('항상 POSIX 구분자를 쓴다', () => {
    expect(linkSpec('/a/b/c', '/a/toolkit', 'x')).not.toContain('\\');
  });
});

describe('linkDeps', () => {
  it('devDependencies에 link: 스펙을 넣는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-link-'));
    created.push(dir);
    const toolkit = join(dir, 'eslint');
    const project = join(dir, 'my-api');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'my-api', devDependencies: { typescript: '^5.7.3' } }, null, 2),
    );

    const ctx: Ctx = { targetDir: project, toolkitRoot: toolkit, name: 'my-api', log: () => {} };
    await linkDeps(['tsconfig', 'jest-config']).run(ctx);

    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['@devbak/tsconfig']).toBe('link:../eslint/packages/tsconfig');
    expect(pkg.devDependencies['@devbak/jest-config']).toBe('link:../eslint/packages/jest-config');
    expect(pkg.devDependencies.typescript).toBe('^5.7.3');
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/link-deps.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`packages/devkit-cli/src/ops/link-deps.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { applyPatch, type JsonObject } from './merge-json.js';

/**
 * targetDir에서 toolkitRoot/packages/<pkg>까지의 상대경로를 link: 스펙으로 만든다.
 *
 * 하드코딩하지 않는 이유는 모노레포 때문이다. 루트와 apps/web은 툴킷까지의
 * 깊이가 다르고, pnpm catalog:가 link:를 거부해(설계 2.3절) 각자 선언해야 한다.
 */
export function linkSpec(targetDir: string, toolkitRoot: string, pkg: string): string {
  const from = resolve(targetDir);
  const to = resolve(toolkitRoot, 'packages', pkg);
  const posix = relative(from, to).split(sep).join('/');
  return `link:${posix}`;
}

export interface LinkDepsOptions {
  /** targetDir 기준 상대 경로. 기본값 'package.json' */
  file?: string;
}

export function linkDeps(packages: string[], options: LinkDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  return {
    kind: 'linkDeps',
    label: `link: 배선 — ${packages.map((p) => `@devbak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;

      const devDependencies: JsonObject = {};
      for (const pkg of packages) {
        devDependencies[`@devbak/${pkg}`] = linkSpec(ctx.targetDir, ctx.toolkitRoot, pkg);
      }

      const merged = applyPatch(parsed, { devDependencies });
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  링크: @devbak/${pkg}`);
    },
  };
}
```

- [ ] **Step 4: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/link-deps.test.ts`
Expected: PASS (5개 테스트)

- [ ] **Step 5: 검증 후 커밋**

Run: `pnpm lint && pnpm test`

```bash
git add packages/devkit-cli
git commit -m "feat: linkDeps 연산 추가 (상대경로 계산, 깊이 2종 대응)"
```

---

### Task 8: `delegate` 연산 + 레시피 실행기 + CLI 진입점 완성

**Files:**
- Create: `packages/devkit-cli/src/ops/delegate.ts`, `packages/devkit-cli/src/ops/index.ts`, `packages/devkit-cli/src/run.ts`
- Modify: `packages/devkit-cli/src/bin.ts` (main 추가)
- Modify: `packages/devkit-cli/src/index.ts`
- Test: `packages/devkit-cli/tests/run.test.ts`

**Interfaces:**
- Consumes: 앞선 모든 연산
- Produces:
  ```ts
  export interface DelegateOptions {
    /** targetDir 대신 이 절대경로에서 실행. 미지정 시 ctx.targetDir */
    cwd?: 'targetDir' | 'parent';
  }
  export function delegate(command: string, args: string[], options?: DelegateOptions): Step;

  /** 스캐폴딩 전용. 부모 디렉토리에서 basename을 인자로 넘겨 실행한다. */
  export function scaffold(command: string, argsBefore: string[], argsAfter: string[]): Step;

  export function compose(label: string, steps: Step[], mapCtx: (ctx: Ctx) => Ctx): Step;

  export async function run(steps: Step[], ctx: Ctx): Promise<void>;
  ```

**`scaffold`가 따로 있는 이유**

`nest new <name>`과 `create-next-app <dir>`은 **인자로 받은 디렉토리를 새로 만든다.** 따라서 부모 디렉토리에서 실행하고 basename을 넘겨야 한다.

```
단일 앱:      cwd = dirname(/develop/my-api)      arg = 'my-api'   → /develop/my-api
모노레포 내부: cwd = dirname(/develop/mono/apps/web) arg = 'web'   → /develop/mono/apps/web
```

같은 공식이 두 경우 모두에 맞는다. 모노레포가 Next 레시피를 그대로 합성할 수 있는 것은 이 대칭 덕분이다(설계 4.1절).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/run.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { compose, run } from '../src/run.js';
import type { Ctx, Step } from '../src/types.js';

function fakeStep(label: string, spy: (ctx: Ctx) => void): Step {
  return {
    kind: 'makeDirs',
    label,
    describe: () => ({ label }),
    run: async (ctx) => {
      spy(ctx);
    },
  };
}

const baseCtx: Ctx = {
  targetDir: '/target',
  toolkitRoot: '/toolkit',
  name: 'fx',
  log: () => {},
};

describe('run', () => {
  it('단계를 선언 순서대로 실행한다', async () => {
    const order: string[] = [];
    await run(
      [fakeStep('a', () => order.push('a')), fakeStep('b', () => order.push('b'))],
      baseCtx,
    );
    expect(order).toEqual(['a', 'b']);
  });

  it('한 단계가 던지면 이후 단계를 실행하지 않는다', async () => {
    const later = vi.fn();
    const failing: Step = {
      kind: 'removeFiles',
      label: 'boom',
      describe: () => ({}),
      run: async () => {
        throw new Error('boom');
      },
    };
    await expect(run([failing, fakeStep('later', later)], baseCtx)).rejects.toThrow('boom');
    expect(later).not.toHaveBeenCalled();
  });

  it('에러 메시지에 레시피 단계 번호를 붙인다', async () => {
    const failing: Step = {
      kind: 'removeFiles',
      label: 'pnpm-workspace.yaml 삭제',
      describe: () => ({}),
      run: async () => {
        throw new Error('없습니다');
      },
    };
    await expect(run([fakeStep('ok', () => {}), failing], baseCtx)).rejects.toThrow(/\[2\/2\]/);
  });
});

describe('compose', () => {
  it('자식 ctx로 하위 단계를 실행한다', async () => {
    let seen: Ctx | undefined;
    const child = fakeStep('child', (ctx) => {
      seen = ctx;
    });
    const step = compose('apps/web에 next 레시피 실행', [child], (ctx) => ({
      ...ctx,
      targetDir: `${ctx.targetDir}/apps/web`,
      name: 'web',
    }));

    await step.run(baseCtx);
    expect(seen?.targetDir).toBe('/target/apps/web');
    expect(seen?.name).toBe('web');
  });

  it('describe가 하위 단계까지 직렬화한다 — 스냅샷이 합성을 들여다볼 수 있다', () => {
    const step = compose('sub', [fakeStep('child', () => {})], (ctx) => ctx);
    expect(step.describe()).toEqual({ label: 'sub', steps: [{ label: 'child' }] });
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/run.test.ts`
Expected: FAIL

- [ ] **Step 3: `delegate.ts` 구현**

```ts
import { spawn } from 'node:child_process';
import { basename, dirname } from 'node:path';
import type { Ctx, Step } from '../types.js';

function exec(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`\`${command} ${args.join(' ')}\`가 종료 코드 ${code}로 실패했습니다.`));
    });
  });
}

export interface DelegateOptions {
  cwd?: 'targetDir' | 'parent';
}

export function delegate(command: string, args: string[], options: DelegateOptions = {}): Step {
  const where = options.cwd ?? 'targetDir';

  return {
    kind: 'delegate',
    label: `${command} ${args.join(' ')}`,
    describe: () => ({ command, args, cwd: where }),
    run: async (ctx: Ctx) => {
      const cwd = where === 'parent' ? dirname(ctx.targetDir) : ctx.targetDir;
      await exec(command, args, cwd);
    },
  };
}

/**
 * 스캐폴딩 전용. 공식 CLI는 인자로 받은 디렉토리를 스스로 만들므로,
 * 부모 디렉토리에서 실행하고 basename을 넘겨야 한다.
 * 이 대칭 덕분에 모노레포가 next 레시피를 그대로 합성할 수 있다.
 */
export function scaffold(command: string, argsBefore: string[], argsAfter: string[]): Step {
  return {
    kind: 'delegate',
    label: `스캐폴딩: ${command} ${argsBefore.join(' ')} <name> ${argsAfter.join(' ')}`,
    describe: () => ({ command, argsBefore, argsAfter, cwd: 'parent' }),
    run: async (ctx: Ctx) => {
      const args = [...argsBefore, basename(ctx.targetDir), ...argsAfter];
      await exec(command, args, dirname(ctx.targetDir));
    },
  };
}
```

- [ ] **Step 4: `run.ts` 구현**

```ts
import type { Ctx, Step } from './types.js';

/** 단계를 순서대로 실행한다. 실패하면 즉시 중단하고 위치를 알린다. */
export async function run(steps: Step[], ctx: Ctx): Promise<void> {
  for (const [index, step] of steps.entries()) {
    ctx.log(`[${index + 1}/${steps.length}] ${step.label}`);
    try {
      await step.run(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[${index + 1}/${steps.length}] ${step.label}\n  ${message}`, { cause: error });
    }
  }
}

/** 하위 ctx에서 다른 레시피를 실행하는 단계. 모노레포가 next를 합성할 때 쓴다. */
export function compose(label: string, steps: Step[], mapCtx: (ctx: Ctx) => Ctx): Step {
  return {
    kind: 'compose',
    label,
    describe: () => ({ label, steps: steps.map((s) => s.describe()) }),
    run: async (ctx: Ctx) => {
      await run(steps, mapCtx(ctx));
    },
  };
}
```

- [ ] **Step 5: `ops/index.ts` 작성**

```ts
export { mergeJson, applyPatch, hasPath } from './merge-json.js';
export type { Json, JsonObject, MergeJsonOptions } from './merge-json.js';
export { removeFiles, assertInside } from './remove-files.js';
export type { RemoveFilesOptions } from './remove-files.js';
export { copyOverlay, templateFileName } from './copy-overlay.js';
export { makeDirs } from './make-dirs.js';
export { linkDeps, linkSpec } from './link-deps.js';
export type { LinkDepsOptions } from './link-deps.js';
export { delegate, scaffold } from './delegate.js';
export type { DelegateOptions } from './delegate.js';
```

- [ ] **Step 6: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/run.test.ts`
Expected: PASS (5개 테스트)

- [ ] **Step 7: `bin.ts`에 `main()` 추가**

`bin.ts` 하단에 붙인다. 레시피 맵은 Task 9~11에서 채워지므로 지금은 빈 객체로 두고, 알 수 없는 타입에 명확히 실패한다:

```ts
import { mkdir, stat } from 'node:fs/promises';
import { run } from './run.js';
import type { Ctx, ProjectType, Recipe } from './types.js';

const RECIPES: Partial<Record<ProjectType, Recipe>> = {
  // Task 9~11에서 채운다
};

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      type: { type: 'string' },
      'no-verify': { type: 'boolean', default: false },
    },
  });

  const [command, name] = positionals;
  if (command !== 'create' || name === undefined) {
    throw new Error('사용법: pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]');
  }

  const type = values.type as ProjectType | undefined;
  if (type === undefined || !(type in RECIPES)) {
    throw new Error(`--type은 nest · next · monorepo 중 하나여야 합니다 (받은 값: ${String(type)}).`);
  }

  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  assertDistFresh(pkgDir);

  const toolkitRoot = findToolkitRoot(pkgDir);
  const targetDir = resolve(dirname(toolkitRoot), name);

  const exists = await stat(targetDir).then(
    () => true,
    () => false,
  );
  if (exists) {
    throw new Error(`${targetDir}가 이미 존재합니다. 덮어쓰지 않습니다.`);
  }
  await mkdir(dirname(targetDir), { recursive: true });

  const ctx: Ctx = {
    targetDir,
    toolkitRoot,
    name,
    log: (message) => {
      process.stdout.write(`${message}\n`);
    },
  };

  const recipe = RECIPES[type];
  if (recipe === undefined) throw new Error(`레시피가 아직 구현되지 않았습니다: ${type}`);

  await run(recipe({ skipVerify: values['no-verify'] === true }), ctx);
  ctx.log(`\n완료. cd ${targetDir}`);
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]));
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

필요한 import(`basename`, `parseArgs` 등)를 상단에 정리한다.

- [ ] **Step 8: 빌드·검증**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: 전부 exit 0

Run: `pnpm devbak create x --type nest`
Expected: "레시피가 아직 구현되지 않았습니다" 또는 `--type` 검증 에러로 **깔끔하게** 실패 (스택 트레이스가 아니라 메시지)

- [ ] **Step 9: 커밋**

```bash
git add packages/devkit-cli
git commit -m "feat: delegate 연산과 레시피 실행기, CLI 진입점 추가"
```

---

### Task 9: `nest` 레시피 + 템플릿

**Files:**
- Create: `packages/devkit-cli/src/recipes/nest.ts`
- Create: `packages/devkit-cli/templates/nest/eslint.config.mjs`, `tsconfig.json`, `jest.config.js`, `jest-e2e.config.js`, `_gitignore`, `CLAUDE.md`
- Modify: `packages/devkit-cli/src/bin.ts` (`RECIPES.nest`)
- Test: `packages/devkit-cli/tests/recipe-nest.test.ts`

**Interfaces:**
- Consumes: 모든 연산 (Task 5~8)
- Produces: `export const nestRecipe: Recipe`

**출처**: 각 단계는 설계 5.1절, 삭제/수정 대상은 설계 2.1절 실측.

- [ ] **Step 1: 템플릿 파일 작성**

`templates/nest/eslint.config.mjs`:

```js
import nest from '@devbak/eslint-config-nest';

export default [{ ignores: ['dist/**', 'coverage/**'] }, ...nest];
```

`templates/nest/tsconfig.json`:

```json
{
  "extends": "@devbak/tsconfig/nest",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./"
  },
  "include": ["src", "test"]
}
```

`templates/nest/jest.config.js` — **`.ts`가 아니라 `.js`인 것이 중요하다**(Task 2 배경 절):

```js
module.exports = require('@devbak/jest-config/nest');
```

`templates/nest/jest-e2e.config.js`:

```js
module.exports = require('@devbak/jest-config/nest-e2e');
```

`templates/nest/_gitignore` — `nest new`가 `.gitignore`를 만들지 않는다(설계 2.1절):

```
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
.env.*
!.env.example
```

`templates/nest/CLAUDE.md`:

```markdown
# __NAME__

NestJS API. `@devbak` 표준 툴킷으로 생성됨.

## 명령어

- 개발: `pnpm start:dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint`
- 포맷: `pnpm format`
- 테스트: `pnpm test` / e2e: `pnpm test:e2e`

## 규칙

- 비즈니스 로직은 Service에, Controller는 thin하게 유지한다.
- 입력 검증은 zod로 한다. `class-validator`를 쓰지 않는다.
- 린트 설정은 `@devbak/eslint-config-nest`에서 온다. 타입 인식 규칙이 켜져 있으므로
  `@typescript-eslint/no-floating-promises` 위반을 그냥 넘기지 않는다.
- 포맷은 Prettier가 전담한다. ESLint에 포맷 규칙을 추가하지 않는다.

## @devbak 의존

`package.json`의 `@devbak/*`는 `link:` 상대경로로 `~/Documents/develop/eslint`를
가리킨다. 이 프로젝트를 다른 위치로 옮기면 경로가 깨진다.
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/devkit-cli/tests/recipe-nest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nestRecipe } from '../src/recipes/nest.js';

describe('nest 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = nestRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(steps).toMatchSnapshot();
  });

  it('eslint-plugin-prettier와 eslint-config-prettier를 제거한다', () => {
    // 설계 4.5절(로드맵)이 제거하기로 한 조합. nest new가 기본 포함한다.
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { devDependencies: Record<string, unknown> } };
    expect(detail.patch.devDependencies['eslint-plugin-prettier']).toBeNull();
    expect(detail.patch.devDependencies['eslint-config-prettier']).toBeNull();
  });

  it('eslint를 ^10으로 올린다 — eslint-config-nest가 ^10 전용이다', () => {
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { devDependencies: Record<string, string> } };
    expect(detail.patch.devDependencies.eslint).toMatch(/^\^10\./);
  });

  it('인라인 jest 블록을 제거하고 그 존재를 required로 요구한다', () => {
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: Record<string, unknown>; required: string[] };
    expect(detail.patch.jest).toBeNull();
    expect(detail.required).toContain('jest');
  });

  it('skipVerify면 자가검증 단계를 빼고, 기본값이면 넣는다', () => {
    const withVerify = nestRecipe().filter((s) => s.label.includes('lint'));
    const without = nestRecipe({ skipVerify: true }).filter((s) => s.label.includes('lint'));
    expect(withVerify.length).toBeGreaterThan(0);
    expect(without).toHaveLength(0);
  });

  it('skipInstall이면 pnpm install도 자가검증도 빼진다', () => {
    // 자가검증은 설치된 의존에 기대므로 install 없이는 의미가 없다.
    const steps = nestRecipe({ skipInstall: true });
    expect(steps.some((s) => s.label.includes('install'))).toBe(false);
    expect(steps.some((s) => s.label.includes('lint'))).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-nest.test.ts`
Expected: FAIL

- [ ] **Step 4: 레시피 구현**

`packages/devkit-cli/src/recipes/nest.ts`:

```ts
import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

/**
 * NestJS API 레시피. 설계 5.1절.
 *
 * 삭제·수정 대상은 전부 nest new를 실제로 돌려 관측한 것이다(설계 2.1절).
 * 추측으로 쓰면 최소 세 군데가 틀린다.
 */
export const nestRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    scaffold('pnpm', ['dlx', '@nestjs/cli@latest', 'new'], [
      '--skip-git',
      '--skip-install',
      '-p',
      'pnpm',
      '--strict',
    ]),

    // .prettierrc는 package.json의 "prettier" 키로 대체한다. 파일이 하나 준다.
    removeFiles(['.prettierrc'], { required: true }),

    // eslint.config.mjs를 덮어쓴다. nest new는 flat config를 만들지만
    // eslint-plugin-prettier가 얹힌 상태다(설계 2.1절).
    copyOverlay('nest'),

    mergeJson(
      {
        devDependencies: {
          'eslint-plugin-prettier': null,
          'eslint-config-prettier': null,
          '@eslint/eslintrc': null,
          '@eslint/js': null,
          globals: null,
          eslint: '^10.8.0',
          'typescript-eslint': '^8.65.0',
          'eslint-plugin-zod': '^4.9.0',
          zod: '^4.4.3',
        },
        jest: null,
        prettier: '@devbak/prettier-config',
        scripts: {
          lint: 'eslint .',
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
          'test:e2e': 'jest --config ./jest-e2e.config.js',
        },
      },
      { required: ['jest', 'devDependencies.eslint-plugin-prettier'] },
    ),

    linkDeps(['eslint-config-nest', 'prettier-config', 'tsconfig', 'jest-config']),

    // 소비자 3개 프로젝트에서 실측된 관용 구조(로드맵 1.3절)
    makeDirs(['src/modules', 'src/common']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
```

- [ ] **Step 5: `bin.ts`의 `RECIPES`에 등록**

```ts
import { nestRecipe } from './recipes/nest.js';

const RECIPES: Partial<Record<ProjectType, Recipe>> = {
  nest: nestRecipe,
};
```

- [ ] **Step 6: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-nest.test.ts`
Expected: PASS (6개 테스트, 스냅샷 신규 생성)

스냅샷 파일을 **읽어보고** 단계 순서가 설계 5.1절과 맞는지 눈으로 확인한 뒤 커밋한다. 스냅샷은 자동 생성되므로 틀린 상태로 고정될 수 있다.

- [ ] **Step 7: 실제 생성 1회 (수동 검증)**

Run:
```bash
pnpm build
pnpm devbak create devkit-probe-nest --type nest
```

Expected: `~/Documents/develop/devkit-probe-nest`가 생성되고 `pnpm lint`·`pnpm build`가 통과

실패하면 원인을 고친다. 특히 확인할 것:
- `eslint-config-nest`가 `projectService`를 `.ts`에 거는데 `jest.config.js`가 `.js`라 크래시하지 않는지
- `no-floating-promises`가 켜져 있는지 (`src/app.service.ts`에 `async function f() {} f();`를 잠깐 넣어 확인 후 되돌린다)

검증이 끝나면 정리한다:
```bash
rm -rf ~/Documents/develop/devkit-probe-nest
```

- [ ] **Step 8: 검증 후 커밋**

Run: `pnpm lint && pnpm test && pnpm build`

```bash
git add packages/devkit-cli
git commit -m "feat: nest 레시피와 템플릿 추가"
```

---

### Task 10: `next` 레시피 + 템플릿

**Files:**
- Create: `packages/devkit-cli/src/recipes/next.ts`
- Create: `packages/devkit-cli/templates/next/eslint.config.mjs`, `vitest.config.ts`, `CLAUDE.md`
- Modify: `packages/devkit-cli/src/bin.ts` (`RECIPES.next`)
- Test: `packages/devkit-cli/tests/recipe-next.test.ts`

**Interfaces:**
- Consumes: 모든 연산
- Produces: `export const nextRecipe: Recipe` — Task 11의 모노레포가 이를 합성한다

**FSD 레이어를 `views`로 만드는 이유**

`create-next-app --src-dir`은 라우팅을 `src/app/`에 둔다. FSD의 `pages` 레이어를 `src/pages`로 만들면 Next의 Pages Router 규약과 충돌한다. `eslint-plugin-fsd`가 `views`/`screens` 별칭을 지원하므로 `views`를 쓴다.

- [ ] **Step 1: 템플릿 파일 작성**

`templates/next/eslint.config.mjs`:

```js
import fsd from '@devbak/eslint-plugin-fsd/next';

export default [{ ignores: ['.next/**', 'out/**', 'next-env.d.ts'] }, ...fsd];
```

`templates/next/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import config from '@devbak/vitest-config/next';

export default defineConfig(config);
```

`templates/next/CLAUDE.md`:

```markdown
# __NAME__

Next.js App Router 앱. `@devbak` 표준 툴킷으로 생성됨.

## 명령어

- 개발: `pnpm dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint`
- 포맷: `pnpm format`
- 테스트: `pnpm test`

## 아키텍처 — Feature-Sliced Design

`src/` 아래 레이어는 위에서 아래로만 의존한다.

```
app      → Next 라우팅 + 앱 초기화 (최상위)
views    → 페이지 조합 (FSD의 pages 레이어. Next의 Pages Router와 이름이
           충돌해 views를 쓴다)
widgets  → 독립적인 UI 블록
features → 사용자 시나리오
entities → 비즈니스 엔티티
shared   → 재사용 유틸·UI (최하위, 아무것도 의존하지 않는다)
```

`@devbak/eslint-plugin-fsd`가 이 경계를 강제한다.

- 하위 레이어가 상위를 import하면 에러다.
- 같은 레이어의 다른 슬라이스를 직접 import하면 에러다.
- 슬라이스 내부 파일을 직접 import하지 말고 슬라이스의 `index.ts`를 거쳐라.

## 규칙

- Server Component가 기본이다. `'use client'`는 필요한 곳에만 좁게 붙인다.
- mutation은 Server Actions로 처리한다.

## @devbak 의존

`package.json`의 `@devbak/*`는 `link:` 상대경로로 `~/Documents/develop/eslint`를
가리킨다. 이 프로젝트를 다른 위치로 옮기면 경로가 깨진다.
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/devkit-cli/tests/recipe-next.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextRecipe } from '../src/recipes/next.js';

describe('next 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = nextRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(steps).toMatchSnapshot();
  });

  it('--no-eslint로 스캐폴딩한다 — 우리 설정을 깨끗하게 얹기 위해서다', () => {
    const scaffoldStep = nextRecipe()[0];
    const detail = scaffoldStep?.describe() as { argsAfter: string[] };
    expect(detail.argsAfter).toContain('--no-eslint');
    expect(detail.argsAfter).toContain('--skip-install');
    expect(detail.argsAfter).toContain('--disable-git');
  });

  it('AGENTS.md와 CLAUDE.md를 제거한다', () => {
    const remove = nextRecipe().find((s) => s.kind === 'removeFiles');
    const detail = remove?.describe() as { paths: string[]; required: boolean };
    expect(detail.paths).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md']));
    expect(detail.required).toBe(true);
  });

  it('pnpm-workspace.yaml은 지우지 않는다 — 단일 앱에서는 sharp 빌드 승인에 필요하다', () => {
    const removes = nextRecipe().filter((s) => s.kind === 'removeFiles');
    const allPaths = removes.flatMap((s) => (s.describe() as { paths: string[] }).paths);
    expect(allPaths).not.toContain('pnpm-workspace.yaml');
  });

  it('FSD 레이어를 만들고 pages 대신 views를 쓴다', () => {
    const dirs = nextRecipe().find((s) => s.kind === 'makeDirs');
    const detail = dirs?.describe() as { paths: string[] };
    expect(detail.paths).toEqual(
      expect.arrayContaining([
        'src/views',
        'src/widgets',
        'src/features',
        'src/entities',
        'src/shared',
      ]),
    );
    expect(detail.paths).not.toContain('src/pages');
  });

  it('skipInstall이면 install도 자가검증도 빠진다 — 모노레포 합성용', () => {
    const steps = nextRecipe({ skipInstall: true });
    expect(steps.some((s) => s.label.includes('install'))).toBe(false);
    expect(steps.some((s) => s.label.includes('lint'))).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-next.test.ts`
Expected: FAIL

- [ ] **Step 4: 레시피 구현**

`packages/devkit-cli/src/recipes/next.ts`:

```ts
import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

/**
 * Next.js App Router 레시피. 설계 5.2절.
 *
 * pnpm-workspace.yaml은 지우지 않는다 — 단일 앱에서는 sharp 빌드 승인에
 * 필요하다. 모노레포에서만 제거하며 그것은 monorepo 레시피의 일이다.
 */
export const nextRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    scaffold(
      'pnpm',
      ['dlx', 'create-next-app@latest'],
      [
        '--ts',
        '--app',
        '--src-dir',
        '--tailwind',
        '--no-eslint',
        '--use-pnpm',
        '--skip-install',
        '--disable-git',
        '--import-alias',
        '@/*',
      ],
    ),

    // create-next-app이 만든 에이전트 문서를 devkit 판으로 교체한다.
    removeFiles(['AGENTS.md', 'CLAUDE.md'], { required: true }),

    copyOverlay('next'),

    mergeJson({
      prettier: '@devbak/prettier-config',
      scripts: {
        lint: 'eslint .',
        format: 'prettier --write .',
        'format:check': 'prettier --check .',
        typecheck: 'tsc --noEmit',
        test: 'vitest run',
        'test:watch': 'vitest',
      },
      devDependencies: {
        eslint: '^10.8.0',
        vitest: '^2.1.0',
        jsdom: '^25.0.0',
        prettier: '^3.4.2',
        '@next/eslint-plugin-next': '^16.0.0',
        'eslint-plugin-jsx-a11y': '^6.10.0',
        'eslint-plugin-react-hooks': '^7.1.0',
      },
    }),

    linkDeps(['eslint-plugin-fsd', 'prettier-config', 'tsconfig', 'vitest-config']),

    // FSD 레이어. app은 create-next-app이 이미 만들었다.
    // pages 레이어는 Next의 Pages Router와 이름이 충돌하므로 views를 쓴다.
    makeDirs(['src/views', 'src/widgets', 'src/features', 'src/entities', 'src/shared']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
```

`templates/next/tsconfig.json`을 두지 않는 것은 의도적이다 — `create-next-app`의 tsconfig에는 `.next/types/**` 등 Next가 관리하는 항목이 들어 있어 덮어쓰면 타입이 깨진다. 대신 `mergeJson`으로 `extends`만 얹을지는 Step 7의 실측 결과로 정한다.

- [ ] **Step 5: `bin.ts`의 `RECIPES`에 등록**

```ts
import { nextRecipe } from './recipes/next.js';

const RECIPES: Partial<Record<ProjectType, Recipe>> = {
  nest: nestRecipe,
  next: nextRecipe,
};
```

- [ ] **Step 6: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-next.test.ts`
Expected: PASS (6개 테스트)

스냅샷을 읽어 단계 순서가 설계 5.2절과 맞는지 확인한다.

- [ ] **Step 7: 실제 생성 + FSD 규칙 발화 검증 (완료 기준 3)**

Run:
```bash
pnpm build
pnpm devbak create devkit-probe-next --type next
```

Expected: `pnpm lint`·`pnpm build` 통과

**그다음이 핵심이다.** 레이어 폴더만 만들고 규칙이 안 걸리면 아무것도 한 것이 아니다. 고의 위반을 넣어 확인한다:

```bash
cd ~/Documents/develop/devkit-probe-next
mkdir -p src/shared/ui src/features/auth
echo "export const Button = () => null;" > src/shared/ui/index.ts
# shared(최하위)가 features(상위)를 import → no-higher-level-imports 위반이어야 한다
echo "import { x } from '../../features/auth';" >> src/shared/ui/index.ts
pnpm lint
```

Expected: `fsd/no-higher-level-imports` 에러가 **발화한다**

그리고 **오탐이 없는지도 확인한다** — 위반 파일을 지우고 원래 생성물만으로:

```bash
rm -rf src/shared/ui src/features/auth
pnpm lint
```

Expected: exit 0. `src/app/`의 Next 라우팅 파일에 FSD 규칙이 잘못 걸리지 않아야 한다.

오탐이 나오면 `templates/next/eslint.config.mjs`의 `ignores`를 조정하고, 그 근거를 파일 주석에 남긴다.

정리:
```bash
cd ~/Documents/develop/eslint
rm -rf ~/Documents/develop/devkit-probe-next
```

- [ ] **Step 8: 검증 후 커밋**

Run: `pnpm lint && pnpm test && pnpm build`

```bash
git add packages/devkit-cli
git commit -m "feat: next 레시피와 템플릿 추가 (FSD 레이어 스캐폴딩 포함)"
```

---

### Task 11: `monorepo` 레시피 + 템플릿

**Files:**
- Create: `packages/devkit-cli/src/recipes/monorepo.ts`
- Create: `packages/devkit-cli/templates/monorepo/package.json`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `_gitignore`, `CLAUDE.md`
- Modify: `packages/devkit-cli/src/bin.ts` (`RECIPES.monorepo`)
- Test: `packages/devkit-cli/tests/recipe-monorepo.test.ts`

**Interfaces:**
- Consumes: `nextRecipe` (Task 10), `compose` (Task 8)
- Produces: `export const monorepoRecipe: Recipe`

**기준선**: `~/Documents/develop/nextjs-monorepo` (설계 2.4절). Turborepo + pnpm `catalog:` + flat config 구조를 그대로 따르되 `@repo/*`를 `@devbak/*`로 바꾼다.

**🚨 이 태스크의 존재 이유**: `create-next-app`이 `apps/web/pnpm-workspace.yaml`을 만들면 pnpm이 그 디렉토리를 독립 워크스페이스 루트로 인식한다. 문서 어디에도 없고 실행해야만 나오는 함정이다(설계 2.2절).

- [ ] **Step 1: 템플릿 파일 작성**

`templates/monorepo/package.json`:

```json
{
  "name": "__NAME__",
  "private": true,
  "packageManager": "pnpm@10.29.2",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "eslint .",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "prettier": "@devbak/prettier-config",
  "devDependencies": {
    "eslint": "^10.8.0",
    "prettier": "^3.4.2",
    "turbo": "^2.8.0",
    "typescript": "catalog:",
    "@next/eslint-plugin-next": "catalog:",
    "eslint-plugin-jsx-a11y": "catalog:",
    "eslint-plugin-react-hooks": "catalog:"
  }
}
```

`templates/monorepo/pnpm-workspace.yaml` — `catalog:`에 `@devbak/*`를 **넣지 않는다**(설계 2.3절 실측):

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

# @devbak/* 는 여기에 넣을 수 없다. pnpm이 catalog 항목의 link: 프로토콜을
# 거부한다(ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC). 각 package.json이
# link: 상대경로로 직접 선언한다.
catalog:
  next: ^16.2.12
  react: ^19.2.4
  react-dom: ^19.2.4
  typescript: ^5.7.3
  tailwindcss: ^4
  '@tailwindcss/postcss': ^4
  '@next/eslint-plugin-next': ^16.0.0
  eslint-plugin-jsx-a11y: ^6.10.0
  eslint-plugin-react-hooks: ^7.1.0
  vitest: ^2.1.0
  jsdom: ^25.0.0

ignoredBuiltDependencies:
  - sharp
  - unrs-resolver
```

`templates/monorepo/turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {}
  }
}
```

`lint`는 turbo task로 두지 않는다 — 루트에서 `eslint .` 한 번이면 워크스페이스 전체를 훑는다. 기준선 저장소도 `//#lint`로 루트 전용 태스크를 썼다.

`templates/monorepo/eslint.config.mjs`:

```js
import fsd from '@devbak/eslint-plugin-fsd/next';

export default [
  { ignores: ['**/.next/**', '**/out/**', '**/next-env.d.ts', '**/dist/**'] },
  ...fsd,
];
```

`templates/monorepo/_gitignore`:

```
node_modules/
.turbo/
dist/
.next/
out/
*.log
.DS_Store
.env
.env.*
!.env.example
```

`templates/monorepo/CLAUDE.md`:

```markdown
# __NAME__

Turborepo 모노레포. `@devbak` 표준 툴킷으로 생성됨.

## 구조

```
apps/web        Next.js App Router 앱 (FSD 구조)
packages/       공유 패키지 (필요할 때 추가)
```

## 명령어 (루트에서)

- 개발: `pnpm dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint` (루트 한 번으로 전체를 훑는다)
- 타입: `pnpm typecheck`
- 테스트: `pnpm test`

## 버전 관리

일반 의존은 `pnpm-workspace.yaml`의 `catalog:`에서 버전을 정한다.
각 `package.json`은 `"next": "catalog:"`처럼 참조만 한다.

**`@devbak/*`는 catalog에 넣을 수 없다.** pnpm이 catalog 항목의 `link:`
프로토콜을 거부하기 때문이다. 각 `package.json`이 `link:` 상대경로로 직접
선언하며, 루트와 `apps/web`은 깊이가 달라 경로도 다르다.

## 아키텍처

`apps/web`은 Feature-Sliced Design을 따른다. 자세한 내용은
`apps/web`의 레이어 구조와 `@devbak/eslint-plugin-fsd` 규칙을 참고하라.
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/devkit-cli/tests/recipe-monorepo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { monorepoRecipe } from '../src/recipes/monorepo.js';

describe('monorepo 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = monorepoRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(steps).toMatchSnapshot();
  });

  it('next 레시피를 합성한다 — 로직을 복제하지 않는다', () => {
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    expect(composed).toBeDefined();
    const detail = composed?.describe() as { steps: unknown[] };
    expect(detail.steps.length).toBeGreaterThan(3);
  });

  it('합성된 next 레시피에는 install과 자가검증이 없다', () => {
    // 설치는 루트에서 한 번만 해야 한다. apps/web에서 따로 하면
    // 중첩 node_modules가 생긴다.
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    const detail = composed?.describe() as { steps: { command?: string; args?: string[] }[] };
    const hasInstall = detail.steps.some(
      (s) => s.command === 'pnpm' && s.args?.includes('install') === true,
    );
    expect(hasInstall).toBe(false);
  });

  it('apps/web/pnpm-workspace.yaml을 required로 제거한다', () => {
    // 이 방어가 조용히 무력화되면 중첩 워크스페이스를 못 잡는다(설계 6.1절).
    const removes = monorepoRecipe().filter((s) => s.kind === 'removeFiles');
    const target = removes.find((s) =>
      (s.describe() as { paths: string[] }).paths.some((p) => p.includes('pnpm-workspace.yaml')),
    );
    expect(target).toBeDefined();
    expect((target?.describe() as { required: boolean }).required).toBe(true);
  });

  it('루트와 apps/web에 각각 link: 배선을 한다', () => {
    // catalog:가 link:를 거부하므로 각자 선언해야 한다(설계 2.3절).
    const links = monorepoRecipe().filter((s) => s.kind === 'linkDeps');
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    const nested = (composed?.describe() as { steps: { packages?: string[] }[] }).steps.filter(
      (s) => s.packages !== undefined,
    );
    expect(links.length).toBeGreaterThan(0);
    expect(nested.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-monorepo.test.ts`
Expected: FAIL

- [ ] **Step 4: 레시피 구현**

`packages/devkit-cli/src/recipes/monorepo.ts`:

```ts
import { join } from 'node:path';
import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles } from '../ops/index.js';
import { compose } from '../run.js';
import { nextRecipe } from './next.js';

/**
 * Turborepo 모노레포 레시피. 설계 5.3절.
 *
 * next 레시피를 그대로 합성한다 — 이것이 레시피 파이프라인을 택한 이유의
 * 실현이다(설계 4.1절). Next 로직을 복제하지 않는다.
 */
export const monorepoRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    copyOverlay('monorepo'),

    makeDirs(['apps', 'packages']),

    compose(
      'apps/web에 next 레시피 실행',
      // install·자가검증은 루트에서 한 번만 한다. apps/web에서 따로 설치하면
      // 중첩 node_modules가 생긴다.
      nextRecipe({ skipInstall: true }),
      (ctx) => ({ ...ctx, targetDir: join(ctx.targetDir, 'apps', 'web'), name: 'web' }),
    ),

    // 🚨 create-next-app이 만든 pnpm-workspace.yaml을 지운다. 남으면 pnpm이
    // apps/web을 독립 워크스페이스 루트로 인식한다(설계 2.2절 실측).
    // required: true 없이는 이 방어가 조용히 죽어도 알 수 없다(설계 6.1절).
    removeFiles([join('apps', 'web', 'pnpm-workspace.yaml')], { required: true }),

    // apps/web이 catalog를 참조하게 한다. 버전 문자열이 중복되지 않는다.
    mergeJson(
      {
        dependencies: {
          next: 'catalog:',
          react: 'catalog:',
          'react-dom': 'catalog:',
        },
        devDependencies: {
          typescript: 'catalog:',
          tailwindcss: 'catalog:',
          '@tailwindcss/postcss': 'catalog:',
          vitest: 'catalog:',
          jsdom: 'catalog:',
          '@next/eslint-plugin-next': 'catalog:',
          'eslint-plugin-jsx-a11y': 'catalog:',
          'eslint-plugin-react-hooks': 'catalog:',
          // 루트가 담당한다. 앱에서 중복 선언하지 않는다.
          eslint: null,
          prettier: null,
        },
        scripts: {
          lint: null,
          format: null,
          'format:check': null,
        },
      },
      { file: join('apps', 'web', 'package.json'), required: ['dependencies.next'] },
    ),

    // 루트도 @devbak/* 를 직접 선언해야 한다 — catalog:가 link:를 거부한다.
    linkDeps(['eslint-plugin-fsd', 'prettier-config', 'tsconfig']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
```

`linkDeps`가 `apps/web/package.json`에 쓰는 상대경로는 `compose` 안에서 자식 ctx(`targetDir = <root>/apps/web`)로 실행되므로 자동으로 `../../../eslint/...`가 된다. 이것이 Task 7에서 경로를 계산한 이유다.

- [ ] **Step 5: `bin.ts`의 `RECIPES`에 등록**

```ts
import { monorepoRecipe } from './recipes/monorepo.js';

const RECIPES: Partial<Record<ProjectType, Recipe>> = {
  nest: nestRecipe,
  next: nextRecipe,
  monorepo: monorepoRecipe,
};
```

- [ ] **Step 6: 테스트를 돌려 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/recipe-monorepo.test.ts`
Expected: PASS (5개 테스트)

- [ ] **Step 7: 실제 생성 + 중첩 워크스페이스 검증 (완료 기준 2)**

Run:
```bash
pnpm build
pnpm devbak create devkit-probe-mono --type monorepo
```

Expected: `pnpm install`이 **중첩 워크스페이스 경고 없이** 완료되고 `pnpm lint`·`pnpm build` 통과

확인할 것:
```bash
cd ~/Documents/develop/devkit-probe-mono
test ! -f apps/web/pnpm-workspace.yaml && echo "OK: 중첩 워크스페이스 파일 없음"
test ! -d apps/web/node_modules/.pnpm && echo "OK: 중첩 스토어 없음"
grep -c 'link:\.\./\.\./\.\./eslint' apps/web/package.json
```

Expected: 마지막 명령이 1 이상 — `apps/web`의 상대경로가 세 단계여야 한다

정리:
```bash
cd ~/Documents/develop/eslint
rm -rf ~/Documents/develop/devkit-probe-mono
```

- [ ] **Step 8: 검증 후 커밋**

Run: `pnpm lint && pnpm test && pnpm build`

```bash
git add packages/devkit-cli
git commit -m "feat: monorepo 레시피와 템플릿 추가 (next 레시피 합성)"
```

---

### Task 12: 실생성 통합 테스트 (3층)

**Files:**
- Create: `vitest.e2e.config.ts` (루트)
- Create: `packages/devkit-cli/tests/e2e/create.e2e.test.ts`
- Modify: `packages/devkit-cli/README.md`

**Interfaces:**
- Consumes: 완성된 CLI
- Produces: `pnpm test:e2e`

**왜 분리하는가**

느리고(각 유형마다 `pnpm dlx` + `pnpm install`) 네트워크가 필요하다. 기본 `pnpm test`에 넣으면 개발 루프가 망가진다. **분리 자체가 위험**이므로 완료 기준(Task 13)에 명시적으로 넣는다.

**왜 필요한가**

2층 스냅샷이 전부 초록이어도 공식 CLI 산출물이 바뀌면 실제 프로젝트는 깨진다. `eslint-plugin-react`가 구조 테스트 9개 초록 상태에서 ESLint 10에 크래시한 전례가 있다(work-log 2026-07-30).

- [ ] **Step 1: e2e vitest 설정 작성**

`vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/e2e/**/*.e2e.test.ts'],
    // pnpm dlx 다운로드 + pnpm install + next build가 들어간다
    testTimeout: 900_000,
    hookTimeout: 900_000,
    // 같은 부모 디렉토리에 생성하므로 병렬 실행하면 서로 간섭한다
    fileParallelism: false,
  },
});
```

- [ ] **Step 2: 통합 테스트 작성**

`packages/devkit-cli/tests/e2e/create.e2e.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
const PARENT = resolve(TOOLKIT, '..');
const created: string[] = [];

function create(name: string, type: string): string {
  const dir = join(PARENT, name);
  created.push(dir);
  execFileSync('node', ['packages/devkit-cli/dist/bin.js', 'create', name, '--type', type], {
    cwd: TOOLKIT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return dir;
}

/** 생성물에서 스크립트를 돌리고 종료 코드를 반환한다. */
function runIn(dir: string, script: string): number {
  try {
    execFileSync('pnpm', [script], { cwd: dir, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('devkit create --type nest', () => {
  it('생성물에서 lint·build·test가 통과한다', () => {
    const dir = create('devkit-e2e-nest', 'nest');
    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    // nest new는 샘플 spec을 만들므로 test도 통과해야 한다
    expect(runIn(dir, 'test')).toBe(0);
  });

  it('eslint-plugin-prettier가 남아 있지 않다', () => {
    const dir = create('devkit-e2e-nest-deps', 'nest');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
      jest?: unknown;
    };
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-prettier');
    expect(pkg.devDependencies).not.toHaveProperty('eslint-config-prettier');
    expect(pkg.devDependencies.eslint).toMatch(/^\^10\./);
    expect(pkg.jest).toBeUndefined();
    expect(existsSync(join(dir, '.prettierrc'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
  });
});

describe('devkit create --type next', () => {
  it('생성물에서 lint·build가 통과하고 FSD 레이어가 있다', () => {
    const dir = create('devkit-e2e-next', 'next');
    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    for (const layer of ['views', 'widgets', 'features', 'entities', 'shared']) {
      expect(existsSync(join(dir, 'src', layer))).toBe(true);
    }
    expect(existsSync(join(dir, 'src', 'pages'))).toBe(false);
  });
});

describe('devkit create --type monorepo', () => {
  it('중첩 워크스페이스 없이 생성되고 lint·build가 통과한다', () => {
    const dir = create('devkit-e2e-mono', 'monorepo');
    expect(existsSync(join(dir, 'apps', 'web', 'pnpm-workspace.yaml'))).toBe(false);
    expect(existsSync(join(dir, 'apps', 'web', 'node_modules', '.pnpm'))).toBe(false);

    const webPkg = readFileSync(join(dir, 'apps', 'web', 'package.json'), 'utf8');
    expect(webPkg).toContain('link:../../../eslint/packages/');

    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
  });
});

describe('안전장치', () => {
  it('이미 존재하는 디렉토리를 덮어쓰지 않는다', () => {
    const dir = create('devkit-e2e-dup', 'nest');
    expect(existsSync(dir)).toBe(true);
    expect(() => create('devkit-e2e-dup', 'nest')).toThrow();
  });
});
```

- [ ] **Step 3: e2e 테스트 실행**

Run: `pnpm build && pnpm test:e2e`
Expected: PASS (6개 테스트). 수 분이 걸린다.

실패하면 원인을 고친다. **테스트를 느슨하게 만들지 않는다** — 이 테스트가 잡는 것이 바로 이 작업의 유일한 진짜 증거다.

- [ ] **Step 4: 기본 `pnpm test`가 e2e를 집지 않는지 확인**

Run: `pnpm test`
Expected: e2e 테스트가 실행되지 않는다 (루트 `vitest.config.ts`의 include가 `packages/*/tests/**/*.test.ts`이고 e2e 파일은 `*.e2e.test.ts`라 매칭된다 — **매칭되면 include를 `packages/*/tests/*.test.ts`로 좁힌다**)

이 확인을 건너뛰지 마라. 기본 테스트가 9백 초짜리 e2e를 물면 개발 루프가 죽는다.

- [ ] **Step 5: README 작성**

`packages/devkit-cli/README.md`에 사용법, 지원 유형 3종, 각 유형이 무엇을 하는지, `--no-verify` 플래그, **`link:` 상대경로 때문에 생성 위치가 `~/Documents/develop/` 아래로 제약된다는 사실**을 적는다.

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli vitest.e2e.config.ts vitest.config.ts
git commit -m "test: 실생성 통합 테스트 추가 (3개 유형 e2e)"
```

---

### Task 13: 최종 검증 및 기록

**Files:**
- Modify: `work-log.md`
- Modify: `docs/superpowers/specs/2026-08-01-devkit-template-design.md` (9절 미결 사항 갱신)

- [ ] **Step 1: 완료 기준 전수 확인**

설계 8절의 7개 항목을 하나씩 확인하고 결과를 기록한다.

```bash
cd ~/Documents/develop/eslint
pnpm lint && pnpm build && pnpm test
pnpm test:e2e
npx tsc --noEmit -p packages/devkit-cli/tsconfig.json
npx tsc --noEmit -p packages/devkit-cli/tests/tsconfig.json
```

- [ ] **Step 2: `dist` 삭제 후 재빌드 검증 (완료 기준 5)**

`link:` 배선이 우연히 캐시된 산출물에 기대고 있지 않은지 확인하는 유일한 방법이다.

```bash
rm -rf packages/*/dist
pnpm build
pnpm devbak create devkit-final-check --type nest
cd ~/Documents/develop/devkit-final-check && pnpm lint && pnpm build
cd ~/Documents/develop/eslint && rm -rf ~/Documents/develop/devkit-final-check
```

Expected: 전부 exit 0

- [ ] **Step 3: `dist` 신선도 검사가 실제로 동작하는지 확인**

```bash
touch packages/devkit-cli/src/bin.ts
pnpm devbak create x --type nest
```

Expected: "dist가 src보다 오래됐습니다" 에러로 **중단**. 생성이 시작되지 않는다.

```bash
pnpm build
```

- [ ] **Step 4: 미사용 패키지 0 확인 (완료 기준 6)**

생성한 3개 유형 각각에서 선언된 `@devbak/*`가 전부 실제로 소비되는지 확인한다. 선언만 하고 안 쓰는 패키지가 있으면 `linkDeps` 목록에서 뺀다.

| 유형 | 선언 | 실제 소비처 |
| --- | --- | --- |
| nest | `eslint-config-nest` | `eslint.config.mjs` |
| nest | `prettier-config` | `package.json`의 `"prettier"` |
| nest | `tsconfig` | `tsconfig.json`의 `extends` |
| nest | `jest-config` | `jest.config.js`, `jest-e2e.config.js` |
| next | `eslint-plugin-fsd` | `eslint.config.mjs` |
| next | `prettier-config` | `package.json`의 `"prettier"` |
| next | `tsconfig` | **확인 필요** — Task 10 Step 4에서 tsconfig를 덮어쓰지 않기로 했다. 소비처가 없으면 `linkDeps`에서 뺀다 |
| next | `vitest-config` | `vitest.config.ts` |
| monorepo 루트 | `eslint-plugin-fsd`, `prettier-config`, `tsconfig` | `eslint.config.mjs`, `package.json`, **tsconfig 확인 필요** |

- [ ] **Step 5: 스펙 9절 갱신**

설계 문서의 미결 사항 중 해소된 것을 실제 결과로 대체한다. 특히 첫 항목:

> `eslint-config-nest`가 Nest 런타임 전역을 담는가

`eslint-config-nest`는 `js.configs.recommended`를 spread하지 않고 `tseslint.configs.recommendedTypeChecked`만 쓴다 → `no-undef`가 애초에 켜지지 않으므로 `globals.node`/`globals.jest`가 불필요하다. Task 9 Step 7의 실생성으로 확인된 결과를 함께 적는다.

해소되지 않았거나 새로 발견된 미결은 추가한다.

- [ ] **Step 6: `work-log.md` 기록**

`## 2026-08-01` 아래에 새 항목을 추가한다. CLAUDE.md의 형식(변경 파일 / 내용 / 커밋)을 따르고, 다음을 반드시 포함한다:

- 새 패키지 4개와 각각의 역할
- 실측이 설계를 바꾼 지점 (nest의 flat config, `pnpm-workspace.yaml` 함정, catalog의 `link:` 거부)
- 구현 중 새로 발견한 것 (있다면)
- 테스트 개수 변화 (77 → N)
- 커밋 해시 범위

- [ ] **Step 7: memory 갱신**

`/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/project_devkit-template-scope_2026-08-01.md`를 구현 완료 상태로 갱신하고, 새로 배운 것이 있으면 추가한다.

- [ ] **Step 8: 최종 커밋**

```bash
git add work-log.md docs/superpowers/specs/2026-08-01-devkit-template-design.md
git commit -m "docs: 템플릿 구현 완료 기록 및 미결 사항 갱신"
```

---

## 계획 셀프 리뷰

**1. 스펙 커버리지**

| 스펙 절 | 구현 태스크 |
| --- | --- |
| 4. 아키텍처 (패키지 4개) | Task 1·2·3·4 |
| 4.2 원자 연산 6종 | Task 5(mergeJson) · 6(removeFiles·copyOverlay·makeDirs) · 7(linkDeps) · 8(delegate) |
| 4.3 설정 패키지 무빌드 | Task 1·2·3 (build 스크립트 없음) |
| 5.1 nest 레시피 | Task 9 |
| 5.2 next 레시피 | Task 10 |
| 5.3 monorepo 레시피 | Task 11 |
| 5.4 자가검증 | Task 9·10·11의 마지막 delegate 단계 + `--no-verify` (Task 8) |
| 6.2 `required` 규약 | Task 5(mergeJson) · 6(removeFiles) |
| 6.3 실패 목록 | Task 4(디렉토리 존재·dist 신선도·툴킷 루트 탐색) · 6(경로 탈출) · 8(non-zero 종료·단계 위치) |
| 7. 테스트 3층 | 1층: Task 5·6·7 / 2층: Task 9·10·11 스냅샷 / 3층: Task 12 |
| 8. 완료 기준 7개 | Task 13 |

빠진 것: 스펙 6.3의 "대상이 툴킷과 형제 디렉토리가 아님 → 경고"는 Task 4의 `main()`에서 `targetDir`을 `dirname(toolkitRoot)` 기준으로 강제 계산하므로 애초에 발생할 수 없다. 경고 대신 구조적으로 차단한 것이며, 이는 스펙보다 강한 보장이다.

**2. 플레이스홀더 스캔**

"TBD"·"적절히"·"필요에 따라" 없음. 코드가 필요한 단계는 전부 실제 코드를 담았다. Task 10 Step 4의 "Step 7의 실측 결과로 정한다"와 Task 13 Step 4의 "확인 필요"는 플레이스홀더가 아니라 **의도적으로 실측에 위임한 결정**이며, 어느 단계에서 무엇을 보고 정할지가 명시돼 있다.

**3. 타입 일관성**

- `Ctx`·`Step`·`Recipe`·`RecipeOptions`·`ProjectType`: Task 4에서 정의, 이후 전부 동일 이름 사용 ✓
- `applyPatch(target, patch)`: Task 5 정의 → Task 7에서 동일 시그니처로 사용 ✓
- `assertInside(targetDir, relativePath)`: Task 6 `remove-files.ts` 정의 → `make-dirs.ts`에서 import ✓
- `linkSpec(targetDir, toolkitRoot, pkg)`: Task 7 정의 → 테스트와 구현 일치 ✓
- `compose(label, steps, mapCtx)`: Task 8 정의 → Task 11에서 3인자로 호출 ✓
- `scaffold(command, argsBefore, argsAfter)`: Task 8 정의 → Task 9·10에서 3인자로 호출 ✓
- `mergeJson(patch, options)`: Task 5는 `patch`가 첫 인자다. Task 9·10·11 호출 전부 이 순서 ✓ (`file`은 `options.file`)

**4. 알려진 리스크**

| 리스크 | 대응 |
| --- | --- |
| 공식 CLI가 이 계획 작성 이후 산출물을 바꾼다 | `required` 규약이 침묵 대신 에러를 낸다. Task 9·10·11의 실생성 단계에서 즉시 드러난다 |
| `nest new`가 `.gitignore`를 만들기 시작한다 | `copyOverlay`가 덮어쓰므로 무해하다 |
| Next 앱의 `src/app/`에 FSD 규칙이 오탐한다 | Task 10 Step 7이 명시적으로 확인한다. 나오면 `ignores` 조정 |
| `apps/web`이 `catalog:`를 참조하는데 루트 catalog에 없는 키가 있다 | Task 11 Step 7의 `pnpm install`이 실패로 알려준다 |
| e2e 테스트가 네트워크·시간에 취약하다 | 기본 `test`에서 분리. 타임아웃 900초. 완료 기준에 명시해 건너뛰지 못하게 한다 |
