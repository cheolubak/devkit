# NestJS / Node 린팅

NestJS(및 일반 Node 서버) 프로젝트를 Flat Config로 린팅한다. 서버 코드에서는 타입 인식 규칙, 특히 `no-floating-promises`가 실무 버그를 크게 줄여준다. NestJS는 데코레이터를 광범위하게 쓰므로 파서 설정에 주의한다.

## 설치

```bash
pnpm add -D eslint typescript-eslint @eslint/js \
  eslint-plugin-jest eslint-config-prettier
```

## NestJS 기본 Flat Config

NestJS는 `@Injectable()`, `@Controller()` 같은 데코레이터를 쓰므로 `tsconfig.json`에 `"experimentalDecorators": true`, `"emitDecoratorMetadata": true`가 켜져 있어야 한다(Nest CLI 기본값). ESLint는 타입 인식 파서가 이 tsconfig를 읽으므로 별도 파서 옵션은 필요 없다.

```js
// eslint.config.mjs
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 서버 필수: 버려진 Promise 방지 (아래 설명)
      '@typescript-eslint/no-floating-promises': 'error',
      // 데코레이터 메타데이터 때문에 생기는 오탐 완화
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  eslintConfigPrettier,
);
```

`globals`는 `pnpm add -D globals`로 설치한다. `globals.node`로 `process`·`Buffer` 등을 인식시킨다.

## 서버에 유용한 타입 인식 규칙

### no-floating-promises — NestJS async 핸들러의 핵심

컨트롤러·서비스·이벤트 핸들러에서 `await` 없이 Promise를 버리면 에러가 조용히 사라지고 요청 흐름이 어긋난다. 서버에서 가장 자주 실수하는 지점이라 `error`로 강제한다.

```ts
@Injectable()
export class OrderService {
  async placeOrder() { /* ... */ }
}

@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  create() {
    this.orders.placeOrder(); // ❌ no-floating-promises: await 누락 → 실패해도 200 반환
    return { ok: true };
  }

  @Post('v2')
  async createV2() {
    await this.orders.placeOrder(); // ✅
    return { ok: true };
  }
}
```

의도적으로 기다리지 않을 땐 `void`로 명시한다.

```ts
void this.analytics.track('order_created'); // ✅ 명시적 fire-and-forget
```

### no-misused-promises

`async` 함수를 동기 콜백/조건 자리에 넘기는 실수를 잡는다. 미들웨어·이벤트 리스너에서 흔하다.

```ts
if (this.userService.exists(id)) { /* ... */ } // ❌ Promise는 항상 truthy
if (await this.userService.exists(id)) { /* ... */ } // ✅
```

### no-unsafe-* — any 오염 차단

`no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`은 `any`가 타입 시스템을 뚫고 퍼지는 것을 막는다. 외부 라이브러리·`req.body` 등에서 자주 발생한다. DTO + ValidationPipe로 입력을 좁히면(→ nestjs-validation 스킬) 대부분 해소된다. 점진 도입 시 임시로 `warn`:

```js
{
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
  },
}
```

## Jest 테스트 파일 override

`eslint-plugin-jest`의 `flat/recommended` 프리셋을 테스트 파일에만 적용한다. `files`로 스코프를 한정해 프로덕션 코드에는 영향이 없게 한다.

```js
import jest from 'eslint-plugin-jest';

export default tseslint.config(
  // ...위 기본 설정...
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // 테스트에서는 unbound-method 오탐이 잦아 완화
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error',
    },
  },
  eslintConfigPrettier, // 항상 마지막
);
```

`eslint-plugin-jest`는 `expect` 누락(`expect-expect`), 비활성 테스트(`no-disabled-tests`), 포커스 테스트(`no-focused-tests`) 등을 잡아 CI에 `.only`가 섞여 들어가는 사고를 막는다. Nest 테스트 작성 패턴 자체는 nestjs-testing 스킬을 참조한다.

## package.json 스크립트

```jsonc
{
  "scripts": {
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings 0"
  }
}
```

Nest CLI 기본 스크립트는 `--fix`를 포함하지만, CI에서는 자동 수정 없이 검사만 하는 `lint:check`를 별도로 둔다.
