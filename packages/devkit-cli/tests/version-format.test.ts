import { describe, expect, it } from 'vitest';
import { readMarker } from '../src/lib/marker.js';
import { displayWidth, formatVersionReport, padTo } from '../src/version/format.js';
import type { VersionReport } from '../src/version/types.js';

/**
 * readMarker(marker.ts)가 알 수 없는 프로젝트 유형에 실제로 던지는 메시지를
 * 가져온다. 값을 손으로 베껴 픽스처로 쓰면 marker.ts 가 문구를 바꿔도
 * 테스트는 조용히 낡은 값을 계속 참조한다 — 실제 throw 지점에서 직접
 * 얻어야 두 파일이 만나는 지점이 고정된다.
 */
function invalidTypeMessage(): string {
  try {
    readMarker({ devkit: { type: 'php', version: '0.1.0' } });
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error('readMarker 가 알 수 없는 유형에 대해 던지지 않았습니다.');
}

/** 어떤 토큰이 그 줄에서 시작하는 표시 폭 위치. 열 정렬 단언에 쓴다. */
function startOf(line: string, token: string): number {
  const index = line.indexOf(token);
  if (index < 0) throw new Error(`'${token}' 가 줄에 없습니다: ${line}`);
  return displayWidth(line.slice(0, index));
}

function lineWith(output: string, token: string): string {
  const line = output.split('\n').find((candidate) => candidate.includes(token));
  if (line === undefined) throw new Error(`'${token}' 가 출력에 없습니다:\n${output}`);
  return line;
}

const REPORT: VersionReport = {
  cli: '0.2.0',
  workspaces: [
    {
      relPath: '.',
      marker: { type: 'monorepo', version: '0.1.0' },
      packages: [
        { name: '@cheolubak/eslint-plugin-fsd', declared: '^0.1.0', installed: '0.1.1' },
        { name: '@cheolubak/prettier-config', declared: '^0.1.0', installed: null },
      ],
    },
  ],
};

describe('displayWidth', () => {
  it('ASCII 는 1칸, 한글은 2칸으로 센다', () => {
    expect(displayWidth('devbak')).toBe(6);
    expect(displayWidth('패키지')).toBe(6);
    expect(displayWidth('a패b')).toBe(4);
    expect(displayWidth('')).toBe(0);
  });
});

describe('padTo', () => {
  it('표시 폭 기준으로 채운다 — 코드포인트 기준이 아니다', () => {
    expect(padTo('패키지', 10)).toBe('패키지    ');
    expect(displayWidth(padTo('패키지', 10))).toBe(10);
    expect(displayWidth(padTo('devbak', 10))).toBe(10);
  });

  it('이미 폭을 넘으면 자르지 않고 그대로 낸다', () => {
    expect(padTo('@cheolubak/eslint-plugin-fsd', 3)).toBe('@cheolubak/eslint-plugin-fsd');
  });
});

describe('formatVersionReport', () => {
  it('워크스페이스가 없으면 CLI 한 줄만 낸다', () => {
    const output = formatVersionReport({ cli: '0.2.0', workspaces: [] });
    expect(output).toBe('devbak  0.2.0\n');
  });

  it('CLI · 마커 · 패키지 세 층을 모두 낸다', () => {
    const output = formatVersionReport(REPORT);
    expect(lineWith(output, 'devbak')).toContain('0.2.0');
    expect(lineWith(output, '(monorepo)')).toContain('0.1.0');
    expect(lineWith(output, '@cheolubak/eslint-plugin-fsd')).toContain('0.1.1');
  });

  it('설치본이 없으면 미설치로 낸다', () => {
    expect(lineWith(formatVersionReport(REPORT), '@cheolubak/prettier-config')).toContain('미설치');
  });

  it('한글 헤더가 있어도 열이 표시 폭 기준으로 맞는다', () => {
    // padEnd 로 구현하면 실패한다 — '패키지' 는 코드포인트 3개지만 6칸이라
    // 헤더 행의 다음 열만 오른쪽으로 밀린다.
    const output = formatVersionReport(REPORT);
    const header = lineWith(output, '선언');
    const row = lineWith(output, '@cheolubak/eslint-plugin-fsd');

    expect(startOf(header, '선언')).toBe(startOf(row, '^0.1.0'));
    expect(startOf(header, '설치본')).toBe(startOf(row, '0.1.1'));
  });

  it('값에 한글이 섞여도 그 행이 다른 행과 어긋나지 않는다', () => {
    const output = formatVersionReport(REPORT);
    const installed = lineWith(output, '0.1.1');
    const notInstalled = lineWith(output, '미설치');

    expect(startOf(notInstalled, '미설치')).toBe(startOf(installed, '0.1.1'));
  });

  it('여러 워크스페이스의 열이 서로 어긋나지 않는다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        REPORT.workspaces[0],
        {
          relPath: 'apps/web',
          marker: { type: 'next', version: '0.1.0' },
          packages: [{ name: '@cheolubak/vitest-config', declared: '^0.1.0', installed: '0.1.1' }],
        },
      ],
    });

    expect(startOf(lineWith(output, '@cheolubak/vitest-config'), '^0.1.0')).toBe(
      startOf(lineWith(output, '@cheolubak/eslint-plugin-fsd'), '^0.1.0'),
    );
  });

  it('마커가 깨진 워크스페이스를 표시하고 나머지 행을 계속 낸다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        { relPath: '.', marker: { broken: 'devkit 마커가 객체가 아닙니다.' }, packages: [] },
        REPORT.workspaces[0],
      ],
    });

    expect(output).toContain('마커 손상');
    expect(output).toContain('devkit 마커가 객체가 아닙니다.');
    expect(output).toContain('@cheolubak/eslint-plugin-fsd');
  });

  it('마커 손상 메시지가 여러 줄이어도 한 줄로 접혀 표가 어긋나지 않는다', () => {
    // readMarker 가 던지는 InvalidMarkerError 세 곳 중 "알 수 없는 프로젝트
    // 유형"만 사람이 콘솔에서 읽기 좋으라고 줄바꿈이 들어 있다(나머지 둘은
    // 한 줄). 임의의 'a\nb' 대신 그 실제 메시지를 그대로 써야, 그 원문을
    // 한 열에 그대로 넣으면 둘째 줄이 정렬 없이 왼쪽 끝에 붙어 표가
    // 무너지는 실제 상황을 검증한다.
    const brokenMessage = invalidTypeMessage();
    expect(brokenMessage).toContain('\n'); // 전제 확인 — 한 줄이면 이 테스트는 의미가 없다

    const multiline = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        { relPath: '.', marker: { broken: brokenMessage }, packages: [] },
        REPORT.workspaces[0],
      ],
    });
    // 리포트가 접어서 낸 결과가, 처음부터 한 줄이었던 것과 완전히 같아야 한다.
    const alreadySingleLine = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        { relPath: '.', marker: { broken: brokenMessage.replace(/\n/g, ' ') }, packages: [] },
        REPORT.workspaces[0],
      ],
    });

    expect(multiline).toBe(alreadySingleLine);
    expect(lineWith(multiline, '마커 손상')).toContain('지원 유형');
  });

  it('패키지가 없는 워크스페이스는 표 머리를 내지 않는다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [{ relPath: '.', marker: { type: 'nest', version: '0.1.0' }, packages: [] }],
    });

    expect(output).not.toContain('선언');
  });
});
