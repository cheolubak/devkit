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
      # `${2:-}` 로 빈 값을 받으면 인자가 실제로 없었을 때도 조용히 넘어가고,
      # 뒤이은 `shift 2`가 남은 인자보다 큰 수를 당겨 set -e 아래에서 아무
      # 출력 없이 죽는다(실행으로 확인: `--timeout` 을 마지막 인자로 주면
      # rc=1, 메시지 없음). 값 존재 여부를 먼저 확인해 usage 의 계약(사용법
      # 오류는 exit 2)을 지킨다.
      [ $# -ge 2 ] || { echo "--timeout 에 값이 필요합니다" >&2; usage >&2; exit 2; }
      TIMEOUT="$2"
      # 숫자가 아닌 값은 여기서 걸러야 한다. 걸러지지 않으면 아래 DEADLINE
      # 계산의 산술 확장이 문자열을 변수명으로 재귀 확장하려다 set -u 에
      # 걸려 "unbound variable" 로 죽는다(실행으로 확인: `--timeout abc`).
      case "$TIMEOUT" in
        '' | *[!0-9]*)
          echo "--timeout 은 0 이상의 정수여야 합니다: $TIMEOUT" >&2
          exit 2
          ;;
      esac
      shift 2
      ;;
    --interval)
      # --timeout 과 같은 두 문제(값 누락·비숫자)가 그대로 있다. 여기서는
      # 첫 폴링이 gh 호출 2건을 이미 태운 뒤 sleep 의 산술 확장에서 죽는다는
      # 점만 다르다.
      [ $# -ge 2 ] || { echo "--interval 에 값이 필요합니다" >&2; usage >&2; exit 2; }
      INTERVAL="$2"
      case "$INTERVAL" in
        '' | *[!0-9]*)
          echo "--interval 은 1 이상의 정수여야 합니다: $INTERVAL" >&2
          exit 2
          ;;
      esac
      # --timeout 과 달리 0 을 허용하지 않는다. --interval 0 이면 아래 재시도
      # 경로와 폴링 루프 끝의 `sleep "$INTERVAL"` 이 `sleep 0` 이 되어 지연
      # 없이 돈다 — 타임아웃까지 gh API 를 쉬지 않고 두들기는 바쁜 루프가
      # 된다. `--timeout 0` 은 반대로 "한 번만 확인하고 끝낸다"는 뜻이 있어
      # (첫 폴링 뒤 데드라인 검사에 곧바로 걸린다) 0 을 허용해도 된다 — 두
      # 옵션의 하한이 다른 것은 실수가 아니다.
      if [ "$INTERVAL" -eq 0 ]; then
        echo "--interval 은 1 이상의 정수여야 합니다: $INTERVAL" >&2
        exit 2
      fi
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

# 검증 없이 그대로 gh 에 넘기면 임의 문자열이 API 호출까지 흘러가 알아보기
# 어려운 에러로 죽는다. PR 번호는 1부터 시작하므로 0 도 거부한다.
case "$PR" in
  '' | *[!0-9]*)
    echo "PR 번호는 양의 정수여야 합니다: $PR" >&2
    exit 2
    ;;
esac
if [ "$PR" -eq 0 ]; then
  echo "PR 번호는 1 이상이어야 합니다: $PR" >&2
  exit 2
fi

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# GitHub 쪽 자동 머지가 아직 살아 있으면 이 스크립트가 판정하기 전에 그쪽이
# 먼저 머지한다. 작업 트리가 아니라 **기본 브랜치**를 봐야 한다 —
# workflow_run·status 트리거는 정의상 기본 브랜치의 파일만 읽으므로, 이 PR
# 이 그 파일을 작업 트리에서 지웠어도 머지되기 전까지 기본 브랜치에는 그대로
# 남아 있어 그쪽이 이 스크립트보다 먼저 머지할 수 있다. contents API 는 ref
# 를 안 주면 기본 브랜치를 보므로 따로 조회할 필요가 없다. 중단하지는
# 않는다 — 그 파일을 지우는 PR 자체가 이 상태에서 돌아야 하기 때문이다.
if gh api "repos/$REPO/contents/.github/workflows/auto-merge.yml" --silent >/dev/null 2>&1; then
  echo "경고: 기본 브랜치에 .github/workflows/auto-merge.yml 이 아직 있습니다." >&2
  echo "      그쪽이 이 스크립트보다 먼저 머지할 수 있습니다 — 지우세요." >&2
fi

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

# 완료된 CheckRun 의 conclusion 허용 목록. SUCCESS 는 물론 SKIPPED(경로
# 필터로 건너뛴 워크플로가 매우 흔히 이 값으로 완료된다)·NEUTRAL 도 통과시킨다
# — 이 둘을 막으면 자신과 무관한 워크플로를 가진 정당한 PR 이 전부 막힌다.
# **거부 목록이 아니라 허용 목록이다**: GitHub 이 새 conclusion 값을 추가해도
# (예전에 STALE 이 그랬듯) 허용 목록에 없으면 자동으로 차단된다 — 거부
# 목록이었다면 새 값이 아무도 모르게 통과했다.
def okConclusion($v): ["SUCCESS", "SKIPPED", "NEUTRAL"] | index($v) != null;

