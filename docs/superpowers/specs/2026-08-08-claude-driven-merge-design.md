# Claude 주도 머지 설계

작성일: 2026-08-08

## 1. 배경

지금 이 저장소와 devkit 템플릿은 머지 결정을 **GitHub Actions 에 맡긴다**.
`claude-review.yml` 이 리뷰하고 통과 신호를 Commit Status(`context: claude-review`)로
남기면, `auto-merge.yml` 이 그것을 게이트로 읽어 사람 없이 머지한다.

그 구조가 만든 비용이 전부 "GitHub 에 맡겼기 때문"에서 나온다.

- **트리거 3개** (`pull_request_review` / `workflow_run` / `status`) — 승인과 체크가
  서로 다른 이벤트 경로로 도착하고, 각 경로는 자기 트리거로만 깨울 수 있다.
  하나라도 빠지면 그 경로가 아무 신호 없이 죽는다.
- **`release.yml` 디스패치** — `GITHUB_TOKEN` 이 만든 push 는 워크플로를 트리거하지
  않으므로, 자동 머지를 켠 순간 릴리스가 조용히 멈춘다. 그것을 되살리는 스텝이다.
- **신원 검사**(`trusted`, `creator`, `onHead`, fork 차단) — 사람이 안 보는 사이
  머지되므로 "누가 승인했는가"를 코드가 판정해야 한다.

이 셋의 실패 이력이 memory 에 4건 남아 있다(비공개 저장소 권한, creator 엔드포인트,
자기제외 단언, TOCTOU). 전부 **PR 을 실제로 열어야만 드러났다**.

머지 결정을 로컬 Claude 세션으로 옮기면 앞의 둘은 **구조적으로 사라지고**, 셋째는
사람이 세션에 앞에 있다는 사실로 대체된다.

## 2. 목표

Claude 가 PR 을 생성한 뒤 **리뷰 결과를 기다렸다가**, 모두 통과로 나오면 그 자리에서
머지한다. GitHub 은 리뷰만 하고 머지 판정에는 관여하지 않는다.

**비목표** — 리뷰 자체를 로컬로 옮기지 않는다. `claude-review.yml` 은 그대로 GitHub
Actions 에서 돌고 Commit Status 를 남긴다. 이 설계가 바꾸는 것은 **그 신호를 누가
읽고 머지를 실행하는가**뿐이다.

## 3. 결정

| 항목 | 결정 |
| --- | --- |
| 적용 범위 | 이 저장소 + devkit 템플릿(`_shared`) 둘 다 |
| 구현 형태 | 셸 스크립트 + 그것을 부르는 슬래시 커맨드 |
| 실패 시 행동 | 멈추고 보고. 자동 수정·재시도 없음 |
| 머지 조건 | `claude-review` 통과 + 다른 체크 전원 초록. 사람 승인 요구 안 함 |
| 잔존 워크플로 | `devbak update` 가 실제로 지운다(은퇴 파일 목록) |

## 4. 산출물

| 경로 | 처리 |
| --- | --- |
| `.github/workflows/auto-merge.yml` | **삭제** (저장소·템플릿 양쪽) |
| `.github/workflows/claude-review.yml` | 유지. auto-merge.yml 을 가리키던 주석·프롬프트 문구만 갱신 |
| `.github/scripts/wait-and-merge.sh` | **신설** (양쪽, 바이트 단위로 동일) |
| `.claude/commands/merge.md` | **신설** (양쪽) |

## 5. 스크립트 계약

```
wait-and-merge.sh <PR번호> [--timeout <초>] [--interval <초>] [--dry-run]
```

기본값: `--timeout 1800`(30분), `--interval 20`.

한 번의 폴링은 이렇게 돈다.

