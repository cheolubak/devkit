---
name: nextjs-shadcn
description: "shadcn/ui + Next.js 컴포넌트 패턴 가이드.\nAPPLIES: shadcn/ui 또는 Radix 기반 UI 컴포넌트를 추가·수정할 때 (`components/ui/` 아래 작업 포함). 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"UI 컴포넌트\", \"shadcn\", \"버튼 만들어줘\", \"모달 만들어줘\", \"다이얼로그\", \"드롭다운\", \"테이블 만들어줘\", \"카드 컴포넌트\", \"컴포넌트 추가\", shadcn/ui 또는 Radix 기반 컴포넌트 사용 시.\nSKIP: 커스텀 스타일링/테마는 tailwind-patterns. 폼 로직은 react-hook-form. 애니메이션은 framer-motion."
---

> 참조:
> - [references/architecture.md](references/architecture.md) - 컴포넌트, 라우팅, Suspense, 데이터 패턴, AI 디렉토리 구조
> - [references/styling.md](references/styling.md) - 테마, 폰트, radius, 애니메이션, CSS 변수, 배경 패턴
> - [references/sidebar.md](references/sidebar.md) - shadcn 사이드바 + 중첩 레이아웃
> - [references/project-setup.md](references/project-setup.md) - pnpm 명령어, 프리셋, 프로젝트 구조

# shadcn/ui + Next.js 패턴 가이드

## 설치 및 설정

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog form input label select textarea sonner
```

## 컴포넌트 사용 원칙

### 1. shadcn 컴포넌트는 `components/ui/`에 위치

```text
components/
├── ui/           # shadcn 기본 컴포넌트 (수정 최소화)
│   ├── button.tsx
│   ├── card.tsx
│   └── dialog.tsx
└── shared/       # 비즈니스 컴포넌트 (shadcn 조합)
    ├── user-card.tsx
    └── confirm-dialog.tsx
```

### 2. cn() 유틸리티 필수 사용

모든 컴포넌트에서 className을 받아 cn()으로 병합:

```tsx
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outlined";
}

function CustomCard({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-6",
        variant === "outlined" && "border border-border",
        className
      )}
      {...props}
    />
  );
}
```

### 3. named export 선호

```tsx
// 좋음
export function UserAvatar({ user }: UserAvatarProps) { ... }

// 나쁨
export default function UserAvatar({ user }: UserAvatarProps) { ... }
```

### 4. 폼 패턴 - React Hook Form + Zod

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요"),
  email: z.email("올바른 이메일을 입력해주세요"),
});

type FormValues = z.infer<typeof formSchema>;

export function ContactForm({ action }: { action: (data: FormValues) => Promise<void> }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(action)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          제출
        </Button>
      </form>
    </Form>
  );
}
```

### 5. Dialog/Sheet 패턴

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  trigger,
  title,
  children,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <Button onClick={onConfirm}>확인</Button>
      </DialogContent>
    </Dialog>
  );
}
```

### 6. Toast 알림

```tsx
import { toast } from "sonner";

// Server Action 결과 처리
async function handleSubmit(data: FormValues) {
  const result = await createItem(data);
  if (result.error) {
    toast.error("생성 실패", { description: result.error });
  } else {
    toast.success("생성 완료");
  }
}
```

### 7. 테마 색상 - CSS 변수 사용

```tsx
// 좋음 - shadcn 테마 변수
<Button variant="default" />           // bg-primary
<Button variant="secondary" />         // bg-secondary
<Button variant="destructive" />       // bg-destructive
<Button variant="outline" />           // border-border
<Button variant="ghost" />             // hover:bg-accent

// 나쁨 - 하드코딩 색상
<button className="bg-blue-500 text-white" />
```

## Sidebar 패턴

```tsx
// app/(dashboard)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shared/app-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
```

## Data Table 패턴

```tsx
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";

export default async function UsersPage() {
  const users = await getUsers();
  return <DataTable columns={columns} data={users} />;
}
```
