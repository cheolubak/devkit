import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * 이 파일 자신은 검사 대상이 아니다.
 *
 * 지금 형태로는 빼지 않아도 걸리지 않는다 — 확인해 봤다. 아래 문서 주석에
 * `@cheolubak/tsconfig': '^0.1.0'` 예시가 있지만 그 줄에 `expect(` 가 없어
 * 세 조건이 한 줄에서 만나지 않는다. 그래도 빼 두는 이유는 **예시를 하나만
 * 더 실감나게 적으면 곧바로 자기 자신을 신고하기 때문이다.** 가드가 자기
 * 문서 때문에 빨개지면 고치는 사람이 진짜 위반과 구분하지 못한다.
 */
const SELF = 'version-literal-guard.test.ts';

/**
 * 같은 줄에서 이 셋이 모두 보이면 실패시킨다:
 *   1. `@cheolubak/` 패키지 이름
 *   2. 따옴표나 백틱으로 감싼 하드코딩 버전(`'^0.1.0'`, `"0.1.1"`)
 *   3. `expect(`
 *
 * **왜 `expect(` 를 함께 요구하는가.** 테스트가 직접 만드는 입력 픽스처
 * (`devDependencies: { '@cheolubak/tsconfig': '^0.1.0' }`) 는 정당하다 —
 * 그 값은 릴리스가 건드리지 않고, 테스트 안에서 자기완결적이다. 문제가 되는
 * 것은 **생성물에서 읽은 값을 하드코딩 버전과 대조하는 단언**뿐이다. 그 값은
 * `DEVKIT_VERSION_RANGE` 에서 흘러나오므로 릴리스가 상수를 올리면 단언만
 * 뒤처지고, 다음 릴리스의 검증 스텝이 거기서 막힌다(이슈 #6).
 *
 * 실제로 이 모양이 세 곳에 있었다: `update-plan.test.ts`, `packed.e2e.test.ts`,
 * `create.e2e.test.ts`. 앞의 둘은 단위 스위트가, 마지막 하나는 e2e 만 잡을 수
 * 있었다 — `vitest.config.ts` 의 include 가 `tests/*.test.ts` 한 단계라
 * `tests/e2e/` 는 개발 루프에서 아예 돌지 않기 때문이다. 이 가드는 기본
 * 스위트에서 돌면서 **e2e 안쪽까지 읽는다.** 고치는 법은 리터럴을
 * `DEVKIT_VERSION_RANGE` import 로 바꾸는 것이다.
 *
 * **알려진 한계**: 판정이 한 줄 단위라 `expect(` 와 리터럴이 다른 줄에 있는
 * 여러 줄 단언은 빠져나간다. 세 실제 사례가 전부 한 줄이었기에 이 범위로
 * 둔다 — 조용히 약한 것보다 한계를 적어 두는 쪽이 낫다.
 */
