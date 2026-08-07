import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const WORKFLOWS_DIR = `${TEMPLATES_DIR}_shared/.github/workflows`;
const AUTO_MERGE = `${WORKFLOWS_DIR}/auto-merge.yml`;
const CLAUDE_REVIEW = `${WORKFLOWS_DIR}/claude-review.yml`;

/**
 * 워크플로 YAML 의 최상위 `name:` 값. 따옴표를 벗긴다.
 *
 * 던지는 것이 요구다 — 없을 때 빈 문자열을 돌려주면 아래 "이름이 일치한다"
 * 단언이 `''` 끼리 비교해 항상 통과하는 공허한 단언이 된다.
 */
function workflowName(yaml: string): string {
  const matched = /^name:[ \t]*(.+)$/m.exec(yaml);
  if (matched === null) throw new Error('워크플로에 최상위 name: 이 없다');
  return matched[1].trim().replace(/^['"]|['"]$/g, '');
}

async function readAutoMerge(): Promise<string> {
  return readFile(AUTO_MERGE, 'utf8');
}

describe('_shared 자동 머지 워크플로', () => {
  it('파일이 존재하고 claude-review.yml 과 함께 놓인다', async () => {
    const entries = await readdir(WORKFLOWS_DIR);
    expect(entries).toContain('auto-merge.yml');
    expect(entries).toContain('claude-review.yml');
  });

  it('트리거가 workflow_run 과 pull_request_review 둘 다다', async () => {
    // 하나만 두면 승인 경로 하나가 조용히 죽는다. GITHUB_TOKEN 이 일으킨
    // 이벤트는 새 워크플로 실행을 만들지 않으므로, Claude 봇의 승인은
    // pull_request_review 를 발화시키지 못한다(설계 2.1절).
    const doc = await readAutoMerge();
    expect(doc).toContain('workflow_run:');
    expect(doc).toContain('pull_request_review:');
  });

  it('workflow_run 이 듣는 이름이 claude-review.yml 의 name 과 일치한다', async () => {
    // 이름이 어긋나면 워크플로는 **에러 없이** 영원히 실행되지 않는다.
    // 실행으로는 절대 드러나지 않으므로 여기서 결합을 고정한다.
    const [auto, review] = await Promise.all([
      readAutoMerge(),
      readFile(CLAUDE_REVIEW, 'utf8'),
    ]);
    const reviewName = workflowName(review);
    const line = /^\s*workflows:[ \t]*(.+)$/m.exec(auto);
    expect(line, 'auto-merge.yml 에 workflows: 줄이 없다').not.toBeNull();
    expect(line?.[1]).toContain(reviewName);
  });

  it('rebase 로 머지하고 브랜치를 지운다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('--rebase');
    expect(doc).toContain('--delete-branch');
    expect(doc).not.toContain('--squash');
    expect(doc).not.toContain('--merge');
  });

  it('옵아웃 라벨 이름을 갖는다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('no-auto-merge');
  });

  it('머지와 리뷰 조회에 필요한 권한을 선언한다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('contents: write');
    expect(doc).toContain('pull-requests: write');
    expect(doc).toContain('checks: read');
  });

  it('자기 자신을 workflowName 으로 체크 집계에서 뺀다', async () => {
    // CheckRun 의 .name 은 워크플로가 아니라 **잡** 이름이다. .name 으로
    // 거르면 잡 이름과 어긋나 자기 자신이 집계에 남고, 그 체크는 항상
    // IN_PROGRESS 이므로 영원히 머지되지 않는다(설계 5.5절).
    const doc = await readAutoMerge();
    expect(doc).toContain('.workflowName');
    // 이름을 손으로 박으면 워크플로 name: 만 바꿔도 필터가 조용히 무력해진다.
    expect(doc).toContain('${{ github.workflow }}');
  });

  it('reviewDecision 을 쓰지 않는다', async () => {
    // 그 값은 브랜치 보호의 required reviews 설정에 좌우된다. 설정이 없는
    // 저장소에서는 비어 나오고, 새로 만든 프로젝트는 전부 그 상태다 —
    // 쓰면 영원히 머지되지 않는다(설계 5.4절).
    // 필드가 아니라 '값'을 금지하는 것이므로 점 표기(.reviewDecision)로
    // 실사용만 본다 — 이유를 설명하는 코멘트 자체가 이 단어를 언급하므로
    // 순수 부분 문자열 검사는 코멘트에 걸려 항상 실패한다.
    const doc = await readAutoMerge();
    expect(doc).not.toContain('.reviewDecision');
  });

  it('PR 코드를 체크아웃하지 않는다', async () => {
    // workflow_run 과 pull_request_review 는 base 저장소 컨텍스트에서
    // 시크릿과 쓰기 토큰을 들고 도는 권한 있는 트리거다. head 를 체크아웃해
    // 무언가 실행하면 fork PR 이 임의 코드로 그 토큰을 가져간다(설계 5.2절).
    // uses: 스텝으로 실제로 붙였는지만 본다 — 붙이지 말라는 코멘트 자체가
    // 이 문자열을 언급하므로 순수 부분 문자열 검사는 코멘트에 걸려 항상
    // 실패한다.
    const doc = await readAutoMerge();
    expect(doc).not.toContain('uses: actions/checkout');
  });

  it('모든 gh pr 호출이 --repo 를 넘긴다', async () => {
    // 체크아웃이 없어 git remote 가 없다 — --repo 없이는 gh 가 대상
    // 저장소를 추론하지 못하고 죽는다.
    const doc = await readAutoMerge();
    const calls = doc.split('\n').filter((line) => line.includes('gh pr '));
    expect(calls.length, 'gh pr 호출이 하나도 없다').toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, `--repo 가 없다: ${call.trim()}`).toContain('--repo');
    }
  });
});
