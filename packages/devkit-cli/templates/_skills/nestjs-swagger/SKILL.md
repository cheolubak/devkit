---
name: nestjs-swagger
description: "NestJS Swagger/OpenAPI 문서화.\nAPPLIES: NestJS에서 `@ApiProperty`·`SwaggerModule` 등 OpenAPI 문서화를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"Swagger 설정\", \"API 문서화\", \"OpenAPI\", \"API docs\", \"API 문서 만들어줘\", \"스웨거\", \"API 명세\", NestJS에서 API 문서화/Swagger 설정 시.\nSKIP: 프론트엔드 Storybook 문서화는 별도."
version: 1.0.0
---

> 참조:
> - [references/advanced-swagger-patterns.md](references/advanced-swagger-patterns.md) - 응답 DTO, 파일 업로드, Enum, oneOf 다형성, 버전별 문서 분리, 커스텀 데코레이터

# NestJS Swagger/OpenAPI 문서화

## 개요

@nestjs/swagger를 사용하여 REST API 문서를 자동 생성한다. Swagger UI 셋업, DTO 데코레이터, 응답 타입 정의, ApiTags/ApiOperation 등 문서화 패턴을 포함한다.

## 사전 요구사항

```bash
pnpm add @nestjs/swagger
```

## Swagger 초기 설정

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ValidationPipe 글로벌 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('API 문서')
    .setDescription('API 설명')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', '인증 관련 API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(3000);
}
bootstrap();
```

## CLI 플러그인 설정 (자동 데코레이터)

```json
// nest-cli.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": true,
          "introspectComments": true
        }
      }
    ]
  }
}
```

> CLI 플러그인을 사용하면 DTO 프로퍼티에 `@ApiProperty()`를 자동 추가한다. 단, 명시적 설정이 필요한 경우(example, enum 등)에는 직접 데코레이터를 사용한다.

## DTO 데코레이터 패턴

### 기본 프로퍼티

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: '사용자 이메일', example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '비밀번호(8자 이상)', example: 'P@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '사용자 이름', example: '홍길동', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ description: '프로필 이미지 URL' })
  @IsOptional()
  @IsUrl()
  profileImage?: string;
}
```

### Enum 타입

```typescript
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export class UpdateRoleDto {
  @ApiProperty({ enum: UserRole, description: '사용자 역할' })
  @IsEnum(UserRole)
  role: UserRole;
}
```

### 배열/중첩 타입

```typescript
export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto], description: '주문 항목 목록' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

### PartialType / PickType / OmitType / IntersectionType

```typescript
import { PartialType, PickType, OmitType, IntersectionType } from '@nestjs/swagger';

// 모든 필드 Optional
export class UpdateUserDto extends PartialType(CreateUserDto) {}

// 특정 필드만 선택
export class LoginDto extends PickType(CreateUserDto, ['email', 'password'] as const) {}

// 특정 필드 제외
export class PublicUserDto extends OmitType(CreateUserDto, ['password'] as const) {}

// 두 DTO 합치기
export class CreateUserWithRoleDto extends IntersectionType(CreateUserDto, UpdateRoleDto) {}
```

## Controller 데코레이터 패턴

### 기본 CRUD

```typescript
import {
  ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery,
  ApiBearerAuth, ApiBody, ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: '사용자 목록 조회', description: '페이지네이션 지원' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '조회 성공', type: PaginatedUserResponseDto })
  findAll(@Query() query: PaginationQueryDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '사용자 상세 조회' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: '조회 성공', type: UserResponseDto })
  @ApiResponse({ status: 404, description: '사용자 없음' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '사용자 생성' })
  @ApiResponse({ status: 201, description: '생성 완료', type: UserResponseDto })
  @ApiResponse({ status: 400, description: '유효성 검증 실패' })
  @ApiResponse({ status: 409, description: '이메일 중복' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }
}
```

### 파일 업로드

```typescript
@Post('upload')
@ApiOperation({ summary: '파일 업로드' })
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  },
})
@UseInterceptors(FileInterceptor('file'))
uploadFile(@UploadedFile() file: Express.Multer.File) {
  return { url: file.path };
}
```

## 응답 타입 정의

```typescript
// src/common/dto/api-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: T;

  @ApiProperty({ example: null, nullable: true })
  error: string | null;
}

// 페이지네이션 응답
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

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
```

## 접근 제한 (프로덕션 비활성화)

```typescript
// main.ts - 환경별 Swagger 활성화
if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder().setTitle('API').setVersion('1.0').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
}
```

## 체크리스트

- [ ] `main.ts`에 Swagger 설정 완료
- [ ] `nest-cli.json`에 swagger 플러그인 설정 (선택)
- [ ] 모든 Controller에 `@ApiTags()` 적용
- [ ] 모든 엔드포인트에 `@ApiOperation()` + `@ApiResponse()` 적용
- [ ] 인증 필요 엔드포인트에 `@ApiBearerAuth()` 적용
- [ ] DTO 프로퍼티에 example 값 포함
- [ ] 프로덕션 환경에서 Swagger UI 비활성화 확인
- [ ] `http://localhost:3000/api-docs` 에서 문서 확인

## 참고

- `nestjs-validation` 스킬: DTO 유효성 검증과 Swagger 연동
- `nestjs-crud` 스킬: CRUD 엔드포인트 기본 문서화 포함
