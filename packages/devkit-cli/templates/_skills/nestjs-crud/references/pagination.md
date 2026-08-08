# 공용 페이지네이션 유틸리티

`src/common/dto/pagination-query.dto.ts`로 사용.

## 기본 오프셋 페이지네이션

```typescript
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

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export function createPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
```

## 커서 기반 페이지네이션 (대규모 데이터셋용)

```typescript
export class CursorPaginationQueryDto {
  @ApiPropertyOptional({ description: '커서 (마지막 항목의 ID)' })
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}
```

### 커서 페이지네이션 Service 사용 예시

```typescript
async findAllWithCursor(query: CursorPaginationQueryDto): Promise<CursorPaginatedResult<Entity>> {
  const { cursor, take = 20 } = query;

  const queryBuilder = this.repository.createQueryBuilder('entity')
    .orderBy('entity.createdAt', 'DESC')
    .take(take + 1); // 다음 페이지 존재 여부 확인용 +1

  if (cursor) {
    const cursorEntity = await this.repository.findOne({ where: { id: cursor } });
    if (cursorEntity) {
      queryBuilder.andWhere('entity.createdAt < :cursorDate', {
        cursorDate: cursorEntity.createdAt,
      });
    }
  }

  const items = await queryBuilder.getMany();
  const hasMore = items.length > take;
  const data = hasMore ? items.slice(0, take) : items;

  return {
    data,
    meta: {
      hasMore,
      nextCursor: data.length > 0 ? data[data.length - 1].id : null,
    },
  };
}
```
