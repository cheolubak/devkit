# devkit-cli 게시 가능화 설계

**날짜**: 2026-08-05
**상태**: 승인됨
**선행**: [레지스트리 설치 전환](2026-08-05-registry-install-design.md)

## 1. 문제

`@cheolubak/devkit-cli`는 `private: true`라 게시되지 않는다. 쓰려면 저장소를
클론하고 `pnpm install && pnpm build`를 해야 한다. 설정 패키지 6개는
`pnpm add -D`로 받는데 CLI만 저장소 관리를 요구하는 비대칭이 있다.

목표는 `pnpm dlx @cheolubak/devkit-cli create my-api --type nest` 한 줄로
쓸 수 있게 하는 것이다.

## 2. 실측 — 막고 있는 것은 셋뿐이다

레지스트리 전환 당시 "`findToolkitRoot`가 `pnpm-workspace.yaml`을 못 찾아 첫
줄에서 죽으므로 게시해도 쓸 수 없다"고 판단해 `private: true`로 돌렸다. 그
판단의 전제를 다시 확인한 결과, **템플릿 경로는 이미 게시본을 지원하고
있었다.**

- `templatesRoot()`(`src/ops/copy-overlay.ts:27`)가 **번들 레이아웃과 소스
  레이아웃을 이미 구분한다** — `dist/../templates`를 먼저 보고 없으면
  `../../templates`를 본다.
- `package.json`의 `files`가 이미 `["dist", "templates"]`이고 `bin` 필드도 있다.
- `pnpm pack`으로 실제 tarball을 만들어 확인했다: **32개 파일, `dist/` +
  `templates/` 전체 포함, `src/` 없음.** `_npmrc`·`_gitignore`(npm이 dot-file을
  거르므로 밑줄 이름으로 저장)와 `templates/**/.claude/`·`.github/`까지 정상
  포함된다.
- `devkitVersion()`은 `package.json`을 위로 찾아 올라가므로 게시본에서도
  패키지 루트를 정확히 찾는다.

따라서 실제 장애물은 셋이다.

### 2.1 `assertDistFresh`가 게시본에서 크래시한다

`src/bin.ts:53`의 `assertDistFresh`는 `newestMtime(join(pkgDir, 'src'))`를
부른다. tarball에 `src`가 없으므로 `readdirSync`가 **ENOENT로 던진다**. 현재
조기 반환 조건은 `dist/bin.js` 부재뿐이라 이 경로를 막지 못한다.

### 2.2 `findToolkitRoot`가 게시본에서 틀린 답을 내거나 던진다

`node_modules/@cheolubak/devkit-cli`에서 위로 올라가며 `pnpm-workspace.yaml`을
찾는다. 두 결과 모두 잘못이다.

- **소비자가 pnpm 모노레포면 소비자의 워크스페이스 루트를 찾는다.** 그러면
  `toolkitRoot`가 소비자 루트가 되고, 사용자가 그 루트에서 `devbak update`를
  돌릴 때 `runUpdate`의 자기보호 가드(`targetDir === toolkitRoot`,
  `src/update/index.ts:36`)가 **정당한 사용을 막는다.** 조용한 오작동이 아니라
  틀린 거부다.
- `pnpm dlx`로 실행하면 pnpm 스토어 경로에 놓여 못 찾고 던진다.

`toolkitRoot`의 실사용처는 이 가드 하나뿐이다(`Ctx`에 실려 다니지만 템플릿
경로에는 쓰이지 않는다).

### 2.3 `private: true`

## 3. 결정

### 3.1 레지스트리는 GitHub Packages

설정 패키지 6개와 같은 곳에 올린다. 결과적으로 소비자는 CLI를 받기 전에
`@cheolubak` 스코프 설정과 토큰이 있어야 한다 — GitHub Packages는 공개
패키지도 익명 접근을 허용하지 않기 때문이다.

