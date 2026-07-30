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
    // .superpowers/는 git-ignored 스크래치(SDD 워크스페이스)다. ESLint는
    // .gitignore를 읽지 않으므로 여기서 따로 제외해야 한다.
    ignores: ['**/dist/**', 'coverage/**', '.superpowers/**'],
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

  // ⬇️ 반드시 마지막: oxlint가 담당하는 규칙을 여기서 비활성화한다.
  // 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 이중 보고가 남는다.
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
