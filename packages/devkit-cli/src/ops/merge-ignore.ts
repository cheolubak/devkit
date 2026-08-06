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
 * block 안의 `!X/Y/` 부정 패턴에서, 그 패턴을 무력화하는 조상 디렉토리
 * 경로(`X`, 깊으면 `X/Y` 도)를 전부 뽑는다. 부정 패턴이 없으면 빈 Set.
 */
function ancestorPathsToStrip(block: readonly string[]): Set<string> {
  const ancestors = new Set<string>();
  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('!')) continue;
    const segments = trimmed
      .slice(1)
      .split('/')
      .filter((segment) => segment.length > 0);
    // 마지막 세그먼트가 부정 패턴 자신이다 — 그 앞의 모든 접두가 조상이다.
    for (let i = 1; i < segments.length; i += 1) {
      ancestors.add(segments.slice(0, i).join('/'));
    }
  }
  return ancestors;
}

/**
 * line 이 ancestors 안의 어떤 경로와 "정확히" 같은 디렉토리 제외 줄인지
 * 본다. 트레일링 슬래시 유무만 다른 것도 같은 줄로 취급한다(`.claude` ==
 * `.claude/`). `.claude/foo` 처럼 자식을 가리키는 줄은 걸리지 않는다 —
 * exact match 만 본다.
 */
function isAncestorExclusion(line: string, ancestors: ReadonlySet<string>): boolean {
  const trimmed = line.trim().replace(/\/$/, '');
  return ancestors.has(trimmed);
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

  // "줄을 지우지 않는다"는 원칙의 유일한 예외다. block 이 `!.claude/agents/`
  // 처럼 특정 하위 경로를 되살리려 하는데, 대상에 그 조상을 통째로 무시하는
  // 줄(`.claude/`·`.claude`)이 이미 있으면 git 은 애초에 그 디렉토리 안으로
  // 내려가지 않아 부정 패턴이 물리적으로 아무 효력이 없다(git-ignore(5)).
  // 즉 이 줄을 "유지"하면 블록 자체가 죽은 코드가 된다 — 남기는 쪽이 항상
  // 안전하다는 일반 원칙이 여기서는 거꾸로 뒤집힌다. 정확히 일치하는 조상
  // 줄만 지운다 — `.claude/foo` 처럼 자식을 가리키는 줄은 건드리지 않는다.
  const ancestorsToStrip = ancestorPathsToStrip(block);
  const stripAncestors = (arr: readonly string[]): string[] =>
    arr.filter((line) => !isAncestorExclusion(line, ancestorsToStrip));
  head = stripAncestors(head);
  tail = stripAncestors(tail);

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
