# `@devbak/*` → `@cheolubak/*` 레지스트리 설치 전환 설계 문서

- 작성일: 2026-08-05
- 브랜치: `feature/registry-install`
- 선행 문서: `2026-08-01-devkit-template-design.md`(이하 "템플릿 설계"), `2026-08-02-devkit-update-design.md`(이하 "update 설계")
- 상태: 설계 확정

---

## 0. 요약

설정 패키지를 **`link:` 상대경로**로 소비하던 것을 **GitHub Packages 레지스트리 설치**로 바꾼다. 그러면서 스코프를 `@devbak/*`에서 `@cheolubak/*`로 개명한다.

| | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| 스코프 | `@devbak/*` | `@cheolubak/*` |
| 소비 선언 | `link:../eslint/packages/tsconfig` | `^0.1.0` |
| 레지스트리 | 없음(로컬 symlink) | `https://npm.pkg.github.com` |
| 생성 위치 | 툴킷의 **형제 디렉토리 강제** | 임의 경로 |
| 소비자 설정 | 없음 | `.npmrc` + `GITHUB_TOKEN` |

### 0.1 이 전환이 뽑는 것은 의존 선언 한 줄이 아니다

`link:`는 이 저장소의 여러 결정을 낳은 **뿌리**다. 뽑으면 딸려 나온다.

- **위치 제약이 근거를 잃는다.** `create`가 형제 디렉토리에만 만든 이유가 "상대경로가 깨지므로"였다(템플릿 설계). 레지스트리 설치에는 그 이유가 없다.
- **`catalog:` 금지가 풀린다.** `pnpm catalog:`가 `link:`를 거부해(`ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC`, 템플릿 설계 2.3절 실측) 모노레포의 각 `package.json`이 `@devbak/*`를 직접 선언해야 했다. 버전 범위는 catalog에 넣을 수 있다.
- **`linkSpec()`의 깊이 계산이 통째로 사라진다.** 루트와 `apps/web`의 깊이가 달라 상대경로를 **계산**해야 했던 문제 자체가 없어진다.

### 0.2 대신 새로 지는 것

**GitHub Packages는 공개 패키지도 설치에 토큰을 요구한다.** GitHub 공식 문서:

> You need an access token to publish, install, and delete private, internal, and **public** packages.

그래서 생성되는 모든 프로젝트가 `.npmrc`를 갖고, 개발자는 `GITHUB_TOKEN`을 환경에 둬야 한다. **토큰이 없으면 `pnpm install`부터 실패한다.** 이것이 이 전환의 실질 비용이며, e2e 테스트에도 그대로 적용된다(5.2절).

---

## 1. 실측 (2026-08-05)

### 1.1 게시 준비는 이미 돼 있고, 게시는 한 번도 안 됐다

7개 패키지 전부 `private: false`, `publishConfig: { access: "public" }`, `files` 화이트리스트, 버전 `0.1.0`을 갖췄다. 그런데 npm 레지스트리 조회는 404다.

즉 이 저장소는 처음부터 게시를 염두에 뒀고, `link:`는 **게시 전까지의 임시 소비 방식**이었다. 이 작업은 방향 전환이라기보다 원래 의도로 가는 것이다.

### 1.2 GitHub Packages는 스코프가 저장소 소유자와 일치해야 한다

저장소는 `cheolubak/devkit`이고 스코프는 `@devbak`이다. 어긋난다.

`devbak`이라는 이름은 **이미 존재하는 User 계정**(`DevBak`)이라 그 이름의 org를 새로 만들 수도 없다. `gh api users/devbak` → `DevBak (User)`.

**해소는 스코프를 `@cheolubak/*`로 개명하는 것이다**(사용자 결정). 저장소를 옮기는 대안은 계정 소유 관계에 의존하고, npm 공개 레지스트리로 트는 대안은 사용자가 GitHub Packages를 택했으므로 배제한다.

### 1.3 `@devbak` 참조 402건 중 246건은 과거 기록이다

| 분류 | 건수 | 파일 |
| --- | --- | --- |
| 코드·템플릿·테스트·현행 README | **77** | 37 |
| 과거 기록(`docs/superpowers/**`, `work-log.md`) | 246 | 11 |

