# TypeORM 고급 패턴 참조

## 1. Base Entity

```typescript
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export abstract class SoftDeletableEntity extends BaseEntity {
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
```

## 2. 관계 패턴

### One-to-Many / Many-to-One

```typescript
@Entity('users')
export class User extends BaseEntity {
  @Column()
  name: string;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}

@Entity('posts')
export class Post extends SoftDeletableEntity {
  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;
}
```

### Many-to-Many (자동 조인 테이블)

```typescript
@Entity('posts')
export class Post extends BaseEntity {
  @ManyToMany(() => Tag, (tag) => tag.posts)
  @JoinTable({ name: 'post_tags', joinColumn: { name: 'post_id' }, inverseJoinColumn: { name: 'tag_id' } })
  tags: Tag[];
}
```

### Self-referencing (트리 구조)

```typescript
@Entity('categories')
@Tree('closure-table')
export class Category extends BaseEntity {
  @Column()
  name: string;

  @TreeParent()
  parent: Category;

  @TreeChildren()
  children: Category[];
}
```

## 3. Custom Repository

```typescript
@Injectable()
export class ProductRepository extends Repository<Product> {
  constructor(private dataSource: DataSource) {
    super(Product, dataSource.createEntityManager());
  }

  async searchProducts(params: { search?: string; categoryId?: string; minPrice?: number; page: number; limit: number; sortBy: string; sortOrder: 'ASC' | 'DESC' }) {
    const qb = this.createQueryBuilder('product').leftJoinAndSelect('product.category', 'category');

    if (params.search) {
      qb.andWhere('(product.name ILIKE :search OR product.description ILIKE :search)', { search: `%${params.search}%` });
    }
    if (params.categoryId) qb.andWhere('product.categoryId = :categoryId', { categoryId: params.categoryId });
    if (params.minPrice !== undefined) qb.andWhere('product.price >= :minPrice', { minPrice: params.minPrice });

    const [data, total] = await qb.orderBy(`product.${params.sortBy}`, params.sortOrder).skip((params.page - 1) * params.limit).take(params.limit).getManyAndCount();
    return { data, total };
  }

  async getStatsByCategory() {
    return this.createQueryBuilder('product')
      .select('product.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(product.price)', 'avgPrice')
      .leftJoin('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .groupBy('product.categoryId')
      .addGroupBy('category.name')
      .getRawMany();
  }
}
```

## 4. 트랜잭션

### DataSource.transaction() (간단한 경우)

```typescript
async createOrder(dto: CreateOrderDto): Promise<Order> {
  return this.dataSource.transaction(async (manager) => {
    const order = manager.create(Order, { userId: dto.userId, status: 'pending' });
    const savedOrder = await manager.save(order);

    for (const item of dto.items) {
      const product = await manager.findOne(Product, {
        where: { id: item.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product || product.stock < item.quantity) {
        throw new InvalidOperationException(`재고 부족: ${product?.name}`);
      }
      product.stock -= item.quantity;
      await manager.save(product);
    }
    return savedOrder;
  });
}
```

### QueryRunner (세밀한 제어)

```typescript
async complexOperation(): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await queryRunner.manager.save(/* ... */);
    await queryRunner.query('SAVEPOINT step1');
    try {
      await queryRunner.manager.save(/* ... */);
    } catch {
      await queryRunner.query('ROLLBACK TO SAVEPOINT step1');
    }
    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

## 5. Entity Subscriber

```typescript
@EventSubscriber()
export class ProductSubscriber implements EntitySubscriberInterface<Product> {
  listenTo() { return Product; }
  beforeInsert(event: InsertEvent<Product>): void { /* 검증 로직 */ }
  afterInsert(event: InsertEvent<Product>): void { /* 검색 인덱스 업데이트, 캐시 무효화 */ }
}
```

## 6. Index 패턴

```typescript
@Entity('products')
@Index(['name', 'categoryId'])                          // 복합 인덱스
@Index(['price'], { where: '"deleted_at" IS NULL' })    // 부분 인덱스
export class Product extends SoftDeletableEntity {
  @Index()                                              // 단일 컬럼 인덱스
  @Column()
  name: string;

  @Index({ unique: true })                              // 유니크 인덱스
  @Column()
  sku: string;
}
```

## 7. Migration 예시

```typescript
export class CreateProductTable1704067200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'products',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
        { name: 'name', type: 'varchar', length: '200' },
        { name: 'price', type: 'decimal', precision: 10, scale: 2 },
        { name: 'stock', type: 'int', default: 0 },
        { name: 'category_id', type: 'uuid', isNullable: true },
        { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        { name: 'deleted_at', type: 'timestamptz', isNullable: true },
      ],
      foreignKeys: [{
        columnNames: ['category_id'],
        referencedTableName: 'categories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('products');
  }
}
```
