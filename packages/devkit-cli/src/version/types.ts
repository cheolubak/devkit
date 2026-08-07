import type { DevkitMarker } from '../lib/marker.js';

/** 한 워크스페이스에서 발견한 devkit 설정 패키지 하나. */
export interface DevkitPackage {
  /** 완전한 패키지 이름. 예: '@cheolubak/tsconfig' */
  name: string;
  /** package.json 에 적힌 범위. 예: '^0.1.0' */
  declared: string;
  /** node_modules 에서 읽은 실제 버전. 찾지 못하면 null. */
  installed: string | null;
}

/**
 * 마커가 있는데 형태가 틀린 경우.
 *
 * 던지지 않고 값으로 담는 이유는 진단 명령이기 때문이다 — 한 워크스페이스의
 * 마커가 깨졌다고 나머지 워크스페이스 정보까지 못 보게 되면 거꾸로다.
 */
export interface BrokenMarker {
  broken: string;
}

export function isBrokenMarker(marker: DevkitMarker | BrokenMarker): marker is BrokenMarker {
  return 'broken' in marker;
}

export interface WorkspaceReport {
  /** 스캔 시작 지점 기준 상대경로. 시작 지점 자신은 '.' 이고 구분자는 항상 '/'. */
  relPath: string;
  marker: DevkitMarker | BrokenMarker;
  packages: DevkitPackage[];
}

export interface VersionReport {
  /** 설치된 CLI 자신의 버전. */
  cli: string;
  /** 상대경로 오름차순('.' 이 항상 맨 앞). 빈 배열이면 devkit 프로젝트가 아니다. */
  workspaces: WorkspaceReport[];
}
