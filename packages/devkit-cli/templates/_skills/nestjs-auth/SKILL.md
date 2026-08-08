---
name: nestjs-auth
description: "NestJS 인증/인가 설정.\nAPPLIES: NestJS 프로젝트에서 Guard·JWT·Passport·세션 등 인증/인가 코드를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"인증 설정\", \"JWT\", \"Guard 생성\", \"로그인 구현\", \"토큰 발급\", \"로그인 API\", \"회원가입 API\", \"패스포트\", \"Passport\", NestJS 백엔드에서 인증/인가 구현 시.\nSKIP: Next.js 프론트엔드 인증은 nextjs-auth. 폼 UI는 react-hook-form."
version: 1.0.0
---

> 참조:
> - [references/complete-auth-example.md](references/complete-auth-example.md) - Access/Refresh Token + Role Guard 전체 모듈 예시
> - [references/oauth-google-example.md](references/oauth-google-example.md) - Google OAuth 2.0 Strategy 연동

# NestJS 인증/인가 설정

## 개요

JWT 기반 인증 시스템을 구성한다. Access Token + Refresh Token 패턴, Auth Guard, Passport Strategy, Login/Register DTO를 포함한다.

## 사전 요구사항

```bash
pnpm add @nestjs/passport @nestjs/jwt passport passport-jwt bcrypt
pnpm add -D @types/passport-jwt @types/bcrypt
```

## 파일 구조

```text
src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── jwt-refresh.strategy.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   └── jwt-refresh.guard.ts
├── decorators/
│   ├── current-user.decorator.ts
│   └── public.decorator.ts
└── dto/
    ├── login.dto.ts
    ├── register.dto.ts
    └── token-response.dto.ts
```

## 코드 템플릿

### JWT Strategy

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
```

### Refresh Token Strategy

```typescript
// src/auth/strategies/jwt-refresh.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    const refreshToken = req.get('Authorization')?.replace('Bearer ', '').trim();
    return { id: payload.sub, email: payload.email, refreshToken };
  }
}
```

### Guards

```typescript
// src/auth/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
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

// src/auth/guards/jwt-refresh.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
```

### Decorators

```typescript
// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

### DTOs

```typescript
// src/auth/dto/login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

// src/auth/dto/register.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

// src/auth/dto/token-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}
```

### Auth Service

```typescript
// src/auth/auth.service.ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('이미 등록된 이메일입니다');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.userService.create({
      ...dto,
      password: hashedPassword,
    });

    return this.generateTokens({ sub: user.id, email: user.email });
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    return this.generateTokens({ sub: user.id, email: user.email });
  }

  async refresh(userId: string, refreshToken: string): Promise<TokenResponseDto> {
    const user = await this.userService.findOne(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    const isTokenValid = hashRefreshToken(refreshToken) === user.hashedRefreshToken;
    if (!isTokenValid) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    return this.generateTokens({ sub: user.id, email: user.email });
  }

  private async generateTokens(payload: JwtPayload): Promise<TokenResponseDto> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    // Refresh Token 해시 저장 (bcrypt 금지 — 아래 경고 참조)
    const hashedRefreshToken = hashRefreshToken(refreshToken);
    await this.userService.updateRefreshToken(payload.sub, hashedRefreshToken);

    return { accessToken, refreshToken };
  }
}

// 리프레시 토큰 전용 해시. 비밀번호와 달리 bcrypt를 쓰면 안 된다.
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

> **리프레시 토큰에 bcrypt를 쓰지 마라.** bcrypt는 입력을 **72바이트에서 잘라낸다.** JWT는 200자가 넘고 앞부분은 헤더와 `sub` 클레임이라, 같은 사용자에게 발급된 서로 다른 리프레시 토큰들이 앞 72바이트를 공유하면 **전부 서로 매치된다.** 즉 토큰 회전과 폐기가 무력화되고, 이미 회수한 옛 토큰으로도 갱신이 통과한다.
>
> 리프레시 토큰은 이미 고엔트로피 난수라 느린 해시가 필요 없다. sha256으로 전체 길이를 해싱한다. **비밀번호는 반대로 bcrypt가 맞다** — 짧고 저엔트로피라 느린 해시가 방어의 핵심이다.

### Auth Controller

```typescript
// src/auth/auth.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { Public } from './decorators/public.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '회원가입' })
  @ApiResponse({ status: 201, type: TokenResponseDto })
  register(@Body() dto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(dto);
  }

  @Public() // 전역 JwtAuthGuard 우회 — 액세스 토큰이 만료된 상태로 호출되는 엔드포인트다
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  refresh(@CurrentUser() user: { id: string; refreshToken: string }): Promise<TokenResponseDto> {
    return this.authService.refresh(user.id, user.refreshToken);
  }
}
```

### Auth Module

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### 글로벌 Guard 등록 (main.ts 또는 AppModule)

```typescript
// app.module.ts 에서 글로벌 Guard 등록
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

### 환경변수 (.env)

```env
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
```

## 체크리스트

- [ ] `UserModule`과 `UserService` 존재 확인 (findByEmail, updateRefreshToken 메서드 필요)
- [ ] `.env`에 JWT_ACCESS_SECRET, JWT_REFRESH_SECRET 설정
- [ ] `AppModule`에 `AuthModule` 등록
- [ ] 글로벌 `JwtAuthGuard` 등록 시 `@Public()` 데코레이터로 공개 엔드포인트 표시
- [ ] User Entity에 `hashedRefreshToken` 컬럼 추가
- [ ] 비밀번호 해시 솔트 라운드는 환경에 따라 조절 (기본 10)

## 참고

- `nestjs-config` 스킬: 환경변수 관리 상세
- `nestjs-validation` 스킬: DTO 유효성 검증 심화
