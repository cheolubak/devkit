import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { Ctx, PlannedChange, Step } from '../types.js';
import { collectTree, templatesRoot } from './copy-overlay.js';

/**
 * 스킬 공용 풀의 디렉토리 이름(설계 2.2절).
 *
 * 유형별 디렉토리에 각각 복사하지 않는 이유는 monorepo 다 — nest·next 를
 * 모두 받으므로 같은 스킬이 git 에 최대 3벌 남고, 한 벌만 고치면 나머지가
 * 조용히 낡는다. 풀은 한 벌이므로 그 실패가 구조적으로 불가능하다.
 */
export const SKILL_POOL_DIR = '_skills';

/**
 * `templates/_skills/<name>/` 을 `.claude/skills/<name>/` 로 복사한다.
 *
 * `__NAME__` 치환을 하지 않고(vars 가 빈 객체다) 파일명도 바꾸지 않는다
 * (`literalNames`). 스킬 본문은 프로젝트 이름과 무관하고, 우연히 그 형태의
 * 문자열이나 `_` 접두 파일명이 있으면 변환이 원문을 훼손한다 — 원본 그대로
 * 복사가 이 자산의 계약이다(설계 2.1절).
 */
export function copySkills(names: readonly string[]): Step {
  const plan = async (): Promise<PlannedChange[]> => {
    const root = join(templatesRoot(), SKILL_POOL_DIR);

    const nested = await Promise.all(
      names.map(async (name): Promise<PlannedChange[]> => {
        const from = join(root, name);
        if (!existsSync(from)) {
          throw new Error(
            `스킬 '${name}' 가 풀(templates/${SKILL_POOL_DIR}/)에 없습니다. ` +
              `조용히 건너뛰면 그 스킬은 어떤 유형에도 배포되지 않으면서 생성이 성공합니다.`,
          );
        }
        return await collectTree(from, posix.join('.claude', 'skills', name), {}, { literalNames: true });
      }),
    );

    return nested.flat();
  };

  return {
    kind: 'copySkills',
    label: `스킬 복사: ${names.length}개`,
    describe: () => ({ skills: [...names] }),
    plan,
    run: async (ctx: Ctx) => {
      const changes = await plan();
      for (const change of changes) {
        if (change.kind !== 'file') continue;
        const target = join(ctx.targetDir, ...change.relPath.split('/'));
        // 부분 실패 시 어디까지 썼는지가 순서로 드러나야 한다.
        // oxlint-disable-next-line no-await-in-loop -- 위 이유로 병렬화하지 않는다
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
        await writeFile(target, change.content);
      }
      ctx.log(`  스킬 ${names.length}개 복사: .claude/skills/`);
    },
  };
}
