---
name: nestjs-error-handling
description: "NestJS 예외 처리.\nAPPLIES: NestJS에서 예외 필터·커스텀 예외·에러 응답 형태를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"에러 처리\", \"exception filter\", \"커스텀 예외\", \"error handling\", \"에러 응답\", \"예외 필터\", \"에러 잡아줘\", \"에러 핸들링\", NestJS에서 에러/예외 처리 구현 시.\nSKIP: DTO 유효성 검증 에러는 nestjs-validation. 프론트엔드 에러 바운더리는 react-best-practices."
version: 1.0.0
---

> 참조:
> - [references/complete-error-handling.md](references/complete-error-handling.md) - AllExceptionsFilter + 비즈니스 예외 + TypeORM 에러 매핑 + 응답 통일 전체 구성

# NestJS 예외 처리

## 개요

NestJS 프로젝트에서 일관된 에러 응답을 위한 패턴. Custom Exception Filter, Business Exception 클래스, 에러 응답 포맷 통일, 로깅 연동을 포함한다.

## 표준 에러 응답 포맷

```typescript
// src/common/interfaces/error-response.interface.ts
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: any;
}
```

## Global Exception Filter

```typescript
// src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponse } from '../interfaces/error-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.getErrorInfo(exception);

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Validation 에러 상세 포함
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && 'details' in (exceptionResponse as any)) {
        errorResponse.details = (exceptionResponse as any).details;
      }
    }

    // 500 에러만 스택 트레이스 로깅
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${statusCode}: ${message}`);
    }

    response.status(statusCode).json(errorResponse);
  }

  private getErrorInfo(exception: unknown): { statusCode: number; message: string; error: string } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = typeof response === 'string'
        ? response
        : (response as any).message || exception.message;

      return {
        statusCode: exception.getStatus(),
        message: Array.isArray(message) ? message.join(', ') : message,
        error: exception.name,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '서버 내부 오류가 발생했습니다',
      error: 'InternalServerError',
    };
  }
}
```

## 비즈니스 예외 클래스

```typescript
// src/common/exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly errorCode?: string,
  ) {
    super({ message, errorCode }, statusCode);
  }
}

// 도메인별 예외 클래스들
// src/common/exceptions/domain-exceptions.ts

export class EntityNotFoundException extends BusinessException {
  constructor(entity: string, id: string | number) {
    super(`${entity} #${id}을(를) 찾을 수 없습니다`, HttpStatus.NOT_FOUND, 'ENTITY_NOT_FOUND');
  }
}

export class DuplicateEntityException extends BusinessException {
  constructor(entity: string, field: string) {
    super(`이미 존재하는 ${entity}입니다 (${field})`, HttpStatus.CONFLICT, 'DUPLICATE_ENTITY');
  }
}

export class UnauthorizedAccessException extends BusinessException {
  constructor(message = '접근 권한이 없습니다') {
    super(message, HttpStatus.FORBIDDEN, 'UNAUTHORIZED_ACCESS');
  }
}

export class InvalidOperationException extends BusinessException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_OPERATION');
  }
}

export class ExternalServiceException extends BusinessException {
  constructor(service: string, message?: string) {
    super(
      `외부 서비스(${service}) 연동 중 오류가 발생했습니다${message ? `: ${message}` : ''}`,
      HttpStatus.BAD_GATEWAY,
      'EXTERNAL_SERVICE_ERROR',
    );
  }
}
```

### 비즈니스 예외 사용 예시

```typescript
// src/user/user.service.ts
import { EntityNotFoundException, DuplicateEntityException } from '../common/exceptions/domain-exceptions';

@Injectable()
export class UserService {
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new DuplicateEntityException('User', 'email');
    }
    return this.userRepository.save(this.userRepository.create(dto));
  }
}
```

## HTTP Exception Filter (HttpException만 처리)

```typescript
// src/common/filters/http-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const error = typeof exceptionResponse === 'string'
      ? { message: exceptionResponse }
      : (exceptionResponse as object);

    this.logger.warn(`${request.method} ${request.url} - ${status}: ${JSON.stringify(error)}`);

    response.status(status).json({
      ...error,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

## 글로벌 등록

### 방법 1: main.ts에서 직접 등록

```typescript
// src/main.ts
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const app = await NestFactory.create(AppModule);
app.useGlobalFilters(new AllExceptionsFilter());
```

### 방법 2: Module에서 DI로 등록 (권장 - 다른 서비스 주입 가능)

```typescript
// src/app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

## TypeORM 에러 처리

```typescript
// src/common/filters/typeorm-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const driverError = exception.driverError as any;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '데이터베이스 오류가 발생했습니다';

    // PostgreSQL 에러 코드
    switch (driverError?.code) {
      case '23505': // unique_violation
        status = HttpStatus.CONFLICT;
        message = '이미 존재하는 데이터입니다';
        break;
      case '23503': // foreign_key_violation
        status = HttpStatus.BAD_REQUEST;
        message = '참조하는 데이터가 존재하지 않습니다';
        break;
      case '23502': // not_null_violation
        status = HttpStatus.BAD_REQUEST;
        message = '필수 값이 누락되었습니다';
        break;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: 'DatabaseError',
      timestamp: new Date().toISOString(),
    });
  }
}
```

## Interceptor를 활용한 성공 응답 통일

```typescript
// src/common/interceptors/response-transform.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

## 체크리스트

- [ ] `AllExceptionsFilter` 글로벌 등록
- [ ] 비즈니스 로직에서 적절한 도메인 예외 사용
- [ ] 500 에러 시 스택 트레이스 로깅 확인
- [ ] 에러 응답 포맷이 클라이언트와 합의한 형태인지 확인
- [ ] 프로덕션에서 내부 에러 메시지 노출되지 않는지 확인
- [ ] TypeORM 사용 시 `TypeOrmExceptionFilter` 등록
- [ ] Validation 에러 상세 정보(`details`) 포함 여부 결정

## 참고

- `nestjs-validation` 스킬: ValidationPipe 에러 포맷 커스터마이즈
- `nestjs-database` 스킬: TypeORM 에러 처리 상세
