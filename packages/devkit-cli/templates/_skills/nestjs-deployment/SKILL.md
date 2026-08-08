---
name: nestjs-deployment
description: "NestJS 배포 패턴. Docker 멀티스테이지 빌드, 프로덕션 빌드(nest build), 헬스체크(@nestjs/terminus), graceful shutdown, PM2, GitHub Actions CI/CD, 컨테이너 최적화.\nAPPLIES: NestJS 서버를 컨테이너화·기동·헬스체크·무중단 종료로 배포할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"NestJS 배포\", \"백엔드 배포\", \"Nest Dockerfile\", \"NestJS Docker\", \"PM2\", \"graceful shutdown\", \"헬스체크\", \"terminus\", \"백엔드 CI/CD\", \"컨테이너 배포\", NestJS 서버 배포/컨테이너화 시.\nSKIP: Next.js 프론트엔드 배포는 nextjs-deployment. 앱 관측성/모니터링(OpenTelemetry·대시보드)은 grafana-observability. 환경변수·시크릿 관리는 nestjs-config. 모노레포 빌드 파이프라인은 nestjs-monorepo."
version: 1.0.0
---

# NestJS 배포 가이드

> 참조:
> - [references/dockerfile.md](references/dockerfile.md) - 멀티스테이지 Dockerfile 전문, pnpm/corepack, .dockerignore, non-root, 레이어 캐시·이미지 크기 최적화 **CRITICAL**
> - [references/health-lifecycle.md](references/health-lifecycle.md) - @nestjs/terminus 헬스체크(HTTP·DB·디스크·메모리), readiness vs liveness, graceful shutdown 상세
> - [references/ci-cd.md](references/ci-cd.md) - GitHub Actions 워크플로(install·lint·test·build·이미지 push·배포 트리거), 환경별 배포, 시크릿

## 핵심 원칙

NestJS 서버 배포는 프론트엔드와 다르다. **장수하는 프로세스**를 컨테이너로 감싸고, 오케스트레이터(K8s·ECS·Compose)가 **살아있는지(liveness)** 와 **트래픽 받을 준비가 됐는지(readiness)** 를 구분해 관측하며, 재배포 때 **처리 중인 요청을 잃지 않고(graceful shutdown)** 교체하는 것이 목표다.

세 가지 축으로 압축된다:

1. **작고 안전한 이미지** — devDependencies를 런타임에서 배제하고, non-root로 실행한다. → dockerfile.md
2. **정직한 헬스 신호** — 프로세스 생존과 의존성(DB·Redis) 준비를 분리해 노출한다. → health-lifecycle.md
3. **무손실 교체** — `enableShutdownHooks()`로 SIGTERM을 받아 커넥션을 닫고 in-flight 요청을 흘려보낸다. → health-lifecycle.md

> 이 스킬은 배포 메커니즘에 집중한다. 환경변수·시크릿 로딩 규율은 nestjs-config, 로그·트레이스·메트릭 수집은 grafana-observability, 멀티 패키지 빌드 파이프라인은 nestjs-monorepo로 간다.

## 프로덕션 빌드

`nest build`는 TypeScript를 `dist/`로 컴파일한다. 진입점은 `dist/main.js`이며, 런타임은 이 산출물만 있으면 된다 — 소스·devDependencies·테스트는 필요 없다.

```jsonc
// package.json
{
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/main.js"   // ts-node·nest start 아님
  }
}
```

```typescript
// src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 프로덕션에서는 로그 레벨을 조인다 (verbose·debug 제외)
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();          // graceful shutdown 필수 (health-lifecycle.md)
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0'); // 0.0.0.0 바인딩 필수
}
bootstrap();
```

- **런타임은 `node dist/main.js`로 실행**한다. `nest start`/`ts-node`는 devDependency(`@nestjs/cli`, `typescript`)를 요구하므로 프로덕션 이미지에 두지 않는다.
- `0.0.0.0`로 바인딩해야 컨테이너 밖에서 접근된다. 기본값 `localhost`면 헬스체크조차 실패한다.
- devDependencies 배제는 빌드 스테이지와 런타임 스테이지를 나눠서 달성한다 → dockerfile.md.

## 멀티스테이지 Dockerfile (요약)

`deps → build → runtime` 3스테이지로, 빌드 도구는 앞 스테이지에 격리하고 런타임에는 `dist/` + 프로덕션 의존성만 남긴다.

```dockerfile
# 1) deps: 프로덕션 의존성만 별도 설치 (레이어 캐시 극대화)
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 2) build: devDeps 포함 설치 후 nest build
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build                       # -> dist/

# 3) runtime: 산출물 + prod 의존성만, non-root 실행
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node                            # non-root
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

전문(레이어 캐시 순서, `.dockerignore`, `dumb-init` PID 1 처리, distroless 대안, 이미지 크기 계측)은 → [references/dockerfile.md](references/dockerfile.md).

## 헬스체크: liveness와 readiness 분리

`@nestjs/terminus`로 두 종류의 프로브를 노출한다. **섞으면 안 된다.**

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  // liveness: 프로세스가 살아있나? 의존성 체크 금지 (DB 죽었다고 재시작하면 안 됨)
  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  // readiness: 트래픽 받을 준비가 됐나? DB·Redis 등 의존성 확인
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 1500 })]);
  }
}
```

