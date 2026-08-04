import path from 'node:path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

/**
 * oxlint + ESLint 하이브리드 구성의 **공유 부분**.
 *
 * - oxlint(.oxlintrc.json): 비타입 correctness 대부분을 초고속으로 담당
 * - ESLint(이 파일): oxlint가 못 하는 타입 인식 규칙만 담당
 * - eslint-plugin-oxlint: 위 둘의 중복을 마지막에 off 처리
 *
 * 이 파일은 실행 설정이 아니라 라이브러리다 — 이름이 `eslint.config.*`이면
 * ESLint가 설정으로 자동 탐색해 의도치 않은 중첩이 생기고, 그것이
 * `multiple candidate TSConfigRootDirs`의 원인이 된다.
 *
 * @param {string} tsconfigRootDir 이 설정을 소비하는 패키지의 절대경로
 * @param {unknown[]} extra oxlint 스프레드 **앞**에 끼울 추가 config
 */
export function baseConfig(tsconfigRootDir, extra = []) {
  // 빠뜨리면 undefined가 되는데, typescript-eslint는 이때 던지지 않고 자체
  // 추론으로 넘어간다 — 설정이 조용히 엉뚱한 루트를 잡고, 그것이 이 분할이
  // 막으려 한 `multiple candidate TSConfigRootDirs` 그 자체다. 여기서 끊는다.
  if (!tsconfigRootDir) {
    throw new Error(
      'baseConfig(tsconfigRootDir): tsconfigRootDir는 필수다. 패키지의 ' +
        'eslint.config.mjs에서 `baseConfig(import.meta.dirname)`처럼 절대경로를 넘겨라. ' +
        '생략하면 typescript-eslint가 던지지 않고 자체 추론으로 넘어가 ' +
        'multiple candidate TSConfigRootDirs로 저장소 전체 lint가 죽을 수 있다.',
    );
  }

  return tseslint.config(
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
        // packages/jest-config/tests/config.test.ts가 execFileSync로 실제 jest를
        // 돌리며 만드는 임시 프로젝트 픽스처. .gitignore는 git 추적만 막을 뿐
        // ESLint와는 무관하므로 여기서 따로 제외해야 한다 — 테스트가 죽거나
        // 타임아웃되면 afterEach 정리가 안 돼 잔여물이 남고, 그러면 그 잔여
        // .js/.ts 파일이 어떤 tsconfig에도 속하지 않아 projectService가 파싱에
        // 실패해 저장소 전체 lint가 깨진다(실측 확인됨. tests/tsconfig.json의
        // include: ["."]는 점(dot)으로 시작하는 이 디렉터리를 포함하지 않는다).
        '**/tests/.fixtures/**',
        // devkit-cli/templates/는 생성물에 복사될 파일들이다. 이 저장소의
        // tsconfig 어디에도 속하지 않으므로 projectService가 실패해 ESLint가
        // 크래시한다(eslint-config-nest 최종 리뷰가 잡은 Critical과 같은 부류).
        // .oxlintrc.json의 ignorePatterns가 buildFromOxlintConfigFile을 통해
        // ESLint에도 주입되므로 이 항목은 실질적으로 중복이지만, 저장소 기존
        // 관행(tests/fixtures, tests/.fixtures 모두 양쪽에 명시)을 따라 여기에도
        // 명시적으로 남긴다 — 실측으로 양쪽 다 단독으로 통과시킴을 확인했다.
        '**/templates/**',
      ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },

    {
      // 어떤 tsconfig에도 속하지 않는 설정 파일들 — 타입 인식 자체를 끈다.
      // eslint.base.mjs 자신도 여기 포함해야 한다: 이름이 `*.config.*`가
      // 아니라 위 glob에 안 걸리는데, 어떤 tsconfig에도 속하지 않으므로
      // projectService가 파싱에 실패한다.
      //
      // 'eslint.base.mjs' 항목은 flat config의 files가 **이 설정 파일 기준
      // 상대경로**로 해석되므로 루트 실행에서만 유효하다. 패키지 실행에서는
      // 존재하지 않는 packages/<pkg>/eslint.base.mjs를 가리켜 아무것도
      // 매칭하지 않는다(무해한 no-op — 패키지에는 이 파일이 애초에 없다).
      files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}', 'eslint.base.mjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: false,
        },
      },
    },

    ...extra,

    // ⬇️ 반드시 마지막: oxlint가 담당하는 규칙을 여기서 비활성화한다.
    // 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 이중 보고가 남는다.
    //
    // 경로를 절대경로로 푸는 것이 요구다 — 패키지 설정이 이 함수를 부를 때
    // cwd는 그 패키지 디렉토리이므로, './.oxlintrc.json' 같은 상대경로는
    // 저장소 루트가 아니라 패키지 안을 가리켜 파일을 못 찾는다. 그리고 이때
    // buildFromOxlintConfigFile은 **던지지 않고 조용히 빈 배열을 준다** —
    // stderr에 경고 한 줄만 남고 종료코드는 0이다. 패키지 cwd에서 실측하니
    // 절대경로는 규칙 150개를 off했고 상대경로는 0개였다. 즉 상대경로를 쓰면
    // 린트는 "통과"하면서 oxlint와 ESLint가 같은 위반을 이중 보고하게 된다.
    //
    // `fileURLToPath(new URL(..., import.meta.url))`가 아니라 import.meta.dirname을
    // 쓰는 이유: 이 블록은 위에서 disableTypeChecked 대상이라 타입 인식이 꺼져
    // 있고, .mjs에 대한 ESLint 기본 globals는 비어 있어 `URL`이 no-undef로
    // 잡힌다(실측 확인됨). import.meta.dirname은 전역 참조가 아니라 구문이므로
    // 같은 절대경로를 globals 선언 없이 얻는다.
    ...oxlint.buildFromOxlintConfigFile(
      path.join(import.meta.dirname, '.oxlintrc.json'),
    ),
  );
}
