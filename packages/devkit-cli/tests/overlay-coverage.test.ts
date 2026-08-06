import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { categoryOf } from '../src/lib/categories.js';

const execFileAsync = promisify(execFile);

const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));

/** templates/<type>/ 아래의 모든 파일을 프로젝트 상대 경로로 수집한다. */
async function collectOverlayFiles(): Promise<{ type: string; relPath: string }[]> {
  const collected: { type: string; relPath: string }[] = [];
  const types = await readdir(TEMPLATES_DIR, { withFileTypes: true });

  for (const type of types) {
    if (!type.isDirectory()) continue;
    const root = `${TEMPLATES_DIR}/${type.name}`;
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absDir = entry.parentPath;
      const relPath = `${absDir}/${entry.name}`.slice(root.length + 1);
      collected.push({ type: type.name, relPath });
    }
  }

  return collected;
}

const ALL_TYPE_DIRS = ['_shared', 'nest', 'next', 'monorepo'] as const;

describe('오버레이 카테고리 커버리지', () => {
  it('templates 아래에 파일이 실제로 존재한다', async () => {
    // 수집이 0건이면 아래 단언이 공허하게 통과한다.
    const files = await collectOverlayFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it('유형 디렉토리 4개가 각각 파일을 1건 이상 갖는다', async () => {
    // files.length > 0 만으로는 유형 하나가 통째로 비어도 통과한다.
    // `_shared/`의 두 파일이 사라지는 시나리오를 이 단언이 직접 잡는다.
    const files = await collectOverlayFiles();
    for (const type of ALL_TYPE_DIRS) {
      const count = files.filter((f) => f.type === type).length;
      expect(count, `${type} 디렉토리에 파일이 없다`).toBeGreaterThan(0);
    }
  });

  it('모든 오버레이 파일이 카테고리에 매칭된다', async () => {
    // 매칭되지 않는 파일은 어떤 --only 로도 갱신되지 않으면서
    // update 가 성공을 보고한다. 설계 5.4절의 드리프트 방어.
    const files = await collectOverlayFiles();
    const unmatched = files
      .filter(({ relPath }) => categoryOf(relPath) === null)
      .map(({ type, relPath }) => `${type}/${relPath}`);

    expect(unmatched).toEqual([]);
  });

  it('JSON 오버레이가 전부 정규형이다 — create와 update가 같은 바이트를 만든다', async () => {
    // create(copyOverlay.run, ops/copy-overlay.ts)는 템플릿 파일을 원문 텍스트
    // 그대로 쓴다. 반면 update(buildPlan, update/plan.ts)는 JSON 오버레이를
    // reduceJsonOverlay → applyPatch → JSON.stringify(v, null, 2)로 재직렬화한다.
    // 템플릿이 이 정규형(JSON.stringify(JSON.parse(t), null, 2) + '\n')이 아니면
    // — 흔히 배열을 한 줄로 압축해 쓴 경우 — 의미는 같은데 바이트가 달라
    // 갓 생성한 프로젝트에도 update가 "변경 있음"으로 잡는다. Task 11 e2e에서
    // templates/nest/tsconfig.json의 압축 include 배열로 처음 드러난 실제 결함이다.
    const files = await collectOverlayFiles();
    const jsonFiles = files.filter(({ relPath }) => relPath.endsWith('.json'));

    // expect()에 커스텀 메시지를 실으면(2번째 인자) oxlint의 vitest/valid-expect가
    // toEqual 매처와 조합될 때 "Expect takes at most 1 argument"로 막는다 — 그래서
    // 설명을 메시지가 아니라 실패 배열의 각 항목에 싣는다. toEqual 실패 시 vitest가
    // 이 배열을 그대로 diff에 찍으므로 다음 사람이 무엇을 해야 할지 항목별로 보인다.
    const nonCanonical: string[] = [];
    for (const { type, relPath } of jsonFiles) {
      const full = `${TEMPLATES_DIR}/${type}/${relPath}`;
      // oxlint-disable-next-line no-await-in-loop -- 템플릿 파일 수가 적고(십여 개), 실패 시 어떤 파일인지 순서대로 드러나는 편이 낫다
      const text = await readFile(full, 'utf8');
      const canonical = `${JSON.stringify(JSON.parse(text) as unknown, null, 2)}\n`;
      if (text !== canonical) {
        nonCanonical.push(
          `${type}/${relPath} — 정규형(JSON.stringify(JSON.parse(text), null, 2) + "\\n")과 ` +
            '바이트가 다르다. create는 이 파일을 원문 그대로 쓰지만 update는 재직렬화하므로, ' +
            '정규형이 아니면 갓 생성한 프로젝트에도 update가 변경을 잡는다(의미는 같은데 ' +
            '바이트만 다르다). 보통 배열을 한 줄로 압축해서 생긴다 — 원소마다 줄바꿈하라.',
        );
      }
    }

    expect(nonCanonical).toEqual([]);
  });

  it('템플릿의 모든 파일이 git에 추적된다', async () => {
    // 저장소 루트 .gitignore 는 `.claude/`(로컬 에이전트 스크래치)를 무시한다.
    // 그 규칙이 templates/<type>/.claude/ 까지 삼켜서, 새 템플릿 자산을 만들면
    // `git add` 가 조용히 건너뛴다 — 그런데 이 테스트 스위트는 디스크를 읽으므로
    // 전부 통과한다. 즉 clone·CI·게시본에는 파일이 없는데 검증은 초록불인 상태가
    // 된다. 2026-08-06 devkit-implementer 추가 때 실제로 그렇게 됐다.
    const files = await collectOverlayFiles();
    const { stdout } = await execFileAsync('git', ['ls-files', '-z', '--', '.'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    const tracked = new Set(
      stdout
        .split('\0')
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/^templates\//, '')),
    );

    const untracked = files
      .map(({ type, relPath }) => `${type}/${relPath}`)
      .filter((p) => !tracked.has(p));

    expect(untracked).toEqual([]);
  });
});