**과거 기록은 개명하지 않는다.** 그 문서들은 *그때 무엇을 결정했는가*를 적은 것이고 당시 이름은 `@devbak`이었다. 일괄 치환하면 역사를 다시 쓰는 것이 되고, 다음 사람이 "언제 왜 바뀌었는지"를 영영 알 수 없다. 앞선 turbo 작업에서 `362 → 363` 정정 때 **중간 체크포인트의 362를 그대로 둔** 판단과 같은 규율이다.

### 1.4 `devkit-cli`는 게시해도 쓸 수 없다

`findToolkitRoot`가 `pnpm-workspace.yaml`을 위로 찾아 올라가고 **못 찾으면 던진다**(cwd 폴백을 일부러 막았다 — 템플릿 설계 6.1절). `pnpm dlx @cheolubak/devkit-cli`로 실행하면 그런 파일이 없어 **첫 줄에서 죽는다.**

게시해도 쓸 수 없는 것을 게시하지 않는다.

---

## 2. 범위 결정

### 2.1 확정된 결정

| # | 결정 | 근거 |
| --- | --- | --- |
| 1 | 스코프를 **`@cheolubak/*`**로 개명 | 1.2절 — GitHub Packages의 소유자 일치 요구 |
| 2 | **CLI 명령 이름 `devbak`은 유지** | 스코프는 배포 네임스페이스, 명령 이름은 도구의 이름이다. 함께 바꿀 이유가 없고 루트 스크립트·문서·근육기억이 흔들린다 |
| 3 | **설정 패키지 6개만 게시**, `devkit-cli`는 `private: true` | 1.4절 |
| 4 | **락스텝 단일 버전**(전부 `0.1.0`) | 1인 저장소이고 패키지 간 의존이 0이라 버전을 따로 굴릴 이유가 없다. changesets는 도구 하나를 더 들인다 |
| 5 | **위치 제약 제거** — `create`도 임의 경로를 받는다 | 근거가 사라진 제약을 남기면 다음 사람이 이유를 찾다 못 찾는다 |
| 6 | **과거 기록은 개명하지 않는다** | 1.3절 |
| 7 | **게시는 마지막 태스크로 분리하고 실행 직전 확인받는다** | 6절 |

### 2.2 비범위

- **`catalog:` 활용** — 금지가 풀리지만 지금 당장 쓸 이유가 없다. 필요해지면 그때.
- **버전 범프·릴리스 자동화** — `0.1.0` 최초 게시만 한다. CI 파이프라인은 별도.
- **npm 공개 레지스트리 동시 게시** — 사용자가 GitHub Packages를 택했다.
- **`devkit-cli`를 dlx로 실행 가능하게 만드는 것** — `findToolkitRoot` 재설계가 필요하다. 별도 작업.

---

## 3. 스코프 개명

### 3.1 대상

`packages/*/package.json`의 `name`, 그리고 그것을 참조하는 **코드·템플릿·테스트·현행 README** 77건.

특히 놓치기 쉬운 곳:

| 자리 | 형태 |
| --- | --- |
| 템플릿 `tsconfig.json` | `"extends": "@devbak/tsconfig/nest"` |
| 템플릿 `eslint.config.mjs` | `import ... from '@devbak/eslint-plugin-fsd/next'` |
| 템플릿 `package.json` | `"prettier": "@devbak/prettier-config"` |
| 템플릿 `jest.config.js`·`vitest.config.ts` | `require`/`import` 경로 |
| 레시피 `linkDeps([...])` | 패키지 **짧은 이름** 목록(`'tsconfig'` 등) — 스코프가 코드에 박혀 있다 |
| 레시피 `mergeJson` 패치 | `devDependencies` 키 |
| 스냅샷 | `describe()` 직렬화 결과 |

### 3.2 손대지 않는 것

`docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `work-log.md`의 **기존 항목**. 1.3절.

이번 작업의 `work-log` **새 항목**에는 새 이름을 쓴다 — 그것이 이번에 일어난 일이기 때문이다.

---

## 4. 게시

### 4.1 각 패키지에 필요한 필드

```jsonc
"publishConfig": {
  "access": "public",
  "registry": "https://npm.pkg.github.com"
},
"repository": {
  "type": "git",
  "url": "git+https://github.com/cheolubak/devkit.git",
  "directory": "packages/<pkg>"
}
```

**`repository`가 요구다.** GitHub Packages는 이 필드로 저장소를 매칭해 패키지를 귀속시킨다. 없으면 게시가 거부되거나 엉뚱한 저장소에 붙는다.

`devkit-cli`는 반대로 `"private": true`를 넣고 `publishConfig`를 지운다.

### 4.2 인증

툴킷 루트의 `.npmrc`(**`.gitignore` 대상**)에 게시용 토큰을 둔다. 토큰은 `gh auth token`으로 얻거나 PAT를 쓴다. **커밋되면 안 된다** — `.gitignore` 등록이 이 태스크의 일부다.

### 4.3 게시 절차

```bash
pnpm build                      # dist가 있는 패키지 최신화
pnpm -r --filter '!@cheolubak/devkit-cli' publish --dry-run
# 무엇이 올라가는지 확인한 뒤에만
pnpm -r --filter '!@cheolubak/devkit-cli' publish
```

`--dry-run`에서 특히 볼 것: **`files` 화이트리스트가 맞는가.** `tsconfig`는 JSON 4개, `prettier-config`는 `index.json`, `jest-config`는 `.js` 2개, `vitest-config`는 `.js` 2개, 빌드가 있는 둘은 `dist`뿐이어야 한다.

---

## 5. 소비 방식

### 5.1 `linkDeps` → `registryDeps`

상대경로 계산이 통째로 사라진다.

```
지금: link:../../../eslint/packages/tsconfig   (깊이마다 다름)
뒤:   ^0.1.0                                   (어디서나 같음)
```

**연산 이름을 바꾸는 것이 요구다.** `linkDeps`라는 이름이 남으면 다음 사람이 symlink를 기대한다. `linkSpec()`·`normalizeToPosix()`는 소비처가 사라지므로 **지운다** — 쓰이지 않는 채 남겨 두지 않는다(그 함수들의 테스트도 함께).

### 5.2 생성물의 `.npmrc`

```
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

템플릿 파일명은 **`_npmrc`**다 — 기존 관용(`_gitignore`·`_prettierignore`)을 따른다. npm이 패키지에서 점 파일을 거르므로 언더스코어로 담고 `copyOverlay`가 점 이름으로 되돌린다.

`${GITHUB_TOKEN}` 확장은 npm·pnpm이 지원한다. **토큰이 없으면 `pnpm install`이 실패하며, 이는 0.2절의 구조적 비용이다.** 생성 완료 메시지에 이 사실을 넣는다.

### 5.3 카테고리 배치

`.npmrc`는 **`deps`** 카테고리다. 레지스트리 접근 설정이므로 의존성과 함께 움직이는 것이 맞다.

부수 효과: `devbak update --only deps`가 **기존 `link:` 프로젝트를 버전 범위로 마이그레이션하는 경로**가 된다. 별도 마이그레이션 도구가 필요 없다.

`categories.ts`의 `FILE_PATTERNS`에 `_?\.?npmrc` → `deps`를 추가한다. 미분류 파일이 있으면 `overlay-coverage.test.ts`가 실패하므로 빠뜨릴 수 없다.

### 5.4 위치 제약 제거

`bin.ts`의 `resolve(dirname(toolkitRoot), name)` 강제를 푼다.

**대상은 cwd 기준으로 해석한다** — `devbak create my-api`를 `~/projects`에서 치면 `~/projects/my-api`가 생긴다. `nest new`·`create-next-app`과 같은 관습이며, 사용자가 "여기에 만들어진다"고 기대하는 자리다.

`update`처럼 "인자 생략 시 cwd"로 두지 않는 이유: `create`의 대상은 **아직 없는 디렉토리**라 cwd 자체를 가리키는 것이 의미가 없다. 이름은 계속 필수다.

기존 안전장치는 그대로 둔다 — **대상이 이미 존재하면 덮어쓰지 않고 던진다.** 임의 경로를 받게 되면서 오히려 더 중요해진다.

