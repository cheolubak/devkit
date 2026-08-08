# Swagger 고급 패턴 참조

## 1. 응답 DTO 정의

```typescript
export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '무선 키보드' })
  name: string;

  @ApiProperty({ example: 59900 })
  price: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class PaginatedProductResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
```

## 2. 다양한 응답 코드 문서화

```typescript
@Get(':id')
@ApiOperation({ summary: '상품 상세 조회' })
@ApiParam({ name: 'id', description: '상품 UUID', type: 'string', format: 'uuid' })
@ApiResponse({ status: 200, description: '조회 성공', type: ProductResponseDto })
@ApiResponse({ status: 400, description: '잘못된 UUID 형식' })
@ApiResponse({ status: 401, description: '인증 필요' })
@ApiResponse({ status: 403, description: '접근 권한 없음' })
@ApiResponse({ status: 404, description: '상품을 찾을 수 없음' })
findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
  return this.productService.findOne(id);
}
```

## 3. 파일 업로드

```typescript
@Post('upload')
@ApiOperation({ summary: '상품 이미지 업로드' })
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: '이미지 파일 (jpg, png, webp)' },
      alt: { type: 'string', description: '대체 텍스트' },
    },
  },
})
@UseInterceptors(FileInterceptor('file'))
uploadImage(@UploadedFile() file: Express.Multer.File, @Body('alt') alt?: string) { ... }
```

## 4. Enum 문서화

```typescript
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export class OrderQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus, description: '주문 상태 필터' })
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: '복수 상태 필터' })
  statuses?: OrderStatus[];
}
```

## 5. 커스텀 헤더 문서화

```typescript
@Get('export')
@ApiHeader({ name: 'X-Export-Format', description: '내보내기 형식', required: false, enum: ['csv', 'xlsx', 'json'] })
@ApiResponse({
  status: 200,
  headers: {
    'Content-Disposition': {
      description: '파일 다운로드 헤더',
      schema: { type: 'string', example: 'attachment; filename="export.csv"' },
    },
  },
})
export(@Headers('X-Export-Format') format: string) { ... }
```

## 6. oneOf/anyOf (다형성 응답)

```typescript
@ApiExtraModels(CreditCardPaymentDto, BankTransferPaymentDto)
@Post('pay')
@ApiBody({
  schema: {
    oneOf: [
      { $ref: getSchemaPath(CreditCardPaymentDto) },
      { $ref: getSchemaPath(BankTransferPaymentDto) },
    ],
    discriminator: {
      propertyName: 'method',
      mapping: {
        credit_card: getSchemaPath(CreditCardPaymentDto),
        bank_transfer: getSchemaPath(BankTransferPaymentDto),
      },
    },
  },
})
pay(@Body() dto: CreditCardPaymentDto | BankTransferPaymentDto) { ... }
```

## 7. API 버전별 문서 분리

```typescript
// main.ts
const v1Config = new DocumentBuilder().setTitle('API v1').setVersion('1.0').addBearerAuth().build();
const v2Config = new DocumentBuilder().setTitle('API v2').setVersion('2.0').addBearerAuth().build();

const v1Document = SwaggerModule.createDocument(app, v1Config, { include: [UserModule, ProductModule] });
SwaggerModule.setup('api-docs/v1', app, v1Document);

const v2Document = SwaggerModule.createDocument(app, v2Config, { include: [UserModuleV2, ProductModuleV2] });
SwaggerModule.setup('api-docs/v2', app, v2Document);
```

## 8. 커스텀 데코레이터로 반복 줄이기

```typescript
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiPaginatedResponse(model: any) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: 200,
      schema: {
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}

// 사용:
@Get()
@ApiOperation({ summary: '상품 목록 조회' })
@ApiPaginatedResponse(ProductResponseDto)
findAll(@Query() query: PaginationQueryDto) { ... }
```
