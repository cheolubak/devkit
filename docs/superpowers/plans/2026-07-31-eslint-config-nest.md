# eslint-config-nest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NestJS 백엔드용 ESLint 공유 설정을 모노레포의 새 패키지 `eslint-config-nest`로 제공한다. 검증 라이브러리는 zod를 전제하고, ESLint 10 전용이다.

**Architecture:** `typescript-eslint` 타입 인식 베이스라인 + `eslint-plugin-zod` recommended를 flat config 배열 하나로 조립해 단일 export한다. Nest 관용구와 충돌하는 규칙은 **추측하지 않고** 디스크 픽스처에 실제로 ESLint를 돌려 발화한 것만 끈다.

**Tech Stack:** TypeScript(strict, ESM), ESLint 10 flat config, typescript-eslint 8, eslint-plugin-zod 4, tsup(번들+dts), Vitest, pnpm workspace.

설계 근거는 `docs/superpowers/specs/2026-07-31-eslint-config-nest-design.md`에 있다. 이 계획과 스펙이 어긋나면 스펙이 우선이다.

## Global Constraints

- 패키지 매니저는 **pnpm**만 쓴다. `npm`/`yarn` 금지.
- 새 의존성은 `packages/eslint-config-nest`의 `devDependencies`에 설치한다(루트가 아니다). 명령은 `pnpm --filter eslint-config-nest add -D <pkg>`.
- TypeScript strict, 2-space 들여쓰기, ESM(`type: module`), `verbatimModuleSyntax: true`(루트 `tsconfig.base.json`에서 상속).
- 테스트는 Vitest, 테스트 이름은 **한글**로 쓴다(기존 패키지와 동일).
- 커밋 메시지는 conventional commits + 한글 본문. 끝에 다음 줄을 넣는다:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- 각 태스크 종료 시 `pnpm test`와 `pnpm lint`가 **둘 다 통과**해야 한다. `pnpm lint`는 `oxlint && eslint .`이다.
- `eslint` peer는 **`^10.0.0`만** 선언한다. `^9`를 넣지 않는다 — 이 패키지는 v9에서 검증하지 않는다.
- **`class-validator`와 `@darraghor/eslint-plugin-nestjs-typed`를 도입하지 않는다.** 설계 3.1 참조.
- 상류 버전 고정: `typescript-eslint@^8.0.0`, `eslint-plugin-zod@^4.0.0`, `zod@^4.0.0`, `@types/node@^24`(런타임 Node 24에 정렬).
- 테스트 총 개수: 현재 저장소 전체 **67개**. Task 1 후 69, Task 2 후 72, Task 3 후 74.

## 상류 사실 (실물 확인 완료, 추측 아님)

`eslint-plugin-zod@4.9.0`의 default export는 `{ ...plugin, configs: { recommended } }`이고, `configs.recommended`는 **단일 flat config 객체**다:

```js
{
  name: 'zod/recommended',
  files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
  plugins: { zod: <plugin> },
  rules: { 'zod/array-style': 'error', /* ... 총 30개 */ },
}
```

`files`에 `.ts`가 이미 들어 있으므로 **우리가 스코프를 다시 씌우지 않는다.** 그대로 배열에 넣는다.

peer는 `eslint`/`oxlint`/`zod` 세 개이며 **전부 optional**이라 상류가 강요하는 의존이 없다.

---

### Task 1: 패키지 스캐폴딩과 베이스라인 config

새 패키지를 만들고 타입 인식 베이스라인 + zod recommended를 조립한다. Nest 관용구 조정은 아직 하지 않는다 — 무엇을 조정할지는 Task 2의 실측 결과로 정한다.

**Files:**
- Create: `packages/eslint-config-nest/package.json`
- Create: `packages/eslint-config-nest/tsconfig.json`
- Create: `packages/eslint-config-nest/tests/tsconfig.json`
- Create: `packages/eslint-config-nest/tsup.config.ts`
- Create: `packages/eslint-config-nest/src/index.ts`
- Test: `packages/eslint-config-nest/tests/config.test.ts`

**Interfaces:**
- Consumes: 없음 (새 패키지)
- Produces: `src/index.ts`의 default export — `Linter.Config[]`. Task 2·3이 이 배열을 ESLint에 실어 검증한다. 배열 순서는 `[베이스라인 languageOptions, ...tseslint recommendedTypeChecked, zod recommended]`.

