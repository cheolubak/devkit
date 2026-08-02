/**
 * @devbak/devkit-cli 공개 표면.
 *
 * `create` 계열(레시피 실행기·원자 연산)과, `update` 가 조립할 순수 모듈을
 * 함께 노출한다. 후자는 서로를 import 하지 않는 독립 모듈이며 조립은
 * 호출자의 몫이다.
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
