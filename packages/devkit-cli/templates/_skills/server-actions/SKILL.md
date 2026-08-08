---
name: server-actions
description: "Next.js Server Actions 패턴. 변이 전용, Zod 유효성 검사, 에러 처리, updateTag/refresh 사용법.\nAPPLIES: Next.js에서 `'use server'` 함수로 데이터를 변경하거나 폼 제출을 서버에서 처리할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"서버 액션\", \"server action\", \"use server\", \"폼 제출 처리\", \"데이터 수정\", \"mutation 처리\", \"서버에서 처리\", Next.js에서 데이터 변이/폼 서버 처리 구현 시.\nSKIP: 폼 UI/클라이언트 검증은 react-hook-form. NestJS API 엔드포인트는 nestjs-crud."
---

> 참조:
> - [references/api-reference.md](references/api-reference.md) - 전체 API (updateTag, revalidateTag, refresh, redirect, React Hooks, 직렬화 규칙)
> - [references/patterns.md](references/patterns.md) - 9개 패턴 (CRUD, 낙관적 업데이트, 파일 업로드, 배치 작업 등)
> - [references/validation.md](references/validation.md) - Zod 스키마 레퍼런스, FormData 파싱, 에러 처리 패턴

# Next.js Server Actions 가이드

## 핵심 규칙

Server Actions는 **변이(mutation) 전용**. 데이터 읽기에 절대 사용하지 않음.

```tsx
// ❌ 심각 - 데이터 페칭에 Server Action 사용
"use server";
export async function getUsers() {
  return await db.users.findMany();
}

// ✅ 올바름 - Server Component에서 직접 페칭
export default async function UsersPage() {
  const users = await db.users.findMany();
  return <UserList users={users} />;
}
```

## 파일 구조

```text
app/
├── actions/          # 전역 Server Actions
│   ├── auth.ts       # 인증 관련 actions
│   ├── posts.ts      # 게시글 관련 actions
│   └── users.ts      # 사용자 관련 actions
├── (dashboard)/
│   └── actions/      # 라우트 전용 actions
│       └── settings.ts
```

## Zod 유효성 검사 (필수)

```tsx
"use server";

import { z } from "zod";
import { updateTag } from "next/cache";

const createPostSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요").max(100, "제목은 100자 이내"),
  content: z.string().min(1, "내용을 입력해주세요"),
  categoryId: z.uuid("올바른 카테고리를 선택해주세요"),
});

// useActionState에 연결할 액션은 이전 상태를 첫 인자로 받는다. formData는 두 번째다.
// <form action={직접연결}>로만 쓸 액션이라면 (formData: FormData) 하나만 받으면 된다.
export async function createPost(_prevState: unknown, formData: FormData) {
  const result = createPostSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    categoryId: formData.get("categoryId"),
  });

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const post = await db.posts.create({ data: result.data });
  updateTag("posts");
  return { data: post };
}
```

## 반환 타입 패턴

```tsx
"use server";

type ActionResult<T = void> =
  | { data: T; error?: never }
  | { data?: never; error: string | Record<string, string[]> };

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const result = profileSchema.safeParse({
    name: formData.get("name"),
    bio: formData.get("bio"),
  });

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  try {
    await db.profiles.update({ data: result.data });
    updateTag("profile");
    return { data: undefined };
  } catch {
    return { error: "프로필 업데이트에 실패했습니다" };
  }
}
```

## useActionState 활용

```tsx
"use client";

import { useActionState } from "react";
import { createPost } from "@/app/actions/posts";

export function CreatePostForm() {
  const [state, action, isPending] = useActionState(createPost, null);

  return (
    <form action={action}>
      <input name="title" />
      {state?.error?.title && <p className="text-destructive">{state.error.title}</p>}

      <textarea name="content" />
      {state?.error?.content && <p className="text-destructive">{state.error.content}</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? "작성 중..." : "작성"}
      </button>
    </form>
  );
}
```

## 무효화 패턴

### updateTag - 즉시 무효화

```tsx
"use server";

import { updateTag } from "next/cache";

export async function deletePost(id: string) {
  await db.posts.delete({ where: { id } });
  updateTag(`post-${id}`);
  updateTag("posts"); // 목록도 무효화
}
```

### refresh - 라우터 새로고침

```tsx
"use server";

import { refresh } from "next/cache";

export async function updateTheme(theme: string) {
  const cookieStore = await cookies();
  cookieStore.set("theme", theme);
  refresh(); // 캐시되지 않은 데이터의 UI 업데이트
}
```

### redirect - 페이지 이동

```tsx
"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ data: { ... } });
  updateTag("posts");
  redirect(`/posts/${post.id}`);
}
```

## 파일 업로드

```tsx
"use server";

import { z } from "zod";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const uploadSchema = z.object({
  file: z.instanceof(File)
    .refine(f => f.size <= MAX_SIZE, "파일 크기는 5MB 이내여야 합니다")
    .refine(f => ["image/jpeg", "image/png", "image/webp"].includes(f.type), "지원되지 않는 파일 형식입니다"),
});

export async function uploadAvatar(formData: FormData) {
  const result = uploadSchema.safeParse({ file: formData.get("file") });

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const { file } = result.data;
  const buffer = Buffer.from(await file.arrayBuffer());
  // 스토리지에 업로드...
  updateTag("avatar");
  return { data: { url: uploadedUrl } };
}
```

## 주의사항

- Server Actions 외부에서 `refresh()` 사용 금지 (오류 발생)
- `updateTag()`는 Server Actions 전용 (Route Handlers에서는 `revalidateTag()`)
- 유효성 검사 없는 직접 `formData.get() as string` 캐스트 금지
- 데이터 읽기 전용 Server Action 금지 (Server Component 사용)
