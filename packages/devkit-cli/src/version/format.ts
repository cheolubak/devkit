import { isBrokenMarker, type VersionReport, type WorkspaceReport } from './types.js';

const CLI_LABEL = 'devbak';
const HEADER_NAME = '패키지';
const HEADER_DECLARED = '선언';
const HEADER_INSTALLED = '설치본';
const NOT_INSTALLED = '미설치';

/** 열 사이 최소 간격. */
const GAP = 2;

/**
 * 동아시아 전각 문자를 2칸으로 세는 표시 폭.
 *
 * padEnd 는 코드포인트를 세지만 터미널은 표시 폭으로 그린다 —
 * '패키지'.padEnd(30) 은 코드포인트 30개지만 화면에서는 33칸이라
 * 그 행의 다음 열만 3칸 밀린다.
 *
 * 전체 유니코드 East Asian Width 표를 옮겨오지 않는다. 이 리포트에 나올 수
 * 있는 것은 한글과 CJK 기호뿐이고, 이모지·결합문자까지 다루는 범용 폭
 * 계산기를 만드는 것은 이 명령의 일이 아니다.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isFullWidth(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 부수 ~ 이(Yi)
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // CJK 호환 한자
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 호환 형태
    (code >= 0xff00 && code <= 0xff60) || // 전각 형태
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** displayWidth 기준으로 오른쪽을 공백으로 채운다. 넘치면 자르지 않는다. */
export function padTo(text: string, width: number): string {
  const gap = width - displayWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

function indent(text: string): string {
  return `  ${text}`;
}

function workspaceLabel(workspace: WorkspaceReport): string {
  return isBrokenMarker(workspace.marker)
    ? workspace.relPath
    : `${workspace.relPath} (${workspace.marker.type})`;
}

function workspaceValue(workspace: WorkspaceReport): string {
  return isBrokenMarker(workspace.marker)
    ? `마커 손상 — ${collapseLines(workspace.marker.broken)}`
    : workspace.marker.version;
}

/**
 * 여러 줄 에러 메시지를 한 줄로 접는다.
 *
 * readMarker(마커.ts)가 던지는 InvalidMarkerError 메시지 중 일부는
 * 사람이 콘솔에서 읽기 좋으라고 줄바꿈이 들어 있다. 그 원문을 그대로 한
 * 열에 넣으면 둘째 줄이 열 정렬 없이 왼쪽 끝에 붙어 표가 무너진다.
 * marker.ts는 다른 소비처(update 등)에는 여러 줄이 맞으므로 건드리지
 * 않고, 표시를 책임지는 이쪽에서 접는다.
 */
function collapseLines(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ');
}

export function formatVersionReport(report: VersionReport): string {
  // 1열 폭을 워크스페이스마다 따로 재면 섹션끼리 열이 어긋나 한 화면에서
  // 계단처럼 보인다. 모든 행의 후보를 먼저 모아 한 번에 정한다.
  const firstColumn: string[] = [CLI_LABEL];
  const secondColumn: string[] = [];

  for (const workspace of report.workspaces) {
    firstColumn.push(workspaceLabel(workspace));
    if (workspace.packages.length === 0) continue;
    firstColumn.push(indent(HEADER_NAME));
    secondColumn.push(HEADER_DECLARED);
    for (const pkg of workspace.packages) {
      firstColumn.push(indent(pkg.name));
      secondColumn.push(pkg.declared);
    }
  }

  const width1 = Math.max(...firstColumn.map(displayWidth)) + GAP;
  const width2 = Math.max(0, ...secondColumn.map(displayWidth)) + GAP;

  const lines = [padTo(CLI_LABEL, width1) + report.cli];

  for (const workspace of report.workspaces) {
    lines.push('');
    lines.push(padTo(workspaceLabel(workspace), width1) + workspaceValue(workspace));
    if (workspace.packages.length === 0) continue;
    lines.push(
      padTo(indent(HEADER_NAME), width1) + padTo(HEADER_DECLARED, width2) + HEADER_INSTALLED,
    );
    for (const pkg of workspace.packages) {
      lines.push(
        padTo(indent(pkg.name), width1) +
          padTo(pkg.declared, width2) +
          (pkg.installed ?? NOT_INSTALLED),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
