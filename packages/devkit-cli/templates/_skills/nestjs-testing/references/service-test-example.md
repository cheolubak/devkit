# Service 유닛 테스트 완전 예시

Vitest + @nestjs/testing 기반 ProductService 테스트.

## Mock 헬퍼

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProductService } from './product.service';
import { Product } from './entities/product.entity';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, ReturnType<typeof vi.fn>>>;

const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findAndCount: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  softRemove: vi.fn(),
  preload: vi.fn(),
  createQueryBuilder: vi.fn(),
});

const createMockQueryBuilder = () => {
  const qb: any = {
    andWhere: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue(null),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  };
  return qb;
};
```

## 테스트 데이터 팩토리

```typescript
const createMockProduct = (overrides = {}) => ({
  id: 'uuid-1',
  name: '테스트 상품',
  description: '테스트 설명',
  price: 10000,
  stock: 50,
  isActive: true,
  status: 'published',
  categoryId: 'cat-uuid-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
  ...overrides,
});
```

## 테스트 코드

```typescript
describe('ProductService', () => {
  let service: ProductService;
  let repository: MockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(Product), useValue: createMockRepository() },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    repository = module.get(getRepositoryToken(Product));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a product', async () => {
      const dto = { name: '새 상품', price: 10000, stock: 50, categoryId: 'cat-1' };
      const expected = createMockProduct(dto);

      repository.create!.mockReturnValue(expected);
      repository.save!.mockResolvedValue(expected);

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(expected);
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      const expected = createMockProduct();
      repository.findOne!.mockResolvedValue(expected);

      const result = await service.findOne('uuid-1');
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException if product not found', async () => {
      repository.findOne!.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated products', async () => {
      const mockQb = createMockQueryBuilder();
      const products = [createMockProduct(), createMockProduct({ id: 'uuid-2', name: '상품 2' })];
      mockQb.getManyAndCount.mockResolvedValue([products, 2]);
      repository.createQueryBuilder!.mockReturnValue(mockQb);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(products);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply search filter', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      repository.createQueryBuilder!.mockReturnValue(mockQb);

      await service.findAll({ page: 1, limit: 20, search: '키보드' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%키보드%' }),
      );
    });
  });

  describe('update', () => {
    it('should update and return the product', async () => {
      const existing = createMockProduct();
      const updated = { ...existing, name: '수정된 상품' };

      repository.findOne!.mockResolvedValue(existing);
      repository.save!.mockResolvedValue(updated);

      const result = await service.update('uuid-1', { name: '수정된 상품' });
      expect(result.name).toBe('수정된 상품');
    });
  });

  describe('remove', () => {
    it('should soft remove the product', async () => {
      const product = createMockProduct();
      repository.findOne!.mockResolvedValue(product);
      repository.softRemove!.mockResolvedValue({ ...product, deletedAt: new Date() });

      await service.remove('uuid-1');
      expect(repository.softRemove).toHaveBeenCalledWith(product);
    });
  });
});
```
