import type { ProjectType } from '../types.js';

/**
 * 유형별로 `.claude/skills/` 에 놓을 스킬 이름. 단일 출처다(설계 2.3절).
 *
 * 레시피가 이 목록을 이름으로 선언하므로 유형별 구성이 코드에 드러난다 —
 * `registryDeps(['eslint-config-nest', ...])` 와 같은 모양이다.
 */

/** 세 유형이 함께 받는 툴체인·규율 스킬. devkit-stack 만 devkit 저작이다. */
const COMMON = [
  'devkit-stack',
  'eslint',
  'prettier',
  'oxlint-eslint-hybrid',
  'typescript-patterns',
  'tdd',
  'clean-code',
  'verify-implementation',
] as const;

const NEST = [
  'nestjs-auth',
  'nestjs-caching',
  'nestjs-config',
  'nestjs-crud',
  'nestjs-database',
  'nestjs-deployment',
  'nestjs-error-handling',
  'nestjs-queue',
  'nestjs-security',
  'nestjs-semantic-search',
  'nestjs-swagger',
  'nestjs-testing',
  'nestjs-validation',
  'clean-architecture',
  'backend-verify-loop',
] as const;

const NEXT = [
  'fsd-architecture',
  'react-best-practices',
  'nextjs-a11y',
  'nextjs-auth',
  'nextjs-deployment',
  'nextjs-i18n',
  'nextjs-seo',
  'nextjs-shadcn',
  'nextjs-testing',
  'cache-components',
  'server-actions',
  'tanstack-query',
  'zustand-patterns',
  'react-hook-form',
  'tailwind-patterns',
  'framer-motion',
  'e2e-mcp',
  'frontend-verify-loop',
] as const;

/**
 * 모노레포 전용. 워크스페이스가 실제로 존재할 때만 의미가 있어서
 * 단일 앱 유형에는 넣지 않는다 — 없는 구조를 가정한 코드를 유도한다.
 */
const MONOREPO_ONLY = ['nestjs-monorepo', 'nextjs-monorepo'] as const;

export const SKILL_SETS: Readonly<Record<ProjectType, readonly string[]>> = {
  nest: [...COMMON, ...NEST],
  next: [...COMMON, ...NEXT],
  monorepo: [...COMMON, ...NEST, ...NEXT, ...MONOREPO_ONLY],
};
