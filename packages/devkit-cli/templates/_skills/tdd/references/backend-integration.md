# 백엔드 통합 TDD: 실제 DB 대상 test-first

유닛 TDD(Repository를 mock으로 주입)는 [backend-vitest.md](backend-vitest.md)에 있다. 여기서는 **mock을 걷어내고 실제 테스트 DB에 붙여** test-first하는 각도만 다룬다. 컨테이너·Vitest 설정·`supertest` e2e 배선은 **nestjs-testing** 스킬을 참조한다 — 이 문서는 방법론 델타에 집중한다.

## 유닛과 무엇이 다른가

| | 유닛(backend-vitest.md) | 통합(이 문서) |
|--|--|--|
| Repository | `getRepositoryToken`으로 **mock** | 실제 DB에 연결된 **진짜** Repository |
| 검증 대상 | Service가 mock을 올바로 호출했나 | **쿼리·제약·트랜잭션의 실제 결과** |
| RED의 의미 | 메서드 없음 → 컴파일 실패 | 그 위 + **DB에 실제로 저장/조회되는가** |
| 속도 | 빠름(대부분 사이클) | 느림 → **핵심 경로에만** |

통합 TDD를 쓰는 이유는 mock으론 못 잡는 것들이다: **unique 제약 위반, 실제 SQL의 필터링, 관계 로딩, 트랜잭션 롤백.** 이런 동작은 mock을 아무리 정교하게 짜도 "내가 상상한 DB"만 검증할 뿐이다.

## 통합 TDD의 규율: 매 테스트 깨끗한 DB에서 시작

실제 DB는 **상태가 남는다.** test-first가 성립하려면 각 테스트가 **격리된 초기 상태**에서 출발해야 한다. 안 그러면 앞 테스트가 넣은 행 때문에 RED가 이유 없이 초록이 되거나 그 반대가 된다.

```typescript
beforeEach(async () => {
  // 매 테스트 전에 테이블을 비운다 (격리)
  await dataSource.query('TRUNCATE users RESTART IDENTITY CASCADE');
});
```

> 테스트 DB 자체(테스트 컨테이너 기동, `TypeOrmModule.forRoot` 테스트 설정)는 **nestjs-testing** 스킬. 여기서는 이미 붙어 있다고 가정한다.

## 예시: 이메일 unique 제약 — mock으론 못 잡는 것

> 요구: "이미 가입된 이메일로 다시 가입하면 `ConflictException`."
> unique 위반은 **DB가 던지는 에러**다. mock Repository는 이 제약을 모른다 → 통합으로 test-first할 자리.

### RED — 실제 DB에서 실패를 본다

```typescript
// src/users/users.service.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService (통합)', () => {
  let service: UsersService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // 실제 테스트 DB에 연결하는 모듈 구성 → nestjs-testing 참조
      imports: [TestDbModule],
      providers: [UsersService],
    }).compile();

    service = moduleRef.get(UsersService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(() => dataSource.query('TRUNCATE users RESTART IDENTITY CASCADE'));
  afterAll(() => dataSource.destroy());

  it('중복 이메일로 가입하면 ConflictException을 던진다', async () => {
    await service.create({ email: 'a@test.com', name: 'A' });

    // 두 번째 저장은 DB의 unique 제약에 걸린다
    await expect(service.create({ email: 'a@test.com', name: 'B' })).rejects.toThrow(
      ConflictException,
    );
  });
});
```

지금 Service는 unique 위반을 `ConflictException`으로 변환하지 않으므로 **드라이버 raw 에러가 새어 나와 실패(RED)** 한다. 이 실패는 mock 유닛 테스트로는 절대 재현되지 않는다 — 통합의 존재 이유다.

### GREEN — DB 에러를 도메인 예외로 변환

```typescript
async create(dto: CreateUserDto): Promise<User> {
  try {
    const user = this.repository.create(dto);
    return await this.repository.save(user);
  } catch (e) {
    // Postgres unique_violation
    if (e instanceof QueryFailedError && (e as any).code === '23505') {
      throw new ConflictException('이미 가입된 이메일입니다');
    }
    throw e;
  }
}
```

이제 초록. **실제 제약이 실제로 걸리는 것**을 검증했다.

### 실제 쿼리 결과도 통합으로 검증한다

mock은 "findOne이 이걸 반환한다"고 내가 정해준 것만 돌려준다. 통합은 **진짜 저장 → 진짜 조회** 왕복을 검증한다:

```typescript
it('저장한 사용자를 이메일로 조회할 수 있다', async () => {
  await service.create({ email: 'a@test.com', name: 'A' });

  const found = await service.findByEmail('a@test.com');

  expect(found?.name).toBe('A'); // DB 왕복이 실제로 동작
});
```

## 통합 TDD를 어디까지 쓰나

- **통합으로**: unique/FK 제약, 실제 필터·정렬·조인 쿼리, 트랜잭션 롤백, 마이그레이션이 만든 스키마.
- **유닛(mock)으로 충분**: 분기·계산·검증 로직. 이건 [backend-vitest.md](backend-vitest.md)에서 빠르게 돈다.
- **e2e(supertest)로**: 컨트롤러·가드·파이프까지 HTTP 계층 전체 → **nestjs-testing** 스킬.

통합은 느리다. 유닛으로 잡을 수 있는 걸 통합으로 짜지 않는다 — **DB만이 알려줄 수 있는 동작**에만 쓴다.
