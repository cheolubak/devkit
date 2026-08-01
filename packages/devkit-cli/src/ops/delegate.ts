import { spawn } from 'node:child_process';
import { basename, dirname } from 'node:path';
import type { Ctx, Step } from '../types.js';

function exec(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`\`${command} ${args.join(' ')}\`가 종료 코드 ${code}로 실패했습니다.`));
    });
  });
}

export interface DelegateOptions {
  /** targetDir 대신 이 절대경로에서 실행. 미지정 시 ctx.targetDir */
  cwd?: 'targetDir' | 'parent';
}

export function delegate(command: string, args: string[], options: DelegateOptions = {}): Step {
  const where = options.cwd ?? 'targetDir';

  return {
    kind: 'delegate',
    label: `${command} ${args.join(' ')}`,
    describe: () => ({ command, args, cwd: where }),
    run: async (ctx: Ctx) => {
      const cwd = where === 'parent' ? dirname(ctx.targetDir) : ctx.targetDir;
      await exec(command, args, cwd);
    },
  };
}

/**
 * 스캐폴딩 전용. 공식 CLI는 인자로 받은 디렉토리를 스스로 만들므로,
 * 부모 디렉토리에서 실행하고 basename을 넘겨야 한다.
 * 이 대칭 덕분에 모노레포가 next 레시피를 그대로 합성할 수 있다.
 */
export function scaffold(command: string, argsBefore: string[], argsAfter: string[]): Step {
  return {
    kind: 'delegate',
    label: `스캐폴딩: ${command} ${argsBefore.join(' ')} <name> ${argsAfter.join(' ')}`,
    describe: () => ({ command, argsBefore, argsAfter, cwd: 'parent' }),
    run: async (ctx: Ctx) => {
      const args = [...argsBefore, basename(ctx.targetDir), ...argsAfter];
      await exec(command, args, dirname(ctx.targetDir));
    },
  };
}
