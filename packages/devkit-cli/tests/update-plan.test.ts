import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATEGORIES, type Category } from '../src/lib/categories.js';
import { SKILL_SETS } from '../src/lib/skill-sets.js';
import { DEVKIT_VERSION_RANGE } from '../src/ops/registry-deps.js';
import type { Ctx } from '../src/types.js';
import { buildPlan, effectiveCategories } from '../src/update/plan.js';

const SKILLS_PREFIX = '.claude/skills/';

/**
 * 계획을 "스킬"과 "그 밖"으로 가른다.
 *
 * 스킬은 파일이 200개가 넘어 완전 열거가 읽히지 않는다. 대신 그 밖은 그대로
 * 완전 열거로 남기고(카테고리 필터가 엉뚱한 파일을 들이지 않는지 보는 것이
 * 원래 목적이다), 스킬은 **이름 집합**으로 본다 — 스킬 안의 파일 구성이
 * 상류에서 바뀌어도 흔들리지 않으면서, 유형별 목록과 어긋나면 잡는다.
 */
function splitSkills(paths: readonly string[]): { skills: Set<string>; rest: string[] } {
  return {
    skills: new Set(
      paths.filter((p) => p.startsWith(SKILLS_PREFIX)).map((p) => p.slice(SKILLS_PREFIX.length).split('/')[0]),
    ),
    rest: paths.filter((p) => !p.startsWith(SKILLS_PREFIX)).sort(),
  };
}

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 최소한의 대상 프로젝트를 만든다. update는 package.json만 전제한다. */
function makeTarget(pkg: Record<string, unknown> = {}): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-target-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo', ...pkg }, null, 2)}\n`);
  return { targetDir: dir, toolkitRoot: '/a/b/eslint', name: 'demo', log: () => {} };
}

const ALL = new Set<Category>(CATEGORIES.filter((c) => c !== 'scaffold'));

describe('effectiveCategories', () => {
  it('생략하면 scaffold를 뺀 전체다', () => {
    expect(effectiveCategories()).toEqual(ALL);
  });

  it('명시하면 scaffold도 포함된다', () => {
    expect(effectiveCategories(['scaffold'])).toEqual(new Set(['scaffold']));
  });
});

