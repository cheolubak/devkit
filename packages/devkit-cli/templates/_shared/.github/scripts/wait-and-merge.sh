#!/usr/bin/env bash
#
# PR 의 리뷰·체크 결과를 폴링해 전부 통과하면 rebase 로 머지한다.
#
# 예전에는 이 판정을 GitHub Actions(auto-merge.yml)가 했다. 그 구조의 비용은
# 전부 "사람이 없는 곳에서 판정한다"에서 나왔다 — 승인·Commit Status·CheckRun
# 이 서로 다른 이벤트로 도착해 트리거를 셋 두어야 했고, GITHUB_TOKEN 이 만든
# push 는 워크플로를 깨우지 않아 릴리스를 따로 디스패치해야 했으며, 누가
# 승인했는지를 코드가 판정해야 했다. 판정을 사람 앞으로 옮기면 셋 다 사라진다.
#
# 대신 이벤트 대신 **폴링**이 되므로 판정을 세 갈래로 나눈다. merge/skip 둘로
# 뭉뚱그리면 변경 요청을 받은 PR 을 타임아웃까지 헛되이 기다린다.
#
#   merge:  조건 충족 — 머지하고 끝낸다
#   wait:   더 기다리면 해소될 수 있다 — 다시 폴링한다
#   stop:   기다려도 안 된다 — 사유를 남기고 실패로 끝낸다
#
# 이 파일은 devkit 템플릿과 툴킷 저장소 양쪽에 같은 바이트로 존재한다.
# tests/merge-script.test.ts 가 그 동일성을 고정한다 — 한쪽만 고치지 말 것.
set -euo pipefail

OPT_OUT_LABEL=no-auto-merge

usage() {
  cat <<'USAGE'
사용법: wait-and-merge.sh <PR번호> [--timeout <초>] [--interval <초>] [--dry-run]

  --timeout   판정을 기다릴 최대 시간(기본 1800초)
  --interval  폴링 간격(기본 20초)
  --dry-run   판정까지만 하고 머지하지 않는다

종료 코드: 0 머지(또는 --dry-run 통과), 1 중단·타임아웃, 2 사용법 오류
USAGE
}

PR=''
TIMEOUT=1800
INTERVAL=20
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)
      TIMEOUT="${2:-}"
      shift 2
      ;;
    --interval)
      INTERVAL="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "알 수 없는 옵션: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$PR" ]; then
        echo "PR 번호는 하나만 받습니다 (받은 것: $PR, $1)" >&2
        exit 2
      fi
      PR="$1"
      shift
      ;;
  esac
done

if [ -z "$PR" ]; then
  echo "PR 번호가 필요합니다." >&2
  usage >&2
  exit 2
fi

# GitHub 쪽 자동 머지가 아직 살아 있으면 이 스크립트가 판정하기 전에 그쪽이
# 먼저 머지한다. 중단하지는 않는다 — 그 파일을 지우는 PR 자체가 이 상태에서
# 돌아야 하기 때문이다.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo '')
if [ -n "$ROOT" ] && [ -f "$ROOT/.github/workflows/auto-merge.yml" ]; then
  echo "경고: .github/workflows/auto-merge.yml 이 남아 있습니다." >&2
  echo "      GitHub 쪽 자동 머지가 이 스크립트보다 먼저 머지할 수 있습니다 — 지우세요." >&2
