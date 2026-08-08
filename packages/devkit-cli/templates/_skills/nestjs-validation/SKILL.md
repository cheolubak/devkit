---
name: nestjs-validation
description: "NestJS DTO 유효성 검증.\nAPPLIES: NestJS에서 DTO·`class-validator`·`ValidationPipe`로 입력을 검증할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"DTO 생성\", \"validation\", \"유효성 검증\", \"class-validator\", \"입력 검증\", \"요청 검증\", \"파이프 설정\", \"ValidationPipe\", NestJS에서 요청 데이터 검증 시.\nSKIP: 프론트엔드 폼 검증은 react-hook-form. Zod 스키마만 사용하면 typescript-patterns."
version: 1.0.0
---

> 참조:
> - [references/dto-patterns.md](references/dto-patterns.md) - 회원가입·검색·중첩 객체 등 실무 DTO 유형별 예시
> - [references/custom-validators.md](references/custom-validators.md) - IsUnique, Match, 한국 전화번호·사업자등록번호 등 커스텀 Validator + DI 등록

# NestJS DTO 유효성 검증

## 개요

class-validator와 class-transformer를 사용한 DTO 유효성 검증 패턴. ValidationPipe 글로벌 설정, 다양한 데코레이터 활용, 커스텀 validator, 중첩 DTO 검증을 포함한다.

## 사전 요구사항

```bash
pnpm add class-validator class-transformer
```

## ValidationPipe 글로벌 설정

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,             // DTO에 정의되지 않은 프로퍼티 자동 제거
    forbidNonWhitelisted: true,  // 정의되지 않은 프로퍼티가 있으면 400 에러
    transform: true,             // 요청 데이터를 DTO 인스턴스로 자동 변환
    transformOptions: {
      enableImplicitConversion: true,  // @Type() 없이도 타입 변환
    },
  }),
);
```

## 기본 데코레이터 패턴

### 문자열 검증

```typescript
import {
  IsString, IsNotEmpty, IsOptional, MinLength, MaxLength,
  IsEmail, IsUrl, Matches, IsUUID, IsEnum,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message: '비밀번호는 대/소문자, 숫자, 특수문자를 포함해야 합니다',
  })
  password: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsEnum(UserRole)
  role: UserRole;
}
```

### 숫자 검증

```typescript
import { IsInt, IsNumber, IsPositive, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  stock: number;

  // Query Parameter에서 숫자 변환 (transform: true 사용 시)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}
```

### 날짜 검증

```typescript
import { IsDate, IsDateString, MinDate, MaxDate } from 'class-validator';
import { Type } from 'class-transformer';

export class EventDto {
  @IsDateString()  // ISO 8601 문자열
  startDate: string;

  @IsDate()
  @Type(() => Date)
  @MinDate(new Date())
  endDate: Date;
}
```

### 배열 검증

```typescript
import { IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsArray()
  @IsString({ each: true })  // 배열 내 각 요소가 string인지
  tags: string[];
}
```

### 조건부 검증

```typescript
import { ValidateIf, IsNotEmpty } from 'class-validator';

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  // method가 'card'일 때만 검증
  @ValidateIf((o) => o.method === PaymentMethod.CARD)
  @IsNotEmpty()
  @IsString()
  cardNumber?: string;

  // method가 'bank'일 때만 검증
  @ValidateIf((o) => o.method === PaymentMethod.BANK)
  @IsNotEmpty()
  @IsString()
  accountNumber?: string;
}
```

## 중첩 DTO 검증

```typescript
// src/common/dto/address.dto.ts
export class AddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  zipCode: string;
}

// src/user/dto/create-user.dto.ts
export class CreateUserDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  additionalAddresses?: AddressDto[];
}
```

## 커스텀 Validator

### 데코레이터 방식

```typescript
// src/common/validators/is-unique.validator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private dataSource: DataSource) {}

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const [entityClass, property] = args.constraints;
    const repository = this.dataSource.getRepository(entityClass);
    const entity = await repository.findOne({ where: { [property]: value } });
    return !entity;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} '${args.value}' 은(는) 이미 사용 중입니다`;
  }
}

export function IsUnique(entityClass: any, property: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [entityClass, property],
      validator: IsUniqueConstraint,
    });
  };
}

// 사용
export class RegisterDto {
  @IsUnique(User, 'email', { message: '이미 등록된 이메일입니다' })
  @IsEmail()
  email: string;
}
```

### 커스텀 Validator를 DI에 등록

```typescript
// app.module.ts
import { useContainer } from 'class-validator';

// bootstrap 내부
const app = await NestFactory.create(AppModule);
useContainer(app.select(AppModule), { fallbackOnErrors: true });
```

### 비밀번호 확인 (Match 데코레이터)

```typescript
// src/common/validators/match.validator.ts
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function Match(property: string, options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property}이(가) ${args.constraints[0]}과(와) 일치하지 않습니다`;
        },
      },
    });
  };
}

// 사용
export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  password: string;

  @Match('password', { message: '비밀번호가 일치하지 않습니다' })
  passwordConfirm: string;
}
```

## 변환 (Transform)

```typescript
import { Transform } from 'class-transformer';

export class SearchDto {
  // 공백 제거 + 소문자 변환
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsString()
  keyword: string;

  // 쉼표 구분 문자열 → 배열
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  // 불리언 변환 (Query Parameter)
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive: boolean;
}
```

## 에러 응답 커스터마이즈

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => {
      const messages = errors.map((error) => ({
        field: error.property,
        errors: Object.values(error.constraints ?? {}),
      }));
      return new BadRequestException({ message: '유효성 검증 실패', details: messages });
    },
  }),
);
```

## 체크리스트

- [ ] `main.ts`에 `ValidationPipe` 글로벌 설정
- [ ] DTO의 모든 프로퍼티에 적절한 검증 데코레이터 적용
- [ ] Optional 필드에 `@IsOptional()` 명시
- [ ] 중첩 객체에 `@ValidateNested()` + `@Type(() => ...)` 적용
- [ ] Query Parameter 숫자 필드에 `@Type(() => Number)` 적용
- [ ] 커스텀 Validator 사용 시 `useContainer()` 설정
- [ ] 한국어 에러 메시지 커스터마이즈

## 참고

- `nestjs-swagger` 스킬: Swagger 데코레이터와의 연동
- `nestjs-crud` 스킬: CRUD DTO 기본 패턴
