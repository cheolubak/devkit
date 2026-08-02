import {
  categoryOfJsonPath,
  MARKER_KEY,
  PROJECT_OWNED_KEYS,
  UnknownCategoryError,
  type Category,
} from '../lib/categories.js';
import type { JsonObject } from '../ops/merge-json.js';

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** POSIX·Windows 구분자 모두에서 마지막 경로 조각. */
function baseName(relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function isJsonOverlay(relPath: string): boolean {
  return baseName(relPath).endsWith('.json');
}

/**
 * 통짜 JSON 파일 오버레이를 병합 패치로 바꾼다(설계 5.5절).
 *
 * update 가 이런 파일을 통째로 덮으면 사용자가 늘린 의존성·스크립트와
 * compilerOptions.paths 가 사라진다. create 는 빈 디렉토리에 놓으므로
 * 그대로 써도 되고, 그래서 이 환원은 update 전용이다.
 *
 * 대가는 **키 삭제가 전파되지 않는다**는 것이다. 템플릿에서 스크립트를
 * 없애도 기존 프로젝트에는 남는다. 남는 쪽이 사라지는 쪽보다 회복 가능하다.
 */
export function reduceJsonOverlay(relPath: string, content: string): JsonObject {
  const parsed = JSON.parse(content) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`${relPath}: JSON 오버레이가 객체가 아닙니다.`);
  }

  if (baseName(relPath) !== 'package.json') return parsed;

  const result: JsonObject = { ...parsed };
  for (const key of PROJECT_OWNED_KEYS) delete result[key];
  return result;
}

/**
 * 패치에서 대상 카테고리에 해당하는 부분만 남긴다.
 *
 * `fileCategory` 가 주어지면(= package.json 이 아닌 JSON 파일) 그 카테고리
 * 하나로 전부를 판단한다. `null` 이면 키 경로 테이블로 내려가며 판단한다 —
 * package.json 만 키가 여러 카테고리에 걸쳐 있기 때문이다(설계 6.1절).
 */
export function filterPatchByCategory(
  patch: JsonObject,
  only: ReadonlySet<Category>,
  fileCategory: Category | null,
): JsonObject {
  if (fileCategory !== null) {
    return only.has(fileCategory) ? patch : {};
  }
  return filterByPath(patch, only, '');
}

function filterByPath(patch: JsonObject, only: ReadonlySet<Category>, prefix: string): JsonObject {
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(patch)) {
    // 마커는 카테고리를 갖지 않는다 — 전체 update 만 심는 별도 취급이라
    // 조립자가 따로 얹는다(설계 4.2절).
    if (prefix === '' && key === MARKER_KEY) continue;

    const path = prefix === '' ? key : `${prefix}.${key}`;
    const category = categoryOfJsonPath(path);

    if (category !== null) {
      if (only.has(category)) result[key] = value;
      continue;
    }

    // 표에 없는 중간 노드는 자식으로 내려간다. 잎인데도 못 정하면 던진다 —
    // 조용히 건너뛰면 그 키는 어떤 --only 로도 갱신되지 않으면서 성공을
    // 보고한다(설계 6.3절).
    if (!isPlainObject(value)) {
      throw new UnknownCategoryError(
        `분류되지 않은 package.json 키 경로: '${path}'\n` +
          `src/lib/categories.ts 의 JSON_KEY_CATEGORIES 에 추가하세요.`,
      );
    }

    const nested = filterByPath(value, only, path);
    // 자식이 전부 걸러진 빈 객체는 남기지 않는다. applyPatch 가 아무 일도
    // 하지 않으면서 변경 목록에는 잡히는 잡음이 된다.
    if (Object.keys(nested).length > 0) result[key] = nested;
  }

  return result;
}
