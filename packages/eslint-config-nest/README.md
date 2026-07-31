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
