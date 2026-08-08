# E2E 테스트 완전 예시

Vitest + supertest 기반 Product API E2E 테스트.

## 기본 CRUD E2E 테스트

```typescript
// test/product.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ProductController (e2e)', () => {
  let app: INestApplication;
  let createdProductId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /products', () => {
    const validProduct = {
      name: 'E2E 테스트 상품',
      description: '테스트용 상품입니다',
      price: 15000,
      stock: 100,
      categoryId: '00000000-0000-0000-0000-000000000001',
    };

    it('should create a product', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send(validProduct)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe(validProduct.name);
          createdProductId = res.body.id;
        });
    });

    it('should fail with empty name', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send({ ...validProduct, name: '' })
        .expect(400);
    });

    it('should fail with unknown properties', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send({ ...validProduct, unknownField: 'test' })
        .expect(400);
    });
  });

  describe('GET /products', () => {
    it('should return paginated list', () => {
      return request(app.getHttpServer())
        .get('/products')
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should reject invalid page number', () => {
      return request(app.getHttpServer())
        .get('/products')
        .query({ page: 0 })
        .expect(400);
    });
  });

  describe('GET /products/:id', () => {
    it('should return 404 for non-existent id', () => {
      return request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid uuid', () => {
      return request(app.getHttpServer())
        .get('/products/invalid-uuid')
        .expect(400);
    });
  });

  describe('PATCH /products/:id', () => {
    it('should allow partial update', () => {
      return request(app.getHttpServer())
        .patch(`/products/${createdProductId}`)
        .send({ stock: 200 })
        .expect(200)
        .expect((res) => {
          expect(res.body.stock).toBe(200);
        });
    });
  });

  describe('DELETE /products/:id', () => {
    it('should soft delete the product', () => {
      return request(app.getHttpServer())
        .delete(`/products/${createdProductId}`)
        .expect(204);
    });
  });
});
```

## 테스트 DB 모듈 (SQLite 인메모리)

```typescript
// test/test-database.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';

export const TestDatabaseModule = TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
  synchronize: true,
  dropSchema: true,
});
```

## 인증이 필요한 E2E 테스트

```typescript
describe('Authenticated endpoints (e2e)', () => {
  let accessToken: string;

  beforeAll(async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@test.com', password: 'P@ssw0rd!', name: '테스터' });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'P@ssw0rd!' });

    accessToken = loginRes.body.accessToken;
  });

  it('should access protected endpoint with token', () => {
    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '인증된 상품', price: 10000, stock: 10, categoryId: 'cat-1' })
      .expect(201);
  });

  it('should reject without token', () => {
    return request(app.getHttpServer())
      .post('/products')
      .send({ name: '인증 없음', price: 10000, stock: 10, categoryId: 'cat-1' })
      .expect(401);
  });
});
```
