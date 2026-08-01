/**
 * `devkit update --only <categories>` 의 카테고리 정의.
 *
 * 설계 5.4절: 카테고리는 레시피 태그가 아니라 **경로 패턴**이다.
 * copyOverlay 한 번이 여러 카테고리의 파일을 함께 복사하므로,
 * 디렉토리 단위 태그로는 파일별 필터가 불가능하다.
 */

export const CATEGORIES = ['claude', 'ci', 'lint', 'ts', 'test', 'deps', 'repo'] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * 프로젝트 상대 경로 → 카테고리.
 *
 * `deps`는 여기에 없다 — package.json 패치와 linkDeps를 가리키는
 * 논리 카테고리라 대응하는 파일이 없다. `lint`의 일부도 마찬가지다 —
 * `eslint.config.mjs`는 파일이지만 `package.json`의 prettier 키는
 * 그렇지 않다(설계 5.4절). 그 몫은 아래 `JSON_KEY_CATEGORIES`가 정의한다.
 */
const FILE_PATTERNS: ReadonlyArray<readonly [RegExp, Category]> = [
  [/^\.claude\/(?:agents|commands)\/.+/, 'claude'],
  [/^CLAUDE\.md$/, 'claude'],
  [/^\.github\/workflows\/.+/, 'ci'],
  [/^eslint\.config\.mjs$/, 'lint'],
  [/^tsconfig\.json$/, 'ts'],
  [/^(?:jest\.config\.ts|test\/jest-e2e\.config\.ts|vitest\.config\.ts)$/, 'test'],
  [/^\.gitignore$/, 'repo'],
];

/**
 * `package.json` 은 파일 패턴이 아니라 **키 단위**로 카테고리에 속한다(설계 5.4절).
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