describe('buildPlan', () => {
  it('scaffold를 기본 제외하므로 src/main.ts가 계획에 없다', async () => {
    const plan = await buildPlan({ type: 'nest', ctx: makeTarget(), categories: ALL, marker: null });
    expect(plan.map((f) => f.relPath)).not.toContain('src/main.ts');
  });

  it('--only scaffold면 nest에서 src/main.ts를 낸다', async () => {
    // 위 테스트가 기본 제외(음성)를, categories.test.ts/update-plan.test.ts의
    // 다른 단언들이 categoryOf('src/main.ts') === 'scaffold'(양성 반쪽)를
    // 각각 덮지만, 둘을 합성한 buildPlan(categories={scaffold})가 실제로
    // src/main.ts를 내는지는 비어 있었다.
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['scaffold']),
      marker: null,
    });
    expect(plan.map((f) => f.relPath)).toContain('src/main.ts');
  });

  it('--only claude면 리뷰 자산과 스킬만 낸다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['claude']),
      marker: null,
    });

    const { skills, rest } = splitSkills(plan.map((f) => f.relPath));

    expect(rest).toEqual(
      [
        '.claude/agents/devkit-implementer.md',
        '.claude/agents/devkit-reviewer.md',
        '.claude/commands/api-test.md',
        '.claude/commands/issue-work.md',
        '.claude/commands/issue.md',
        '.claude/commands/module.md',
        '.claude/commands/review.md',
        '.claude/commands/verify.md',
        'CLAUDE.md',
      ].sort(),
    );
    // 스킬이 이 카테고리에 걸리지 않으면 update --only claude 가 스킬을
    // 영영 갱신하지 않으면서 성공을 보고한다.
    expect(skills).toEqual(new Set(SKILL_SETS.nest));
  });

  it('package.json은 패치가 합쳐진 한 파일로 나온다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['deps']),
      marker: null,
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    expect(pkg).toBeDefined();

    const parsed = JSON.parse(pkg!.content) as { devDependencies: Record<string, string>; name: string };
    // 기존 값은 보존된다.
    expect(parsed.name).toBe('demo');
    // 레시피의 devDependencies와 registryDeps의 버전 범위가 함께 들어간다.
    expect(parsed.devDependencies['typescript-eslint']).toBe('^8.65.0');
    // 여기서 보는 것은 상수의 '값'이 아니라 배선이다 — registryDeps 가 선언한
    // 범위가 buildPlan 을 거쳐 package.json 패치까지 실제로 흘러드는가. 그
    // 배선은 상수를 import 해 비교해도 온전히 검증된다(키가 빠지거나 다른
    // 값이 들어가면 undefined 나 불일치로 잡힌다).
    //
    // 값이 실제 게시본과 맞는지는 registry-version.test.ts 가 지킨다. 여기에
    // 리터럴을 박으면 같은 사실이 세 곳(상수·게시본·이 리터럴)에 놓이고
    // 그중 둘만 릴리스가 자동 갱신해, 마이너가 오를 때마다 main 이 빨개진다.
    expect(parsed.devDependencies['@cheolubak/tsconfig']).toBe(DEVKIT_VERSION_RANGE);
  });

  it('마커를 주면 package.json에 얹힌다 — 쓰기 뒤가 아니라 계획 안이다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: ALL,
      marker: { version: '9.9.9' },
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    const parsed = JSON.parse(pkg!.content) as { devkit: { type: string; version: string } };
    expect(parsed.devkit).toEqual({ type: 'nest', version: '9.9.9' });
  });

  it('마커가 null이면 얹지 않는다', async () => {
    const plan = await buildPlan({ type: 'nest', ctx: makeTarget(), categories: ALL, marker: null });
    const pkg = plan.find((f) => f.relPath === 'package.json');
    expect(JSON.parse(pkg!.content)).not.toHaveProperty('devkit');
  });

  it('사용자가 추가한 tsconfig의 paths를 보존한다 — 통짜로 덮지 않는다', async () => {
    const ctx = makeTarget();
    writeFileSync(
      join(ctx.targetDir, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }, null, 2)}\n`,
    );

    const plan = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['ts']),
      marker: null,
    });

    const ts = plan.find((f) => f.relPath === 'tsconfig.json');
    const parsed = JSON.parse(ts!.content) as {
      extends: string;
      compilerOptions: { paths: unknown; outDir: string };
    };
    expect(parsed.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
    expect(parsed.extends).toBe('@cheolubak/tsconfig/nest');
    expect(parsed.compilerOptions.outDir).toBe('./dist');
  });

  it('대상 JSON이 깨져 있으면 어느 파일인지 경로를 담아 던진다', async () => {
    // 실측: 주석 달린 tsconfig.json은 현실에서 흔하다. readJsonOrEmpty가
    // 경로 없이 SyntaxError만 던지면 사용자는 어느 파일인지 알 수 없다.
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, 'tsconfig.json'), '{ // 주석\n "extends": "x" }\n');

    await expect(
      buildPlan({ type: 'nest', ctx, categories: new Set<Category>(['ts']), marker: null }),
    ).rejects.toThrow(/tsconfig\.json: JSON 파싱 실패/);
  });

  it('monorepo는 합성한 next가 놓은 apps/web 설정을 되살리지 않는다', async () => {
    // 레시피는 compose(next) 뒤에 removeFiles로 이것들을 지운다. update가
    // removeFiles를 무시하면 매번 되살리고, apps/web/eslint.config.mjs는
    // 저장소 전체 린트를 죽인다(설계 5.7절).
    const plan = await buildPlan({ type: 'monorepo', ctx: makeTarget(), categories: ALL, marker: null });
    const paths = plan.map((f) => f.relPath);

    expect(paths).not.toContain('apps/web/eslint.config.mjs');
    expect(paths.some((p) => p.startsWith('apps/web/.claude/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('apps/web/.github/'))).toBe(false);
    // 루트 쪽은 그대로 있어야 한다 — 지운 것은 앱 하위뿐이다.
    expect(paths).toContain('eslint.config.mjs');
    expect(paths).toContain('.claude/commands/review.md');
  });

  it('monorepo는 apps/web에 남는 합성 오버레이를 계획에 낸다', async () => {
    // 카테고리 패턴은 프로젝트 루트에 앵커돼 있다(`^CLAUDE\.md$`). 루트 기준
    // 경로 'apps/web/CLAUDE.md'로 분류하면 categoryOf가 null을 내고, 파일
    // 오버레이 분기가 그것을 조용히 버린다 — 지워야 할 것(eslint.config.mjs)만
    // 빠진 것처럼 보이지만 실제로는 apps/web 전체가 재적용 대상에서 사라진다.
    const plan = await buildPlan({ type: 'monorepo', ctx: makeTarget(), categories: ALL, marker: null });
    const paths = plan.map((f) => f.relPath);

    expect(paths).toContain('apps/web/CLAUDE.md');
    expect(paths).toContain('apps/web/vitest.config.ts');
    expect(paths).toContain('apps/web/.prettierignore');
    // 카테고리도 하위 프로젝트 기준으로 매겨진다 — 표시·필터가 함께 맞는다.
    expect(plan.find((f) => f.relPath === 'apps/web/CLAUDE.md')?.category).toBe('claude');
  });

  it('--only claude면 monorepo의 apps/web 쪽 CLAUDE.md도 함께 걸린다', async () => {
    // 위 회귀의 필터 방향. 하위 경로가 null로 분류되면 --only claude가
    // apps/web/CLAUDE.md를 영영 갱신하지 않으면서 성공을 보고한다.
    const plan = await buildPlan({
      type: 'monorepo',
      ctx: makeTarget(),
      categories: new Set<Category>(['claude']),
      marker: null,
    });

    // apps/web 쪽 에이전트 문서는 목록에 없다 — monorepo 레시피가
    // apps/web/.claude 를 통째로 지우고 루트 1벌만 남기기 때문이다.
    // apps/web/CLAUDE.md 는 .claude 밖이라 그 제거에 걸리지 않는다.
    const { skills, rest } = splitSkills(plan.map((f) => f.relPath));

    expect(rest).toEqual(
      [
        '.claude/agents/devkit-implementer.md',
        '.claude/agents/devkit-reviewer.md',
        '.claude/commands/a11y.md',
        '.claude/commands/api-test.md',
        '.claude/commands/issue-work.md',
        '.claude/commands/issue.md',
        '.claude/commands/module.md',
        '.claude/commands/review.md',
        '.claude/commands/slice.md',
        '.claude/commands/verify.md',
        'apps/web/CLAUDE.md',
        'CLAUDE.md',
      ].sort(),
    );
    // 합성된 next 레시피가 apps/web 에 놓은 스킬도 같은 제거에 걸리므로,
    // 남는 것은 루트 1벌뿐이다. rest 에 apps/web/.claude/ 가 없는 것과
    // 같은 이유다.
    expect(skills).toEqual(new Set(SKILL_SETS.monorepo));
  });

  it('next는 CLAUDE.md를 정상적으로 놓는다 — 지운 뒤 놓는 순서다', async () => {
    // removeFiles(['AGENTS.md','CLAUDE.md'])가 copyOverlay('next')보다
    // 앞이므로, 무조건 제외로 구현하면 CLAUDE.md가 영영 안 놓인다.
    const plan = await buildPlan({ type: 'next', ctx: makeTarget(), categories: ALL, marker: null });
    expect(plan.map((f) => f.relPath)).toContain('CLAUDE.md');
  });

  it('monorepo는 apps/web의 package.json도 별개 파일로 낸다', async () => {
    const ctx = makeTarget();
    mkdirSync(join(ctx.targetDir, 'apps', 'web'), { recursive: true });
    writeFileSync(
      join(ctx.targetDir, 'apps', 'web', 'package.json'),
      `${JSON.stringify({ name: 'web' }, null, 2)}\n`,
    );

    const plan = await buildPlan({
      type: 'monorepo',
      ctx,
      categories: new Set<Category>(['deps']),
      marker: null,
    });

    expect(plan.map((f) => f.relPath)).toContain('apps/web/package.json');
    expect(plan.map((f) => f.relPath)).toContain('package.json');
  });

  it('monorepo 루트 package.json은 통짜 템플릿을 덮지 않는다', async () => {
    const ctx = makeTarget({ dependencies: { 'my-lib': '^1.0.0' } });

    const plan = await buildPlan({
      type: 'monorepo',
      ctx,
      categories: new Set<Category>(['deps', 'repo', 'lint', 'test']),
      marker: null,
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    const parsed = JSON.parse(pkg!.content) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // 사용자 것이 살아남고
    expect(parsed.name).toBe('demo');
    expect(parsed.dependencies['my-lib']).toBe('^1.0.0');
    // 표준이 얹힌다
    expect(parsed.devDependencies.turbo).toBe('^2.8.0');
  });
});

describe('.gitignore 병합', () => {
  it('사용자가 추가한 규칙을 지우지 않는다', async () => {
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, '.gitignore'), '내-비밀-폴더/\nnode_modules/\n');

    const plan = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });

    const gitignore = plan.find((f) => f.relPath === '.gitignore');
    expect(gitignore).toBeDefined();
    // 보존 — 이 테스트의 본질이다.
    expect(gitignore!.content).toContain('내-비밀-폴더/');
    // 템플릿 줄이 얹혔는가. "보존"만 보면 통째 교체가 아니라 통째 유지해도
    // 통과하므로, 병합이 실제로 일어났음을 별도로 고정한다.
    expect(gitignore!.content).toContain('coverage/');
    // 구분자 쌍과 블록 내용 — Task 4가 템플릿에 devkit 블록을 채운 뒤로는
    // update 경로에서도 블록 내용을 직접 검증할 수 있다(예전엔 템플릿에
    // 블록이 없어 구분자 쌍만 봤다).
    expect(gitignore!.content).toContain('# >>> devkit >>>');
    expect(gitignore!.content).toContain('# <<< devkit <<<');
    expect(gitignore!.content).toContain('.claude/*');
  });

  it('.claude/ 를 통째로 무시하던 대상은 update 뒤 그 줄이 사라져 리뷰 자산이 추적된다', async () => {
    // 최종 리뷰 Critical 1 회귀: "기존 내용 유지" 원칙만 따르면 이 줄이
    // 살아남는데, git은 이미 무시된 디렉토리 안으로 안 내려가 block의
    // `!.claude/agents/`가 무력해진다 — mergeIgnore의 조상 제외 예외가
    // update 경로에서도 실제로 적용되는지 여기서 고정한다.
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, '.gitignore'), '.claude/\n내-비밀-폴더/\n');

    const plan = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });

    const gitignore = plan.find((f) => f.relPath === '.gitignore');
    expect(gitignore).toBeDefined();
    // 조상 제외 줄만 정확히 지워졌고
    expect(gitignore!.content.split('\n')).not.toContain('.claude/');
    // 무관한 사용자 줄은 그대로 남는다
    expect(gitignore!.content).toContain('내-비밀-폴더/');
    // block의 부정 패턴이 실제로 살아 있다
    expect(gitignore!.content).toContain('!.claude/agents/');
  });

  it('두 번 돌려도 같은 내용이다 — 멱등이다', async () => {
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, '.gitignore'), 'node_modules/\n');

    const first = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });
    const content = first.find((f) => f.relPath === '.gitignore')!.content;

    // 첫 실행의 계획 결과를 그대로 대상에 써서, "update를 한 번 적용한
    // 프로젝트에 다시 update를 돌리면" 상황을 재현한다.
    writeFileSync(join(ctx.targetDir, '.gitignore'), content);
    const second = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });

    expect(second.find((f) => f.relPath === '.gitignore')!.content).toBe(content);
  });
});
