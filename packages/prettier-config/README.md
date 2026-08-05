# @cheolubak/prettier-config

개인 프로젝트 공용 Prettier 설정. **빌드가 없다** — `index.json` 한 파일이 전부다.

## 사용법

소비자 `package.json`에 설치와 참조를 함께 넣는다. 루트 README의
[".npmrc·GITHUB_TOKEN"](../../README.md#기존-프로젝트에-붙이기) 안내를 먼저 본다.

```bash
pnpm add -D @cheolubak/prettier-config prettier
```

```jsonc
{
  "prettier": "@cheolubak/prettier-config"
}
```

`.prettierrc` 파일은 삭제한다. 남겨두면 그쪽이 우선해서 공유 설정이 무시된다.

## 담은 값

| 옵션 | 값 | 이유 |
| --- | --- | --- |
| `singleQuote` | `true` | 기존 3개 프로젝트가 전부 이 값이었다 |
| `trailingComma` | `"all"` | 위와 같다. Prettier 3의 기본값과도 같지만 의도를 고정한다 |

## 왜 빌드가 없는가

JSON이므로 트랜스파일할 것이 없다. 이는 부수 효과가 크다 — 게시된 tarball은 게시 시점의 파일을 그대로 얼려 담으므로, 빌드가 필요한 패키지는 `dist`가 낡거나 비어 있으면 그 버전에 그대로 굳는다(같은 버전 재게시는 안 된다). 이 패키지는 빌드 자체가 없어 그 문제를 아예 겪지 않는다.