# CheckRun(.status/.conclusion) 과 StatusContext(.state) 두 형태를 값이 아니라
# **어느 필드가 있는가**로 먼저 가린다. `.state` 값만 보고 가르면 진행 중이라
# `.conclusion` 이 아직 없는 CheckRun 이 StatusContext 로 오판된다. 우선순위:
# 1) 완료된 CheckRun(.conclusion 이 값을 가짐) → 허용 목록으로 판정
# 2) 아직 안 끝난 CheckRun(.status 는 있지만 COMPLETED 아님) → pending
# 3) StatusContext(.state 만 있음) → SUCCESS 만 통과, PENDING 은 pending
# 4) 위 어디에도 안 걸리는 형태 불명 항목 → 차단(fail-safe) — 여기엔 "완료로
#    표시됐는데 conclusion 이 없는" 정상 API 라면 없어야 할 값도 포함된다.
def classify:
  if (.conclusion // null) != null then
    (if okConclusion(.conclusion | norm) then "ok" else "bad" end)
  elif (.status // null) != null then
    (if (.status | norm) == "COMPLETED" then "bad" else "pending" end)
  elif (.state // null) != null then
    (if (.state | norm) == "SUCCESS" then "ok"
     elif (.state | norm) == "PENDING" then "pending"
     else "bad" end)
  else "bad"
  end;

def pending: checks | map(select(classify == "pending")) | length;
def failing: checks | map(select(classify == "bad")) | length;

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

# 기본값으로 최대 90회 폴링 × 호출 2건, 약 180회의 gh 호출이 오간다.
# set -euo pipefail 아래에서는 그중 한 번의 502·rate limit·네트워크 순단이
# 스크립트 전체를 죽인다 — 오래 기다리는 것이 이 루프의 존재 이유인데,
# 창이 길수록 취약해지는 구조였다. 연속 실패만 항구적 장애로 보고 중단한다
# (일시적 장애는 다음 폴링에서 회복될 수 있다). 성공하면 0 으로 되돌려,
# 30분 동안 흩어진 실패 셋이 누적돼 중단으로 이어지지 않게 한다.
FAILS=0

while :; do
  if ! gh pr view "$PR" --repo "$REPO" \
    --json state,isDraft,headRefOid,labels,reviews,statusCheckRollup > "$WORK/pr.json"; then
    FAILS=$((FAILS + 1))
    if [ "$FAILS" -ge 3 ]; then
      echo "중단: PR 조회(gh pr view)가 연속 3회 실패했습니다 — 게이트가 막은 것이 아닙니다." >&2
      exit 1
    fi
    sleep "$INTERVAL"
    continue
  fi

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
  if ! gh api "repos/$REPO/commits/$HEAD_SHA/statuses" --paginate \
    --jq '.[] | {context, state, creator: (.creator.login // ""), id}' \
    | jq -s 'group_by([.context, .creator]) | map(max_by(.id))' > "$WORK/statuses.json"; then
    FAILS=$((FAILS + 1))
    if [ "$FAILS" -ge 3 ]; then
      echo "중단: gh api …/statuses 가 연속 3회 실패했습니다 — 게이트가 막은 것이 아닙니다." >&2
      exit 1
    fi
    sleep "$INTERVAL"
    continue
  fi
  jq --slurpfile s "$WORK/statuses.json" '. + {commitStatuses: $s[0]}' "$WORK/pr.json" \
    > "$WORK/pr.merged.json"
  mv "$WORK/pr.merged.json" "$WORK/pr.json"

  FAILS=0

  VERDICT=$(jq -r --arg LABEL "$OPT_OUT_LABEL" "$GATE" "$WORK/pr.json")

  # 바뀐 판정만 출력한다. 매 폴링마다 같은 줄을 찍으면 정작 바뀐 순간이 묻힌다.
  # `merge:` 만은 여기서 찍지 않는다 — 문서(README·merge.md)는 `merge:` 를
  # "머지했다"로 정의하는데, 여기서 찍으면 그 뒤의 `gh pr merge` 가 head 커밋
  # 변경이나 API 실패로 죽었을 때 사용자가 `merge:` 를 보고도 머지되지 않은
  # 상태를 갖는다. 실제 머지가 성공한 뒤(아래)에 찍는다.
  if [ "$VERDICT" != "$LAST" ]; then
    case "$VERDICT" in
      merge:*) ;;
      *) echo "$VERDICT" ;;
    esac
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
  # --dry-run 은 머지하지 않으므로 위에서 미룬 `merge:` 판정 줄을 여기서
  # 찍는다 — 머지 성공 뒤로 미룰 이유(실패하면 못 믿을 출력이 된다)가
  # --dry-run 에는 없다. 애초에 아무것도 실행하지 않기 때문이다.
  echo "$VERDICT"
  echo "--dry-run — 머지하지 않았습니다."
  exit 0
fi

# 게이트와 이 호출 사이에 새 푸시가 들어올 수 있고, 그 잔여 창은 서버만 닫을
# 수 있다 — head 가 바뀌었으면 GitHub 이 머지를 거부한다.
gh pr merge "$PR" --repo "$REPO" --rebase --delete-branch --match-head-commit "$HEAD_SHA"

# 머지가 실제로 성공한 뒤에만 `merge:` 를 찍는다(위 루프에서 미뤄 둔 것).
echo "$VERDICT"
echo "머지했습니다 (#$PR, $HEAD_SHA)."
echo "release.yml 은 main push 로 깨어납니다 — Actions 에 실행이 생겼는지 확인하세요."
