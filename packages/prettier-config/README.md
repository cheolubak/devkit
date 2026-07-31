# @devbak/prettier-config

개인 프로젝트 공용 Prettier 설정. **빌드가 없다** — `index.json` 한 파일이 전부다.

## 사용법

소비자 `package.json`에 링크와 참조를 함께 넣는다.

```jsonc
{
  "prettier": "@devbak/prettier-config",
  "devDependencies": {
    "@devbak/prettier-config": "link:../eslint/packages/prettier-config",
    "prettier": "^3.0.0"
  }
}
```

`.prettierrc` 파일은 삭제한다. 남겨두면 그쪽이 우선해서 공유 설정이 무시된다.

## 담은 값

| 옵션 | 값 | 이유 |
| --- | --- | --- |
| `singleQuote` | `true` | 기존 3개 프로젝트가 전부 이 값이었다 |
| `trailingComma` | `"all"` | 위와 같다. Prettier 3의 기본값과도 같지만 의도를 고정한다 |

## 왜 빌드가 없는가

JSON이므로 트랜스파일할 것이 없다. 이는 부수 효과가 크다 — `link:` 의존은 라이프사이클 스크립트를 실행하지 않으므로, 빌드가 필요한 패키지는 `dist`가 낡으면 소비자가 조용히 옛 설정을 쓰게 된다. 이 패키지는 그 문제를 아예 겪지 않는다.
