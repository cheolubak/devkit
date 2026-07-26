# Work Log

## 2026-07-26

### eslint-plugin-fsd 설계 확정 및 저장소 초기화
- **변경 파일**: `docs/superpowers/specs/2026-07-26-eslint-plugin-fsd-design.md`, `.gitignore`
- **내용**: FSD 구조를 강제하는 ESLint 패키지(`eslint-plugin-fsd`) 설계 확정. pnpm 모노레포 구성, rule 3개(`no-higher-level-imports`/`no-cross-imports`/`no-public-api-sidestep`) + `recommended` flat config 프리셋. 관습 기반 zero-config 경로 파싱(`src/` 앵커로 Next.js 라우팅 폴더 오탐 방지), `pages` 레이어 별칭 `views`/`screens` 지원. git 초기화 및 설계 문서 커밋.
- **커밋**: 0bde34b
