/**
 * package.json 의 devkit 마커.
 *
 * `devkit update` 는 대상이 어떤 유형인지 알아야 한다. 의존성으로
 * 짐작하는 휴리스틱(@nestjs/core 유무 등)은 조용히 틀릴 수 있으므로
 * create 가 심어 둔 마커만 신뢰한다(설계 5.1절).
 */

export const PROJECT_TYPES = ['nest', 'next', 'monorepo'] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface DevkitMarker {
  type: ProjectType;
  version: string;
}

export class MissingMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMarkerError';
  }
}

export class InvalidMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMarkerError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readMarker(packageJson: unknown): DevkitMarker {
  if (!isRecord(packageJson) || packageJson.devkit == null) {
    throw new MissingMarkerError(
      'package.json 에 devkit 마커가 없습니다. devkit 으로 생성한 프로젝트가 아니거나 마커가 지워졌습니다.\n' +
        `--type <${PROJECT_TYPES.join('|')}> 으로 유형을 명시하세요.`,
    );
  }

  const marker = packageJson.devkit;
  if (!isRecord(marker)) {
    throw new InvalidMarkerError('package.json 의 devkit 마커가 객체가 아닙니다.');
  }

  const { type, version } = marker;
  const knownTypes: readonly string[] = PROJECT_TYPES;
  if (typeof type !== 'string' || !knownTypes.includes(type)) {
    throw new InvalidMarkerError(
      `알 수 없는 프로젝트 유형: ${String(type)}\n지원 유형: ${PROJECT_TYPES.join(', ')}`,
    );
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new InvalidMarkerError('devkit 마커에 version 문자열이 없습니다.');
  }

  return { type: type as ProjectType, version };
}

/** create 와 전체 update 가 mergeJson 에 넘길 패치. */
export function markerPatch(type: ProjectType, version: string): { devkit: DevkitMarker } {
  return { devkit: { type, version } };
}
