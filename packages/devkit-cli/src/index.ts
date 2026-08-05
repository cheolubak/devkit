/**
 * @cheolubak/devkit-cli 공개 표면.
 *
 * `create` 계열(레시피 실행기·원자 연산)과, `update` 관련 모듈을 함께
 * 노출한다. 후자는 순수 모듈(`categories`·`marker`·`classify`·`git`)뿐
 * 아니라 조립기(`runUpdate`·`buildPlan`)까지 내보낸다 — `bin.ts`는
 * `runUpdate` 하나만 가져다 쓰고, 프로그램으로 `devkit-cli`를 소비하는
 * 쪽은 `buildPlan`으로 조립 이전 단계(계획만 계산하고 쓰지 않는 경로)에
 * 개입할 수 있다.
 */
export * from './types.js';
export * from './run.js';
export * from './ops/index.js';

export {
  CATEGORIES,
  categoryOf,
  DEFAULT_EXCLUDED_CATEGORIES,
  JSON_KEY_CATEGORIES,
  parseOnly,
  UnknownCategoryError,
  type Category,
} from './lib/categories.js';

export {
  InvalidMarkerError,
  markerPatch,
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
  type DevkitMarker,
  type ProjectType,
} from './lib/marker.js';

export {
  classifyFiles,
  formatChangeList,
  type ChangeKind,
  type ClassifiedFile,
  type PlannedFile,
} from './lib/classify.js';

export { inspectGit, type GitState } from './lib/git.js';

export { runUpdate, type UpdateOptions } from './update/index.js';
export { buildPlan, effectiveCategories, type BuildPlanOptions } from './update/plan.js';
export { resolveType, type ResolvedType } from './update/resolve-type.js';
