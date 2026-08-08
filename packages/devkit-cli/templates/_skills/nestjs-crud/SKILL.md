---
name: nestjs-crud
description: "NestJS CRUD 모듈 스캐폴딩.\nAPPLIES: NestJS 프로젝트에 새 리소스(컨트롤러+서비스+모듈+DTO)를 추가하거나 엔드포인트를 늘릴 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"API 만들어줘\", \"CRUD 생성\", \"모듈 생성\", \"리소스 생성\", \"scaffold\", \"컨트롤러 만들어줘\", \"서비스 만들어줘\", \"엔드포인트 추가\", NestJS 프로젝트에서 새 리소스/모듈 생성 시.\nSKIP: Next.js Server Actions는 server-actions. DB 엔티티/마이그레이션만이면 nestjs-database."
version: 1.0.0
---

> 참조:
> - [references/complete-crud-example.md](references/complete-crud-example.md) - Product 리소스 CRUD 모듈 전체 예시 (복사 후 리소스명 치환)
> - [references/pagination.md](references/pagination.md) - 공용 페이지네이션 DTO/유틸 (오프셋·커서)

# NestJS CRUD 모듈 스캐폴딩

## 개요

NestJS 프로젝트에서 새로운 리소스에 대한 CRUD(Create, Read, Update, Delete) 모듈을 일괄 생성한다.
Module, Controller, Service, DTO(Create/Update), Entity를 포함하며 RESTful 엔드포인트, Swagger 데코레이터, class-validator, 페이지네이션을 기본 포함한다.

## 사전 요구사항

```bash
pnpm add @nestjs/swagger class-validator class-transformer
```

## 파일 구조

```text
src/{resource}/
├── {resource}.module.ts
├── {resource}.controller.ts
├── {resource}.service.ts
├── dto/
│   ├── create-{resource}.dto.ts
│   └── update-{resource}.dto.ts
├── entities/
│   └── {resource}.entity.ts
└── {resource}.controller.spec.ts
```

## 코드 템플릿

### Entity

```typescript
// src/{resource}/entities/{resource}.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('{resource}s')
export class {Resource} {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Create DTO

```typescript
// src/{resource}/dto/create-{resource}.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class Create{Resource}Dto {
  @ApiProperty({ description: '{Resource} 이름', example: 'Sample' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
```

### Update DTO

```typescript
// src/{resource}/dto/update-{resource}.dto.ts
import { PartialType } from '@nestjs/swagger';
import { Create{Resource}Dto } from './create-{resource}.dto';

export class Update{Resource}Dto extends PartialType(Create{Resource}Dto) {}
```

### 페이지네이션 DTO (공용)

```typescript
// src/common/dto/pagination-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
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
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### Service

```typescript
// src/{resource}/{resource}.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { {Resource} } from './entities/{resource}.entity';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';
import { Update{Resource}Dto } from './dto/update-{resource}.dto';
import { PaginationQueryDto, PaginatedResult } from '../common/dto/pagination-query.dto';

@Injectable()
export class {Resource}Service {
  constructor(
    @InjectRepository({Resource})
    private readonly {resource}Repository: Repository<{Resource}>,
  ) {}

  async create(dto: Create{Resource}Dto): Promise<{Resource}> {
    const entity = this.{resource}Repository.create(dto);
    return this.{resource}Repository.save(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<{Resource}>> {
    const { page = 1, limit = 20 } = query;
    const [data, total] = await this.{resource}Repository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<{Resource}> {
    const entity = await this.{resource}Repository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`{Resource} #${id}을(를) 찾을 수 없습니다`);
    }
    return entity;
  }

  async update(id: string, dto: Update{Resource}Dto): Promise<{Resource}> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.{resource}Repository.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.{resource}Repository.remove(entity);
  }
}
```

### Controller

```typescript
// src/{resource}/{resource}.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { {Resource}Service } from './{resource}.service';
import { Create{Resource}Dto } from './dto/create-{resource}.dto';
import { Update{Resource}Dto } from './dto/update-{resource}.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('{resource}s')
@Controller('{resource}s')
export class {Resource}Controller {
  constructor(private readonly {resource}Service: {Resource}Service) {}

  @Post()
  @ApiOperation({ summary: '{Resource} 생성' })
  @ApiResponse({ status: 201, description: '생성 완료' })
  create(@Body() dto: Create{Resource}Dto) {
    return this.{resource}Service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '{Resource} 목록 조회' })
  @ApiResponse({ status: 200, description: '조회 완료' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.{resource}Service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '{Resource} 단건 조회' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: '조회 완료' })
  @ApiResponse({ status: 404, description: '리소스 없음' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.{resource}Service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '{Resource} 수정' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: '수정 완료' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Update{Resource}Dto) {
    return this.{resource}Service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '{Resource} 삭제' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: '삭제 완료' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.{resource}Service.remove(id);
  }
}
```

### Module

```typescript
// src/{resource}/{resource}.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { {Resource}Controller } from './{resource}.controller';
import { {Resource}Service } from './{resource}.service';
import { {Resource} } from './entities/{resource}.entity';

@Module({
  imports: [TypeOrmModule.forFeature([{Resource}])],
  controllers: [{Resource}Controller],
  providers: [{Resource}Service],
  exports: [{Resource}Service],
})
export class {Resource}Module {}
```

## 체크리스트

- [ ] `{resource}` / `{Resource}` 플레이스홀더를 실제 리소스명으로 교체
- [ ] Entity 컬럼을 요구사항에 맞게 수정
- [ ] DTO에 필요한 유효성 검증 데코레이터 추가
- [ ] `AppModule`의 imports에 새 모듈 등록
- [ ] `PaginationQueryDto`가 `src/common/dto/`에 없으면 생성
- [ ] Swagger 데코레이터의 description, example 값 커스터마이즈
- [ ] `ValidationPipe`가 `main.ts`에 글로벌 설정되어 있는지 확인

## 참고

- `nestjs-swagger` 스킬: Swagger 설정 상세
- `nestjs-validation` 스킬: DTO 유효성 검증 심화
- `nestjs-database` 스킬: TypeORM/Prisma 설정 및 패턴
