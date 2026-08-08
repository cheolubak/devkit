# 다양한 DTO 패턴 참조

실무에서 자주 사용하는 DTO 유형별 예시.

## 1. 회원가입 DTO (복합 검증)

```typescript
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: '비밀번호는 대/소문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다',
  })
  password: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해주세요' })
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  @IsOptional()
  @Matches(/^01[016789]-?\d{3,4}-?\d{4}$/, { message: '올바른 휴대폰 번호를 입력해주세요' })
  phone?: string;
}
```

## 2. 검색/필터 Query DTO

```typescript
export class ProductSearchDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  // 범위 필터
  @ApiPropertyOptional({ description: '최소 가격' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  // 날짜 범위
  @ApiPropertyOptional({ description: '시작일 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  // 카테고리 다중 선택 (쉼표 구분 → 배열 변환)
  @ApiPropertyOptional({ type: [String], description: '카테고리 ID 목록' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  // 불리언 필터 (Query Parameter 변환)
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean;
}
```

## 3. 중첩 DTO (주문 생성)

```typescript
export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: '올바른 우편번호를 입력해주세요' })
  zipCode: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsString()
  addressDetail?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: '최소 1개 이상의 상품을 주문해야 합니다' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}
```

## 4. 조건부 검증 DTO (결제)

```typescript
export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  VIRTUAL_ACCOUNT = 'virtual_account',
}

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;

  // 카드 결제 시에만
  @ValidateIf((o) => o.method === PaymentMethod.CARD)
  @IsNotEmpty({ message: '카드 번호를 입력해주세요' })
  cardNumber?: string;

  @ValidateIf((o) => o.method === PaymentMethod.CARD)
  @Matches(/^\d{2}\/\d{2}$/, { message: '유효기간 형식: MM/YY' })
  cardExpiry?: string;

  // 계좌이체 시에만
  @ValidateIf((o) => o.method === PaymentMethod.BANK_TRANSFER)
  @IsNotEmpty({ message: '은행 코드를 입력해주세요' })
  bankCode?: string;
}
```

## 5. DTO 조합 패턴

```typescript
// 모든 필드 Optional (업데이트)
export class UpdateUserDto extends PartialType(CreateUserDto) {}

// 특정 필드만 선택
export class LoginDto extends PickType(CreateUserDto, ['email', 'password'] as const) {}

// 특정 필드 제외
export class UserProfileDto extends OmitType(CreateUserDto, ['password'] as const) {}

// 두 DTO 합치기
export class CreateAdminUserDto extends IntersectionType(CreateUserDto, AdminRoleDto) {}
```

## 6. 응답 변환 (Exclude/Expose)

```typescript
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  name: string;

  @Exclude()
  password: string;

  @Exclude()
  hashedRefreshToken: string;

  @Expose()
  createdAt: Date;
}

// Controller에서 사용:
// return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
```
