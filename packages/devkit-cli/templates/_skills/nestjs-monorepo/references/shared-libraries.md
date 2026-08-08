# 공유 라이브러리 상세

## 라이브러리 패키지 구조

NestJS 모노레포에서 공유 라이브러리는 Compiled Package 방식(`tsc`로 빌드 후 `dist/` 참조)을 사용한다. NestJS는 데코레이터 메타데이터(`emitDecoratorMetadata`)가 필요하므로 소스 직접 참조(Internal Package)보다 빌드 후 참조가 안정적이다.

```json
// 공통 패키지 구조
{
  "name": "@repo/패키지명",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  }
}
```

## @repo/common — 공용 모듈

여러 앱에서 재사용하는 DTO, 데코레이터, 파이프, 인터셉터, 필터를 모아둔다.

### package.json

```json
{
  "name": "@repo/common",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint \"src/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "@repo/typescript-config/library.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### 디렉토리 구조

```
packages/common/
├── src/
│   ├── dto/
│   │   ├── pagination-query.dto.ts
│   │   └── api-response.dto.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── pipes/
│   │   └── parse-uuid.pipe.ts
│   ├── interceptors/
│   │   └── transform.interceptor.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   └── roles.guard.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 페이지네이션 DTO

```typescript
// packages/common/src/dto/pagination-query.dto.ts
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

### API 응답 DTO

```typescript
// packages/common/src/dto/api-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional()
  message?: string;

  static ok<T>(data: T, message?: string): ApiResponseDto<T> {
    const response = new ApiResponseDto<T>();
    response.success = true;
    response.data = data;
    response.message = message;
    return response;
  }

  static error(message: string): ApiResponseDto<null> {
    const response = new ApiResponseDto<null>();
    response.success = false;
    response.message = message;
    return response;
  }
}
```

### CurrentUser 데코레이터

```typescript
// packages/common/src/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

### Transform 인터셉터

```typescript
// packages/common/src/interceptors/transform.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponseDto } from '../dto/api-response.dto';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto<T>> {
    return next.handle().pipe(
      map((data) => ApiResponseDto.ok(data)),
    );
  }
}
```

### HttpException 필터

```typescript
// packages/common/src/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : '서버 내부 오류가 발생했습니다';

    if (status >= 500) {
      this.logger.error(exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### index.ts

```typescript
// packages/common/src/index.ts
// DTO
export * from './dto/pagination-query.dto';
export * from './dto/api-response.dto';

// Decorators
export * from './decorators/current-user.decorator';

// Pipes
export * from './pipes/parse-uuid.pipe';

// Interceptors
export * from './interceptors/transform.interceptor';

// Filters
export * from './filters/http-exception.filter';

// Guards
export * from './guards/roles.guard';
```

## @repo/database — DB 모듈

### TypeORM 방식

```json
// packages/database/package.json
{
  "name": "@repo/database",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "typeorm": "^0.3.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

### DatabaseModule

```typescript
// packages/database/src/database.module.ts
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
        host: configService.getOrThrow('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),
        username: configService.getOrThrow('DATABASE_USER'),
        password: configService.getOrThrow('DATABASE_PASSWORD'),
        database: configService.getOrThrow('DATABASE_NAME'),
        autoLoadEntities: true,
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
```

### 공유 엔티티

```typescript
// packages/database/src/entities/user.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: ['admin', 'user'], default: 'user' })
  role: 'admin' | 'user';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 엔티티 앱에서 사용

```typescript
// apps/api/src/users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@repo/database';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### index.ts

```typescript
// packages/database/src/index.ts
export * from './database.module';
export * from './entities/user.entity';
export * from './entities/product.entity';
```

### Prisma 방식

Prisma를 사용하는 경우 스키마와 클라이언트를 공유:

```json
// packages/database/package.json (Prisma)
{
  "name": "@repo/database",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "@nestjs/common": "^11.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

```typescript
// packages/database/src/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// packages/database/src/index.ts (Prisma)
export * from './prisma.service';
export * from '@prisma/client';
```

## @repo/auth — 인증 모듈

여러 앱에서 동일한 인증 로직을 공유:

### package.json

```json
{
  "name": "@repo/auth",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/passport-jwt": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

### JWT 전략

```typescript
// packages/auth/src/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### Auth Guard

```typescript
// packages/auth/src/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

### Public 데코레이터

```typescript
// packages/auth/src/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### AuthModule

```typescript
// packages/auth/src/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRATION', '15m'),
        },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
```

### 앱에서 사용

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@repo/database';
import { AuthModule, JwtAuthGuard } from '@repo/auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

### index.ts

```typescript
// packages/auth/src/index.ts
export * from './auth.module';
export * from './guards/jwt-auth.guard';
export * from './strategies/jwt.strategy';
export * from './decorators/public.decorator';
```

## @repo/config — 공유 Config

여러 앱이 공통 설정 네임스페이스를 사용하는 경우:

```typescript
// packages/config/src/database.config.ts
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  name: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
}));
```

```typescript
// packages/config/src/index.ts
export * from './database.config';
export * from './jwt.config';
export * from './redis.config';
export * from './env.validation';
```

앱에서:

```typescript
import { ConfigModule } from '@nestjs/config';
import { databaseConfig, jwtConfig, envValidationSchema } from '@repo/config';

ConfigModule.forRoot({
  isGlobal: true,
  load: [databaseConfig, jwtConfig],
  validationSchema: envValidationSchema,
}),
```
