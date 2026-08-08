# NestJS 멀티스테이지 Dockerfile

NestJS 컨테이너 이미지의 목표는 **작고 안전하게**다. 빌드 도구(`@nestjs/cli`, `typescript`, 테스트)는 런타임에 필요 없으므로 스테이지를 나눠 격리하고, 런타임 이미지에는 `dist/`와 프로덕션 의존성, 그리고 non-root 사용자만 남긴다.

> 환경변수·시크릿 로딩은 nestjs-config, 모노레포(여러 앱을 한 리포에서 빌드)의 필터드 빌드는 nestjs-monorepo 참조. 여기서는 단일 NestJS 앱의 이미지 구성에 집중한다.

## 목차
- [3스테이지 구조](#3스테이지-구조)
- [pnpm과 corepack](#pnpm과-corepack)
- [레이어 캐시 최적화](#레이어-캐시-최적화)
- [.dockerignore](#dockerignore)
- [non-root 실행](#non-root-실행)
- [PID 1과 시그널 처리](#pid-1과-시그널-처리)
- [이미지 크기 줄이기](#이미지-크기-줄이기)
- [HEALTHCHECK 지시어](#healthcheck-지시어)

## 3스테이지 구조

`deps → build → runtime`. `deps`는 **프로덕션 의존성만** 설치해 런타임으로 복사할 `node_modules`를 만들고, `build`는 devDependencies까지 설치해 `nest build`를 돌리며, `runtime`은 두 결과물만 합친다.

```dockerfile
# syntax=docker/dockerfile:1

# ── 1) deps: 런타임에 넣을 프로덕션 의존성만 ────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── 2) build: devDeps 포함 설치 후 컴파일 ───────────────────
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build                       # -> /app/dist

# ── 3) runtime: 산출물 + prod 의존성만 ──────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

핵심은 **`deps`와 `build`의 `node_modules`가 다르다**는 점이다. 런타임은 `--prod`로 설치한 가벼운 쪽을 쓰고, 무거운 빌드용 트리는 `build` 스테이지에 버려진다.

## pnpm과 corepack

Node 22의 `corepack`은 `package.json`의 `packageManager` 필드에 고정된 pnpm 버전을 재현 가능하게 활성화한다. 전역 `npm i -g pnpm`보다 버전이 확정적이다.

```jsonc
// package.json — 팀이 쓰는 pnpm 버전을 고정
{
  "packageManager": "pnpm@9.12.0"
}
```

```dockerfile
RUN corepack enable                  # packageManager 필드 버전을 그대로 사용
```

- `--frozen-lockfile`은 `pnpm-lock.yaml`과 어긋나면 실패한다. CI·이미지 빌드에서 반드시 사용해 잠금 파일과 설치를 일치시킨다.
- 특정 버전을 명시하려면 `corepack prepare pnpm@9.12.0 --activate`를 쓴다.

## 레이어 캐시 최적화

Docker는 레이어 단위로 캐시한다. **자주 바뀌는 것을 뒤로** 배치해야 캐시 적중률이 오른다. 소스 코드보다 의존성이 훨씬 덜 바뀌므로, `package.json`+lockfile을 먼저 복사·설치하고 소스는 그 다음에 복사한다.

```dockerfile
# ○ 의존성 레이어를 소스와 분리 — 소스만 바뀌면 install 캐시 재사용
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .                             # 소스는 마지막에
RUN pnpm build
```

```dockerfile
# ✕ 전부 먼저 복사 — 소스 한 줄만 바꿔도 install 부터 다시 실행
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
```

- BuildKit `--mount=type=cache`로 pnpm store를 빌드 간 재사용하면 재설치가 빨라진다(위 Dockerfile 참고).
- CI에서는 registry 캐시(`cache-from`/`cache-to type=gha`)를 함께 쓴다 → ci-cd.md.

## .dockerignore

빌드 컨텍스트에서 불필요한 파일을 빼면 전송이 빨라지고, 시크릿·로컬 산출물이 이미지에 새어드는 것을 막는다.

```gitignore
# .dockerignore
node_modules
dist
.git
.github
*.md
.env
.env.*
!.env.example
coverage
test
*.spec.ts
.vscode
Dockerfile
.dockerignore
```

- `node_modules`를 반드시 제외한다 — 호스트의 것이 복사되면 alpine과 네이티브 모듈이 어긋난다. 의존성은 이미지 안에서 설치한다.
- `.env`류를 빼서 시크릿이 레이어에 박히지 않게 한다. 시크릿은 런타임 주입(nestjs-config).

## non-root 실행

`node:22-alpine` 이미지에는 이미 `node`(uid 1000) 사용자가 있다. `USER node`로 전환해 root로 프로세스가 돌지 않게 한다.

```dockerfile
# 복사물의 소유권을 node로 지정하고, 그 사용자로 실행
COPY --from=build --chown=node:node /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
```

- ✕ `USER` 미지정 → 프로세스가 root. 컨테이너 침해 시 권한 확대 위험.
- 쓰기 가능한 경로가 필요하면(임시 파일 등) 해당 디렉터리만 `--chown=node:node`로 소유권을 준다. 앱 디렉터리 전체를 쓰기 가능하게 만들지 않는다.
- 1024 미만 포트 바인딩은 non-root로 불가하므로 앱은 `3000` 같은 상위 포트를 쓰고 외부 노출은 오케스트레이터/프록시가 매핑한다.

## PID 1과 시그널 처리

컨테이너의 PID 1은 특별하다. Node를 PID 1로 직접 띄우면 `SIGTERM`이 기대대로 전달되지 않거나 좀비 프로세스가 회수되지 않을 수 있다. `dumb-init`(또는 `tini`)를 init으로 두면 시그널을 자식에게 올바로 전파해 graceful shutdown이 동작한다.

```dockerfile
RUN apk add --no-cache dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

- `CMD ["node", ...]`처럼 **exec 형식**(JSON 배열)을 쓴다. `CMD node dist/main.js`(shell 형식)는 `/bin/sh`가 PID 1이 되어 시그널을 삼킨다.
- graceful shutdown 구현은 → health-lifecycle.md.

## 이미지 크기 줄이기

| 기법 | 효과 |
|------|------|
| 멀티스테이지 (build/runtime 분리) | devDeps·소스·캐시 제외 — 가장 큰 절감 |
| `pnpm install --prod` (런타임) | devDependencies 미포함 |
| `node:22-alpine` 베이스 | `node:22`(Debian) 대비 수백 MB 절감 |
| `.dockerignore` | 컨텍스트·레이어에서 불필요 파일 제외 |
| distroless 런타임 (아래) | 셸·패키지 매니저 제거로 공격 표면 최소화 |

distroless는 셸이 없어 더 작고 안전하지만 디버깅(`exec`)이 어렵다. 시그널 처리가 내장돼 있어 `dumb-init` 없이도 동작한다.

```dockerfile
# 런타임 스테이지를 distroless로 (build 스테이지는 위와 동일)
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER nonroot
CMD ["dist/main.js"]                 # distroless nodejs 이미지의 ENTRYPOINT가 node
```

- 크기 확인: `docker images`로 태그별 크기를 비교하고, 레이어 구성은 `docker history <image>`로 본다.
- 네이티브 모듈(`bcrypt` 등)이 alpine의 musl과 안 맞으면 `node:22-slim`(Debian) 런타임으로 바꾸거나 빌드 스테이지에서 리빌드한다.

## HEALTHCHECK 지시어

Dockerfile의 `HEALTHCHECK`는 Docker/Compose 단독 운영 시 컨테이너 상태를 표시한다. 오케스트레이터(K8s)를 쓰면 프로브를 그쪽에 정의하므로 이 지시어는 보통 생략한다.

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

- alpine에는 `curl`/`wget`이 없을 수 있으니 Node 내장 `fetch`로 체크하면 추가 패키지가 필요 없다.
- `--start-period`는 앱 기동 시간을 감안해 초기 실패를 무시하는 유예다. NestJS 기동(모듈 초기화·DB 연결)이 길면 넉넉히 준다.
- 어떤 엔드포인트를 프로브로 쓸지(liveness vs readiness) → health-lifecycle.md.
