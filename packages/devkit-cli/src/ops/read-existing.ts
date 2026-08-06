import { readFile } from 'node:fs/promises';

/**
 * 대상 파일의 기존 내용을 읽는다. 없으면(ENOENT) 빈 문자열로 취급한다 —
 * 신규 프로젝트에 처음 놓는 것은 정상 경로다.
 *
 * `.catch(() => '')` 관용구는 `readFile`의 모든 실패를 "없음"으로 읽는다 —
 * `EACCES`(권한 없음) 같은 진짜 읽기 실패까지 "빈 대상"으로 오인해 기존
 * `.gitignore`를 조용히 덮어쓴다. 이 함수가 병합 대상으로 삼는 파일이 바로
 * 그렇게 사라지면 안 되는 대상이라(설계 2.1절), `pathExists`(ENOENT·ENOTDIR
 * 전용 판정)와 같은 관용으로 `ENOENT`만 "없음"으로 취급하고 그 외 에러는
 * 다시 던진다.
 */
export async function readExistingOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return '';
    throw error;
  }
}
