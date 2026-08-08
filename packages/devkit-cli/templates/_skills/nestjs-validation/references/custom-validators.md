# 커스텀 Validator 모음

`src/common/validators/`에 배치.

## 1. IsUnique - DB 고유값 검증

```typescript
@Injectable()
@ValidatorConstraint({ async: true })
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private dataSource: DataSource) {}

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const [entityClass, property, exceptField] = args.constraints;
    const repository = this.dataSource.getRepository(entityClass);
    const where: Record<string, any> = { [property]: value };

    if (exceptField) {
      const exceptValue = (args.object as any)[exceptField];
      if (exceptValue) {
        const existing = await repository.findOne({ where });
        return !existing || existing[exceptField] === exceptValue;
      }
    }

    const entity = await repository.findOne({ where });
    return !entity;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} '${args.value}'은(는) 이미 사용 중입니다`;
  }
}

export function IsUnique(entityClass: any, property: string, exceptField?: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [entityClass, property, exceptField],
      validator: IsUniqueConstraint,
    });
  };
}
```

사용:

```typescript
export class CreateUserDto {
  @IsUnique(User, 'email')
  @IsEmail()
  email: string;
}
```

## 2. Match - 필드 일치 검증 (비밀번호 확인)

```typescript
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
          return value === (args.object as any)[relatedPropertyName];
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property}이(가) ${args.constraints[0]}과(와) 일치하지 않습니다`;
        },
      },
    });
  };
}
```

사용:

```typescript
export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  password: string;

  @Match('password', { message: '비밀번호가 일치하지 않습니다' })
  passwordConfirm: string;
}
```

## 3. IsAfterDate - 날짜 순서 검증

```typescript
export function IsAfterDate(property: string, options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'isAfterDate',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const relatedValue = (args.object as any)[args.constraints[0]];
          if (!value || !relatedValue) return true;
          return new Date(value) > new Date(relatedValue);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property}은(는) ${args.constraints[0]} 이후여야 합니다`;
        },
      },
    });
  };
}
```

## 4. IsKoreanPhoneNumber - 한국 전화번호 검증

```typescript
export function IsKoreanPhoneNumber(options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'isKoreanPhoneNumber',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          return /^01[016789]-?\d{3,4}-?\d{4}$/.test(value.replace(/\s/g, ''));
        },
        defaultMessage() {
          return '올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)';
        },
      },
    });
  };
}
```

## 5. IsBusinessRegistrationNumber - 사업자등록번호 검증

```typescript
export function IsBusinessRegistrationNumber(options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'isBusinessRegistrationNumber',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          const digits = value.replace(/-/g, '');
          if (digits.length !== 10) return false;

          const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
          let sum = 0;
          for (let i = 0; i < 9; i++) {
            sum += parseInt(digits[i]) * weights[i];
          }
          sum += Math.floor((parseInt(digits[8]) * 5) / 10);
          const checkDigit = (10 - (sum % 10)) % 10;
          return checkDigit === parseInt(digits[9]);
        },
        defaultMessage() {
          return '올바른 사업자등록번호를 입력해주세요 (예: 123-45-67890)';
        },
      },
    });
  };
}
```

## 6. IsNotBlank - 공백 문자열 거부

```typescript
export function IsNotBlank(options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName}은(는) 공백일 수 없습니다`, ...options },
      validator: {
        validate(value: any) {
          return typeof value === 'string' && value.trim().length > 0;
        },
      },
    });
  };
}
```

## DI 등록

```typescript
// main.ts
import { useContainer } from 'class-validator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
}

// app.module.ts
@Module({
  providers: [IsUniqueConstraint],
})
export class AppModule {}
```
