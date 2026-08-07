# devbak version 설계

작성일: 2026-08-07

## 1. 배경과 목적

`@cheolubak/devkit-cli`(bin 이름 `devbak`)에는 지금 버전을 물어볼 방법이 없다.
`create`·`update` 두 명령만 있고, 그 외 인자는 전부 `USAGE`를 던진다
(`src/bin.ts:112`).

버전을 못 보면 두 가지 질문에 답할 수 없다.

1. **지금 깔린 CLI가 몇 버전인가** — 전역 설치본이 낡았는지 판단할 근거.
2. **이 프로젝트는 어느 devkit 표준을 따르고 있는가** — `update`를 돌려야
   하는지 판단할 근거.

`devbak version`은 이 둘을 한 번에 답한다.

## 2. 이미 있는 재료

새로 만들 계산 로직은 거의 없다. 필요한 것이 이미 다 있다.

| 재료 | 위치 | 내용 |
| --- | --- | --- |
| `devkitVersion()` | `src/lib/version.ts` | 설치된 CLI 자신의 `package.json` 버전. `packageRoot()`로 위로 걸어 올라가 소스·번들 양쪽 실행 방식을 모두 견딘다 |
| `readMarker()` | `src/lib/marker.ts` | 대상 `package.json`의 `devkit: { type, version }` 마커를 검증하며 읽는다 |
| `packageRoot()` | `src/lib/layout.ts` | `package.json`이 나올 때까지 상위 탐색 |
| `DEVKIT_VERSION_RANGE` | `src/ops/registry-deps.ts` | 소비자에 심는 캐럿 범위(`^0.1.0`) |

`version` 명령은 이들을 **조합**할 뿐 새 버전 계산을 하지 않는다.

## 3. 명령 표면

```
devbak version [path]     # 전체 리포트. path 기본값은 process.cwd()
devbak --version | -v     # CLI 버전 한 줄만
```

`update [path]`가 이미 선택적 경로를 받으므로 그 관습을 그대로 따른다.

플래그 형태를 별도로 두는 이유는 스크립트 용도다. 리포트는 사람이 읽는
형식이라 열 정렬과 섹션이 들어가고, 그것을 `cut`·`awk`로 파싱하게 두면
출력 형식을 영영 못 바꾼다. `--version`이 값 하나만 내는 안정된 계약을
맡고, 리포트는 자유롭게 진화한다.

`USAGE` 문자열에 두 형태를 모두 추가한다.

## 4. 출력 형식

```
$ devbak version
devbak                          0.2.0

. (monorepo)                    0.1.0
  패키지                         선언      설치본
  @cheolubak/eslint-plugin-fsd   ^0.1.0    0.1.1
  @cheolubak/prettier-config     ^0.1.0    0.1.1

apps/web (next)                 0.1.0
  패키지                         선언      설치본
  @cheolubak/eslint-plugin-fsd   ^0.1.0    0.1.1
  @cheolubak/prettier-config     ^0.1.0    0.1.1
  @cheolubak/vitest-config       ^0.1.0    미설치
```

패키지 목록은 하드코딩하지 않는다. 레시피마다 심는 집합이 다르기 때문이다 —
nest는 4개(`eslint-config-nest`·`prettier-config`·`tsconfig`·`jest-config`),
next는 3개(`eslint-plugin-fsd`·`prettier-config`·`vitest-config`), monorepo
루트는 2개(`eslint-plugin-fsd`·`prettier-config`). 대상 `package.json`의
`dependencies`·`devDependencies`에서 `@cheolubak/`로 시작하는 항목을 실제로
찾아 나열한다.

devkit 프로젝트가 아닌 곳:

```
$ devbak version
devbak                          0.2.0
```

**종료 코드는 항상 0이다.** 버전 조회는 진단 명령이고, "여기는 devkit
프로젝트가 아니다"도 정당한 답이지 실패가 아니다.

### 4.1 선언과 설치본을 둘 다 보여주는 이유

