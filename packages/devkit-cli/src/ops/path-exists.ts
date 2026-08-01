import { stat } from 'node:fs/promises';

/**
 * 경로가 존재하는지 확인한다.
 *
 * `.then(() => true, () => false)` 관용구는 `stat`의 모든 실패를 "없음"으로
 * 읽는다 — `EACCES`(권한 없음) 같은 진짜 문제까지 삼킨다. bin.ts의 대상
 * 디렉토리 존재 검사가 그 예다: `EACCES`가 나면 "존재하지 않음"으로 읽혀
 * 덮어쓰기 방지 가드(설계 6.3절)를 통과시켜 버린다.
 *
 * 이 함수는 `ENOENT`(없음)·`ENOTDIR`(중간 경로가 파일이라 하위 경로가
 * 있을 수 없음)만 "없음"으로 취급하고, 그 외 에러는 다시 던진다.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw error;
  }
}
