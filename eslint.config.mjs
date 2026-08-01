import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

/**
 * oxlint + ESLint 하이브리드 구성.
 *
 * - oxlint(.oxlintrc.json): 비타입 correctness 대부분을 초고속으로 담당
 * - ESLint(이 파일): oxlint가 못 하는 타입 인식 규칙만 담당
 * - eslint-plugin-oxlint: 위 둘의 중복을 마지막에 off 처리
 */
export default tseslint.config(
  {
    // .superpowers/는 git-ignored 스크래치(SDD 워크스페이스), .claude/는
    // 에이전트 워크트리다. ESLint는 .gitignore를 읽지 않으므로 여기서 따로
    // 제외해야 한다. 특히 .claude/worktrees/ 안에는 node_modules가 없어
    // projectService가 실패하고, 그 결과 저장소 전체 lint가 깨진다.
    ignores: [
      '**/dist/**',
      'coverage/**',
      '.superpowers/**',
      '.claude/**',
      '**/tests/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    // 어떤 tsconfig에도 속하지 않는 설정 파일들 — 타입 인식 자체를 끈다
    files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}', 'eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false,
      },
    },
  },

  {
    // @devbak/jest-config가 소비자에게 재노출하는 CJS 설정 객체.
    // "type" 필드 없는 package.json 아래에서 동작해야 하므로 CJS(.js)로 남아야
    // 한다(README 참고). sourceType: 'commonjs'로 module/require를 알려진
    // 전역으로 인식시켜 no-undef를 피한다.
    files: ['packages/jest-config/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  // ⬇️ 반드시 마지막: oxlint가 담당하는 규칙을 여기서 비활성화한다.
  // 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 이중 보고가 남는다.
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