소비자 `package.json`에 적히는 값은 구체적 버전이 아니라 고정 캐럿 범위
`^0.1.0`이다(`DEVKIT_VERSION_RANGE`). 0.x에서 `^0.1.0`은 `>=0.1.0 <0.2.0`
이라 패치 선행을 흡수하도록 의도된 값이다.

따라서 선언만 보면 게시 대상 6개가 전부 `^0.1.0`으로 똑같이 보여 실질
정보가 없고, 설치본만 보면 그 값이 어떤 범위에서 나온 것인지 알 수 없다.
두 값을 나란히 두면 범위와 실제 해석 결과의 관계가 한눈에 보인다.

### 4.2 열 정렬 — `padEnd`를 쓰지 않는다

`String.prototype.padEnd`는 **코드포인트**를 센다. 터미널은 **표시 폭**으로
그린다. 한글·CJK 문자는 한 글자가 두 칸을 차지하므로 둘이 어긋난다.

```
'패키지'.padEnd(30)   // 코드포인트 30개, 화면에서는 33칸
```

이 리포트의 헤더 첫 열이 정확히 그 경우다(`패키지`). 헤더만 상수로 보정하는
방법도 있지만, 그러면 나중에 누가 한글 값을 열에 넣는 순간 조용히 깨진다.
`format.ts`에 표시 폭 기준 패딩 헬퍼를 둔다.

```ts
/**
 * 동아시아 전각 문자를 2칸으로 세는 표시 폭.
 *
 * padEnd 는 코드포인트를 세므로 한글이 섞인 열에서 정렬이 밀린다.
 * 전체 유니코드 East Asian Width 표가 필요한 것은 아니다 — 이 출력에
 * 나올 수 있는 것은 한글과 CJK 기호뿐이다.
 */
function displayWidth(text: string): number;

/** displayWidth 기준으로 오른쪽을 공백으로 채운다. */
function padTo(text: string, width: number): string;
```

전각 판정 범위는 이 출력에 실제로 나올 수 있는 것으로 한정한다 — 한글
음절(U+AC00–D7A3), 한글 자모(U+1100–115F), CJK 통합한자·기호
(U+2E80–A4CF), 전각 형태(U+FF00–FF60, U+FFE0–FFE6). 이모지나 결합
문자까지 다루려 들지 않는다. 이 리포트는 그런 문자를 만들지 않으며,
범용 폭 계산기를 만드는 것은 이 명령의 일이 아니다.

## 5. 데이터 모델

```ts
interface DevkitPackage {
  name: string;              // '@cheolubak/tsconfig'
  declared: string;          // '^0.1.0'
  installed: string | null;  // '0.1.1' | null = 미설치
}

interface WorkspaceReport {
  relPath: string;                            // '.' | 'apps/web'
  marker: DevkitMarker | { broken: string };  // broken = 마커가 깨진 이유
  packages: DevkitPackage[];
}

interface VersionReport {
  cli: string;
  workspaces: WorkspaceReport[];  // 빈 배열 = devkit 프로젝트 아님
}
```

`marker`가 유니온인 이유는 6.3절에 있다.

## 6. 모듈 구조

기존 `update/`·`release/`가 명령 단위 폴더인 관습을 따른다.

| 파일 | 책임 |
| --- | --- |
| `src/version/collect.ts` | fs를 읽어 `VersionReport`를 만든다 |
| `src/version/format.ts` | `VersionReport` → 출력 문자열. **순수 함수, fs 접근 없음** |
| `src/bin.ts`의 `runVersionCommand` | 둘을 조합해 stdout에 쓴다 |

`runVersionCommand`를 `bin.ts`에 두는 것은 `runCreate`·`runUpdateCommand`와
대칭을 맞추기 위해서다.

수집과 포맷을 가르는 이유는 테스트다. 포맷이 순수하면 픽스처 디렉토리
없이 고정 데이터로 열 정렬을 단언할 수 있고, 수집은 출력 문자열을 신경
쓰지 않고 데이터 모양만 검증하면 된다. 둘이 붙어 있으면 정렬 하나를
확인하려고 매번 임시 디렉토리에 `node_modules`를 지어야 한다.

