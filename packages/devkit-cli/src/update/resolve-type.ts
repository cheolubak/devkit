import {
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
  type ProjectType,
} from '../lib/marker.js';

export interface ResolvedType {
  type: ProjectType;
  /** 마커에서 읽었는가. 완료 메시지에서 안내를 낼지 판단한다(설계 4.2절). */
  hadMarker: boolean;
}

function assertKnown(requested: string): asserts requested is ProjectType {
  const known: readonly string[] = PROJECT_TYPES;
  if (!known.includes(requested)) {
    throw new Error(
      `알 수 없는 --type: ${requested}\n지원 유형: ${PROJECT_TYPES.join(', ')}`,
    );
  }
}

/**
 * 대상의 유형을 정한다(설계 3.1절).
 *
 * 마커와 `--type` 이 어긋나면 거부한다. 사용자가 대상을 착각했거나 마커가
 * 오염됐다는 신호이고, 조용히 한쪽을 고르면 **엉뚱한 유형의 표준을
 * 덮어쓴다.** `--force` 로도 우회하지 못한다 — 되돌릴 수 있는 상태의
 * 문제가 아니라 입력이 틀렸다는 신호다.
 */
export function resolveType(packageJson: unknown, requested?: string): ResolvedType {
  if (requested !== undefined) assertKnown(requested);

  let marker: ProjectType | null = null;
  try {
    marker = readMarker(packageJson).type;
  } catch (error) {
    // 마커가 없는 것은 정상 경로다(외부 프로젝트). 형식이 깨진 마커는
    // 그대로 던진다 — 사람이 손볼 문제다.
    if (!(error instanceof MissingMarkerError)) throw error;
  }

  if (marker === null) {
    if (requested === undefined) {
      throw new MissingMarkerError(
        'package.json 에 devkit 마커가 없습니다. devkit 으로 생성한 프로젝트가 아니거나 마커가 지워졌습니다.\n' +
          `--type <${PROJECT_TYPES.join('|')}> 으로 유형을 명시하세요.`,
      );
    }
    return { type: requested, hadMarker: false };
  }

  if (requested !== undefined && requested !== marker) {
    throw new Error(
      `유형이 어긋납니다 — 마커는 ${marker} 인데 --type은 ${requested} 입니다.\n` +
        '대상 경로가 맞는지 확인하세요. 이 불일치는 --force 로도 우회하지 못합니다.',
    );
  }

  return { type: marker, hadMarker: true };
}