**README의 "위치 제약" 절은 삭제한다.**

---

## 6. 게시는 되돌릴 수 없다 — 이 설계의 안전장치

GitHub Packages는 삭제가 제한적이고 **같은 버전 재게시가 안 된다.** 그래서:

1. **게시를 마지막 태스크로 분리한다.** 그 앞의 모든 것이 초록불이어야 도달한다.
2. **`--dry-run`을 먼저** 돌려 무엇이 올라가는지 본다.
3. **실행 직전 사람의 확인을 받는다.** 서브에이전트가 임의로 게시하지 않는다.

---

## 7. 검증

| 층 | 확인 | 비고 |
| --- | --- | --- |
| 1 | 단위·스냅샷 **363개** 통과 | 스코프 개명 후에도 개수 불변 |
| 2 | `pnpm lint:ox`·`pnpm lint:es` 에러 0, `pnpm typecheck` 7/7 | |
| 3 | `pnpm -r publish --dry-run`이 6개만, `files`대로 | 게시 전 마지막 관문 |
| 4 | **실제 게시** 6개 | 사람 확인 후 |
| 5 | 새 디렉토리에서 `devbak create` → `pnpm install` 성공 | 레지스트리에서 실제로 받아지는가 |
| 6 | e2e 3유형 | **`GITHUB_TOKEN` 필요** |

### 7.1 e2e의 새 전제 — 조용히 통과하면 안 된다

지금 e2e는 토큰 없이 돈다(`link:`는 로컬 symlink니까). 전환 후에는 `pnpm install`이 레지스트리를 타므로 **환경변수 없이는 통째로 실패한다.**

**토큰이 없을 때의 동작을 명시적으로 정한다**: 알아볼 수 있는 메시지와 함께 **실패**한다. `--passWithNoTests`류로 조용히 넘어가면 e2e가 있다는 사실이 거짓 안심을 준다 — 이 저장소가 반복해서 막아 온 형태다.

---

## 8. 완료 기준

1. 7개 패키지가 `@cheolubak/*`로 개명되고, 코드·템플릿·테스트·현행 README에 `@devbak` 참조가 **0건**이다.
2. `docs/superpowers/**`와 `work-log.md`의 **기존 항목**은 그대로다(과거 기록 보존).
3. `devkit-cli`가 `private: true`이고 나머지 6개에 `repository`·`publishConfig.registry`가 있다.
4. `linkDeps`가 `registryDeps`로 바뀌었다. `linkSpec`·`normalizeToPosix`와 **그 둘만 검증하던 테스트**가 사라지고, `registryDeps`를 검증하는 테스트가 그 자리를 대신한다(`tests/link-deps.test.ts`는 삭제가 아니라 **대체**다 — 연산은 여전히 존재하고 이름과 산출물만 바뀐다).
5. 생성물이 `.npmrc`를 갖고, `categories.ts`가 그것을 `deps`로 분류한다.
6. 위치 제약이 제거되고 README에서 해당 절이 사라졌다.
7. 6개 패키지가 GitHub Packages에 `0.1.0`으로 게시됐다.
8. 새 디렉토리에서 `devbak create` 후 `pnpm install`이 성공한다.
9. 테스트 363개·lint 에러 0·typecheck 7/7이 유지된다.

---

## 9. 미결 사항 / follow-up

- **`catalog:` 활용** — 금지가 풀렸다. 모노레포 템플릿에서 `@cheolubak/*`를 catalog로 옮길지는 필요해질 때 판단한다.
- **버전 범프 절차** — `0.1.0` 최초 게시만 한다. 다음 릴리스를 어떻게 굴릴지(수동/CI/changesets)는 두 번째 게시가 필요해질 때.
- **`devkit-cli`의 dlx 실행** — `findToolkitRoot`가 워크스페이스 파일에 묶여 있다. 풀려면 템플릿 경로 해석부터 재설계해야 한다.
- **토큰 없는 소비자 경험** — GitHub Packages의 구조적 제약이라 이 저장소가 없앨 수 없다. npm 공개 레지스트리 병행 게시가 유일한 우회이며 지금은 비범위다.
