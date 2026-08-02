import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
const PARENT = resolve(TOOLKIT, '..');
const RUN_ID = process.pid;
const created: string[] = [];

/**
 * 정리 정책: create.e2e.test.ts와 같은 관용이다(설계 6.3절 — 공식 CLI가
 * non-zero로 죽으면 "생성물은 지우지 않는다. 지우면 디버깅이 불가능해진다").
 * 이 파일의 "0건" 테스트가 실제로 nest·monorepo에서 실패했던 적이 있다
 * (템플릿 JSON 정규형 결함, e978352에서 수정) — 그때 이 afterEach가 무조건
 * 지우는 버전이었다면 원인 조사의 유일한 증거가 테스트 실패와 동시에
 * 사라졌을 것이다. `context.task.result?.state`로 방금 끝난 테스트가
 * 'fail'인지 확인한다 — afterEach 시점에는 테스트 본문이 이미 실행을
 * 마쳤으므로 result가 확정돼 있다.
 */
afterEach((context) => {
  const failed = context.task.result?.state === 'fail';
  for (const dir of created.splice(0)) {
    if (failed) {
      process.stderr.write(`[e2e] 실패로 보존됨: ${dir} (조사 후 수동 삭제 필요)\n`);
      continue;
    }
    if (process.env.DEVKIT_E2E_KEEP === '1') {
      process.stderr.write(`[e2e] DEVKIT_E2E_KEEP=1 — 정리하지 않고 남깁니다: ${dir}\n`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

function devbak(args: string[], cwd = TOOLKIT): string {
  return execFileSync('node', ['packages/devkit-cli/dist/bin.js', ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function create(name: string, type: string): string {
  const dir = join(PARENT, `${name}-${RUN_ID}`);
  created.push(dir);
  devbak(['create', basename(dir), '--type', type, '--no-verify']);
  return dir;
}

describe.each(['nest', 'next', 'monorepo'])('create → update (%s)', (type) => {
  it('갓 생성한 프로젝트에 update 를 돌리면 변경이 0건이다', () => {
    const dir = create(`devkit-e2e-update-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    // create 와 update 가 같은 레시피에서 갈라지면 여기서 드러난다.
    expect(output).not.toContain('덮어쓰기 (');
    expect(output).not.toContain('신규 (');
    expect(output).toContain('동일 — 건너뜀');
  });

  it('마커 덕분에 --type 없이 돈다', () => {
    const dir = create(`devkit-e2e-marker-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    expect(output).toContain(`(${type})`);
  });
});