- [ ] **Step 1: 패키지 디렉토리와 매니페스트 생성**

`packages/eslint-config-nest/package.json`:

```json
{
  "name": "eslint-config-nest",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup"
  },
  "peerDependencies": {
    "eslint": "^10.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-zod": "^4.0.0",
    "zod": "^4.0.0"
  }
}
```

`peerDependenciesMeta`는 넣지 않는다 — optional peer가 하나도 없다.

- [ ] **Step 2: 의존성 설치**

```bash
pnpm --filter eslint-config-nest add -D 'eslint@^10.8.0' 'typescript-eslint@^8.65.0' 'eslint-plugin-zod@^4.9.0' 'zod@^4.0.0' '@types/node@^24'
```

`zod`를 실제로 설치하는 이유: 타입 인식 린팅에서 미해결 모듈은 `any`가 되어 `no-unsafe-*`가 무더기로 발화한다. 그러면 Task 3의 오탐 가드가 무의미해진다.

- [ ] **Step 3: tsconfig와 tsup 설정 생성**

`packages/eslint-config-nest/tsconfig.json` (기존 패키지와 동일 패턴):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/eslint-config-nest/tests/tsconfig.json`:

```json
{
  // 빌드용 tsconfig(../tsconfig.json)는 rootDir=src라 tests를 포함하지 않는다.
  // 타입 인식 린팅이 테스트 파일도 볼 수 있도록 별도 프로젝트를 둔다.
  // fixtures는 제외한다 — 자체 tsconfig를 갖고 있고 저장소 린트 대상도 아니다.
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false
  },
  "include": ["."],
  "exclude": ["fixtures"]
}
```

`packages/eslint-config-nest/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 4: 실패하는 테스트 작성**

`packages/eslint-config-nest/tests/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import config from '../src/index';

describe('eslint-config-nest', () => {
  it('flat config 배열을 기본 export한다', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('타입 인식을 켠다', () => {
    const withParserOptions = config.find(
      (entry) => entry.languageOptions?.parserOptions !== undefined,
    );
    expect(withParserOptions?.languageOptions?.parserOptions).toMatchObject({
      projectService: true,
    });
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/index"`

- [ ] **Step 6: 베이스라인 config 구현**

`packages/eslint-config-nest/src/index.ts`:

```ts
import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import zod from 'eslint-plugin-zod';

/**
 * NestJS 백엔드용 ESLint 공유 설정.
 *
 * 타입 인식을 켜므로 consumer 프로젝트에 tsconfig가 있어야 한다.
 * tsconfigRootDir는 typescript-eslint v8에서 기본값이 process.cwd()라,
 * 프로젝트 루트에서 `eslint .`를 돌리는 통상적 사용에서 그대로 동작한다.
 */
const config: Linter.Config[] = [
  {
    name: 'nest/language-options',
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  ...(tseslint.configs.recommendedTypeChecked as unknown as Linter.Config[]),

  // eslint-plugin-zod의 recommended는 단일 flat config 객체이며 files에
  // .ts가 이미 포함돼 있다. 스코프를 다시 씌우지 않는다.
  zod.configs.recommended as unknown as Linter.Config,

  {
    // Nest에서 가장 값어치 있는 세 규칙. recommendedTypeChecked에 이미
    // 들어 있지만, 상류가 recommended 구성을 바꿔도 이 셋만은 유지된다는
    // 의도를 코드로 고정한다. 설계 4.3 참조.
    name: 'nest/critical',
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
];

export default config;
```

상류 config를 `as unknown as`로 캐스팅하는 이유: 상류 타입이 ESLint의 `Linter.Config`와 구조적으로 호환되지 않아 단일 캐스팅은 "Conversion of type ... may be a mistake" 에러가 날 수 있다. `as unknown as`는 항상 컴파일되며 `@typescript-eslint/no-unnecessary-type-assertion`에도 걸리지 않는다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (기존 67개 + 신규 2개 = **69개**)

- [ ] **Step 8: 빌드와 린트 확인**

```bash
pnpm build
pnpm lint
pnpm exec tsc -p packages/eslint-config-nest/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-config-nest/tests/tsconfig.json
```
Expected: 모두 종료 코드 0. `packages/eslint-config-nest/dist/`에 `index.js`와 `index.d.ts`가 생성된다.

- [ ] **Step 9: 커밋**

