# Prisma 패턴 참조

## Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { ADMIN USER MODERATOR }
enum OrderStatus { PENDING CONFIRMED SHIPPED DELIVERED CANCELLED }

model User {
  id                 String    @id @default(uuid())
  email              String    @unique
  name               String
  password           String
  role               Role      @default(USER)
  hashedRefreshToken String?   @map("hashed_refresh_token")
  posts              Post[]
  orders             Order[]
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  @@map("users")
}

model Post {
  id          String    @id @default(uuid())
  title       String
  content     String
  isPublished Boolean   @default(false) @map("is_published")
  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId    String    @map("author_id")
  category    Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId  String?   @map("category_id")
  tags        Tag[]
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  @@index([authorId])
  @@index([categoryId])
  @@map("posts")
}

model Category {
  id       String     @id @default(uuid())
  name     String     @unique
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  parentId String?    @map("parent_id")
  children Category[] @relation("CategoryTree")
  posts    Post[]
  @@map("categories")
}
```

## PrismaService

```typescript
// src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit() {
    await this.$connect();

    // Soft Delete 미들웨어
    this.$use(async (params, next) => {
      if (params.model === 'Post') {
        if (params.action === 'findMany' || params.action === 'findFirst') {
          params.args ??= {};
          params.args.where ??= {};
          if (params.args.where.deletedAt === undefined) params.args.where.deletedAt = null;
        }
        if (params.action === 'delete') {
          params.action = 'update';
          params.args.data = { deletedAt: new Date() };
        }
      }
      return next(params);
    });
  }

  async onModuleDestroy() { await this.$disconnect(); }

  async executeInTransaction<T>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn, { maxWait: 5000, timeout: 10000 });
  }
}
```

## PrismaModule (글로벌)

```typescript
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

## Service 패턴

```typescript
@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: {
        title: dto.title,
        content: dto.content,
        authorId: userId,
        tags: dto.tagIds ? { connect: dto.tagIds.map((id) => ({ id })) } : undefined,
      },
      include: { author: { select: { id: true, name: true } }, tags: true },
    });
  }

  async findAll(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true } },
          tags: { select: { id: true, name: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
```

## 트랜잭션

```typescript
async createOrder(userId: string, dto: CreateOrderDto) {
  return this.prisma.executeInTransaction(async (tx) => {
    const order = await tx.order.create({ data: { userId, status: 'PENDING', total: 0 } });

    let total = 0;
    for (const item of dto.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.stock < item.quantity) throw new Error(`재고 부족`);

      await tx.orderItem.create({
        data: { orderId: order.id, productId: item.productId, quantity: item.quantity, unitPrice: product.price },
      });
      await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      total += Number(product.price) * item.quantity;
    }

    return tx.order.update({ where: { id: order.id }, data: { total }, include: { items: true } });
  });
}
```

## Seed

```typescript
// prisma/seed.ts
// package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: '관리자',
      password: await bcrypt.hash('admin1234!', 10),
      role: 'ADMIN',
    },
  });
  console.log('Seed completed:', { admin: admin.email });
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

## 명령어

```bash
npx prisma migrate dev --name init     # 마이그레이션 생성+적용
npx prisma migrate deploy              # 프로덕션 마이그레이션
npx prisma generate                    # 클라이언트 재생성
npx prisma db seed                     # 시드 실행
npx prisma studio                      # 데이터 브라우저
```
