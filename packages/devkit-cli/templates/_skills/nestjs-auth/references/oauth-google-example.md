# Google OAuth 2.0 인증 예시

```bash
pnpm add passport-google-oauth20 @types/passport-google-oauth20
```

## Google Strategy

```typescript
// src/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) {
    const { name, emails, photos } = profile;
    const user = {
      email: emails?.[0]?.value,
      name: `${name?.givenName ?? ''} ${name?.familyName ?? ''}`.trim(),
      picture: photos?.[0]?.value,
      googleAccessToken: accessToken,
    };
    done(null, user);
  }
}
```

## Guard

```typescript
// src/auth/guards/google-auth.guard.ts
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
```

## Controller

```typescript
// src/auth/auth.controller.ts
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Google 로그인 페이지로 리다이렉트
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any) {
    const { email, name, picture } = req.user;

    // 기존 사용자 조회 또는 신규 생성
    let user = await this.userService.findByEmail(email);
    if (!user) {
      user = await this.userService.create({
        email, name, profileImage: picture, provider: 'google',
      });
    }

    // JWT 토큰 발급
    const tokens = await this.authService.generateTokens({
      sub: user.id, email: user.email, role: user.role,
    });

    // 프론트엔드 콜백 URL로 토큰 전달
    const frontendUrl = this.configService.get('FRONTEND_URL');
    return {
      url: `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    };
  }
}
```

## 환경변수

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
FRONTEND_URL=http://localhost:3001
```