1. `gh pr view <PR> --repo <REPO> --json state,isDraft,headRefOid,labels,reviews,statusCheckRollup`
2. `gh api repos/<REPO>/commits/<headRefOid>/statuses --paginate` — **복수형이어야
   한다.** 단수형 `/status`(combined)는 `creator` 를 주지 않아 아래 신원 검사가
   구조적으로 항상 실패한다(PR #9 에서 실측). 복수형은 컨텍스트별 이력 전체를 주므로
   `id`(단조 증가) 로 컨텍스트별 최신만 남긴다.
3. 둘을 합쳐 jq 게이트 **한 프로그램**에 넣고 판정 한 줄을 받는다.

### 5.1 판정 분류 — `wait` 와 `stop` 을 가른다

기존 게이트는 판정을 `merge:` / `skip:` 둘로만 나눴다. 이벤트로 깨어나는 워크플로에는
그것으로 충분했다 — 어느 쪽 `skip` 이든 이번 실행은 아무것도 하지 않고 끝나고, 상태가
바뀌면 새 이벤트가 다시 깨우기 때문이다.

폴링 루프에서는 **반드시 갈라야 한다.** 뭉뚱그리면 변경 요청을 받은 PR 을 30분 동안
헛되이 기다리다 타임아웃으로 끝낸다. 실행 모델이 바뀌면 판정의 분류 축도 바뀐다.

| 접두 | 뜻 | 스크립트 행동 |
| --- | --- | --- |
| `merge:` | 조건 충족 | 머지하고 exit 0 |
| `wait:` | 더 기다리면 해소될 수 있음 — 체크 진행 중, `claude-review` 아직 없음/pending | interval 만큼 자고 재시도 |
| `stop:` | 기다려도 안 됨 — 변경 요청, 체크 실패, `claude-review` failure, draft, 닫힘, 옵아웃 라벨 | 사유 출력 후 exit 1 |

판정 문자열이 **직전과 달라졌을 때만** 출력한다. 매 20초 같은 줄을 찍으면 정작 바뀐
순간이 묻힌다.

타임아웃에 닿으면 마지막 `wait:` 사유를 그대로 붙여 exit 1 한다 — "무엇을 기다리다
끝났는가"가 종료 메시지만으로 읽혀야 한다.

### 5.2 게이트에서 빠지는 것

- `approvals` / `stale` / `trusted` — 사람 승인 경로 전체. 사람은 이제 세션 앞에 있고,
  머지를 실행하는 토큰이 그 사람의 것이다.
- `onHead` — 승인이 없으므로 "승인이 옛 커밋에 달렸는가"를 물을 대상이 없다.
  `claude-review` 쪽은 원래 커밋 고정이 공짜였다(`statusCheckRollup` 은 head 커밋의
  것만 돌려준다).
- fork 차단 — 저장소판에만 있던 방어. 사람이 지시해야만 머지가 일어나므로 자동
  공급망 경로가 없다.
- 봇 로그인 특례 — 이미 죽은 코드였다. Actions 토큰은 PR 을 승인할 수 없다.
- 자기 자신 제외(`workflowName != $SELF`) — auto-merge 워크플로가 사라지므로 집계에
  섞일 자기 체크가 없다.

### 5.3 게이트에 남는 것

- `state == "OPEN"`, `isDraft`, `no-auto-merge` 라벨
- 변경 요청 — 리뷰어별 최신만, `COMMENTED` 제외, `DISMISSED` 반영. 작성자도 커밋도
  가리지 않는다(막는 쪽은 fail-safe).
- `claude-review` Commit Status 가 `success` 이고 **creator 가
  `github-actions[bot]` 또는 `github-actions`** 일 것. context 만 보면 외부 CI 의
  초록불 하나로 통과하고, creator 를 안 보면 `statuses:write` 를 가진 임의의 앱이
  같은 context 로 success 를 심어 리뷰 없이 뚫는다. creator 를 확인할 수 없으면
  세지 않는다.
- 다른 체크의 pending / failing 집계. CheckRun(`.status`/`.conclusion`)과
  StatusContext(`.state`) 두 형태가 섞여 오므로 둘 다 본다.
- `--match-head-commit <headRefOid>` — 판정과 머지 호출 사이의 잔여 창은 서버만 닫을
  수 있다.

### 5.4 잔존 워크플로 감지

스크립트는 시작할 때 `.github/workflows/auto-merge.yml` 이 있으면 경고를 출력한다.
있다는 것은 GitHub 쪽 자동 머지가 아직 살아 있다는 뜻이고, 그쪽 게이트는
`claude-review` success 만으로 머지하므로 **이 스크립트가 판정하기 전에 먼저
머지해 버린다**. 경고일 뿐 중단하지는 않는다 — 그 파일을 지우는 PR 자체가 그 상태에서
돌아야 하기 때문이다.

## 6. `release.yml`

`gh workflow run release.yml` 디스패치 스텝을 **제거**한다. 그 스텝이 있는 이유는
`GITHUB_TOKEN` 이 만든 push 가 워크플로를 트리거하지 않기 때문인데, 사용자 토큰으로
머지하면 push 이벤트가 정상 발화해 `on: push: branches: [main]` 이 그대로 돈다.

**이것은 실행으로 확인할 항목이다.** 첫 머지 뒤 `release.yml` 실행이 실제로 생겼는지
Actions 에서 보고, 안 생겼으면 디스패치를 되살린다. 문서상 그렇다는 이유로 통과로
보고하지 않는다.

## 7. 두 사본의 동일성

저장소판과 템플릿판 `auto-merge.yml` 의 차이는 fork 차단과 release 디스패치 둘뿐이었고
둘 다 사라진다. 따라서 `wait-and-merge.sh` 는 **바이트 단위로 동일**해질 수 있다.

기존 테스트는 "두 사본의 jq 프로그램이 글자 그대로 같다"만 고정했다 — 주석과 배선은
드리프트해도 통과했다. 새 테스트는 **파일 전체 동일성**으로 강화한다. 사본이 둘인 한
드리프트는 언젠가 실제로 일어나고(이미 한 번 일어났다), 강한 쪽 단언이 공짜로 가능해진
상황에서 약한 쪽을 유지할 이유가 없다.

## 8. 테스트

`tests/auto-merge-workflow.test.ts` → `tests/merge-script.test.ts` 로 재작성한다.

- **살아남는 것** — jq 를 실제로 돌리는 판정 테스트 중 체크 집계·`claude-review`·변경
  요청·null 안전 계열. 픽스처와 녹화본(`__snapshots__` 밖의 실제 API 응답 녹화)은
  그대로 재사용한다.
- **사라지는 것** — 승인·`trusted`·`onHead`·fork·트리거 배선·권한 스코프 계열.
  대상 자체가 없어진다.
- **새로 필요한 것**
  - `wait:` 와 `stop:` 이 실제로 갈리는지. 최소한 "변경 요청은 `stop`", "체크 진행
    중은 `wait`", "`claude-review` 없음은 `wait`", "`claude-review` failure 는
    `stop`" 네 건.
  - 두 사본 바이트 동일성.
  - 스크립트가 `--match-head-commit` 을 넘기는지, 모든 `gh` 호출이 `--repo` 를
    넘기는지.
  - `claude-review.yml` 계열 단언은 그대로 유지하되, auto-merge.yml 을 참조하던
    문구 단언만 새 문구로 옮긴다.

판정 테스트는 **jq 를 실제로 실행**한다(기존 방식 그대로). 문자열 포함 단언으로
대체하지 않는다 — 이 저장소가 반복해서 당한 형태의 공허한 단언이다.

## 9. 배선 세부

- `src/lib/categories.ts` 의 `FILE_PATTERNS` 에 `[/^\.github\/scripts\/.+/, 'ci']`
  를 더한다. 없으면 오버레이 커버리지 테스트가 실패한다 — 그것이 안전망이다.
- 실행 비트: **실행으로 확인한 결과, `copyOverlay` 의 `collectTree` 는 내용만
  읽어 `writeFile` 로 쓰므로 모드를 보존하지 않는다.** 그래서 파일은 git 에
  `100644` 로 커밋하고, `/merge` 커맨드가 `./script.sh` 가 아니라
  `bash .github/scripts/…` 로 부른다 — 소비자 프로젝트에 실행 비트 없이
  놓여도 동작해야 하기 때문이다. `100755` 로 커밋했다면 오히려 소스와 소비자
  프로젝트 사이에서 모드가 어긋나는 신호 없는 드리프트가 됐을 것이다.
- `recipe-{next,nest,monorepo}.test.ts.snap` 3개 갱신.

## 10. 은퇴 파일 삭제

`devbak update` 는 지금 파일 삭제를 전파하지 않는다. `plan.ts` 는 레시피의
`removeFiles` 를 **계획에서 빼는 데만** 쓰고 디스크는 건드리지 않는다. 그대로 두면
이미 생성된 소비자 프로젝트는 update 후에도 `auto-merge.yml` 을 갖고, GitHub 쪽이
여전히 먼저 머지한다.

`removeFiles` 를 update 에서 그냥 실행하게 하지 **않는다.** 그 목록은 create 시점의
뼈대 정리용이고, `monorepo` 레시피는 거기서 `apps/web/.claude` 와 `apps/web/.github`
를 통째로 지운다 — 소비자가 그 아래에 자기 커맨드를 넣어 뒀다면 update 가 그것을
날린다.

대신 **은퇴 파일 목록**을 둔다. "템플릿에서 없어진 파일 중 update 가 소비자에게서도
지워야 하는 것"만 담는 별도 상수다. 지금 들어가는 항목은 하나다.

```
.github/workflows/auto-merge.yml
```

- update 만 이 목록을 읽는다. create 는 애초에 그 파일을 놓지 않으므로 관계없다.
- dry-run 계획 출력에 삭제 항목으로 드러나야 한다. 조용히 지우면 update 가 사용자
  파일을 지웠다는 사실이 어디에도 남지 않는다.
- 파일이 없으면 조용히 넘어간다(없는 것이 정상 상태다).
- 카테고리는 `ci` 다 — `--only ci` 로 이 삭제만 따로 적용할 수 있어야 한다.

## 11. 알려진 결손

1. **세션이 끊기면 머지되지 않는다.** 의도된 것이다 — 사람이 없는 동안 머지되지 않는
   것이 이 전환의 목적이다. 대신 사람이 자리를 비우고 머지되기를 기대할 수 없다.
2. **GitHub UI 에서 사람이 연 PR 은 아무도 머지하지 않는다.** Claude 세션이 개입해야
   한다. 이 저장소의 워크플로상 PR 은 전부 Claude 가 열지만, 소비자 프로젝트에서는
   기대가 어긋날 수 있다.
3. **`issue-to-pr` 스킬 문구 드리프트.** 다른 브랜치(`f6d9d03`)의
   `templates/_skills/issue-to-pr/SKILL.md` 가 "PR 을 열면 리뷰가 돌고, 통과 신호가
   남으면 자동으로 머지된다. 즉 PR 생성은 사람이 개입할 수 있는 마지막 지점이다"라고
   적는다. 이 설계가 그 문장을 무효화한다. 두 브랜치 중 **나중에 랜딩하는 쪽이 상대를
   고친다.**
4. **6절의 릴리스 트리거는 아직 미검증이다.** 첫 머지에서 실측한다.

## 12. 완료 기준

1. 저장소·템플릿 양쪽에서 `auto-merge.yml` 이 사라졌다.
2. `wait-and-merge.sh` 두 사본이 바이트 단위로 같고, 테스트가 그것을 고정한다.
3. `wait` / `stop` 분류가 jq 를 실제로 돌리는 테스트로 검증된다.
4. `pnpm lint`, `pnpm build`, `pnpm test` 가 전부 통과한다.
5. `devbak update` dry-run 이 `auto-merge.yml` 삭제를 계획에 드러낸다.
6. 이 변경 자신의 PR 이 `/merge` 로 머지되고, 그 뒤 `release.yml` 실행이 실제로
   생겼는지 확인된다.
