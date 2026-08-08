# NestJS CI/CD (GitHub Actions)

배포 파이프라인의 목표는 **검증을 통과한 커밋만 이미지가 되고, 그 이미지만 배포되는** 흐름을 자동화하는 것이다. `install → lint → test → build → 이미지 push → 배포`를 단계로 묶고, main 브랜치에서만 이미지를 만든다.

> 시크릿 값 자체의 애플리케이션 로딩·검증은 nestjs-config, 이미지 구성은 dockerfile.md, 모노레포에서 여러 앱을 필터드 빌드하는 파이프라인은 nestjs-monorepo 참조.

## 목차
- [파이프라인 개요](#파이프라인-개요)
- [검증 잡 (lint·test)](#검증-잡-linttest)
- [이미지 빌드·푸시](#이미지-빌드푸시)
- [환경별 배포](#환경별-배포)
- [DB 마이그레이션 순서](#db-마이그레이션-순서)
- [시크릿 관리](#시크릿-관리)

## 파이프라인 개요

```
push(PR)     → test (lint + unit + e2e)
push(main)   → test → image(build+push ghcr) → deploy(staging)
tag v*       → deploy(production)  # 승인 게이트
```

- PR에서는 검증만 돌린다(이미지 만들지 않음).
- main 머지 시 이미지를 만들고 staging에 배포한다.
- production은 태그/릴리스 + 승인(environment protection)으로 분리한다.

## 검증 잡 (lint·test)

```yaml
# .github/workflows/deploy.yml
name: CI/CD

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:                         # e2e에 실제 DB가 필요하면 서비스 컨테이너
        image: postgres:17-alpine
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test                  # 유닛
      - run: pnpm test:e2e              # e2e (DB 필요 시)
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/test
```

- `cache: pnpm`으로 스토어 캐시를 재사용해 설치를 가속한다.
- `concurrency` + `cancel-in-progress`로 같은 ref의 이전 실행을 취소해 낭비를 줄인다.
- 실제 DB 통합 테스트는 `services:` 컨테이너로 붙인다(테스트 우선 통합은 tdd 참조).

## 이미지 빌드·푸시

```yaml
  image:
    needs: test                          # 검증 통과 후에만
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write                    # ghcr push 권한
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha
            type=ref,event=branch
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- **`needs: test`** — 검증을 통과하지 못한 커밋은 이미지가 되지 않는다. 이 의존이 파이프라인 신뢰의 핵심이다.
- `metadata-action`으로 `sha`·브랜치·semver 태그를 자동 생성한다. `latest`만 쓰면 롤백할 버전을 특정할 수 없다 — 커밋 sha 태그를 항상 남긴다.
- `cache-from/to type=gha`로 레이어 캐시를 액션 캐시에 저장해 빌드를 가속한다(레이어 순서 자체는 dockerfile.md).

## 환경별 배포

GitHub Environments로 staging/production을 나누고, production에 승인 게이트를 건다.

```yaml
  deploy-staging:
    needs: image
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy
        run: echo "deploy ghcr.io/${{ github.repository }}:sha-${GITHUB_SHA::7} to staging"

  deploy-production:
    needs: image
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production            # Settings에서 필수 리뷰어 지정 → 수동 승인
    steps:
      - name: Deploy
        run: echo "deploy tag ${GITHUB_REF_NAME} to production"
```

- `environment: production`에 **required reviewers**를 걸면 배포 전 수동 승인이 강제된다.
- 배포 실행 방식(kubectl set image, ArgoCD sync, ECS update-service, SSH + `docker compose pull && up -d` 등)은 인프라에 따라 다르다. 공통 규율은 **"검증된 이미지 태그를 특정해 굴린다"** 는 것.

## DB 마이그레이션 순서

스키마 변경이 있는 배포는 **마이그레이션과 앱 롤아웃 순서**가 중요하다. 안전한 기본형은 배포 파이프라인에서 앱 교체 **전에** 마이그레이션을 돌리는 것이다.

```yaml
  migrate:
    needs: image
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm migration:run          # 앱 롤아웃 전에 스키마 반영
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

- 롤링 배포 중에는 **구·신 버전이 동시에 뜬다.** 마이그레이션은 하위 호환(expand)으로 설계한다: 컬럼 추가는 안전, 삭제·이름변경은 2단계(먼저 추가·양쪽 대응 → 다음 배포에서 제거).
- 마이그레이션 도구·엔티티 관리는 nestjs-database 참조. 여기서는 파이프라인 배치만 다룬다.

## 시크릿 관리

| 저장 위치 | 용도 |
|-----------|------|
| `secrets.*` (repo/environment secret) | `DATABASE_URL`, 레지스트리 토큰 등 민감값 |
| `vars.*` (repo/environment variable) | 비민감 설정(리전, 이미지명 등) |
| OIDC (`permissions: id-token: write`) | 장수 클라우드 키 없이 임시 자격 획득 |

```yaml
    permissions:
      id-token: write                    # OIDC로 AWS/GCP 임시 자격
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/deploy
          aws-region: ap-northeast-2
```

- ✕ 시크릿을 워크플로 파일·이미지에 하드코딩 → 리포지토리·레지스트리에 영구 노출. 로그에도 새기 쉽다.
- ✕ 장수 클라우드 액세스 키를 secret에 저장 → 유출 시 회수가 늦다. 가능하면 **OIDC**로 임시 자격을 받는다.
- 런타임 환경변수는 이미지가 아니라 배포 시점(오케스트레이터 secret/configmap)에 주입한다 → 앱 측 로딩·검증은 nestjs-config.