npm 공개 레지스트리에 올리면 `pnpm dlx`가 토큰 없이 되지만, npmjs에서
`@cheolubak` 스코프를 새로 확보해야 하고 저장소가 두 레지스트리에 걸친다.
**생성물은 어차피 GitHub Packages에서 설정 패키지를 받으므로 토큰이
필요하다** — CLI 실행 문턱만 낮아지고 전체 문턱은 그대로다. 이득이 비용보다
작다고 판단했다.

바뀌는 것은 **"클론 + 빌드 + 저장소 관리" → "`~/.npmrc` 2줄 + 토큰"** 이다.

### 3.2 레이아웃을 한 곳에서 판별한다

`templatesRoot()`가 이미 하는 구분을 공용 함수로 올린다.

```ts
export type Layout = 'source' | 'bundled';
export function packageLayout(pkgDir: string): Layout;
```

**판별 기준은 `pkgDir/src`의 존재다.** `templates` 위치로 판별하지 않는다 —
`assertDistFresh`가 보는 것이 `src`이므로, 두 곳이 서로 다른 근거를 쓰면
갈라진다.

| | `source` (저장소) | `bundled` (게시본) |
| --- | --- | --- |
| 판별 | `pkgDir/src` 존재 | 없음 |
| `assertDistFresh` | **그대로 검사** | 건너뛴다 |
| `toolkitRoot` | `findToolkitRoot(pkgDir)` | **`null`** |
| 자기보호 가드 | 작동 | 비활성 |
| `templatesRoot()` | `../../templates` | `../templates` |

`bundled`에서 `assertDistFresh`를 건너뛰는 것은 방어를 포기하는 게 아니다.
그 방어는 "빌드를 잊고 옛 `dist`로 실행하는 것"을 막는데, 게시 경로에서는
`prepublishOnly: pnpm build`가 tarball을 만들 때 이미 보장한다. 게시본의
`dist`는 그 버전에 얼어붙어 있어 낡을 수 없다.

`Ctx.toolkitRoot`의 타입을 `string | null`로 넓히고, 가드를
`toolkitRoot !== null && targetDir === toolkitRoot`로 바꾼다. **`null`을
"검사 생략"으로 조용히 넘기는 것이 아니라, 게시본에는 툴킷 저장소라는 개념
자체가 없다는 사실을 타입으로 표현하는 것이다.**

### 3.3 버전 관문의 기준을 "선언되는 것"으로 좁힌다

`tests/registry-version.test.ts`의 대상 집합을 **"`private`이 아닌 전부"**에서
**"레시피가 `registryDeps`로 실제 선언하는 이름"**으로 바꾼다.

| 테스트 | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| 존재 검사 | 선언된 이름 ⊆ 게시 패키지 | 그대로 |
| 버전 검사 | 게시 패키지 전부가 범위 만족 | **선언된 이름의** `version`이 범위 만족 |

이유는 둘이다.

1. **`devkit-cli`가 자동으로 빠진다.** 어떤 레시피도 `registryDeps`로 CLI를
   선언하지 않는다. 예외 목록을 손으로 관리하지 않아도 된다.
2. **관문이 원래 검사하려던 명제와 정확히 일치한다** — "생성물이 선언한
   범위가 실제 게시본을 가리키는가". CLI는 아무도 의존으로 선언하지 않고
   사람이 `pnpm dlx`로 부르는 도구라 이 명제의 대상이 아니다.

`devkit-cli`는 관문에서 빠질 뿐 여전히 `0.1.0`이다. 독립 버전 체계로
분리하지 않는다.

### 3.4 pack 기반 e2e 1건

게시본 경로는 코드가 실제로 갈라지는 지점이 있으므로(번들 레이아웃, `src`
부재, `toolkitRoot` 없음) 검증이 필요하다. 이번 레지스트리 전환에서 얻은
교훈이 정확히 이것이다 — **`link:`가 감춘 결함은 실제 설치 경로를 밟는 e2e만
잡았다.**

`packages/devkit-cli/tests/e2e/packed.e2e.test.ts`를 신설한다.

1. `pnpm pack`으로 tarball 생성 → `mkdtempSync(tmpdir())`에 풀기
2. 풀린 `dist/bin.js`로 `create <name> --type nest --no-verify` 실행
   (cwd도 임시 디렉토리)