const PKG = '@cheolubak/';
// 백틱도 받는다. `toBe(`^0.1.0`)` 는 이 저장소에서 드문 형태지만, 따옴표
// 두 종류만 보면 그 한 형태로 가드를 그냥 지나칠 수 있다.
const VERSION_LITERAL = /['"`]\^?\d+\.\d+\.\d+['"`]/;
const EXPECT_CALL = 'expect(';

/**
 * 정당한 예외를 남길 때 쓰는 표식. 이유를 함께 적는다.
 *
 * 위반한 줄 자체나 **바로 윗줄** 어디에 있어도 인정한다 — 단언이 길면
 * 포매터가 트레일링 주석을 허용하지 않아, 같은 줄만 인정하면 표식을 달 수
 * 없는 줄이 생긴다.
 */
const OPT_OUT = 'version-literal-ok';

/**
 * 읽을 절대경로와, 판정·표시에 쓸 **POSIX 로 통일된** 상대경로를 함께 낸다.
 *
 * 절대경로를 문자열로 이으면 안 된다 — 최상위 항목의 `parentPath` 는 readdir
 * 에 넘긴 값 그대로라 끝에 구분자가 붙어 있고(`.../tests/`), 하위 디렉토리
 * 항목은 Node 가 만들어 붙지 않는다(`.../tests/e2e`). 그대로 이으면 최상위만
 * 슬래시가 겹친다. 그래서 `join` 을 쓴다.
 *
 * 그런데 `join` 은 Windows 에서 `\` 를 쓴다. 경로를 그대로 두면 아래 e2e
 * 커버리지 판정(`'e2e'` 세그먼트 찾기)이 Windows 에서 **정상 체크아웃인데도
 * 실패하고**, 위반 메시지의 경로 모양도 플랫폼마다 갈린다. 여기서 한 번
 * POSIX 로 통일해 두 곳 모두 플랫폼과 무관하게 만든다.
 */
async function testSourceFiles(): Promise<{ abs: string; rel: string }[]> {
  const entries = await readdir(TESTS_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && e.name !== SELF)
    .map((e) => {
      const abs = join(e.parentPath, e.name);
      return { abs, rel: relative(TESTS_DIR, abs).split(sep).join('/') };
    });
}

describe('테스트가 릴리스 관리 버전을 하드코딩하지 않는다', () => {
  it('@cheolubak/* 버전 리터럴을 단언에 박은 곳이 없다', async () => {
    const files = await testSourceFiles();
    // 하나도 못 읽으면 아래 루프가 0회 돌아 "검사할 것이 없으니 통과"가 된다.
    // 이 저장소의 다른 방어들과 같은 이유로 던진다(registry-version.test.ts,
    // package-task-coverage.test.ts).
    if (files.length === 0) {
      throw new Error(`테스트 소스를 하나도 찾지 못했다: ${TESTS_DIR}`);
    }
    // e2e 를 실제로 훑고 있는지까지 확인한다 — include 나 디렉토리 구조가
    // 바뀌어 e2e 가 스캔에서 빠지면, 정확히 이 가드가 막으려던 사각지대가
    // 소리 없이 돌아온다(create.e2e.test.ts 가 그렇게 살아남았다).
    // 세그먼트로 쪼개 본다 — `'/e2e/'` 부분 문자열로 찾으면 Windows 의 `\`
    // 경로에서 늘 false 가 되어, 아무 문제 없는 체크아웃에서 가드가 헛되이
    // 빨개진다(CodeRabbit 지적).
    expect(files.some((f) => f.rel.split('/').includes('e2e'))).toBe(true);

    const sources = await Promise.all(
      files.map(async (f) => ({ rel: f.rel, lines: (await readFile(f.abs, 'utf8')).split('\n') })),
    );

    const violations: string[] = [];
    for (const { rel, lines } of sources) {
      lines.forEach((line, i) => {
        if (!line.includes(PKG)) return;
        if (!line.includes(EXPECT_CALL)) return;
        if (!VERSION_LITERAL.test(line)) return;
        if (line.includes(OPT_OUT) || (lines[i - 1]?.includes(OPT_OUT) ?? false)) return;
        violations.push(`${rel}:${i + 1} — ${line.trim()}`);
      });
    }

    // 목록을 그대로 보여줘야 어디를 고칠지 바로 안다. expect 의 두 번째 인자
    // (메시지)는 oxlint 의 vitest(valid-expect) 가 막으므로, 이 저장소의 다른
    // 방어들처럼 던진다.
    if (violations.length > 0) {
      throw new Error(
        '릴리스가 올리는 버전을 단언에 하드코딩했다. DEVKIT_VERSION_RANGE 를 import 해 ' +
          '비교하라 — 리터럴로 두면 다음 마이너 릴리스의 검증 스텝이 여기서 막힌다.\n' +
          `정당한 예외라면 그 줄이나 바로 윗줄에 \`${OPT_OUT}: <이유>\` 주석을 남겨라.\n` +
          violations.join('\n'),
      );
    }
  });
});
