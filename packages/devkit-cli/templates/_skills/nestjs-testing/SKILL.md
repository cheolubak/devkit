---
name: nestjs-testing
description: "NestJS 테스트 작성 (Vitest 기준).\nAPPLIES: NestJS에서 유닛 테스트나 supertest e2e를 쓰거나 러너를 설정할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"테스트 작성\", \"유닛 테스트\", \"e2e 테스트\", \"테스트 코드\", \"서비스 테스트\", \"컨트롤러 테스트\", \"테스트 돌려줘\", \"vitest 설정\", \"jest 설정\", NestJS 백엔드 프로젝트에서 테스트 작성 시.\nSKIP: Next.js/React 프론트엔드 테스트는 nextjs-testing."
version: 1.0.0
---

> 참조:
> - [references/service-test-example.md](references/service-test-example.md) - ProductService 유닛 테스트 전체 예시 (Mock 헬퍼 포함)
> - [references/e2e-test-example.md](references/e2e-test-example.md) - Product API E2E 테스트 전체 예시 (supertest)

# NestJS 테스트 작성

## 개요

NestJS 프로젝트에서 유닛 테스트(Service/Controller)와 E2E 테스트를 작성한다. Vitest 기반 TestingModule 구성, Mock 패턴, 커버리지 전략을 포함한다.

## 사전 요구사항

```bash
pnpm add -D @nestjs/testing vitest unplugin-swc @swc/core supertest @types/supertest
```

## 유닛 테스트 패턴

### Service 테스트

```typescript
// src/{resource}/{resource}.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { {Resource}Service } from './{resource}.service';
import { {Resource} } from './entities/{resource}.entity';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';

// Mock Repository 타입 헬퍼
type MockRepository<T = any> = Partial<Record<keyof Repository<T>, ReturnType<typeof vi.fn>>>;

const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findAndCount: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  preload: vi.fn(),
});

describe('{Resource}Service', () => {
  let service: {Resource}Service;
  let repository: MockRepository<{Resource}>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {Resource}Service,
        {
          provide: getRepositoryToken({Resource}),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<{Resource}Service>({Resource}Service);
    repository = module.get<MockRepository<{Resource}>>(getRepositoryToken({Resource}));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new {resource}', async () => {
      const dto: Create{Resource}Dto = { name: 'Test' };
      const expected = { id: 'uuid-1', ...dto, createdAt: new Date(), updatedAt: new Date() };

      repository.create!.mockReturnValue(expected);
      repository.save!.mockResolvedValue(expected);

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(expected);
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return a {resource} by id', async () => {
      const expected = { id: 'uuid-1', name: 'Test' };
      repository.findOne!.mockResolvedValue(expected);

      const result = await service.findOne('uuid-1');
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when {resource} not found', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const items = [{ id: 'uuid-1', name: 'Test' }];
      repository.findAndCount!.mockResolvedValue([items, 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(items);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });
});
```

### Controller 테스트

```typescript
// src/{resource}/{resource}.controller.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { {Resource}Controller } from './{resource}.controller';
import { {Resource}Service } from './{resource}.service';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';

const mockService = {
  create: vi.fn(),
  findAll: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

describe('{Resource}Controller', () => {
  let controller: {Resource}Controller;
  let service: typeof mockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [{Resource}Controller],
      providers: [
        { provide: {Resource}Service, useValue: mockService },
      ],
    }).compile();

    controller = module.get<{Resource}Controller>({Resource}Controller);
    service = module.get('{Resource}Service');
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a {resource}', async () => {
      const dto: Create{Resource}Dto = { name: 'Test' };
      const expected = { id: 'uuid-1', ...dto };
      service.create.mockResolvedValue(expected);

      const result = await controller.create(dto);
      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return paginated list', async () => {
      const expected = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 });
      expect(result).toEqual(expected);
    });
  });
});
```

### Guard/Interceptor Mock 패턴

```typescript
// Guard가 적용된 Controller 테스트 시
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const module: TestingModule = await Test.createTestingModule({
  controllers: [{Resource}Controller],
  providers: [{ provide: {Resource}Service, useValue: mockService }],
})
  .overrideGuard(JwtAuthGuard)
  .useValue({ canActivate: () => true })
  .compile();
```

### 외부 서비스 Mock 패턴

```typescript
import { vi } from 'vitest';

// ConfigService Mock
const mockConfigService = {
  get: vi.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-secret',
      DATABASE_URL: 'postgres://test',
    };
    return config[key];
  }),
  getOrThrow: vi.fn((key: string) => {
    const value = mockConfigService.get(key);
    if (!value) throw new Error(`Config key "${key}" not found`);
    return value;
  }),
};

// HttpService Mock (외부 API 호출)
const mockHttpService = {
  get: vi.fn(),
  post: vi.fn(),
};
```

## E2E 테스트 패턴

```typescript
// test/{resource}.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('{Resource}Controller (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 실제 앱과 동일한 파이프 설정
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /{resource}s', () => {
    it('should create a {resource}', () => {
      return request(app.getHttpServer())
        .post('/{resource}s')
        .send({ name: 'Test' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('Test');
        });
    });

    it('should fail with invalid data', () => {
      return request(app.getHttpServer())
        .post('/{resource}s')
        .send({})
        .expect(400);
    });
  });

  describe('GET /{resource}s', () => {
    it('should return paginated list', () => {
      return request(app.getHttpServer())
        .get('/{resource}s')
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
        });
    });
  });

  describe('GET /{resource}s/:id', () => {
    it('should return 404 for non-existent id', () => {
      return request(app.getHttpServer())
        .get('/{resource}s/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
```

### E2E 테스트용 테스트 DB 설정

```typescript
// test/test-utils.ts
import { TypeOrmModule } from '@nestjs/typeorm';

export const TestDatabaseModule = TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
  synchronize: true,
});
```

## Vitest 설정

```typescript
// vitest.config.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,          // 명시적 import 권장 (import { describe, it } from 'vitest')
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/**/*.dto.ts', 'src/**/*.entity.ts'],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});

// vitest.config.e2e.ts (E2E 테스트용)
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "vitest run --config vitest.config.e2e.ts"
  }
}
```

## 테스트 실행

```bash
# 유닛 테스트
pnpm test

# 유닛 테스트 (watch)
pnpm test:watch

# E2E 테스트
pnpm test:e2e

# 커버리지
pnpm test:cov
```

## 체크리스트

- [ ] 각 Service 메서드에 대해 정상 케이스 + 에러 케이스 테스트
- [ ] Repository, 외부 서비스는 반드시 Mock 처리
- [ ] Controller 테스트에서 Guard 오버라이드 확인
- [ ] E2E 테스트 시 ValidationPipe 등 미들웨어 설정 동일하게 적용
- [ ] E2E 테스트 DB는 인메모리 SQLite 또는 별도 테스트 DB 사용
- [ ] `beforeEach`에서 Mock 초기화(`vi.clearAllMocks()` 또는 재생성)
- [ ] `vitest.config.ts`에 `unplugin-swc` 플러그인 설정 확인