3. 단언: 생성 성공, `package.json`이 `@cheolubak/*`를 `^0.1.0`으로 선언,
   `.npmrc` 존재

`--no-verify`로 lint·build는 건너뛰되 `pnpm install`은 그대로 한다 — 템플릿
해석과 레지스트리 설치가 실제로 되는지가 이 테스트의 존재 이유다.
`pnpm pack`은 `files` 화이트리스트를 그대로 적용하므로 "템플릿이 tarball에
빠졌다" 같은 것도 함께 잡힌다.

임시 디렉토리를 쓰는 것은 의도다. 툴킷 워크스페이스 밖이라
`pnpm-workspace.yaml` 범위 문제가 없고, 사용자의 개발 디렉토리도 오염시키지
않는다. 기존 e2e가 `PARENT`(툴킷의 부모)에 만드는 것과 다르다.

전체 e2e 11개를 양쪽 경로로 돌리지 않는다 — 대부분 중복이고 실행 시간이
5분을 넘는다.

### 3.5 게시

`private: true`를 제거하고 `publishConfig`(`access: public`,
`registry: https://npm.pkg.github.com`)를 나머지 6개와 동일하게 넣는다.
`0.1.0`으로 게시한다 — 한 번도 올라간 적이 없어 비어 있다.

루트 `package.json`의 `publish:packages` 스크립트에서
`--filter '!@cheolubak/devkit-cli'`를 걷어낸다.

## 4. 문서

`private: true`를 전제로 쓴 서술이 네 곳 있고 전부 갱신 대상이다.

1. **루트 README `## CLI 설치`** — `pnpm dlx` 경로를 주 경로로 올리고, 클론
   방식은 "개발·기여용"으로 내린다. `~/.npmrc`의 스코프 설정과 토큰이
   **CLI를 받는 데도** 필요하다는 것을 명시한다.
2. **루트 README 패키지 표와 빌드 문단** — "`devkit-cli`는 `private: true`라
   게시되지 않고 저장소에서 직접 실행되므로, 이 검사가 유일한 방어선이다"가
   거짓이 된다. 게시 경로는 `prepublishOnly`가 지킨다.
3. **`packages/devkit-cli/README.md` 첫 문단** — "이 패키지는 게시하지
   않는다".
4. **루트 README 트러블슈팅 표** — `툴킷 저장소 루트를 찾지 못했습니다`
   항목. 게시본에서는 그 에러가 더는 나지 않는다.

## 5. 완료 기준

1. `pnpm pack` → 임시 디렉토리에서 `create --type nest --no-verify`가
   성공한다(pack e2e가 이것을 검증한다).
2. 저장소 경로(`pnpm devbak`)가 **그대로 동작한다** — 기존 e2e 11개 통과.
3. `assertDistFresh`가 저장소에서는 여전히 낡은 `dist`를 막는다(단위 테스트로
   양쪽 레이아웃을 고정한다).
4. 소비자가 pnpm 모노레포 루트에서 `devbak update`를 돌릴 때 자기보호 가드가
   오작동하지 않는다(`toolkitRoot === null` 단위 테스트).
5. `registry-version.test.ts`가 `devkit-cli`를 검사 대상에서 제외하고, 여전히
   드리프트를 문다(값 주입으로 실증).
6. `@cheolubak/devkit-cli@0.1.0`이 게시되고 `pnpm dlx`로 실행된다.
7. 문서 네 곳이 갱신된다.
8. 기준선 유지: `pnpm test`·`pnpm typecheck` 7/7·`pnpm lint:ox` 에러 0·
   `pnpm lint:es` 8/8.

## 6. 범위 밖

- npm 공개 레지스트리 게시
- `devkit-cli`의 독립 버전 체계
- 전체 e2e의 양방향 실행
- `vitest-config` 선언을 `types/`로 옮기는 shadowing 해소(별도 follow-up)
- README의 게시(생산) 절차 문서화(별도 follow-up)
