# 완전한 에러 처리 시스템 예시

AllExceptionsFilter + Business Exceptions + TypeORM 에러 + 응답 통일.

## 에러 응답 인터페이스

```typescript
// src/common/interfaces/error-response.interface.ts
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  errorCode?: string;
  timestamp: string;
  path: string;
  details?: any;
}
```

## Business Exception 클래스

```typescript
// src/common/exceptions/business.exception.ts
export class BusinessException extends HttpException {
  public readonly errorCode: string;

  constructor(message: string, statusCode: HttpStatus = HttpStatus.BAD_REQUEST, errorCode = 'BUSINESS_ERROR') {
    super({ message, errorCode, statusCode }, statusCode);
    this.errorCode = errorCode;
  }
}
```

## 도메인별 예외 클래스

```typescript
// src/common/exceptions/domain-exceptions.ts

export class EntityNotFoundException extends BusinessException {
  constructor(entity: string, identifier: string | number) {
    super(`${entity} #${identifier}을(를) 찾을 수 없습니다`, HttpStatus.NOT_FOUND, 'ENTITY_NOT_FOUND');
  }
}

export class DuplicateEntityException extends BusinessException {
  constructor(entity: string, field: string, value?: string) {
    const detail = value ? ` (${field}: ${value})` : ` (${field})`;
    super(`이미 존재하는 ${entity}입니다${detail}`, HttpStatus.CONFLICT, 'DUPLICATE_ENTITY');
  }
}

export class ForbiddenResourceException extends BusinessException {
  constructor(resource?: string) {
    super(resource ? `${resource}에 대한 접근 권한이 없습니다` : '접근 권한이 없습니다', HttpStatus.FORBIDDEN, 'FORBIDDEN_RESOURCE');
  }
}

export class InvalidOperationException extends BusinessException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_OPERATION');
  }
}

export class InvalidStateTransitionException extends BusinessException {
  constructor(entity: string, currentState: string, targetState: string) {
    super(`${entity}의 상태를 '${currentState}'에서 '${targetState}'(으)로 변경할 수 없습니다`, HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_STATE_TRANSITION');
  }
}

export class ExternalServiceException extends BusinessException {
  constructor(serviceName: string, detail?: string) {
    super(`외부 서비스(${serviceName}) 연동 중 오류가 발생했습니다${detail ? `: ${detail}` : ''}`, HttpStatus.BAD_GATEWAY, 'EXTERNAL_SERVICE_ERROR');
  }
}
```

## AllExceptionsFilter

```typescript
// src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const errorInfo = this.extractErrorInfo(exception);

    const errorResponse: ErrorResponse = {
      statusCode: errorInfo.statusCode,
      error: errorInfo.error,
      message: errorInfo.message,
      errorCode: errorInfo.errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      details: errorInfo.details,
    };

    // 500 에러만 스택 트레이스 로깅
    if (errorInfo.statusCode >= 500) {
      this.logger.error(`${request.method} ${request.url} - ${errorInfo.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception));
    } else if (errorInfo.statusCode >= 400) {
      this.logger.warn(`${request.method} ${request.url} - ${errorInfo.statusCode}: ${errorInfo.message}`);
    }

    response.status(errorInfo.statusCode).json(errorResponse);
  }

  private extractErrorInfo(exception: unknown) {
    if (exception instanceof BusinessException) {
      return {
        statusCode: exception.getStatus(),
        error: exception.constructor.name,
        message: (exception.getResponse() as any).message,
        errorCode: exception.errorCode,
        details: undefined,
      };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        statusCode: exception.getStatus(),
        error: exception.name,
        message: typeof response === 'object' ? (response as any).message || exception.message : response,
        errorCode: undefined,
        details: typeof response === 'object' ? (response as any).details : undefined,
      };
    }
    // TypeORM QueryFailedError
    if ((exception as any)?.constructor?.name === 'QueryFailedError') {
      const code = (exception as any).driverError?.code;
      if (code === '23505') return { statusCode: 409, error: 'DuplicateEntry', message: '이미 존재하는 데이터입니다', errorCode: 'DUPLICATE_ENTRY', details: undefined };
      if (code === '23503') return { statusCode: 400, error: 'ForeignKeyViolation', message: '참조하는 데이터가 존재하지 않습니다', errorCode: 'FK_VIOLATION', details: undefined };
    }
    return { statusCode: 500, error: 'InternalServerError', message: '서버 내부 오류가 발생했습니다', errorCode: 'INTERNAL_ERROR', details: undefined };
  }
}
```

## 성공 응답 통일 Interceptor

```typescript
// src/common/interceptors/response-transform.interceptor.ts
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => ({ success: true as const, data, timestamp: new Date().toISOString() })),
    );
  }
}
```

## 글로벌 등록

```typescript
// app.module.ts
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
```

## 응답 예시

성공:
```json
{ "success": true, "data": { "id": "uuid-1", "name": "상품" }, "timestamp": "2024-01-01T00:00:00.000Z" }
```

비즈니스 에러 (422):
```json
{ "statusCode": 422, "error": "InvalidOperationException", "message": "재고가 부족합니다", "errorCode": "INVALID_OPERATION", "timestamp": "...", "path": "/api/orders" }
```
