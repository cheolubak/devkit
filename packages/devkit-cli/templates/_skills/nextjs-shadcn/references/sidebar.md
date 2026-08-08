# Sidebar

대시보드 애플리케이션을 위한 중첩 레이아웃 기반 shadcn/ui sidebar입니다.

## 설치

```bash
pnpm dlx shadcn@latest add sidebar
```

## 레이아웃 패턴

영구적인 sidebar 상태를 위해 SidebarProvider와 함께 중첩 레이아웃을 사용하세요:

```
app/
├── (dashboard)/           # sidebar 페이지용 라우트 그룹
│   ├── layout.tsx         # SidebarProvider + AppSidebar
│   ├── page.tsx           # 대시보드 홈
│   ├── settings/
│   │   └── page.tsx
│   └── components/        # 라우트 전용 컴포넌트
├── (public)/              # 공개 라우트 (sidebar 없음)
│   └── login/
└── layout.tsx             # 루트 레이아웃
```

### 대시보드 레이아웃

```tsx
// app/(dashboard)/layout.tsx
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarRail />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
```

### 페이지 컴포넌트

페이지는 깔끔하게 유지하세요 - 콘텐츠만, 레이아웃 크롬 없이:

```tsx
// app/(dashboard)/page.tsx
import { DocumentWorkspace } from "@/components/workspace/document-workspace"
import { Suspense } from "react"

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DocumentWorkspace />
    </Suspense>
  )
}
```

## AppSidebar 컴포넌트

```tsx
// components/layout/app-sidebar.tsx
import Link from "next/link"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { NAV_GROUPS, FOOTER_NAV_ITEMS } from "./nav"

export function AppSidebar() {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/" className="flex items-center gap-3">
                <Logo className="size-8" />
                <span className="text-base font-semibold">App Name</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group, index) => (
          <div key={group.title}>
            <SidebarGroup>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {index < NAV_GROUPS.length - 1 && <SidebarSeparator />}
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {FOOTER_NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
```

## 내비게이션 설정

내비게이션 데이터를 컴포넌트에서 분리하세요:

```tsx
// components/layout/nav.ts
import { Home, Settings, Users, HelpCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { title: "Dashboard", href: "/", icon: Home },
      { title: "Users", href: "/users", icon: Users },
    ],
  },
]

export const FOOTER_NAV_ITEMS: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Help", href: "/help", icon: HelpCircle },
]
```

## Sidebar 변형

| 변형 | 설명 |
|---------|-------------|
| `default` | 기본 sidebar |
| `inset` | 패딩이 있는 sidebar, 콘텐츠 영역에 둥근 모서리 적용 |
| `floating` | 콘텐츠 위에 떠 있는 sidebar |

```tsx
<Sidebar variant="inset" collapsible="icon">
```

## 접기 옵션

| 옵션 | 동작 |
|--------|----------|
| `icon` | 아이콘만 보이는 레일로 접힘 |
| `offcanvas` | 화면 밖으로 완전히 슬라이드 |
| `none` | 접기 불가 |

## 파일 구조

```
components/
└── layout/
    ├── app-sidebar.tsx    # Sidebar 컴포넌트
    └── nav.ts             # 내비게이션 설정
```