- ✕ liveness에서 DB를 체크 → DB 순단에 오케스트레이터가 **멀쩡한 앱을 재시작**시켜 장애를 증폭한다.
- ○ liveness는 프로세스 생존만, readiness가 의존성을 본다. 준비 안 되면 트래픽에서만 빠지고 프로세스는 유지된다.

디스크·메모리 indicator, custom indicator, DB/Redis 체크 상세 → [references/health-lifecycle.md](references/health-lifecycle.md).

## Graceful shutdown

재배포는 오케스트레이터가 컨테이너에 `SIGTERM`을 보내고, 유예시간(grace period) 뒤 `SIGKILL`하는 흐름이다. 이 사이에 in-flight 요청을 마치고 커넥션을 닫아야 요청 유실이 없다.

```typescript
// enableShutdownHooks() 를 켜야 아래 훅이 호출된다
@Injectable()
export class RedisService implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.client.quit();   // SIGTERM 수신 시 커넥션 정리
  }
}
```

동작 순서: `SIGTERM` → readiness 실패 처리로 신규 트래픽 차단 → 진행 중 요청 완료 → `onModuleDestroy`로 DB·Redis·큐 정리 → 프로세스 종료. 세부·함정은 → [references/health-lifecycle.md](references/health-lifecycle.md).

## PM2 대안 (컨테이너를 안 쓸 때)

VM에 직접 올리는 경우 PM2로 프로세스 관리·클러스터·무중단 reload를 한다. 컨테이너 오케스트레이터(K8s)가 있으면 보통 불필요하다 — 역할이 겹친다.

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/main.js',
      instances: 'max',          // CPU 코어 수만큼
      exec_mode: 'cluster',      // 로드 밸런싱 + 무중단 reload
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
  ],
};
```

```bash
pm2 start ecosystem.config.js
pm2 reload api        # 무중단 재시작 (worker 순차 교체)
```

- cluster 모드는 상태를 프로세스 메모리에 두면 깨진다(세션·인메모리 캐시 → Redis 등 외부로).
- graceful shutdown을 위해 `enableShutdownHooks()`는 PM2에서도 동일하게 필요하다.

## GitHub Actions CI/CD (요약)

`install → lint → test → build → 이미지 push`를 파이프라인으로 묶는다.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test

  image:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

환경별 배포(staging/production), OIDC로 클라우드 배포, 마이그레이션 실행 순서, 시크릿 관리 → [references/ci-cd.md](references/ci-cd.md).

## 흔한 실수

| ✕ 실수 | 결과 | ○ 올바른 방법 |
|--------|------|---------------|
| devDependencies 포함해 이미지 빌드 | 이미지 수백 MB, 공격 표면 확대 | 멀티스테이지 + `--prod` 설치로 런타임 분리 |
| `USER` 미지정 (root 실행) | 컨테이너 탈출 시 권한 확대 | `USER node`로 non-root 실행 |
| 헬스체크 없음 | 죽은 컨테이너에 계속 라우팅 | terminus liveness/readiness 노출 |
| liveness에서 DB 체크 | DB 순단에 앱까지 재시작 (장애 증폭) | liveness는 프로세스만, readiness가 의존성 |
| shutdown hook 없음 | 재배포마다 in-flight 요청 유실 | `enableShutdownHooks()` + `OnModuleDestroy` |
| `nest start`로 프로덕션 실행 | devDeps 필요, 느린 기동 | `node dist/main.js` |
| `localhost` 바인딩 | 컨테이너 밖에서 접근 불가 | `listen(port, '0.0.0.0')` |
| 환경변수·시크릿 하드코딩 | 시크릿 유출, 환경 전환 불가 | 런타임 주입 (nestjs-config) |

## 배포 전 체크리스트

1. `nest build` 산출물(`dist/main.js`)로 `node`가 직접 기동되는가
2. 멀티스테이지로 devDependencies가 런타임에서 배제됐는가 → dockerfile.md
3. `USER node` non-root 실행인가
4. `.dockerignore`로 `node_modules`·`.git`·테스트가 컨텍스트에서 빠졌는가
5. liveness와 readiness 프로브가 분리 노출됐는가 → health-lifecycle.md
6. `enableShutdownHooks()` + 커넥션 정리(`OnModuleDestroy`)가 있는가
7. `0.0.0.0` 바인딩 + 헬스체크 경로가 오케스트레이터에 연결됐는가
8. CI가 lint·test 통과 후에만 이미지를 push하는가 → ci-cd.md
9. 시크릿이 런타임 주입인가 (이미지·리포지토리에 하드코딩 아님, nestjs-config)
