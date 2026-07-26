# Work Log

## 2026-07-26

### eslint-plugin-fsd 설계 확정 및 저장소 초기화
- **변경 파일**: `docs/superpowers/specs/2026-07-26-eslint-plugin-fsd-design.md`, `.gitignore`
- **내용**: FSD 구조를 강제하는 ESLint 패키지(`eslint-plugin-fsd`) 설계 확정. pnpm 모노레포 구성, rule 3개(`no-higher-level-imports`/`no-cross-imports`/`no-public-api-sidestep`) + `recommended` flat config 프리셋. 관습 기반 zero-config 경로 파싱(`src/` 앵커로 Next.js 라우팅 폴더 오탐 방지), `pages` 레이어 별칭 `views`/`screens` 지원. git 초기화 및 설계 문서 커밋.
- **커밋**: 0bde34b

### Task 1: pnpm 모노레포 스캐폴딩 + eslint-plugin-fsd 패키지 뼈대
- **변경 파일**: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/tsconfig.json`, `packages/eslint-plugin-fsd/tsup.config.ts`, `packages/eslint-plugin-fsd/src/index.ts`, `pnpm-lock.yaml`
- **내용**: task-1-brief.md의 명세대로 pnpm 워크스페이스와 `eslint-plugin-fsd` 패키지 뼈대(임시 stub export)를 생성. `pnpm install`/`pnpm build`(tsup으로 dist 생성 확인)/`pnpm test` 모두 성공 확인. vitest가 테스트 0개로 exit 1 실패하여 브리프의 폴백대로 루트 `test` 스크립트에 `--passWithNoTests`를 추가해 exit 0으로 통과시킴.
- **커밋**: 1c29d1f

## 2026-07-27

### eslint-plugin-fsd 구현 완료 (Task 2~10 + 최종 리뷰 반영)
- **변경 파일**: `packages/eslint-plugin-fsd/src/lib/{types,layers,parse-path,resolve-import,create-rule}.ts`, `src/rules/{no-higher-level-imports,no-cross-imports,no-public-api-sidestep}.ts`, `src/index.ts`, `packages/eslint-plugin-fsd/tests/*.test.ts`, `README.md`
- **내용**: Subagent-Driven Development로 계획 10개 태스크를 TDD로 구현(레이어 모델 → 경로 파싱 → import 해석 → rule 공통 헬퍼 → rule 3개 → 진입점/`recommended` 프리셋 → README/통합검증). 총 42개 테스트 통과, tsup 빌드 성공. 태스크별 리뷰에서 실버그 3건 수정: (1) `findFsdRoot` 최상위 레이어 시 절대경로 `/` 반환, (2) `createImportRule`의 `ImportExpression`을 실제 노드로 처리해 report 크래시 제거, (3) 최종 리뷰(opus)에서 발견한 Critical — `recommended` 프리셋이 Next.js 루트 라우팅 `pages/`를 no-cross-imports 오탐 → `ignores: ['app/**','pages/**']` 스코핑으로 차단.
- **브랜치/커밋**: `feature/eslint-plugin-fsd` (fb00c5a..981b9a5, 총 14 커밋). main 미머지.
- **남은 follow-up**: type-only import 예외, 명시적 `/index` 진입점 허용, Windows 경로 테스트, `@x` cross-import, rule option `rootDir`.
