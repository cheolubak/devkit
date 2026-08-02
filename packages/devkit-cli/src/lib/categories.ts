/**
 * `devkit update --only <categories>` 의 카테고리 정의.
 *
 * 설계 5.4절: 카테고리는 레시피 태그가 아니라 **경로 패턴**이다.
 * copyOverlay 한 번이 여러 카테고리의 파일을 함께 복사하므로,
 * 디렉토리 단위 태그로는 파일별 필터가 불가능하다.
 */

export const CATEGORIES = [
  'claude',
  'ci',
  'lint',
  'ts',
  'test',
  'deps',
  'repo',
  'scaffold',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * `update` 가 기본으로 건드리지 않는 카테고리.
 *
 * `scaffold` 는 프레임워크 뼈대 소스(`src/main.ts` 등)다. 생성 시점에 한 번
 * 놓이고 그 뒤로는 **사람이 고쳐 쓰는 파일**이므로, 표준 재적용이 덮어쓰면
 * 사용자의 작업이 사라진다. `--only scaffold` 로 명시해야만 대상이 된다.
 */
export const DEFAULT_EXCLUDED_CATEGORIES: readonly Category[] = ['scaffold'];

/**
 * 프로젝트 상대 경로 → 카테고리.
 *
 * `deps`는 여기에 없다 — package.json 패치와 linkDeps를 가리키는
 * 논리 카테고리라 대응하는 파일이 없다. `lint`의 일부도 마찬가지다 —
 * `eslint.config.mjs`는 파일이지만 `package.json`의 prettier 키는
 * 그렇지 않다(설계 5.4절). 그 몫은 아래 `JSON_KEY_CATEGORIES`가 정의한다.
 *
 * 템플릿의 `_gitignore`·`_prettierignore` 는 언더스코어 접두 형태다 —
 * npm 이 패키지에서 `.gitignore` 를 걸러내므로 그대로 담을 수 없고,
 * `copyOverlay` 가 복사하며 점(dot) 이름으로 되돌린다. 양쪽 이름을 모두
 * 매칭해야 오버레이 커버리지와 실제 소비자 경로가 함께 걸린다.
 */
const FILE_PATTERNS: ReadonlyArray<readonly [RegExp, Category]> = [
  [/^\.claude\/(?:agents|commands)\/.+/, 'claude'],
  [/^CLAUDE\.md$/, 'claude'],
  [/^\.github\/workflows\/.+/, 'ci'],
  [/^eslint\.config\.mjs$/, 'lint'],
  [/^_?\.?prettierignore$/, 'lint'],
  [/^tsconfig(?:\.build)?\.json$/, 'ts'],
  [/^(?:jest|jest-e2e|vitest)\.config\.[cm]?[jt]s$/, 'test'],
  [/^test\/jest-e2e\.config\.[cm]?[jt]s$/, 'test'],
  [/^_?\.?gitignore$/, 'repo'],
  [/^(?:pnpm-workspace\.yaml|turbo\.json|package\.json)$/, 'repo'],
  [/^src\/.+/, 'scaffold'],
];

/**
 * `package.json` 의 **키 단위** 카테고리(설계 5.4절).
 *
 * 같은 이름이 두 역할을 겸하므로 구분해야 한다.
 * - `monorepo` 처럼 템플릿이 `package.json` 을 **통째로** 놓는 경우는 파일이며,
 *   위 `FILE_PATTERNS` 가 `repo` 로 분류한다.
 * - `nest`·`next` 처럼 공식 CLI 산출물에 **키를 얹는** 경우는 파일이 아니라
 *   `mergeJson` 패치이며, 그 몫이 이 테이블이다.
 *
 * 훗날 `update` 조립자가 mergeJson 패치를 `--only` 로 거를 때 이 테이블을 쓴다.
 * 파일 오버레이와 달리 오버레이 커버리지 테스트가 이쪽을 훑지 못하므로,
 * JSON 패치를 추가할 때는 여기도 함께 갱신해야 한다.
 */
export const JSON_KEY_CATEGORIES: Readonly<Record<string, Category>> = {
  prettier: 'lint',
  devDependencies: 'deps',
};

export function categoryOf(relPath: string): Category | null {
  const normalized = relPath.replaceAll('\\', '/');
  for (const [pattern, category] of FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return category;
    }
  }
  return null;
}

export class UnknownCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownCategoryError';
  }
}

/**
 * `--only` 값을 파싱한다.
 *
 * 알 수 없는 값이 하나라도 있으면 전체를 거부한다. 부분 실행하면
 * `--only clade` 가 아무것도 갱신하지 않은 채 성공을 보고하게 되고,
 * 그것이 이 저장소가 반복해서 경계해 온 조용한 실패다(설계 6절).
 */
export function parseOnly(value: string): Category[] {
  const requested = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (requested.length === 0) {
    throw new UnknownCategoryError(
      `--only 에 카테고리를 지정하세요. 유효한 값: ${CATEGORIES.join(', ')}`,
    );
  }

  const known: readonly string[] = CATEGORIES;
  const unknown = requested.filter((part) => !known.includes(part));
  if (unknown.length > 0) {
    throw new UnknownCategoryError(
      `알 수 없는 카테고리: ${unknown.join(', ')}\n유효한 값: ${CATEGORIES.join(', ')}`,
    );
  }

  return [...new Set(requested)] as Category[];
}
