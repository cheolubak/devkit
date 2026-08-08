# 완전한 환경설정 구성 예시

Config Namespace + Joi 검증 + 타입 안전 주입.

## Joi 환경변수 검증 스키마

```typescript
// src/config/env.validation.ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_SSL: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  AWS_REGION: Joi.string().optional(),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_S3_BUCKET: Joi.string().optional(),

  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  MAIL_FROM: Joi.string().optional().default('noreply@example.com'),

  CORS_ORIGIN: Joi.string().optional(),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
```

## Config Namespace 파일들

```typescript
// src/config/app.config.ts
export const appConfig = registerAs('app', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api',
    isProduction,
    cors: { origin: isProduction ? (process.env.CORS_ORIGIN?.split(',') ?? []) : '*' },
    swagger: { enabled: !isProduction },
    logging: { level: isProduction ? 'warn' : 'debug' },
  };
});

// src/config/database.config.ts
export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST!,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  name: process.env.DATABASE_NAME!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  ssl: process.env.DATABASE_SSL === 'true',
}));

// src/config/jwt.config.ts
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));

// src/config/redis.config.ts
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
}));
```

## 타입 인터페이스

```typescript
// src/config/config.types.ts
export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiration: string;
  refreshExpiration: string;
}
```

## AppModule 등록

```typescript
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, redisConfig, envValidationSchema } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
      load: [appConfig, databaseConfig, jwtConfig, redisConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
  ],
})
export class AppModule {}
```

## 타입 안전한 Config 주입

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { databaseConfig } from '../config/database.config';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private readonly dbConfig: ConfigType<typeof databaseConfig>,
  ) {}

  getConnectionUrl(): string {
    const { user, password, host, port, name, ssl } = this.dbConfig;
    return `postgres://${user}:${password}@${host}:${port}/${name}${ssl ? '?sslmode=require' : ''}`;
  }
}
```
