---
name: nestjs-database
description: "NestJS 데이터베이스 패턴.\nAPPLIES: NestJS에서 TypeORM/Prisma 엔티티·리포지토리·마이그레이션·트랜잭션을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"TypeORM\", \"Prisma\", \"데이터베이스 설정\", \"마이그레이션\", \"엔티티 생성\", \"DB 연결\", \"테이블 만들어줘\", \"스키마 생성\", \"리포지토리 패턴\", NestJS 프로젝트에서 DB 설정/엔티티/마이그레이션 작업 시.\nSKIP: 벡터 검색/임베딩은 nestjs-semantic-search. CRUD 전체 모듈 생성은 nestjs-crud."
version: 1.0.0
---

> 참조:
> - [references/typeorm-advanced-patterns.md](references/typeorm-advanced-patterns.md) - BaseEntity, 관계 매핑, QueryBuilder, 트랜잭션 고급 패턴
> - [references/prisma-patterns.md](references/prisma-patterns.md) - Prisma schema, PrismaService, 트랜잭션·관계 쿼리 패턴

# NestJS 데이터베이스 패턴

## 개요

NestJS에서 TypeORM 또는 Prisma를 사용한 데이터베이스 연동 패턴. 설정, Entity/Model 정의, Repository 패턴, Migration, 트랜잭션 처리를 포함한다.

---

## Part 1: TypeORM

### 설치

```bash
pnpm add @nestjs/typeorm typeorm pg
```

### 설정

```typescript
// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),
        username: configService.getOrThrow('DATABASE_USER'),
        password: configService.getOrThrow('DATABASE_PASSWORD'),
        database: configService.getOrThrow('DATABASE_NAME'),
        autoLoadEntities: true,
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
```

### Entity 패턴

```typescript
// src/common/entities/base.entity.ts
import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// src/user/entities/user.entity.ts
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Post } from '../../post/entities/post.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: ['admin', 'user'], default: 'user' })
  role: string;

  @Column({ nullable: true })
  hashedRefreshToken?: string;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}

// src/post/entities/post.entity.ts
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../user/entities/user.entity';

@Entity('posts')
export class Post extends BaseEntity {
  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ default: false })
  isPublished: boolean;

  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;
}
```

### Soft Delete 패턴

```typescript
import { DeleteDateColumn, Entity } from 'typeorm';

@Entity('posts')
export class Post extends BaseEntity {
  // ... 기존 컬럼

  @DeleteDateColumn()
  deletedAt?: Date;
}

// Service에서 소프트 삭제
await this.postRepository.softRemove(post);

// 소프트 삭제된 항목 포함 조회
await this.postRepository.find({ withDeleted: true });
```

### Custom Repository 패턴

```typescript
// src/user/user.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(private dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
  }

  async findWithPosts(userId: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post')
      .where('user.id = :userId', { userId })
      .andWhere('post.isPublished = :isPublished', { isPublished: true })
      .getOne();
  }
}

// Module에 등록
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

### 트랜잭션 패턴

```typescript
// 방법 1: DataSource.transaction()
import { DataSource } from 'typeorm';

@Injectable()
export class OrderService {
  constructor(private dataSource: DataSource) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = manager.create(Order, { userId: dto.userId });
      const savedOrder = await manager.save(order);

      const items = dto.items.map((item) =>
        manager.create(OrderItem, { ...item, orderId: savedOrder.id }),
      );
      await manager.save(items);

      // 재고 차감
      for (const item of dto.items) {
        await manager.decrement(Product, { id: item.productId }, 'stock', item.quantity);
      }

      return savedOrder;
    });
  }
}

// 방법 2: QueryRunner (세밀한 제어)
async createOrderWithQueryRunner(dto: CreateOrderDto): Promise<Order> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const order = queryRunner.manager.create(Order, { userId: dto.userId });
    const savedOrder = await queryRunner.manager.save(order);

    // ... 나머지 로직

    await queryRunner.commitTransaction();
    return savedOrder;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

### Migration

```typescript
// data-source.ts (CLI용 DataSource)
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/database/migrations/*{.ts,.js}'],
});
```

```json
// package.json scripts
{
  "scripts": {
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d ./data-source.ts",
    "migration:generate": "pnpm typeorm migration:generate src/database/migrations/$npm_config_name",
    "migration:run": "pnpm typeorm migration:run",
    "migration:revert": "pnpm typeorm migration:revert"
  }
}
```

```bash
# Migration 생성 (Entity 변경 감지)
pnpm migration:generate --name=CreateUserTable

# Migration 실행
pnpm migration:run

# Migration 롤백
pnpm migration:revert
```

---

## Part 2: Prisma

### 설치

```bash
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init
```

### Schema 정의

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String   @id @default(uuid())
  email            String   @unique
  name             String
  password         String
  role             Role     @default(USER)
  hashedRefreshToken String?
  posts            Post[]
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("users")
}

model Post {
  id          String   @id @default(uuid())
  title       String
  content     String
  isPublished Boolean  @default(false) @map("is_published")
  author      User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId    String   @map("author_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  @@map("posts")
}

enum Role {
  ADMIN
  USER
}
```

### PrismaService

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Prisma Service 사용

```typescript
// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException(`User #${id}을(를) 찾을 수 없습니다`);
    return user;
  }

  async findAll(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true },
      }),
      this.prisma.user.count(),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
```

### Prisma 트랜잭션

```typescript
async createOrder(dto: CreateOrderDto) {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { userId: dto.userId },
    });

    await tx.orderItem.createMany({
      data: dto.items.map((item) => ({
        ...item,
        orderId: order.id,
      })),
    });

    for (const item of dto.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return order;
  });
}
```

### Prisma Migration

```bash
# 마이그레이션 생성 + 적용
npx prisma migrate dev --name init

# 프로덕션 마이그레이션
npx prisma migrate deploy

# 클라이언트 재생성
npx prisma generate

# DB 시드
npx prisma db seed
```

## 체크리스트

- [ ] 프로덕션에서 `synchronize: false` (TypeORM) 확인
- [ ] Migration 파일 버전 관리에 포함
- [ ] 트랜잭션이 필요한 비즈니스 로직 식별 및 적용
- [ ] Entity/Model에 적절한 인덱스 설정
- [ ] 민감한 컬럼 `select: false` (TypeORM) 또는 `select` 제외 (Prisma)
- [ ] Soft Delete 필요 여부 결정
- [ ] 연관관계(cascade, onDelete) 정책 결정
- [ ] 개발 환경에서 쿼리 로깅 활성화

## 참고

- `nestjs-config` 스킬: 데이터베이스 환경변수 관리
- `nestjs-crud` 스킬: CRUD 서비스에서 Repository 사용 패턴
- `nestjs-error-handling` 스킬: TypeORM 에러 처리
