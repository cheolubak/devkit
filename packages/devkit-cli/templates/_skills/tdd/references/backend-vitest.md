# 백엔드 TDD: NestJS + Vitest

NestJS Service를 **test-first**로 만든다. `Test.createTestingModule`로 대상을 격리하고, 의존성(Repository 등)은 mock으로 주입한다. 여기서는 방법론에 집중한다. Vitest 설정(`vitest.config.ts` + `unplugin-swc`)·프로젝트 배선은 **nestjs-testing** 스킬을 참조한다.

```bash
pnpm test:watch   # vitest — 저장할 때마다 자동 재실행
```

> `globals: false`가 기본이므로 `describe`/`it`/`expect`/`vi`는 항상 `vitest`에서 명시적으로 import한다.

## 유닛 vs 통합

- **유닛(격리)**: Repository·외부 협력자를 mock으로 주입해 Service 로직만 검증한다. 빠르고 대부분의 TDD 사이클이 여기서 돈다. (이 문서의 예시)
- **통합**: 실제 DB(테스트용 컨테이너 등)에 붙여 쿼리·트랜잭션까지 검증한다. 느리므로 핵심 경로에만.
- **e2e**: HTTP 계층까지 `supertest`로 검증한다 → **nestjs-testing** 스킬 참조.

---

## 예시: `UsersService.create` / `findOne`

### RED — 실패하는 테스트 먼저

Repository는 `getRepositoryToken`으로 mock provider를 주입한다.

```typescript
// src/users/users.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, ReturnType<typeof vi.fn>>>;

const createMockRepository = <T = any>(): MockRepository<T> => ({
  create: vi.fn(),
  save: vi.fn(),
  findOne: vi.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repository: MockRepository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: createMockRepository() },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('전달받은 dto로 사용자를 생성해 저장한다', async () => {
      // Arrange
      const dto = { email: 'a@test.com', name: 'A' };
      const entity = { id: 1, ...dto };
      repository.create!.mockReturnValue(entity);
      repository.save!.mockResolvedValue(entity);

      // Act
      const result = await service.create(dto);

      // Assert: 관찰 가능한 결과를 검증
      expect(result).toEqual(entity);
      expect(repository.save).toHaveBeenCalledWith(entity);
    });
  });
});
```

`UsersService`에 `create`가 없으니 **컴파일 실패 = RED**.

### GREEN — 통과할 최소 코드

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.repository.create(dto);
    return this.repository.save(user);
  }
}
```

### RED — 예외 케이스 (NotFound)

테스트 리스트에서 다음 케이스를 꺼낸다: "없는 id로 조회하면 예외".

```typescript
describe('findOne', () => {
  it('id로 사용자를 반환한다', async () => {
    const user = { id: 1, email: 'a@test.com', name: 'A' };
    repository.findOne!.mockResolvedValue(user);

    await expect(service.findOne(1)).resolves.toEqual(user);
  });

  it('존재하지 않는 id면 NotFoundException을 던진다', async () => {
    repository.findOne!.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });
});
```

### GREEN

```typescript
async findOne(id: number): Promise<User> {
  const user = await this.repository.findOne({ where: { id } });
  if (!user) {
    throw new NotFoundException(`User ${id} not found`);
  }
  return user;
}
```

### REFACTOR

초록을 유지하며 정리한다. 예: 여러 메서드에서 반복되는 "조회 후 없으면 예외" 로직을 private `findOrThrow(id)`로 추출한다. 테스트는 그대로 통과해야 한다.

---

## 팁

- **커스텀 provider로 모킹**: TypeORM Repository는 `getRepositoryToken(Entity)`, 그 외 협력 서비스는 `{ provide: OtherService, useValue: { method: vi.fn() } }`로 주입한다.
- **mock 초기화**: `beforeEach`에서 모듈을 새로 컴파일하면 mock도 새로 만들어진다. 모듈을 재사용한다면 `afterEach(() => vi.clearAllMocks())`를 둔다.
- 정상 케이스 하나 통과시킨 뒤, **예외·경계 케이스**를 각각 RED→GREEN으로 추가한다(한 번에 하나).
- `save`가 호출됐는지 같은 상호작용 검증은 최소화하고, 가능하면 **반환값**을 검증한다(과도한 모킹 안티패턴 주의).
- 설정(`vitest.config.ts`)·e2e(`supertest`)는 **nestjs-testing** 스킬.