```bash
git add packages/eslint-config-nest pnpm-lock.yaml
git commit -F - <<'EOF'
feat: eslint-config-nest 패키지 추가

NestJS 백엔드용 ESLint 공유 설정을 새 패키지로 만든다. 타입 인식
베이스라인(typescript-eslint recommendedTypeChecked)과 zod recommended
30개 규칙을 flat config 배열 하나로 조립해 단일 export한다.

no-floating-promises·no-misused-promises·require-await는 이미
recommendedTypeChecked에 있지만 명시적으로 다시 켠다. Nest는 서비스
호출이 전부 Promise라 await 누락이 가장 빈번한 사고이며, 상류가
recommended 구성을 바꿔도 이 셋은 유지되어야 한다.

eslint peer는 ^10.0.0만 선언한다. v9에서 검증하지 않기 때문이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Nest 픽스처와 런타임 검증 하네스

타입 인식 규칙은 실제 파일과 tsconfig 없이 검증할 수 없다. 디스크에 Nest 형태 픽스처를 두고 실제 ESLint를 돌린다.

**Files:**
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/tsconfig.json`
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/src/decorator-stubs.ts`
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/src/idioms.ts`
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/src/violations.ts`
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/src/schema.ts`
- Create: `packages/eslint-config-nest/tests/fixtures/nest-app/src/user.service.spec.ts`
- Modify: `packages/eslint-config-nest/tests/config.test.ts`
- Modify: `eslint.config.mjs` (ignores에 픽스처 추가)
- Modify: `.oxlintrc.json` (ignorePatterns에 픽스처 추가)

**Interfaces:**
- Consumes: Task 1의 `src/index.ts` default export(`Linter.Config[]`)
- Produces: `tests/config.test.ts`의 `lintFixture(relativePath: string): Promise<Linter.LintMessage[]>` 헬퍼. Task 3이 이걸 써서 오탐 가드를 단언한다.

- [ ] **Step 1: 두 린터의 무시 목록에 픽스처 추가**

픽스처는 **의도적으로 규칙을 위반하는 파일**이다. 저장소 자체 린트 대상이 되면 `pnpm lint`가 깨진다. 그리고 픽스처는 git에 커밋되므로 oxlint의 gitignore 존중도 통하지 않는다. **두 린터 모두** 고쳐야 한다.

`eslint.config.mjs`의 ignores 배열을 다음으로 바꾼다:

```js
    ignores: ['**/dist/**', 'coverage/**', '.superpowers/**', '**/tests/fixtures/**'],
```

`.oxlintrc.json`의 `ignorePatterns`를 다음으로 바꾼다:

```json
  "ignorePatterns": ["**/dist/**", "**/node_modules/**", "coverage/**", "**/tests/fixtures/**"],
```

- [ ] **Step 2: 픽스처 tsconfig 생성**

`packages/eslint-config-nest/tests/fixtures/nest-app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`experimentalDecorators`를 켜는 이유: Nest는 레거시 데코레이터를 쓰며, 실제 Nest 프로젝트의 tsconfig를 재현해야 검증이 의미를 갖는다.

- [ ] **Step 3: Nest 관용구 픽스처 작성**

> **2026-07-31 개정:** 데코레이터 **정의(스텁)**와 **사용(관용구)**을 서로 다른 파일로 분리한다. 초판은 둘을 `idioms.ts` 한 파일에 뒀는데, 스텁의 미사용 파라미터(`_meta`, `_prefix`)가 `no-unused-vars` 2건을 만들었다. **실제 Nest 코드는 데코레이터를 소비할 뿐 정의하지 않으므로** 이 발화는 Nest 관용구와 무관한 픽스처 인공물이고, Task 3이 그것을 "Nest 오탐"으로 오독하면 실존하지 않는 상황에 맞춰 규칙을 끄게 된다. 측정 대상 파일은 사용부만 담아야 한다.

`packages/eslint-config-nest/tests/fixtures/nest-app/src/decorator-stubs.ts` — 데코레이터 **정의**. 측정 대상이 아니다:

```ts
// Nest 데코레이터를 의존성 없이 재현한 스텁. 데코레이터의 출처는 규칙
// 판정에 영향을 주지 않으므로 @nestjs/* 를 설치하지 않는다.
//
// 이 파일은 측정 대상이 아니다. 실제 Nest 코드는 데코레이터를 소비할 뿐
// 정의하지 않으므로, 여기서 나오는 발화(미사용 파라미터 등)는 스텁이
// 만들어낸 인공물이지 Nest 관용구가 아니다. 관용구 측정은 idioms.ts에서만
// 한다.
export function Injectable(): ClassDecorator {
  return () => undefined;
}

