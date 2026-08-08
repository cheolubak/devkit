# 공유 패키지 및 내부 패키지

## 패키지 유형

| 유형 | 빌드 필요 | HMR | 적용 대상 |
|------|----------|-----|----------|
| Internal Package | 아니오 | 즉시 반영 | UI 컴포넌트, 유틸, 타입 |
| Compiled Package | 예 (`tsc`, `tsup`) | 재빌드 필요 | npm 배포 예정, 복잡한 변환 필요 |

**권장:** 대부분의 경우 Internal Package (Just-in-Time) 방식을 사용한다. 빌드 단계가 없어 개발 경험이 좋고 설정이 간단하다.

## @repo/ui — UI 컴포넌트 패키지

### package.json

```json
{
  "name": "@repo/ui",
  "private": true,
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx",
    "./input": "./src/input.tsx",
    "./dialog": "./src/dialog.tsx",
    "./globals.css": "./src/globals.css"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "@repo/typescript-config/library.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

### 컴포넌트 예시

```tsx
// packages/ui/src/button.tsx
import { cn } from './lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
          'border border-input bg-background hover:bg-accent': variant === 'outline',
          'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
        },
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className,
      )}
      {...props}
    />
  );
}
```

### 앱에서 사용

```tsx
// apps/web/app/page.tsx
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';

export default function Page() {
  return (
    <Card>
      <h1>안녕하세요</h1>
      <Button variant="default">시작하기</Button>
    </Card>
  );
}
```

앱의 `next.config.ts`에 반드시 `transpilePackages` 추가:

```typescript
// apps/web/next.config.ts
const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui'],
};
```

## @repo/typescript-config — TSConfig 공유

### package.json

```json
{
  "name": "@repo/typescript-config",
  "private": true,
  "files": ["*.json"]
}
```

### base.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules"]
}
```

### nextjs.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "noEmit": true,
    "module": "ESNext",
    "plugins": [{ "name": "next" }]
  }
}
```

### library.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "react-jsx"
  }
}
```

### 앱에서 사용

```json
// apps/web/tsconfig.json
{
  "extends": "@repo/typescript-config/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## @repo/eslint-config — ESLint 설정 공유

### package.json

```json
{
  "name": "@repo/eslint-config",
  "private": true,
  "files": ["*.js"],
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

### base.js (Flat Config)

```javascript
// packages/eslint-config/base.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  { ignores: ['node_modules/', 'dist/', '.next/'] },
];
```

### next.js

```javascript
// packages/eslint-config/next.js
import baseConfig from './base.js';
import nextPlugin from 'eslint-config-next';

export default [
  ...baseConfig,
  ...nextPlugin,
];
```

### 앱에서 사용

```javascript
// apps/web/eslint.config.js
import config from '@repo/eslint-config/next.js';

export default config;
```

## @repo/utils — 공유 유틸리티

### package.json

```json
{
  "name": "@repo/utils",
  "private": true,
  "exports": {
    "./cn": "./src/cn.ts",
    "./format": "./src/format.ts",
    "./validation": "./src/validation.ts",
    "./types": "./src/types.ts"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

### 유틸 예시

```typescript
// packages/utils/src/format.ts
export function formatPrice(price: number, currency = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
  }).format(price);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}
```

### 타입 공유

```typescript
// packages/utils/src/types.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

앱에서 사용:

```typescript
import { formatPrice } from '@repo/utils/format';
import type { User, PaginatedResponse } from '@repo/utils/types';
```

## @repo/database — 데이터베이스 스키마 공유

여러 앱이 같은 DB를 사용할 때 Prisma 스키마를 공유하는 패턴:

### package.json

```json
{
  "name": "@repo/database",
  "private": true,
  "exports": {
    ".": "./src/client.ts"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

### Prisma 클라이언트

```typescript
// packages/database/src/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Prisma 타입 재 export
export * from '@prisma/client';
```

앱에서 사용:

```typescript
// apps/web/app/actions/user.ts
import { db } from '@repo/database';

export async function getUsers() {
  return db.user.findMany();
}
```

## @repo/tailwind-config — Tailwind 설정 공유

### package.json

```json
{
  "name": "@repo/tailwind-config",
  "private": true,
  "exports": {
    ".": "./tailwind.config.ts"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0"
  }
}
```

### 공유 설정

```typescript
// packages/tailwind-config/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    // 앱에서 content 경로를 추가해야 함
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          900: '#0c4a6e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

앱에서 확장:

```typescript
// apps/web/tailwind.config.ts
import sharedConfig from '@repo/tailwind-config';
import type { Config } from 'tailwindcss';

const config: Config = {
  ...sharedConfig,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',  // 공유 UI 패키지 포함
  ],
};

export default config;
```

## Compiled Package 패턴

npm 배포가 필요하거나 복잡한 빌드 변환이 필요한 경우:

### tsup 사용

```bash
pnpm add -D tsup --filter @repo/my-lib
```

```json
// packages/my-lib/package.json
{
  "name": "@repo/my-lib",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts"
  }
}
```

이 방식은 build task가 필요하므로 `turbo.json`의 `dependsOn: ["^build"]`에 의해 의존 앱보다 먼저 빌드된다.
