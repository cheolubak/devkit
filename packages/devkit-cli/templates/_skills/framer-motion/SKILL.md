---
name: framer-motion
description: "Motion (Framer Motion) v11+ 애니메이션 패턴. 레이아웃 애니메이션, 페이지 전환, 스크롤 애니메이션, 제스처, AnimatePresence, View Transitions API.\nAPPLIES: `motion`/`framer-motion` import가 있거나, CSS transition만으로 어려운 움직임(레이아웃 전환·제스처·스크롤 연동)을 만들 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"애니메이션 넣어줘\", \"트랜지션\", \"페이지 전환 효과\", \"스크롤 애니메이션\", \"모션\", \"framer-motion\", \"움직이게\", \"fade in\", \"슬라이드\", React/Next.js에서 애니메이션/모션 효과 구현 시.\nSKIP: CSS만으로 충분한 단순 hover/transition은 tailwind-patterns."
---

# Motion (Framer Motion) 애니메이션 가이드

## 설치

```bash
pnpm add motion
```

> Motion v11+에서는 `framer-motion` 대신 `motion` 패키지 사용

## 기본 애니메이션

```tsx
"use client";
import { motion } from "motion/react";

// 마운트 시 애니메이션
export function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}

// hover & tap 인터랙션
export function InteractiveCard() {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="cursor-pointer rounded-lg border p-6"
    >
      Click me
    </motion.div>
  );
}
```

## Variants (재사용 가능한 애니메이션 정의)

```tsx
"use client";
import { motion } from "motion/react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // 자식 요소 순차 애니메이션
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function StaggeredList({ items }: { items: string[] }) {
  return (
    <motion.ul
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => (
        <motion.li key={item} variants={itemVariants}>
          {item}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

## AnimatePresence (퇴장 애니메이션)

```tsx
"use client";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

export function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const remove = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <AnimatePresence mode="popLayout">
      {notifications.map((notification) => (
        <motion.div
          key={notification.id}
          initial={{ opacity: 0, height: 0, x: 50 }}
          animate={{ opacity: 1, height: "auto", x: 0 }}
          exit={{ opacity: 0, height: 0, x: -50 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <span>{notification.message}</span>
          <button onClick={() => remove(notification.id)}>닫기</button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// 토글 (단일 요소)
export function ExpandablePanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            Expandable content
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

## 레이아웃 애니메이션

### layout prop

```tsx
"use client";
import { motion } from "motion/react";
import { useState } from "react";

export function ToggleSwitch() {
  const [isOn, setIsOn] = useState(false);

  return (
    <div
      className={`flex w-16 cursor-pointer rounded-full p-1 ${
        isOn ? "justify-end bg-primary" : "justify-start bg-muted"
      }`}
      onClick={() => setIsOn(!isOn)}
    >
      <motion.div
        layout // 위치 변경을 자동으로 애니메이션
        className="h-6 w-6 rounded-full bg-white"
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </div>
  );
}
```

### layoutId (공유 레이아웃 전환)

```tsx
"use client";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

export function CardExpandable({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layoutId={item.id}
            onClick={() => setSelectedId(item.id)}
            className="cursor-pointer rounded-lg border p-4"
          >
            <motion.h3 layoutId={`title-${item.id}`}>{item.title}</motion.h3>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div
            layoutId={selectedId!}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setSelectedId(null)}
          >
            <motion.div className="rounded-xl bg-white p-8" onClick={(e) => e.stopPropagation()}>
              <motion.h3 layoutId={`title-${selectedId}`}>{selectedItem.title}</motion.h3>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {selectedItem.description}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

## 스크롤 애니메이션

### useInView

```tsx
"use client";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}
```

### useScroll + useTransform (스크롤 연동 애니메이션)

```tsx
"use client";
import { motion, useScroll, useTransform } from "motion/react";

export function ParallaxHero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, -150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <motion.div style={{ y, opacity }} className="relative h-screen">
      <h1 className="text-6xl font-bold">Parallax Hero</h1>
    </motion.div>
  );
}

// 섹션 기반 스크롤 진행도
export function ScrollProgress() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8]);

  return (
    <motion.section ref={ref} style={{ scale }}>
      Content
    </motion.section>
  );
}
```

## 제스처 애니메이션

### 드래그

```tsx
"use client";
import { motion } from "motion/react";

export function DraggableCard() {
  return (
    <motion.div
      drag
      dragConstraints={{ left: -100, right: 100, top: -50, bottom: 50 }}
      dragElastic={0.2}
      whileDrag={{ scale: 1.1, cursor: "grabbing" }}
      className="cursor-grab rounded-lg border p-6"
    >
      Drag me
    </motion.div>
  );
}
```

### 스와이프 (카드 스택)

```tsx
"use client";
import { motion, useMotionValue, useTransform } from "motion/react";

export function SwipeCard({ onSwipe }: { onSwipe: (dir: "left" | "right") => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-30, 30]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (info.offset.x > 100) onSwipe("right");
    else if (info.offset.x < -100) onSwipe("left");
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, rotate, opacity }}
      onDragEnd={handleDragEnd}
      className="cursor-grab rounded-xl border p-8"
    >
      Swipe me
    </motion.div>
  );
}
```

## Next.js 페이지 전환

### View Transitions API (네이티브)

`ViewTransition`은 **React에서 직접 import**한다. `next/navigation`에는 이 export가 없어 빌드가 깨진다. 별도 설정도 필요 없다.

```tsx
// app/layout.tsx
import { unstable_ViewTransition as ViewTransition } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ViewTransition>{children}</ViewTransition>
      </body>
    </html>
  );
}

// 전환 시 CSS
// app/globals.css
::view-transition-old(root) {
  animation: fade-out 0.3s ease;
}
::view-transition-new(root) {
  animation: fade-in 0.3s ease;
}
```

### Motion으로 페이지 전환

```tsx
// components/page-transition.tsx
"use client";
import { motion } from "motion/react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

// app/about/page.tsx
import { PageTransition } from "@/components/page-transition";

export default function AboutPage() {
  return (
    <PageTransition>
      <h1>About</h1>
    </PageTransition>
  );
}
```

## 성능 최적화

```tsx
// GPU 가속 속성 사용 (transform, opacity)
// 좋음 - GPU 가속
<motion.div animate={{ x: 100, opacity: 0.5 }} />

// 나쁨 - 레이아웃 재계산 유발
<motion.div animate={{ width: "200px", left: "100px" }} />

// will-change 자동 관리
<motion.div
  style={{ willChange: "transform" }} // layout 애니메이션 시 명시
  layout
/>

// lazy motion (번들 크기 최적화)
import { LazyMotion, domAnimation, m } from "motion/react";

export function App({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <m.div animate={{ opacity: 1 }}>
        {children}
      </m.div>
    </LazyMotion>
  );
}
```

## 자주 하는 실수

1. **Server Component에서 motion 사용** - `"use client"` 필수
2. **AnimatePresence에 key 누락** - 리스트 요소에 고유 key 필수
3. **width/height 애니메이션** - `layout` prop 또는 `scale` 사용이 성능상 유리
4. **mode="wait" 과다 사용** - 이전 요소 퇴장 완료까지 대기하므로 UX 지연 발생
5. **useScroll을 조건부 렌더링과 함께 사용** - ref가 null이면 동작하지 않음
6. **layout 애니메이션에서 border-radius 깨짐** - `style`로 직접 지정