export function Module(_meta: { providers?: unknown[] }): ClassDecorator {
  return () => undefined;
}

export function Controller(_prefix: string): ClassDecorator {
  return () => undefined;
}

export function Get(): MethodDecorator {
  return () => undefined;
}
```

`packages/eslint-config-nest/tests/fixtures/nest-app/src/idioms.ts` — 데코레이터 **사용**. 이 파일이 오탐 가드의 대상이다:

```ts
// 실제 Nest 코드가 하는 일만 담는다: 데코레이터를 소비하고, 생성자
// 주입을 쓰고, 서비스·컨트롤러·모듈을 선언한다.
import { Controller, Get, Injectable, Module } from './decorator-stubs';

export interface User {
  id: string;
  name: string;
}

@Injectable()
export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return await Promise.resolve({ id, name: 'test' });
  }
}

@Injectable()
export class UserService {
  // 생성자 파라미터 프로퍼티 — Nest DI의 표준 형태
  constructor(private readonly repo: UserRepository) {}

  async getUser(id: string): Promise<User | null> {
    return await this.repo.findById(id);
  }
}

@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get()
  async list(): Promise<User[]> {
    const user = await this.service.getUser('1');
    return user === null ? [] : [user];
  }
}

// 데코레이터만 있는 빈 클래스 — Nest 모듈의 표준 형태
@Module({ providers: [UserService, UserRepository] })
export class UserModule {}
```

- [ ] **Step 4: 의도적 위반 픽스처 작성**

`packages/eslint-config-nest/tests/fixtures/nest-app/src/violations.ts`:

```ts
import type { UserService } from './idioms';

export class BadService {
  constructor(private readonly service: UserService) {}

  // await 누락 — no-floating-promises가 잡아야 한다.
  // Nest에서 가장 빈번한 사고이며 컴파일은 통과한다.
  run(): void {
    this.service.getUser('1');
  }
}
```

`packages/eslint-config-nest/tests/fixtures/nest-app/src/schema.ts`:

```ts
import { z } from 'zod';

// zod/no-any-schema — 스키마가 아무것도 검증하지 않는다
export const anySchema = z.any();
```

`packages/eslint-config-nest/tests/fixtures/nest-app/src/user.service.spec.ts`:

```ts
// Nest 테스트 파일의 관용구를 jest 없이 재현한다. 핵심은 언바운드
// 메서드 참조를 단언 함수에 넘기는 패턴으로, unbound-method가 여기서
// 발화하는지 측정하기 위한 것이다. 설계 4.4 참조.
import { UserRepository, UserService } from './idioms';

declare function expectCalled(received: unknown): void;
declare function describeBlock(name: string, body: () => void): void;
declare function itBlock(name: string, body: () => Promise<void>): void;

describeBlock('UserService', () => {
  itBlock('사용자를 조회한다', async () => {
    const service = new UserService(new UserRepository());
    const user = await service.getUser('1');

    // 언바운드 메서드 참조 — jest의 expect(service.getUser) 패턴과 같은 형태
    expectCalled(service.getUser);
    expectCalled(user);
  });
});
```

이 파일이 필요한 이유: 설계 4.4가 테스트 파일 완화를 실측으로 정한다고 했는데, 측정 대상이 없으면 정할 수가 없다. `*.spec.ts`에서 실제로 무엇이 발화하는지 Step 7에서 함께 측정한다.

- [ ] **Step 5: 실패하는 테스트 작성**

`packages/eslint-config-nest/tests/config.test.ts`에 아래를 **추가**한다(Task 1의 describe는 그대로 둔다). 파일 상단 import에 `ESLint`와 node 경로 모듈을 더한다:

```ts
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/index';

const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/nest-app');

/**
 * 픽스처 파일을 실제 ESLint로 린트한다.
 * cwd를 픽스처 루트로 두면 projectService가 픽스처의 tsconfig를 찾는다 —
 * consumer가 프로젝트 루트에서 `eslint .`를 돌리는 상황과 같다.
 */
