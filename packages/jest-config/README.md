# @cheolubak/jest-config

NestJS 프로젝트 공용 Jest 설정. **빌드가 없다** — CJS `.js` 파일 2개가 전부다.

## 서브패스

| 서브패스 | 용도 | 출처 |
| --- | --- | --- |
| `@cheolubak/jest-config/nest` | 유닛 테스트(`*.spec.ts`) | `nest new` 산출물의 `package.json` 인라인 `jest` 블록 |
| `@cheolubak/jest-config/nest-e2e` | e2e 테스트(`*.e2e-spec.ts`) | `nest new` 산출물의 `test/jest-e2e.json` |

## 사용법

소비자 `jest.config.js`(유닛)와 `test/jest-e2e.json` 자리에 두는 `jest-e2e.config.js`(e2e)에서 그대로 재노출한다.

```js
// jest.config.js
module.exports = require('@cheolubak/jest-config/nest');
```

```js
// test/jest-e2e.config.js
module.exports = require('@cheolubak/jest-config/nest-e2e');
```

소비자 `package.json`에는 `link:` 의존으로 추가하고, `jest`·`ts-jest`는 peerDependency이므로 소비자가 직접 설치한다.

```jsonc
{
  "devDependencies": {
    "@cheolubak/jest-config": "link:../eslint/packages/jest-config",
    "jest": "^30.0.0",
    "ts-jest": "^29.2.0",
    "@types/jest": "^30.0.0"
  }
}
```

## 왜 `.ts`가 아니라 `.js`(CJS)인가

`nest new`가 만드는 프로젝트는 `package.json`에 `"type"` 필드가 없다 — 즉 `.js`는 CJS로 취급된다. 이것만이라면 `.ts`로 바꿔도 무방해 보이지만, 그러면 안 되는 이유가 따로 있다: `@cheolubak/eslint-config-nest`는 `**/*.{ts,mts,cts}`에 `projectService: true`를 건다. 생성물에 `jest.config.ts`를 두면, 그 파일이 소비자 tsconfig의 `include` 밖에 있는 경우 ESLint가 크래시한다(`eslint-config-nest` 최종 리뷰가 잡은 Critical과 같은 부류). `.js`로 두면 그 설정의 `disableTypeChecked` 스코프(`**/*.{js,mjs,cjs}`)에 들어가 이 문제를 구조적으로 피한다. **다시 `.ts`로 바꾸지 말 것.**

## 경로 옵션(`rootDir`, `coverageDirectory`)은 누구 기준인가

`nest.js`의 `rootDir: 'src'`, `coverageDirectory: '../coverage'` 같은 상대 경로는 이 패키지 파일의 위치가 아니라, **이 객체를 최종적으로 담는 소비자의 `jest.config.js` 위치**를 기준으로 Jest가 해석한다(실측 확인됨). `module.exports = require('@cheolubak/jest-config/nest')` 형태로 그대로 재노출하면, Jest는 그 값을 소비자 설정 파일에 적힌 것처럼 다루기 때문이다. 이는 TypeScript의 `extends`가 상속된 상대 경로를 프리셋 파일 자신의 위치 기준으로 해석하는 것(`@cheolubak/tsconfig` 참고)과는 다른 동작이며, 이 패키지에서는 별도 조치 없이 소비자를 안전하게 보호한다.

## 왜 빌드가 없는가

CJS 순수 객체이므로 트랜스파일할 것이 없다. `link:` 의존은 라이프사이클 스크립트를 실행하지 않으므로, 빌드가 필요한 패키지는 `dist`가 낡으면 소비자가 조용히 옛 설정을 쓰게 된다. 이 패키지는 그 문제를 아예 겪지 않는다.
