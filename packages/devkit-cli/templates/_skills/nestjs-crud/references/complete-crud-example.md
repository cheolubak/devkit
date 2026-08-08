# 완전한 CRUD 모듈 예시: Product (상품)

복사 후 `Product/product` → 실제 리소스명으로 치환하여 사용.

## Entity

```typescript
// src/product/entities/product.entity.ts
import {
  Column, CreateDateColumn, DeleteDateColumn, Entity, Index,
  ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  @Index()
  name: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('int', { default: 0 })
  stock: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: ['draft', 'published', 'archived'], default: 'draft' })
  status: 'draft' | 'published' | 'archived';

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
```

## Create DTO

```typescript
// src/product/dto/create-product.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsPositive, IsString, IsUUID, MaxLength, Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: '상품명', example: '무선 키보드', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '상품 설명', example: '블루투스 5.0 무선 키보드' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '가격', example: 59900, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @ApiProperty({ description: '재고 수량', example: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ description: '상태', enum: ['draft', 'published', 'archived'], default: 'draft' })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';

  @ApiProperty({ description: '카테고리 ID', format: 'uuid' })
  @IsUUID()
  categoryId: string;
}
```

## Update DTO

```typescript
// src/product/dto/update-product.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

## Query DTO (검색/필터/정렬/페이지네이션)

```typescript
// src/product/dto/product-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '검색어' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '상태 필터', enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({ description: '정렬 기준', enum: ['createdAt', 'price', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsEnum(['createdAt', 'price', 'name'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: '정렬 방향', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
```

## Service

```typescript
// src/product/product.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create(dto);
    return this.productRepository.save(product);
  }

  async findAll(query: ProductQueryDto) {
    const { page = 1, limit = 20, search, status, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    const queryBuilder = this.productRepository.createQueryBuilder('product');

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (status) {
      queryBuilder.andWhere('product.status = :status', { status });
    }

    queryBuilder
      .orderBy(`product.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!product) {
      throw new NotFoundException(`Product #${id}을(를) 찾을 수 없습니다`);
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    Object.assign(product, dto);
    return this.productRepository.save(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.softRemove(product);
  }
}
```

## Controller

```typescript
// src/product/product.controller.ts
import {
  Controller, Get, Post, Body, Patch, Param, Delete, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('products')
@ApiBearerAuth('access-token')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiOperation({ summary: '상품 생성' })
  @ApiResponse({ status: 201, description: '생성 완료' })
  @ApiResponse({ status: 400, description: '유효성 검증 실패' })
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '상품 목록 조회 (검색/필터/정렬/페이지네이션)' })
  @ApiResponse({ status: 200, description: '조회 완료' })
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '상품 상세 조회' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: '조회 완료' })
  @ApiResponse({ status: 404, description: '상품 없음' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '상품 수정' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '상품 삭제 (Soft Delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: '삭제 완료' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.remove(id);
  }
}
```

## Module

```typescript
// src/product/product.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
```
