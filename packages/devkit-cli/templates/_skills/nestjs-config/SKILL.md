---
name: nestjs-config
description: "NestJS 환경설정 관리.\nAPPLIES: NestJS에서 `ConfigModule`·`.env`·환경별 설정·시크릿 주입을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"환경설정\", \"config 설정\", \"환경변수\", \".env 설정\", \"설정 파일\", \"ConfigModule\", \"환경별 설정\", \"시크릿 관리\", NestJS 프로젝트 환경변수/설정 구성 시.\nSKIP: Next.js 환경변수는 nextjs-deployment. DB 연결 설정은 nestjs-database."
version: 1.0.0
---

> 참조:
> - [references/complete-config-setup.md](references/complete-config-setup.md) - Config Namespace + Joi 검증 + 타입 안전 주입 전체 구성

# NestJS 환경설정 관리

## 개요

@nestjs/config를 사용한 환경변수 관리 패턴. Joi 기반 유효성 검증, 타입 안전한 Config, Config Namespace, 환경별 설정 분리를 포함한다.

## 사전 요구사항

```bash
pnpm add @nestjs/config joi
```

## 기본 설정

### ConfigModule 등록

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,           // 모든 모듈에서 주입 가능
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
  ],
})
export class AppModule {}
```

### .env 파일 구조

```text
.env                    # 기본 (git 추적)
.env.local              # 로컬 오버라이드 (gitignore)
.env.development        # 개발 환경
.env.production         # 프로덕션 환경
.env.test               # 테스트 환경
```

```env
# .env
NODE_ENV=development
PORT=3000

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=myapp
DATABASE_USER=postgres
DATABASE_PASSWORD=password

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Joi 기반 환경변수 유효성 검증

```typescript
// src/config/env.validation.ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  // Database
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  // Redis (optional)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
});
```

```typescript
// app.module.ts
import { envValidationSchema } from './config/env.validation';

ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: envValidationSchema,
  validationOptions: {
    abortEarly: true,  // 첫 번째 에러에서 중단
  },
}),
```

## 타입 안전한 Config Namespace

### Config 파일 정의

```typescript
// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  name: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
}));

// src/config/jwt.config.ts
import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));

// src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
}));
```

### Config 등록

```typescript
// app.module.ts
import { databaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';

ConfigModule.forRoot({
  isGlobal: true,
  load: [databaseConfig, jwtConfig, redisConfig],
  validationSchema: envValidationSchema,
}),
```

### Config 타입 정의

```typescript
// src/config/config.types.ts
export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiration: string;
  refreshExpiration: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}
```

### Config 주입 및 사용

```typescript
// 방법 1: ConfigService 직접 사용
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getPort(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  // getOrThrow: 값이 없으면 에러 (권장)
  getDatabaseHost(): string {
    return this.configService.getOrThrow<string>('database.host');
  }
}

// 방법 2: Config Namespace 타입 안전하게 주입
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { databaseConfig } from '../config/database.config';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private dbConfig: ConfigType<typeof databaseConfig>,
  ) {}

  getConnectionString(): string {
    return `postgres://${this.dbConfig.user}:${this.dbConfig.password}@${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.name}`;
  }
}
```

## TypeORM과 Config 연동

```typescript
// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow('database.host'),
        port: configService.getOrThrow('database.port'),
        username: configService.getOrThrow('database.user'),
        password: configService.getOrThrow('database.password'),
        database: configService.getOrThrow('database.name'),
        autoLoadEntities: true,
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
```

## 환경별 설정 예시

```typescript
// src/config/app.config.ts
import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    cors: {
      origin: isProduction
        ? process.env.CORS_ORIGIN?.split(',') ?? []
        : '*',
    },
    logging: {
      level: isProduction ? 'warn' : 'debug',
    },
    swagger: {
      enabled: !isProduction,
    },
  };
});
```

## .gitignore 설정

```gitignore
# Environment files
.env.local
.env.*.local
.env.development
.env.production
.env.test

# 기본 .env는 기본값만 포함하고 추적 가능
# 민감한 값은 .env.local에 오버라이드
```

## 체크리스트

- [ ] `ConfigModule.forRoot({ isGlobal: true })` 설정
- [ ] `.env` 파일 생성 및 `.gitignore`에 민감 파일 등록
- [ ] Joi 유효성 검증 스키마로 필수 환경변수 확인
- [ ] Config Namespace로 관련 설정 그룹화
- [ ] `getOrThrow()` 사용으로 누락된 설정 조기 발견
- [ ] 프로덕션과 개발 환경 설정 분리
- [ ] 민감한 값은 절대 코드에 하드코딩하지 않음

## 참고

- `nestjs-database` 스킬: TypeORM/Prisma와 Config 연동
- `nestjs-auth` 스킬: JWT Secret 환경변수 관리
