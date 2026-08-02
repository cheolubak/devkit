import { createInterface } from 'node:readline/promises';

/**
 * y/N 프롬프트. 기본값은 아니오다.
 *
 * 대문자 N 이 기본이라는 관례를 지킨다 — 파괴적일 수 있는 작업에서
 * 엔터 한 번이 진행으로 읽히면 안 된다.
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