fi

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# 게이트 전체를 jq 한 프로그램에 모은다. 셸 분기로 흩으면 조건이 늘 때
# 조용히 빠지는 가지가 생긴다. 결과는 항상 한 줄이라 "왜 안 머지됐는가"가
# 출력만으로 읽힌다.
GATE=$(cat <<'JQ'
def norm: (. // "") | ascii_upcase;
def isbad($v): ["FAILURE","CANCELLED","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR"] | index($v) != null;

# 리뷰어별 최신 리뷰만 남긴다. COMMENTED 는 집계에서 뺀다 — 지적 뒤에
# 코멘트를 하나 더 남긴 리뷰어를 철회로 오판한다. DISMISSED 는 포함하되
# 변경 요청으로 세지 않는다(철회가 반영돼야 한다).
def latest:
  [ (.reviews // [])[]
    | select(.state == "APPROVED"
          or .state == "CHANGES_REQUESTED"
          or .state == "DISMISSED") ]
  | group_by(.author.login)
  | map(max_by(.submittedAt));

# 변경 요청은 작성자도 커밋도 가리지 않는다. 막는 쪽은 fail-safe 다 —
# 잘못 막으면 사람이 지우면 그만이지만 잘못 머지하면 되돌릴 수 없다.
def rejections: latest | map(select(.state == "CHANGES_REQUESTED")) | length;

# statusCheckRollup 에는 두 형태가 섞여 온다 — Actions 가 만드는 CheckRun
# (.status/.conclusion)과 Commit Status API 가 만드는 StatusContext(.state).
# 한쪽만 보면 나머지가 항상 통과로 세어진다.
def checks: (.statusCheckRollup // []);
def pending:
  checks
  | map(select(((.status | norm) | . != "" and . != "COMPLETED")
            or ((.state | norm) == "PENDING")))
  | length;
def failing:
  checks
  | map(select(isbad(.conclusion | norm) or isbad(.state | norm)))
  | length;

# Claude 의 통과 신호는 리뷰 승인이 아니라 Commit Status 로 온다. Actions 의
# GITHUB_TOKEN 으로는 PR 을 승인할 수 없지만(GitHub 이 거부한다) Commit Status
# 는 만들 수 있다.
#
# context 와 creator 를 둘 다 본다. context 만 보면 외부 CI 의 초록불 하나로
# 머지되고, creator 를 안 보면 statuses:write 를 가진 임의의 앱이 같은 context
# 로 success 를 심어 리뷰 없이 통과한다. creator 를 확인할 수 없으면 세지
# 않는다.
#
# 커밋 고정이 필요 없다. 이 값의 출처인 /commits/{head}/statuses 는 현재 head
# 커밋의 것만 주므로, 새 커밋을 푸시하면 이 신호가 없는 상태로 시작한다.
def claudeState:
  ([ (.commitStatuses // [])[]
     | select((.context // "") == "claude-review")
     | select((.creator // "") | . == "github-actions[bot]" or . == "github-actions") ]
   | first) as $s
  | if $s == null then "" else ($s.state | norm) end;

# 순서가 판정의 질을 만든다. claude-review 를 다른 체크보다 먼저 보는 것은
# 그쪽이 statusCheckRollup 에도 섞여 들어와서다 — 나중에 보면 "실패한 체크가
# 1건"이라는 두루뭉술한 사유가 나간다.
if .state != "OPEN" then "stop: PR 이 열려 있지 않습니다 (state=\(.state))"
elif .isDraft then "stop: draft PR 입니다"
elif ([(.labels // [])[].name] | index($LABEL)) then "stop: \($LABEL) 라벨이 붙어 있습니다"
elif rejections > 0 then "stop: 변경 요청이 \(rejections)건 있습니다"
elif isbad(claudeState) then "stop: claude-review 가 통과하지 못했습니다 (\(claudeState))"
elif claudeState == "" then "wait: claude-review 신호가 아직 없습니다"
elif claudeState != "SUCCESS" then "wait: claude-review 가 \(claudeState) 입니다"
elif failing > 0 then "stop: 실패한 체크가 \(failing)건 있습니다"
elif pending > 0 then "wait: 체크 \(pending)건이 아직 진행 중입니다"
else "merge: claude-review 통과, 체크 통과"
end
JQ
)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

DEADLINE=$(($(date +%s) + TIMEOUT))
LAST=''
HEAD_SHA=''

while :; do
  gh pr view "$PR" --repo "$REPO" \
    --json state,isDraft,headRefOid,labels,reviews,statusCheckRollup > "$WORK/pr.json"

  HEAD_SHA=$(jq -r '.headRefOid' "$WORK/pr.json")

  # statusCheckRollup 은 StatusContext 의 creator 를 주지 않는다 — gh 가
  # 요청하는 필드가 context·state·startedAt·targetUrl 뿐이다(실측). 위 게이트는
  # "누가 이 status 를 만들었는가"를 봐야 하므로 REST 로 따로 받아 합친다.
  #
  # **복수형** /statuses 여야 한다. 단수형 /commits/{sha}/status(combined)는
  # creator 를 주지 않아 신원 검사가 구조적으로 항상 실패한다(PR #9 에서 실측).
  # 대신 복수형은 컨텍스트별 이력 전체를 주므로 최신만 남긴다. id 로 고른다 —
  # 단조 증가하므로 같은 초에 두 건이 들어와도 갈린다.
  #
  # 축약 키에 creator 가 **들어가야 한다**. context 만으로 묶으면 신원 검사보다
  # 축약이 먼저 일어나, statuses:write 를 가진 임의의 앱이 같은 context 로 id 만
  # 더 큰 status 를 하나 올리는 것만으로 정당한 통과 신호를 지운다. 게이트의
  # creator 검사는 그것을 머지로 이어지게 하지는 않지만(fail-safe 는 유지된다),
  # 정당한 PR 이 영원히 wait: 에 갇혀 타임아웃으로 끝난다. 방어의 방향이
  # 뚫림에서 가용성으로 옮겨갔을 뿐 무방비인 것은 같다.
  gh api "repos/$REPO/commits/$HEAD_SHA/statuses" --paginate \
    --jq '.[] | {context, state, creator: (.creator.login // ""), id}' \
    | jq -s 'group_by([.context, .creator]) | map(max_by(.id))' > "$WORK/statuses.json"
  jq --slurpfile s "$WORK/statuses.json" '. + {commitStatuses: $s[0]}' "$WORK/pr.json" \
    > "$WORK/pr.merged.json"
  mv "$WORK/pr.merged.json" "$WORK/pr.json"

  VERDICT=$(jq -r --arg LABEL "$OPT_OUT_LABEL" "$GATE" "$WORK/pr.json")

  # 바뀐 판정만 출력한다. 매 폴링마다 같은 줄을 찍으면 정작 바뀐 순간이 묻힌다.
  if [ "$VERDICT" != "$LAST" ]; then
    echo "$VERDICT"
    LAST="$VERDICT"
  fi

  case "$VERDICT" in
    merge:*) break ;;
    stop:*) exit 1 ;;
  esac

  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "타임아웃(${TIMEOUT}초) — 마지막 상태: $VERDICT" >&2
    exit 1
  fi

  sleep "$INTERVAL"
done

if [ "$DRY_RUN" = true ]; then
  echo "--dry-run — 머지하지 않았습니다."
  exit 0
fi

# 게이트와 이 호출 사이에 새 푸시가 들어올 수 있고, 그 잔여 창은 서버만 닫을
# 수 있다 — head 가 바뀌었으면 GitHub 이 머지를 거부한다.
gh pr merge "$PR" --repo "$REPO" --rebase --delete-branch --match-head-commit "$HEAD_SHA"

echo "머지했습니다 (#$PR, $HEAD_SHA)."
echo "release.yml 은 main push 로 깨어납니다 — Actions 에 실행이 생겼는지 확인하세요."
