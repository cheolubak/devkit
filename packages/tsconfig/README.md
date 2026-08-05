# @cheolubak/tsconfig

개인 프로젝트 공용 TypeScript 설정 프리셋. **빌드가 없다** — JSON 파일 4개가 전부다.

## 프리셋

| 서브패스 | 용도 |
| --- | --- |
| `@cheolubak/tsconfig/base` | 모든 프리셋의 공통 기반값 (ES2022, strict, `noUncheckedIndexedAccess` 등). 단독으로 extends하는 경우는 드물다 |
| `@cheolubak/tsconfig/nest` | NestJS 백엔드. `module: nodenext` + 데코레이터 지원. `base`를 extends하지 않는다 (아래 참고) |
| `@cheolubak/tsconfig/next` | Next.js 프론트엔드. `base`를 extends하고 DOM lib·JSX·noEmit을 추가한다 |
| `@cheolubak/tsconfig/lib` | 순수 TypeScript 라이브러리. `base`를 extends한다 |

## 사용법

소비자 `tsconfig.json`에서 서브패스로 참조한다.

```jsonc
{
  "extends": "@cheolubak/tsconfig/nest",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

소비자 `package.json`에는 `link:` 의존으로 추가한다.

```jsonc
{
  "devDependencies": {
    "@cheolubak/tsconfig": "link:../eslint/packages/tsconfig",
    "typescript": "^5.6.0"
  }
}
```

`outDir`/`rootDir` 등 프로젝트별 경로 옵션은 프리셋에 두지 않는다 — 소비자 프로젝트 위치에 따라 값이 달라야 하고, 공유 설정 파일 안에 상대 경로로 박아두면 그 경로는 설정 파일 자신의 위치를 기준으로 해석돼(소비자 위치 기준이 아니다) 소비자마다 깨진다. 소비자가 자신의 tsconfig에서 직접 지정한다.

같은 이유로 **프리셋은 `exclude`를 두지 않는다.** `extends`로 상속된 상대 경로는 프리셋 파일 위치 기준으로 해석되어 소비자를 보호하지 못하기 때문이다(예: `"exclude": ["dist"]`를 프리셋에 두면 그건 `packages/tsconfig/dist`를 가리키지, 소비자의 `dist`를 가리키지 않는다). 소비자는 자신의 `tsconfig.json`에 `include`를 직접 지정하라.

## 왜 `nest.json`은 `base.json`을 extends하지 않는가

NestJS는 `module`/`moduleResolution`을 `nodenext`로, 데코레이터 관련 옵션(`emitDecoratorMetadata`, `experimentalDecorators`)을 요구한다. 이는 `base.json`의 `module: ESNext` / `moduleResolution: Bundler`와 근본적으로 다른 축이라, extends를 강제하면 상속받은 값의 절반 이상을 다시 덮어써야 한다. 오히려 독립 파일로 두는 편이 명확하다.

## 왜 빌드가 없는가

JSON이므로 트랜스파일할 것이 없다. `link:` 의존은 라이프사이클 스크립트를 실행하지 않으므로, 빌드가 필요한 패키지는 `dist`가 낡으면 소비자가 조용히 옛 설정을 쓰게 된다. 이 패키지는 그 문제를 아예 겪지 않는다.
