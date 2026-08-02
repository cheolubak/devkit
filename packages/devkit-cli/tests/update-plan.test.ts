import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATEGORIES, type Category } from '../src/lib/categories.js';
import type { Ctx } from '../src/types.js';
import { buildPlan, effectiveCategories } from '../src/update/plan.js';

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

  it('--only claude면 리뷰 자산만 낸다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['claude']),
      marker: null,
    });

    expect(plan.map((f) => f.relPath).sort()).toEqual([
      '.claude/agents/devkit-reviewer.md',
      '.claude/commands/review.md',
      'CLAUDE.md',
    ]);
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
    // 레시피의 devDependencies와 linkDeps의 link:가 함께 들어간다.
    expect(parsed.devDependencies['typescript-eslint']).toBe('^8.65.0');
    expect(parsed.devDependencies['@devbak/tsconfig']).toMatch(/^link:/);
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
    expect(parsed.extends).toBe('@devbak/tsconfig/nest');
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

    expect(plan.map((f) => f.relPath).sort()).toEqual([
      '.claude/agents/devkit-reviewer.md',
      '.claude/commands/review.md',
      'apps/web/CLAUDE.md',
      'CLAUDE.md',
    ].sort());
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