### 6.1 워크스페이스 탐색 — YAML을 파싱하지 않는다

대상 디렉토리부터 **깊이 3까지** `package.json`을 스캔한다. `node_modules`와
`.`로 시작하는 숨김 디렉토리는 건너뛴다. `devkit` 마커가 있는
`package.json`만 리포트에 담는다.

`pnpm-workspace.yaml`의 `packages:` glob을 해석하는 쪽이 "정확"해 보이지만
택하지 않는다.

- 이 패키지는 **런타임 의존성이 0개**다(`devDependencies`가 `@types/node`
  하나뿐). YAML 파서를 넣으면 그 성질이 깨진다.
- 직접 파싱하면 YAML 파서에 더해 glob 엔진까지 만들어야 한다.
- `fs.glob`은 Node 20에 없다. `engines`가 `^20.19.0 || ^22.13.0 || >=24`라
  쓸 수 없다.

마커 스캔은 의존성 0으로 같은 답을 내고, 덤으로 워크스페이스에 등록되지
않았지만 devkit이 관리하는 디렉토리도 잡아낸다.

깊이는 대상 디렉토리 자신을 0으로 센다. 즉 `apps`가 1, `apps/web`이 2이고,
한계값 3은 devkit이 만드는 구조에 한 칸 여유를 둔 값이다. `node_modules`를
제외하므로 스캔 비용은 무시할 만하다.

정렬 순서는 상대경로 오름차순으로 고정한다. `readdir` 순서는 파일시스템에
따라 달라져 출력이 흔들리고, 그러면 테스트가 환경 의존적이 된다. `.`(루트)는
항상 맨 앞에 온다.

### 6.2 설치본 읽기

각 패키지에 대해 순서대로 본다.

1. 해당 워크스페이스의 `node_modules/<name>/package.json`
2. 없으면 저장소 루트(= 스캔 시작 지점)의 `node_modules/<name>/package.json`

pnpm 워크스페이스는 공용 의존을 루트에 두므로 앱 디렉토리에는 심링크조차
없을 수 있다. 둘 다 없으면 `null`이고 출력은 `미설치`다.

`node_modules`가 통째로 없는 상태(설치 전)에서도 명령은 정상 동작하며,
모든 패키지가 `미설치`로 나온다.

### 6.3 마커가 깨졌을 때

`readMarker()`는 두 종류로 던진다.

- `MissingMarkerError` — 마커가 아예 없다. 그 `package.json`은 devkit
  프로젝트가 아니므로 리포트에서 **조용히 제외**한다. 워크스페이스 스캔
  중에는 정상적인 경우다(모노레포의 도구 패키지 등).
- `InvalidMarkerError` — 마커가 있는데 형태가 틀렸다. 이건 알릴 가치가
  있으므로 `{ broken: <에러 메시지> }`로 담아 그 줄에 표시하고 **계속
  진행한다**.

진단 명령이 진단 대상의 손상 때문에 죽으면 안 된다. 마커가 깨졌다는 사실
자체가 사용자가 알아야 할 정보다.

## 7. 실행 순서 — `assertDistFresh`보다 앞

`main()`에서 `version` 처리는 `--help`와 같은 자리, 즉 `assertDistFresh()`
**앞**에 둔다.

`bin.ts:104`의 기존 주석이 그 이유를 이미 적고 있다 — 낡은 `dist` 때문에
사용법조차 못 보면 사용자는 무엇을 잘못했는지 확인할 길이 없다. 버전 조회도
같다. 오히려 "내가 지금 뭘 쓰고 있나"를 묻는 명령이 빌드 상태에 막히는 것은
정확히 거꾸로다.

버전 값 자체는 `package.json`에서 직접 읽으므로 `dist` 신선도와 무관하게
정확하다. 낡을 수 있는 것은 수집·포맷 로직뿐이고, 그 대가는 명령이 아예
답하지 못하는 것보다 작다.

