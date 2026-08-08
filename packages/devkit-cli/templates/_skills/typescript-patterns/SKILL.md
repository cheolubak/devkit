---
name: typescript-patterns
description: "React/Next.js TypeScript 고급 패턴. 제네릭 컴포넌트, discriminated union, Zod 타입 추론, satisfies, 유틸리티 타입, 타입 안전 API.\nAPPLIES: 타입 에러를 풀거나 제네릭·유니온·Zod 추론·유틸리티 타입으로 타입을 설계할 때, `any`/`as`를 없애야 할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"타입 에러\", \"타입 안전하게\", \"제네릭\", \"타입 추론\", \"Zod 스키마\", \"타입 정의\", \"유틸리티 타입\", \"as 쓰지 말고\", \"타입 좁히기\", TypeScript 타입 설계/에러 해결 시.\nSKIP: NestJS DTO 검증은 nestjs-validation. 런타임 폼 검증은 react-hook-form."
---

# TypeScript 고급 패턴 (React/Next.js)

## 제네릭 컴포넌트

### 데이터 테이블

```tsx
interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={String(col.key)}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.id} onClick={() => onRowClick?.(row)}>
            {columns.map((col) => (
              <td key={String(col.key)}>
                {col.render ? col.render(row[col.key], row) : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 사용 - 타입 자동 추론
<DataTable
  data={users}
  columns={[
    { key: "name", header: "이름" },
    { key: "email", header: "이메일" },
    { key: "role", header: "역할", render: (v) => <Badge>{v}</Badge> },
  ]}
/>
```

### 제네릭 Select 컴포넌트

```tsx
interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

export function Select<T extends string>({ value, onChange, options }: SelectProps<T>) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// 사용 - "admin" | "user" 타입만 허용
<Select<"admin" | "user">
  value={role}
  onChange={setRole}
  options={[
    { value: "admin", label: "관리자" },
    { value: "user", label: "사용자" },
  ]}
/>
```

## Discriminated Union Props

### 다형성 컴포넌트

```tsx
type ButtonProps =
  | { variant: "link"; href: string; external?: boolean }
  | { variant: "button"; onClick: () => void; disabled?: boolean }
  | { variant: "submit"; form?: string };

export function ActionButton(props: ButtonProps & { children: React.ReactNode }) {
  switch (props.variant) {
    case "link":
      return (
        <a
          href={props.href}
          target={props.external ? "_blank" : undefined}
          rel={props.external ? "noopener noreferrer" : undefined}
        >
          {props.children}
        </a>
      );
    case "button":
      return (
        <button onClick={props.onClick} disabled={props.disabled}>
          {props.children}
        </button>
      );
    case "submit":
      return (
        <button type="submit" form={props.form}>
          {props.children}
        </button>
      );
  }
}

// 사용 - variant에 따라 필요한 props만 요구
<ActionButton variant="link" href="/about">About</ActionButton>
<ActionButton variant="button" onClick={handleClick}>Click</ActionButton>
```

### 상태 머신 패턴

```tsx
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function renderState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case "idle": return null;
    case "loading": return <Spinner />;
    case "success": return <div>{JSON.stringify(state.data)}</div>; // data 접근 가능
    case "error": return <ErrorMessage error={state.error} />; // error 접근 가능
  }
}
```

## satisfies 연산자

```typescript
// 타입 검증 + 리터럴 타입 보존
const routes = {
  home: "/",
  about: "/about",
  dashboard: "/dashboard",
  settings: "/dashboard/settings",
} satisfies Record<string, string>;

// routes.home의 타입은 string이 아닌 "/"
type HomeRoute = typeof routes.home; // "/"

// 테마 설정
const theme = {
  colors: {
    primary: "#3b82f6",
    secondary: "#64748b",
    danger: "#ef4444",
  },
  spacing: {
    sm: "0.5rem",
    md: "1rem",
    lg: "2rem",
  },
} satisfies Record<string, Record<string, string>>;

// theme.colors.primary는 "#3b82f6" 리터럴 타입
```

## Zod 기반 타입 추론

```typescript
import { z } from "zod";

// 스키마 먼저 정의 → 타입 자동 추론
const userSchema = z.object({
  id: z.uuid(),
  name: z.string().min(2),
  email: z.email(),
  role: z.enum(["admin", "user", "editor"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.coerce.date(),
});

// 타입 추론
type User = z.infer<typeof userSchema>;

// 부분 타입 (업데이트용)
const updateUserSchema = userSchema.pick({ name: true, email: true }).partial();
type UpdateUserInput = z.infer<typeof updateUserSchema>;

// API 응답 스키마
const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    error: z.string().optional(),
  });

const usersResponseSchema = apiResponseSchema(z.array(userSchema));
type UsersResponse = z.infer<typeof usersResponseSchema>;

// 런타임 검증 + 타입 안전
async function fetchUsers(): Promise<User[]> {
  const res = await fetch("/api/users");
  const json = await res.json();
  const parsed = usersResponseSchema.parse(json);
  return parsed.data; // 타입 안전하게 보장
}
```

