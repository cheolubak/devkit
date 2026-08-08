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
 * `deps`는 여기에 없다 — package.json 패치와 registryDeps를 가리키는
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
  // 에이전트·커맨드·스킬은 한 카테고리다. 셋이 서로를 경로 문자열로
  // 가리키므로(리뷰어 → 스킬, 커맨드 → 스킬) 따로 갱신되면 결합이 끊긴다.
  // `skills` 가 빠져 있으면 두 겹으로 샌다: 오버레이 커버리지 테스트가
  // 실패하고, 그것을 우회하면 `update --only claude` 가 스킬을 영원히
  // 갱신하지 않으면서 성공을 보고한다.
  [/^\.claude\/(?:agents|commands|skills)\/.+/, 'claude'],
  [/^CLAUDE\.md$/, 'claude'],
  [/^\.github\/workflows\/.+/, 'ci'],
  [/^eslint\.config\.mjs$/, 'lint'],
  [/^_?\.?prettierignore$/, 'lint'],
  // .npmrc 는 레지스트리 접근 설정이라 의존성과 함께 움직인다(설계 5.3절).
  // 덕분에 `devbak update --only deps` 가 기존 link: 프로젝트에 .npmrc 와
  // @cheolubak/* 버전 범위를 한 번에 놓는다. 다만 **완전한 마이그레이션은
  // 아니다** — registryDeps 는 새 키를 얹기만 하므로 옛 `@devbak/*`: `link:...`
  // 항목은 그대로 남고, 손으로 지워야 한다. 지우지 않으면 이어지는
  // pnpm install 이 옛 패키지를 같이 설치하거나(중복 설정) 경로가 깨져 죽는다.
  [/^_?\.?npmrc$/, 'deps'],
  [/^tsconfig(?:\.build)?\.json$/, 'ts'],
  [/^(?:jest|jest-e2e|vitest)\.config\.[cm]?[jt]s$/, 'test'],
  [/^test\/jest-e2e\.config\.[cm]?[jt]s$/, 'test'],
  [/^_?\.?gitignore$/, 'repo'],
  [/^(?:pnpm-workspace\.yaml|turbo\.json|package\.json)$/, 'repo'],
  [/^src\/.+/, 'scaffold'],
];

/**
 * `package.json` 의 **키 경로** 카테고리(설계 6.2절).
 *
 * `package.json` 만 키 단위인 이유는 그 파일의 키가 실제로 여러 카테고리에
 * 걸쳐 있기 때문이다 — `prettier` 는 lint, `devDependencies` 는 deps,
 * `jest` 는 test 다. 파일 하나로 뭉뚱그리면 `--only lint` 가 의존성까지
 * 갱신한다. 다른 JSON 파일(`tsconfig.json`·`turbo.json`)은 파일 카테고리를
 * 그대로 물려받는다.
 *
 * 점 경로 prefix 매칭이며 **더 긴 쪽이 이긴다**. `devDependencies.eslint` 는
 * `devDependencies` 에 걸리고, `scripts.lint` 는 `scripts` 에 항목이 없으므로
 * 자기 자신에 걸린다.
 *
 * 여기 없는 경로를 만나면 호출자가 던진다(설계 6.3절). 조용히 건너뛰면 그
 * 키는 어떤 `--only` 로도 갱신되지 않으면서 성공을 보고한다.
 */
export const JSON_KEY_CATEGORIES: Readonly<Record<string, Category>> = {
  dependencies: 'deps',
  devDependencies: 'deps',
  prettier: 'lint',
  jest: 'test',
  'scripts.lint': 'lint',
  'scripts.format': 'lint',
  'scripts.format:check': 'lint',
  'scripts.test': 'test',
  'scripts.test:watch': 'test',
  'scripts.test:e2e': 'test',
  'scripts.build': 'repo',
  'scripts.dev': 'repo',
  'scripts.typecheck': 'repo',
  packageManager: 'repo',
  private: 'repo',
  type: 'repo',
};

/**
 * 유형 마커의 키. 카테고리를 갖지 않는다 — `--only` 로 거르는 대상이
 * 아니라 전체 update 만 심는 별도 취급이다(설계 4.2절).
 */
export const MARKER_KEY = 'devkit';

/**
 * 프로젝트 고유값이라 재적용 대상에서 제외하는 `package.json` 키.
 *
 * 템플릿의 `"name": "__NAME__"` 은 create 가 디렉토리 이름으로 치환하는
 * 자리다. update 가 이를 다시 쓰면 사용자가 바꾼 패키지 이름을 디렉토리
 * 이름으로 되돌린다(설계 5.5절).
 */
export const PROJECT_OWNED_KEYS: readonly string[] = ['name', 'version'];

/**
 * 점 경로에 해당하는 카테고리. 더 내려가야 하면 `null`.
 *
 * `null` 은 "모른다"가 아니라 "이 노드에서는 결정할 수 없으니 자식으로
 * 내려가라"는 뜻이다. 잎(leaf)에 닿았는데도 `null` 이면 그때 호출자가
 * `UnknownCategoryError` 를 던진다.
 */
export function categoryOfJsonPath(path: string): Category | null {
  let best: { key: string; category: Category } | null = null;

  for (const [key, category] of Object.entries(JSON_KEY_CATEGORIES)) {
    if (path !== key && !path.startsWith(`${key}.`)) continue;
    if (best === null || key.length > best.key.length) {
      best = { key, category };
    }
  }

  return best?.category ?? null;
}

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
