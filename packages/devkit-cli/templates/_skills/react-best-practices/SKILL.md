---
name: react-best-practices
description: "React + Next.js 모범 사례. 서버/클라이언트 컴포넌트, 상태 관리, 성능 최적화 패턴.\nAPPLIES: `.tsx` 컴포넌트를 새로 만들거나 구조를 고칠 때, `use client`/서버 컴포넌트 경계를 정할 때, 불필요한 리렌더를 줄일 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"컴포넌트 만들어줘\", \"리액트 구조\", \"페이지 만들어줘\", \"컴포넌트 설계\", \"렌더링 최적화\", \"서버 컴포넌트\", \"클라이언트 컴포넌트\", \"use client 써야 해?\", \"React 패턴\", \"컴포넌트 분리\", React/Next.js 프로젝트에서 컴포넌트 작성 시.\nSKIP: 특정 라이브러리(Zustand, TanStack Query, Hook Form 등) 사용법은 해당 전용 스킬. 스타일링은 tailwind-patterns. 레이어/슬라이스/폴더 아키텍처(FSD) 설계는 fsd-architecture."
---

> 참조:
> - [references/01-waterfall.md](references/01-waterfall.md) - 워터폴 제거 (CRITICAL)
> - [references/02-bundle.md](references/02-bundle.md) - 번들 크기 최적화 (CRITICAL)
> - [references/03-server.md](references/03-server.md) - 서버 사이드 성능 (HIGH)
> - [references/04-client.md](references/04-client.md) - 클라이언트 사이드 데이터 페칭 (MEDIUM-HIGH)
> - [references/05-rerender.md](references/05-rerender.md) - 리렌더 최적화 (MEDIUM)
> - [references/06-rendering.md](references/06-rendering.md) - 렌더링 성능 (MEDIUM)
> - [references/07-javascript.md](references/07-javascript.md) - JavaScript 성능 (LOW-MEDIUM)
> - [references/08-advanced.md](references/08-advanced.md) - 고급 패턴 (LOW)
> - [rules/](rules/) - 개별 규칙 파일
> - [README.md](README.md) - 규칙 카테고리, 우선순위, 사용법

# React 모범 사례 (Next.js App Router)

## 1. 서버 컴포넌트 우선

기본적으로 모든 컴포넌트는 Server Component. "use client"는 최소한의 리프 컴포넌트에만 사용.

```tsx
// 좋음 - 서버 컴포넌트에서 직접 데이터 페칭
export default async function UserProfile({ userId }: { userId: string }) {
  const user = await getUser(userId);
  return (
    <div>
      <h1>{user.name}</h1>
      <LikeButton userId={userId} /> {/* 클라이언트 경계는 여기 */}
    </div>
  );
}

// 나쁨 - 전체 페이지를 클라이언트로 만들기
"use client";
export default function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  useEffect(() => { fetchUser(userId).then(setUser) }, [userId]);
  // ...
}
```

## 2. "use client" 경계 최소화

```text
서버 컴포넌트 (기본)
├── 서버 컴포넌트
│   ├── 서버 컴포넌트
│   └── "use client" ← 여기서만 클라이언트 경계
│       ├── 클라이언트 컴포넌트
│       └── 클라이언트 컴포넌트
└── 서버 컴포넌트
```

### "use client"가 필요한 경우

- useState, useReducer
- 이벤트 핸들러 (onClick, onChange 등)
- 브라우저 API (localStorage, window 등)
- 서드파티 클라이언트 라이브러리

### "use client"가 불필요한 경우

- 데이터 표시만 하는 컴포넌트
- 폼 제출 (Server Action 사용)
- 조건부 렌더링 (서버에서 처리 가능)

## 3. useEffect 제거

```tsx
// ❌ 나쁨 - useEffect로 데이터 페칭
"use client";
export function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(setUsers);
  }, []);
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}

// ✅ 좋음 - Server Component
export default async function UserList() {
  const users = await getUsers();
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}

// ❌ 나쁨 - useEffect로 파생 상태
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ 좋음 - 계산된 값
const fullName = `${firstName} ${lastName}`;
```

## 4. 이벤트 핸들러 활용

```tsx
"use client";

// ❌ 나쁨 - useEffect로 외부 동기화
useEffect(() => {
  document.title = `${count} items`;
}, [count]);

// ✅ 좋음 - 이벤트 핸들러에서 처리
function handleAdd() {
  setCount(c => c + 1);
  document.title = `${count + 1} items`;
}
```

## 5. Server Actions로 폼 처리

```tsx
// Server Action
"use server";

export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;
  await db.posts.create({ data: { title } });
  updateTag("posts");
}

// Server Component (useEffect 불필요)
export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" />
      <button type="submit">작성</button>
    </form>
  );
}
```

## 6. 컴포넌트 구성 패턴

### Composition 패턴

```tsx
// 좋음 - children으로 조합
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border p-4", className)}>{children}</div>;
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 font-semibold">{children}</div>;
}

// 사용
<Card>
  <CardHeader>제목</CardHeader>
  <p>내용</p>
</Card>
```

### Props 타입 정의

```tsx
// 좋음 - 명시적 Props 타입
interface UserCardProps {
  user: User;
  showAvatar?: boolean;
  className?: string;
}

export function UserCard({ user, showAvatar = true, className }: UserCardProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {showAvatar && <Avatar src={user.avatar} />}
      <span>{user.name}</span>
    </div>
  );
}
```

## 7. 성능 패턴

### React.memo - 실제 필요한 경우만

```tsx
// 비용이 큰 렌더링 + 부모가 자주 리렌더링되는 경우만
const ExpensiveList = memo(function ExpensiveList({ items }: { items: Item[] }) {
  return items.map(item => <ComplexItem key={item.id} item={item} />);
});
```

### Suspense 활용

```tsx
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <>
      <h1>대시보드</h1>
      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <SalesChart />
      </Suspense>
    </>
  );
}
```

## 8. 임포트 규칙

```tsx
// 좋음 - @ 별칭 사용
import { Button } from "@/components/ui/button";
import { getUser } from "@/data/users";
import { cn } from "@/lib/utils";

// 나쁨 - 상대 경로
import { Button } from "../../../components/ui/button";
import { getUser } from "../../data/users";
```

## 9. 키 패턴

```tsx
// 좋음 - 고유 ID
{users.map(user => <UserCard key={user.id} user={user} />)}

// 나쁨 - 인덱스 (순서 변경 가능한 목록)
{users.map((user, i) => <UserCard key={i} user={user} />)}
```

## 10. 에러 처리

```tsx
// error.tsx - 라우트 에러 경계
"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <h2>문제가 발생했습니다</h2>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}

// not-found.tsx - 404 처리
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4">
      <h2>페이지를 찾을 수 없습니다</h2>
      <Link href="/">홈으로 돌아가기</Link>
    </div>
  );
}
```