## 유틸리티 타입 패턴

### ComponentProps 활용

```tsx
import type { ComponentProps } from "react";

// 기존 컴포넌트의 props 확장
type InputProps = ComponentProps<"input"> & {
  label: string;
  error?: string;
};

export function FormInput({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      <label>{label}</label>
      <input className={cn("border rounded px-3 py-2", className)} {...props} />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

// 다른 컴포넌트의 props 추출
type ButtonProps = ComponentProps<typeof Button>;
```

### 조건부 타입

```typescript
// API 응답 타입
type ApiResponse<T> = T extends undefined
  ? { success: boolean; message: string }
  : { success: boolean; data: T };

// Nullable 필드 처리
type NonNullableFields<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};

// 특정 키만 Required
type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

type UserWithEmail = RequireFields<Partial<User>, "email">;
// { name?: string; email: string; role?: string; ... }
```

### Template Literal Types

```typescript
// API 엔드포인트 타입
type ApiVersion = "v1" | "v2";
type Resource = "users" | "posts" | "comments";
type ApiEndpoint = `/api/${ApiVersion}/${Resource}`;
// "/api/v1/users" | "/api/v1/posts" | ... (6개 조합)

// 이벤트 핸들러 타입
type EventName = "click" | "hover" | "focus";
type HandlerName = `on${Capitalize<EventName>}`;
// "onClick" | "onHover" | "onFocus"
```

## 타입 안전 API 라우트

```typescript
// types/api.ts
interface ApiRoutes {
  "/api/users": {
    GET: { response: User[] };
    POST: { body: CreateUserInput; response: User };
  };
  "/api/users/:id": {
    GET: { response: User };
    PATCH: { body: UpdateUserInput; response: User };
    DELETE: { response: void };
  };
}

// 타입 안전 fetch 래퍼
async function api<
  Path extends keyof ApiRoutes,
  Method extends keyof ApiRoutes[Path],
>(
  path: Path,
  method: Method,
  ...[body]: ApiRoutes[Path][Method] extends { body: infer B } ? [B] : []
): Promise<
  ApiRoutes[Path][Method] extends { response: infer R } ? R : never
> {
  const res = await fetch(path, {
    method: method as string,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// 사용 - 완전한 타입 추론
const users = await api("/api/users", "GET"); // User[]
const newUser = await api("/api/users", "POST", { name: "Kim", email: "kim@example.com" }); // User
```

## 타입 가드

```typescript
// 커스텀 타입 가드
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "email" in value
  );
}

// Discriminated union 타입 가드
function isSuccess<T>(result: ApiResponse<T>): result is { success: true; data: T } {
  return result.success === true;
}

// 사용
const result = await fetchData();
if (isSuccess(result)) {
  console.log(result.data); // 타입 좁히기 완료
}
```

## as const & const 타입 파라미터

```typescript
// as const로 리터럴 타입 보존
const ROLES = ["admin", "user", "editor"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "user" | "editor"

// const 타입 파라미터 (TS 5.0+)
function createConfig<const T extends Record<string, unknown>>(config: T): T {
  return config;
}

const config = createConfig({
  api: "https://api.example.com",
  timeout: 5000,
});
// config.api는 "https://api.example.com" 리터럴 타입
```

## Module Augmentation (타입 확장)

```typescript
// next-auth 타입 확장
declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
}

// 환경변수 타입
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    NEXTAUTH_SECRET: string;
    NEXT_PUBLIC_API_URL: string;
  }
}
```

## 자주 하는 실수

1. **`any` 사용** - `unknown` + 타입 가드 또는 Zod 검증 사용
2. **타입과 스키마 따로 정의** - Zod 스키마에서 `z.infer<>` 사용
3. **`as` 타입 단언 남용** - `satisfies` 또는 타입 가드로 안전하게 처리
4. **유니온 타입에서 공통 속성만 접근** - discriminated union + switch 사용
5. **제네릭 기본값 미설정** - `<T = DefaultType>` 패턴 활용
6. **ComponentProps 대신 수동 타입 정의** - HTML 요소 props는 ComponentProps 활용
