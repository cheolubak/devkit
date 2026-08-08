---
name: nextjs-auth
description: "Next.js 인증/인가 패턴. Auth.js v5, 미들웨어 보호, 세션 관리, OAuth/Credentials 프로바이더, RBAC 패턴.\nAPPLIES: Next.js에서 로그인·세션·미들웨어 보호·권한 분기를 구현할 때 (Auth.js 기준). 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"로그인 만들어줘\", \"회원가입\", \"인증 구현\", \"소셜 로그인\", \"구글 로그인\", \"세션 관리\", \"로그인 페이지\", \"권한 체크\", \"미들웨어 보호\", Next.js 프로젝트에서 인증/인가 구현 시.\nSKIP: NestJS 백엔드 인증은 nestjs-auth. Supabase Auth(쿠키 기반 @supabase/ssr 세션·getUser)는 supabase-patterns. 폼 UI는 react-hook-form."
---

# Next.js 인증 가이드 (Auth.js v5)

## 설치

```bash
pnpm add next-auth@beta @auth/core
```

## 핵심 설정

### auth.ts - 루트 설정 파일

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Kakao from "next-auth/providers/kakao";
import { z } from "zod";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    GitHub,
    Kakao,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await getUserByEmail(parsed.data.email);
        if (!user) return null;

        const isValid = await verifyPassword(parsed.data.password, user.hashedPassword);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = nextUrl.pathname.startsWith("/dashboard");
      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL("/login", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
```

### app/api/auth/[...nextauth]/route.ts

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### proxy.ts - 라우트 보호

Next.js 16에서 `middleware.ts`가 **`proxy.ts`로 개명**되었다(named export도 `middleware` → `proxy`). 15 이하를 쓴다면 아래 이름만 `middleware`로 바꿔 그대로 적용하면 된다. 공식 codemod는 `npx @next/codemod middleware-to-proxy`.

```typescript
// proxy.ts (Next.js 15 이하에서는 middleware.ts)
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/protected/:path*",
  ],
};
```

## 타입 확장

### types/next-auth.d.ts

```typescript
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}
```

## 세션 사용 패턴

### Server Component에서 세션 접근

```tsx
import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <h1>Welcome, {session.user.name}</h1>;
}
```

### Client Component에서 세션 접근

```tsx
// app/providers.tsx
"use client";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

// app/layout.tsx
import { Providers } from "./providers";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body><Providers>{children}</Providers></body></html>;
}

// components/user-menu.tsx
"use client";
import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const { data: session, status } = useSession();
  if (status === "loading") return <Skeleton />;
  if (!session) return <LoginButton />;

  return (
    <DropdownMenu>
      <span>{session.user.name}</span>
      <button onClick={() => signOut()}>Sign Out</button>
    </DropdownMenu>
  );
}
```

### Server Action에서 인증 확인

```typescript
"use server";
import { auth } from "@/auth";

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  // 변이 로직
}
```

## RBAC (역할 기반 접근 제어)

### 역할 체크 유틸리티

```typescript
// lib/auth-utils.ts
import { auth } from "@/auth";
import { redirect } from "next/navigation";

type Role = "user" | "admin" | "editor";

export async function requireAuth() {
  const session = await auth();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(role: Role) {
  const session = await requireAuth();
  if (session.user.role !== role) redirect("/unauthorized");
  return session;
}
```

### 페이지에서 RBAC 사용

```tsx
export default async function AdminPage() {
  const session = await requireRole("admin");
  return <AdminDashboard user={session.user} />;
}
```

### 미들웨어 기반 RBAC

```typescript
// proxy.ts (Next.js 15 이하에서는 middleware.ts)
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const roleRoutes: Record<string, string[]> = {
  "/admin": ["admin"],
  "/editor": ["admin", "editor"],
  "/dashboard": ["admin", "editor", "user"],
};

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const userRole = req.auth?.user?.role;

  for (const [path, roles] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(path) && (!userRole || !roles.includes(userRole))) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }
});
```

## 로그인/로그아웃 Server Actions

```typescript
// app/actions/auth.ts
"use server";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";

// useActionState에 연결하므로 이전 상태가 첫 인자, formData가 두 번째다.
export async function loginWithCredentials(_prevState: unknown, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid credentials" };
    }
    throw error; // NextRedirect 등은 다시 throw
  }
}

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
```

## 로그인 폼 컴포넌트

```tsx
"use client";
import { useActionState } from "react";
import { loginWithCredentials, loginWithGoogle } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, isPending] = useActionState(loginWithCredentials, null);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        {state?.error && <p className="text-destructive text-sm">{state.error}</p>}
        <button type="submit" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="relative">
        <span className="text-muted-foreground text-sm">or continue with</span>
      </div>

      <form action={loginWithGoogle}>
        <button type="submit">Sign in with Google</button>
      </form>
    </div>
  );
}
```

## 자주 하는 실수

1. **`auth()` 대신 `getSession()` 사용** - v5에서는 `auth()` 사용
2. **Credentials에서 에러를 throw** - `null` 반환으로 인증 실패 처리
3. **미들웨어에서 DB 접근** - Edge Runtime에서 DB 직접 접근 불가, JWT 콜백 활용
4. **`signIn` redirect 에러 무시** - `NextRedirect`는 정상 동작이므로 catch 후 re-throw
5. **세션에 민감 정보 저장** - password, token 등은 세션에 절대 포함 금지
6. **`SessionProvider` 누락** - Client Component에서 `useSession` 사용 시 필수
