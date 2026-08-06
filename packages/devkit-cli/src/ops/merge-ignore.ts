/**
 * devkit 이 관리하는 구간의 구분자.
 *
 * 구분자로 감싸는 이유는 갱신 가능성이다. 없으면 "devkit 이 넣은 줄"과
 * "사용자가 넣은 줄"을 구별할 방법이 없어 규칙을 바꾸는 순간 갱신이 곧
 * 파괴가 된다.
 */
export const DEVKIT_BLOCK_START = '# >>> devkit >>>';
export const DEVKIT_BLOCK_END = '# <<< devkit <<<';

/** 중복 판정용 정규화. 빈 줄과 주석은 판정 대상이 아니다. */
function significant(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null;
  return trimmed;
}

/**
 * 무시 파일을 병합한다. 대상의 기존 내용을 유지하고, 없는 템플릿 줄만
 * 더하고, devkit 블록은 통째로 갈아끼운다.
 *
 * 통째 덮어쓰기를 하지 않는 이유는 update 가 사용자가 추가한 규칙을 지우기
 * 때문이다(설계 1.2절). JSON 오버레이가 이미 같은 이유로 병합 패치를 쓴다.
 *
 * 중복 판정은 **정확한 문자열 일치**다. `node_modules` 와 `node_modules/` 는
 * 다른 줄로 남는다 — git 의 무시 문법을 재구현하는 비용이 이득보다 크고
 * 중복 규칙 자체는 무해하다(설계 3절).
 */
export function mergeIgnore(existing: string, lines: string[], block: string[]): string {
  const existingLines = existing.length === 0 ? [] : existing.replace(/\n$/, '').split('\n');

  const startAt = existingLines.indexOf(DEVKIT_BLOCK_START);
  let head: string[];
  let tail: string[];
  if (startAt === -1) {
    head = existingLines;
    tail = [];
  } else {
    const endAt = existingLines.indexOf(DEVKIT_BLOCK_END, startAt);
    if (endAt === -1) {
      // 열린 구분자만 있으면 어디까지가 블록인지 알 수 없다. 파일 끝까지
      // 삼켜 사용자 규칙을 날리는 대신 멈춘다.
      throw new Error(
        `${DEVKIT_BLOCK_START} 는 있는데 닫는 구분자 ${DEVKIT_BLOCK_END} 가 없습니다. 손으로 고친 뒤 다시 실행하세요.`,
      );
    }
    head = existingLines.slice(0, startAt);
    tail = existingLines.slice(endAt + 1);
  }

  // 존재 판정을 이원화한다. 유의미 줄은 trim 키로, 빈 줄·주석은 원문 그대로
  // 비교한다. 하나의 Set 으로 합치면 안 되는 이유: significant() 가 빈 줄·
  // 주석에 null 을 반환하는데 그걸 존재 판정 없이 매번 추가하면 같은 lines
  // 로 두 번 돌릴 때마다 주석이 계속 쌓여 멱등성이 깨진다(리뷰 회귀 재현).
  //
  // 트레이드오프: 원문 일치는 위치를 구분 못 한다 — 대상에 빈 줄이 이미
  // 하나라도 있으면 템플릿이 구획용으로 넣으려는 빈 줄도 "이미 있음"으로
  // 판정돼 생략된다. 빈 줄 자체는 무해하므로(gitignore 의미에 영향 없음)
  // 멱등성을 얻는 대가로 받아들인다. 주석은 텍스트가 정확히 같을 때만
  // 생략되므로 사용자가 쓴 다른 주석은 그대로 남는다(테스트 7).
  const significantPresent = new Set<string>();
  const verbatimPresent = new Set<string>();
  for (const line of [...head, ...tail]) {
    const key = significant(line);
    if (key !== null) significantPresent.add(key);
    else verbatimPresent.add(line);
  }

  const added: string[] = [];
  for (const line of lines) {
    const key = significant(line);
    if (key !== null) {
      if (significantPresent.has(key)) continue;
      significantPresent.add(key);
    } else {
      if (verbatimPresent.has(line)) continue;
      verbatimPresent.add(line);
    }
    added.push(line);
  }

  const merged = [...head, ...added];
  // 블록 앞에 빈 줄 하나를 둔다 — 사람이 읽을 때 경계가 보인다.
  while (merged.length > 0 && merged.at(-1)?.trim() === '') merged.pop();
  if (merged.length > 0) merged.push('');
  merged.push(DEVKIT_BLOCK_START, ...block, DEVKIT_BLOCK_END, ...tail);

  return `${merged.join('\n').replace(/\n+$/, '')}\n`;
}