async function lintFixture(relativePath: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({
    cwd: FIXTURE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const results = await eslint.lintFiles([relativePath]);
  return results[0]?.messages ?? [];
}

describe('런타임 검증', () => {
  it('픽스처를 fatal 오류 없이 린트한다', async () => {
    const messages = await lintFixture('src/idioms.ts');
    expect(messages.filter((m) => m.fatal).map((m) => m.message)).toEqual([]);
  });

  it('await 누락을 no-floating-promises로 잡는다', async () => {
    const messages = await lintFixture('src/violations.ts');
    const ruleIds = messages.map((m) => m.ruleId);
    expect(ruleIds).toContain('@typescript-eslint/no-floating-promises');
  });

  it('zod 스키마 위반을 잡는다', async () => {
    const messages = await lintFixture('src/schema.ts');
    const ruleIds = messages.map((m) => m.ruleId);
    expect(ruleIds).toContain('zod/no-any-schema');
  });
});
```

- [ ] **Step 6: 테스트 실행하고 결과를 기록**

Run: `pnpm test`
Expected: 신규 3개 포함 **72개** 통과.

만약 `zod/no-any-schema`가 아닌 다른 규칙명으로 발화하면, 실제 발화한 `zod/` 규칙명으로 단언을 고치고 리포트에 적는다 — 규칙을 끄거나 픽스처를 무력화하지 말 것.

- [ ] **Step 7: 관용구·테스트 파일의 현재 상태를 측정해 기록**

이것이 Task 3의 입력이다. 아직 단언하지 않고 **측정만** 한다.

측정은 **임시 vitest 테스트**로 한다. node로 `.ts`를 직접 import하면 확장자 없는 상대 import를 해석하지 못해 실패하므로, vitest의 해석기를 빌린다.

`packages/eslint-config-nest/tests/zz-measure-tmp.test.ts`를 만든다:

```ts
import { it } from 'vitest';
import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/index';

const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/nest-app');

it('관용구·테스트 파일 발화 규칙 측정', async () => {
  const eslint = new ESLint({ cwd: FIXTURE_ROOT, overrideConfigFile: true, overrideConfig: config });
  for (const target of ['src/idioms.ts', 'src/user.service.spec.ts']) {
    const [result] = await eslint.lintFiles([target]);
    const counts: Record<string, number> = {};
    for (const m of result?.messages ?? []) {
      const key = m.ruleId ?? 'fatal';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    console.log(`FINDINGS ${target} ${JSON.stringify(counts)}`);
  }
});
```

Run: `pnpm exec vitest run packages/eslint-config-nest/tests/zz-measure-tmp.test.ts`

출력의 `FINDINGS` 두 줄을 리포트에 그대로 옮긴 뒤 **임시 파일을 삭제한다**. 커밋하지 않는다. 삭제 후 `pnpm test`가 72개로 돌아오는지 확인한다.

- [ ] **Step 8: 린트 확인 후 커밋**

```bash
pnpm lint
```
Expected: 종료 코드 0. 픽스처가 무시 목록에 들어갔으므로 위반 파일이 있어도 통과해야 한다. 실패하면 Step 1의 무시 패턴이 잘못된 것이다.

```bash
git add packages/eslint-config-nest eslint.config.mjs .oxlintrc.json
git commit -F - <<'EOF'
test: Nest 픽스처 기반 런타임 검증 하네스 추가

타입 인식 규칙은 실제 파일과 tsconfig 없이 검증할 수 없다. 디스크에
Nest 형태 픽스처를 두고 실제 ESLint를 돌린다.

픽스처는 @nestjs/* 를 설치하지 않고 데코레이터를 로컬 스텁으로
재현한다. 데코레이터의 출처는 규칙 판정에 영향을 주지 않으므로 무거운
의존성 트리를 끌어올 이유가 없다. 반면 zod는 실제로 설치한다 — 미해결
모듈은 any가 되어 no-unsafe-* 가 무더기로 발화하고 그러면 오탐 가드가
무의미해진다.

픽스처는 의도적으로 규칙을 위반하므로 두 린터의 무시 목록에 모두
추가한다. 픽스처가 커밋되기 때문에 oxlint의 gitignore 존중은 통하지
않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 실측 기반 Nest 관용구 조정

Task 2가 측정한 발화 목록을 근거로, **실제로 오탐한 규칙만** 끈다. 이 태스크가 이 패키지의 실질적 값어치다.

**Files:**
- Modify: `packages/eslint-config-nest/src/index.ts`
- Modify: `packages/eslint-config-nest/tests/config.test.ts`

**Interfaces:**
- Consumes: Task 2의 `lintFixture(relativePath)` 헬퍼와 픽스처들
- Produces: 없음 (config 내용 확정)

**결정 절차 — 설계 4.2를 그대로 따른다. 순서를 건너뛰지 말 것:**

1. Task 2가 기록한 관용구 파일 발화 목록을 본다.
2. 각 규칙에 대해 판단한다 — 이 발화가 **(a) Nest 관용구를 잘못 지적한 오탐**인가, **(b) 픽스처 코드가 실제로 나쁜가**.
3. **(b)면 규칙을 끄지 말고 픽스처를 고친다.** 예: 픽스처가 불필요하게 `async`인데 `require-await`이 맞게 지적했다면 픽스처를 고치는 게 맞다.
4. (a)로 판정된 것만 끈다.
5. 다시 린트해 관용구 파일 에러 0건을 확인한다.

**확인 대상 후보** (발화 여부는 실측으로 확정하며, 이 목록에 없는 규칙이 발화해도 같은 절차로 판단한다): `@typescript-eslint/unbound-method`(메서드 참조 전달), `no-extraneous-class`(데코레이터만 있는 `@Module` 클래스), `parameter-properties`(생성자 파라미터 프로퍼티), `no-unsafe-*`(데코레이터 메타데이터), `require-await`, `no-empty-function`(빈 생성자).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/eslint-config-nest/tests/config.test.ts`의 `런타임 검증` describe 안에 추가한다:

```ts
  it('Nest 관용구 파일에서 에러가 하나도 없다', async () => {
    // 이 가드가 깨지면 설정 자체를 쓸 수 없다. 생성자 파라미터 프로퍼티,
    // 데코레이터만 있는 빈 모듈 클래스, DI 주입이 모두 깨끗해야 한다.
    const messages = await lintFixture('src/idioms.ts');
    const reported = messages.map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`);
    expect(reported).toEqual([]);
  });

  it('Nest 테스트 파일에서 에러가 하나도 없다', async () => {
    // 설계 4.4. jest의 expect(service.method) 패턴이 unbound-method를
    // 발화시키는데, 이는 테스트 파일의 정당한 관용구다. 완화가 실제로
    // 적용됐는지 여기서 고정한다.
    const messages = await lintFixture('src/user.service.spec.ts');
    const reported = messages.map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`);
    expect(reported).toEqual([]);
  });
```

두 번째 테스트가 필요한 이유: 설계 4.4의 테스트 파일 완화가 실제로 동작하는지 아무것도 검증하지 않으면, 완화 config를 넣었는데 `files` 패턴이 틀려 적용되지 않아도 알 수 없다. 완화를 넣었다면 이 테스트가 그것을 고정하고, 넣지 않기로 했다면 이 테스트가 실패하므로 결정을 강제로 마주하게 된다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — 관용구 파일에서 발화한 규칙들이 배열로 출력된다. 이 출력이 Step 3의 작업 목록이다.

만약 여기서 **이미 통과한다면** 조정할 것이 없다는 뜻이다. 그 경우 Step 3을 건너뛰고 Step 5로 가되, "베이스라인이 Nest 관용구와 충돌하지 않았다"를 리포트에 명시한다 — 조정 없이 넘어간 것이 누락이 아니라 실측 결과임을 남겨야 한다.

- [ ] **Step 3: 오탐으로 판정된 규칙만 끄기**

`packages/eslint-config-nest/src/index.ts`의 배열 끝(`nest/critical` 다음)에 config 객체를 추가한다. 아래는 **형식 예시**이며, 실제 규칙 목록은 Step 2의 출력과 결정 절차로 정한다:

```ts
  {
    // Nest 관용구와 충돌하는 규칙. 각 항목은 픽스처 실측으로 확인했으며,
    // 어떤 관용구 때문인지 주석으로 남긴다. 설계 4.2 참조.
    name: 'nest/idioms',
    files: ['**/*.ts'],
    rules: {
      // 예시 형식 — 실제 항목은 실측 결과로 채운다:
      // '@typescript-eslint/no-extraneous-class': 'off',
      //   ↑ @Module({}) export class AppModule {} 은 Nest 모듈의 표준 형태다
    },
  },
```

**규칙마다 반드시 어떤 Nest 관용구 때문인지 주석을 남긴다.** 주석 없는 off는 6개월 뒤 아무도 되돌릴 수 없다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (72개 + 신규 2개 = **74개**)

관용구 파일이 0건이 되었는데 `no-floating-promises`·zod 단언(Task 2)이 여전히 통과하는지 확인한다. 규칙을 과하게 껐다면 그쪽이 먼저 깨진다.

- [ ] **Step 5: 전체 검증**

```bash
pnpm lint
pnpm build
pnpm exec tsc -p packages/eslint-config-nest/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-config-nest/tests/tsconfig.json
```
Expected: 모두 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add packages/eslint-config-nest
git commit -F - <<'EOF'
feat: Nest 관용구와 충돌하는 규칙을 실측 기반으로 조정

픽스처에 베이스라인을 그대로 돌려 실제로 발화한 규칙만 껐다. 끈 항목
마다 어떤 Nest 관용구 때문인지 주석으로 남겼다.

추측으로 규칙을 끄면 잡을 수 있었던 버그를 잃고, 추측으로 남겨두면
설정을 쓸 수 없게 된다. 둘 다 실측으로만 갈린다.

관용구 파일 에러 0건을 테스트로 고정한다. 이 가드가 깨지면 설정 자체를
쓸 수 없다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: README

consumer가 문서만으로 설정할 수 있어야 한다.

**Files:**
- Create: `packages/eslint-config-nest/README.md`

**Interfaces:**
- Consumes: Task 3에서 확정된 규칙 조정 목록
- Produces: 없음 (문서)

- [ ] **Step 1: README 작성**

`packages/eslint-config-nest/README.md`:

````markdown
# eslint-config-nest

NestJS 백엔드용 ESLint 공유 설정 (ESLint 10 flat config 전용).

## 설치

```bash
pnpm add -D eslint-config-nest eslint typescript-eslint eslint-plugin-zod zod
```

peer 4개가 모두 **필수**다. optional은 없다.

| peer | 범위 |
|---|---|
| `eslint` | `^10.0.0` |
| `typescript-eslint` | `^8.0.0` |
| `eslint-plugin-zod` | `^4.0.0` |
| `zod` | `^4.0.0` |

## 사용

```js
// eslint.config.js
import nest from 'eslint-config-nest';

export default [...nest];
```

설정은 flat config **배열**이므로 스프레드(`...`)로 편다.

## 요구 사항: tsconfig

타입 인식 규칙을 쓰므로 프로젝트에 `tsconfig.json`이 있어야 한다. 설정이 `parserOptions.projectService: true`를 켜며, `tsconfigRootDir`는 typescript-eslint의 기본값(`process.cwd()`)을 쓴다 — 프로젝트 루트에서 `eslint .`를 실행하면 그대로 동작한다.

루트가 아닌 위치에서 실행한다면 직접 지정한다:

```js
import nest from 'eslint-config-nest';

export default [
  ...nest,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
];
```

## 무엇을 켜는가

- **`typescript-eslint` 타입 인식 베이스라인** (`recommendedTypeChecked`)
- **Nest 치명 규칙 3종** — `no-floating-promises`, `no-misused-promises`, `require-await`. Nest는 서비스·리포지토리 호출이 전부 `Promise`라 `await` 하나를 빠뜨리면 에러가 조용히 삼켜지고 트랜잭션 경계가 어긋난다. 컴파일은 통과하므로 타입 체커도 잡지 못한다.
- **`eslint-plugin-zod` recommended** — 30개 규칙. `no-any-schema`, `no-optional-and-default-together`, `require-error-message` 등이 zod DTO의 실수를 잡는다.

## 무엇을 왜 껐는가

Nest 관용구와 충돌하는 규칙을 껐다. 각 항목은 실제 Nest 형태 코드에 린트를 돌려 확인한 것이며, 추측으로 끈 것이 없다. 목록과 사유는 `src/index.ts`의 해당 config 블록 주석에 있다.

### 검증 범위의 한계

"프로덕션 코드 관용구는 베이스라인과 충돌하지 않았다"는 결론의 범위는 다음과 같다:

- 대상은 **베이스라인이 실제로 켜는 규칙**뿐이다. `no-extraneous-class`·`parameter-properties`·`no-empty-function`은 `recommendedTypeChecked`에 포함되지 않으므로 애초에 발화할 수 없었고, 따라서 "발화하지 않았다"가 이들에 대해 아무것도 증명하지 않는다.
- `no-unsafe-*` 계열은 검증 픽스처가 `any`나 느슨한 요청 바디 타입을 노출하지 않아 **실질적으로 시험되지 않았다.** 실제 프로젝트에서 `@Body()` DTO를 느슨하게 다루면 이 계열이 발화할 수 있다.

즉 이 결론은 "NestJS와 완전히 호환됨을 증명했다"가 아니라 "검증한 범위 안에서는 조정할 것이 없었다"이다. 위 위험군을 노출하는 시나리오를 만나면 재평가가 필요하다.

## 검증 라이브러리는 zod다

`class-validator`는 지원하지 않는다. `@darraghor/eslint-plugin-nestjs-typed`를 포함하지 않는 이유이기도 하다 — 그 플러그인의 가치는 대부분 class-validator 데코레이터 DTO 규칙이라 zod 스택에서는 발화할 대상이 없고, `class-validator`를 필수 peer로 끌어온다.

## ESLint 9는 지원하지 않는다

`peerDependencies`가 `^10.0.0`만 선언한다. v9에서 검증하지 않았기 때문이며, 검증하지 않은 범위를 지원한다고 주장하지 않는다.
````

- [ ] **Step 2: 문서와 실제 동작이 일치하는지 확인**

README가 주장하는 것을 실제로 확인한다:

```bash
node -e "
import('./packages/eslint-config-nest/dist/index.js').then(({ default: config }) => {
  const rules = Object.assign({}, ...config.map((c) => c.rules ?? {}));
  console.log('config 개수        =', config.length);
  console.log('floating-promises  =', rules['@typescript-eslint/no-floating-promises']);
  console.log('zod 규칙 수        =', Object.keys(rules).filter((r) => r.startsWith('zod/')).length);
  console.log('off로 끈 규칙 수   =', Object.values(rules).filter((v) => v === 'off' || v === 0).length);
});
"
```
Expected: `floating-promises`는 `error`, zod 규칙 수는 `30`. config 개수와 off 개수는 Task 3 결과에 따라 달라지므로 리포트에 실제 값을 적는다.

`dist/`가 최신이 아니면 먼저 `pnpm build`를 돌린다.

- [ ] **Step 3: 커밋**

```bash
git add packages/eslint-config-nest/README.md
git commit -F - <<'EOF'
docs: eslint-config-nest README 추가

설치·사용법·tsconfig 요구사항과, 무엇을 켜고 무엇을 왜 껐는지를
적는다. zod 전용이라는 점과 ESLint 9를 지원하지 않는 이유도 명시한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## 완료 조건

```bash
pnpm lint     # oxlint && eslint . — 종료 코드 0
pnpm test     # 74개 통과
pnpm build    # 두 패키지 모두 빌드
pnpm exec tsc -p packages/eslint-config-nest/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-config-nest/tests/tsconfig.json
```

작업 종료 후 CLAUDE.md 규칙에 따라 `work-log.md`에 기록을 추가하고 memory를 갱신한다.

## 스펙 대비 커버리지

| 스펙 섹션 | 담당 태스크 |
|---|---|
| 1 범위 — 새 패키지, 단일 export | Task 1 |
| 1 범위 — 저장소 자체 린트 설정 수정 | Task 2 Step 1 |
| 2 FSD 규칙 미포함 | Task 1 (애초에 의존하지 않음) |
| 3.1 `@darraghor` 제외 | Task 1 (도입하지 않음), Task 4 (README에 사유) |
| 3.2 `eslint-plugin-zod` 채택 | Task 1 |
| 4.1 단일 export, zod 필수 peer | Task 1 Step 1 |
| 4.2 끄는 것은 실측으로 결정 | Task 3 (결정 절차 포함) |
| 4.3 Nest 치명 규칙 3종 명시 | Task 1 Step 6 |
| 4.4 테스트 파일 완화 | Task 2 (`*.spec.ts` 픽스처 + 측정), Task 3 (같은 결정 절차로 처리). 발화가 없으면 완화 config를 만들지 않고 그 사실을 리포트에 남긴다 |
| 5 패키지 매니페스트 | Task 1 Step 1·2·3 |
| 6 타입 인식 배선 | Task 1 Step 6, Task 4 (README) |
| 7 픽스처 테스트 전략 4개 항목 | Task 2 (3개), Task 3 (오탐 가드) |
| 8 문서 | Task 4 |