`findToolkitRoot()`도 부르지 않는다. `version`은 툴킷 저장소가 필요 없다.

## 8. 테스트

`tests/version-report.test.ts`를 새로 만든다. 픽스처는 이 패키지의 기존
관습대로 `mkdtempSync(join(tmpdir(), 'devbak-version-'))`를 쓴다
(`tests/update-flow.test.ts:22`와 동일).

수집(`collect.ts`):

- 단일 프로젝트 — 마커·선언·`node_modules`가 모두 있을 때 정확히 수집한다
- 미설치 — `node_modules`가 없으면 `installed`가 `null`이다
- 루트 폴백 — 앱에는 없고 루트에만 깔린 패키지를 찾아낸다
- 모노레포 — 루트와 `apps/web`을 둘 다, 상대경로 순으로 수집한다
- **`node_modules` 안의 `package.json`은 워크스페이스로 잡히지 않는다**
- 마커 없음 — `workspaces`가 빈 배열이다
- 마커 손상 — 던지지 않고 `{ broken }`으로 담는다

포맷(`format.ts`):

- 고정 픽스처 데이터로 열 정렬을 단언한다
- **한글 헤더가 있는 행과 ASCII 데이터 행의 열 시작 위치가 같다** —
  `displayWidth` 기준으로 계산한다. `padEnd`로 구현하면 실패해야 하는
  테스트다(4.2절)
- 값에 한글이 섞여도(`미설치`) 그 행이 다른 행과 어긋나지 않는다
- 워크스페이스가 없으면 CLI 한 줄만 낸다
- 마커가 깨진 워크스페이스를 표시하고 나머지 행을 정상 출력한다

`tests/bin.test.ts`에 `version` 서브커맨드와 `--version` 플래그 분기를
추가한다.

### 8.1 스냅샷을 쓰지 않는다

포맷 검증에 `toMatchSnapshot()`을 쓰지 않는다. 이 저장소는 바로 그 함정을
이미 밟았다 — 커밋 `36a2042`("레시피 스냅샷을 릴리스 버전과 무관하게
만든다")가 그 수정이다.

버전 문자열이 박힌 스냅샷은 릴리스마다 깨지고, 그러면 사람이 내용을 보지
않고 `-u`로 갱신하게 되어 단언이 죽는다. 고정 픽스처와 명시적 단언은
릴리스 버전과 완전히 분리된다.

## 9. 범위 밖

- **원격 레지스트리 조회.** "최신 버전이 나왔는지" 묻지 않는다. 네트워크
  호출은 진단 명령을 느리고 불안정하게 만들고, 오프라인에서 실패한다.
  최신 여부는 `pnpm outdated`가 이미 답한다.
- **자동 업데이트 제안.** 마커 버전과 CLI 버전을 비교해 `update`를 권하는
  문구는 넣지 않는다. 두 값이 나란히 보이면 판단은 사용자가 한다. 규칙을
  넣으려면 "어느 정도 차이부터 권할 것인가"를 정해야 하는데 근거가 없다.
- **`pnpm-workspace.yaml` 해석.** 6.1절 참조.

## 10. 완료 기준

1. `devbak version`이 devkit 프로젝트에서 CLI·마커·패키지 3층을 모두 낸다
2. devkit 프로젝트가 아닌 곳에서 CLI 한 줄만 내고 종료 코드 0으로 끝난다
3. 모노레포 루트에서 실행하면 루트와 `apps/web`이 모두 나온다
4. `node_modules`가 없어도 죽지 않고 전부 `미설치`로 낸다
5. 마커가 깨진 워크스페이스가 있어도 나머지를 정상 출력한다
6. `devbak --version`이 버전 문자열 한 줄만 낸다
7. 한글 헤더가 있어도 열이 표시 폭 기준으로 정렬된다
8. `pnpm test`·`pnpm lint`·`pnpm typecheck`가 모두 통과한다
9. 런타임 의존성이 0개로 유지된다
