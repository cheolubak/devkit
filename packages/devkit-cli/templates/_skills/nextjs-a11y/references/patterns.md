# Next.js를 위한 컴포넌트 접근성 패턴

일반적인 UI 컴포넌트에 대한 접근성(Accessibility) 패턴 종합 참고 자료입니다. TSX 예제, 필수 ARIA 속성, 키보드 인터랙션 및 흔한 실수를 포함합니다.

---

## 목차

1. [Modal / Dialog](#modal--dialog)
2. [Dropdown / Menu](#dropdown--menu)
3. [Tabs](#tabs)
4. [Accordion](#accordion)
5. [Toast / Notification](#toast--notification)
6. [Navigation](#navigation)
7. [Table](#table)
8. [Tooltip](#tooltip)
9. [Carousel / Slider](#carousel--slider)
10. [Combobox / Autocomplete](#combobox--autocomplete)

---

## Modal / Dialog

### TSX 예제

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      triggerRef.current?.focus(); // 트리거 요소로 포커스 복귀
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      aria-labelledby="modal-title"
      aria-modal="true"
      className="modal"
    >
      <div role="document">
        <h2 id="modal-title">{title}</h2>
        <div>{children}</div>
        <button onClick={onClose} aria-label="Close dialog">
          &times;
        </button>
      </div>
    </dialog>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-modal="true"` | `<dialog>` | 페이지의 나머지 부분이 비활성(inert) 상태임을 나타냄 |
| `aria-labelledby` | `<dialog>` | 접근 가능한 이름(accessible name)을 위해 다이얼로그 제목을 참조함 |
| `role="dialog"` | 컨테이너 | `<dialog>` 요소에는 암묵적으로 포함되며, 네이티브 요소를 사용하지 않는 경우 `<div>`에 명시적으로 지정함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` | 다이얼로그 내부의 다음 포커스 가능 요소로 이동 (포커스 트랩 적용) |
| `Shift + Tab` | 다이얼로그 내부의 이전 포커스 가능 요소로 이동 |
| `Escape` | 다이얼로그를 닫음 |

### 흔한 실수

- 모달 내부에 포커스를 가두지 않아(focus trap) 포커스가 배경 콘텐츠로 빠져나가는 경우.
- 모달이 닫힐 때 트리거 요소로 포커스를 복귀시키지 않는 경우.
- 배경 콘텐츠 대신 모달 자체에 `aria-hidden="true"`를 사용하는 경우.
- Escape 키와 함께 눈에 보이는 닫기 버튼을 제공하지 않는 경우.
- 다이얼로그 컨테이너에 `aria-labelledby` 또는 `aria-label`이 누락된 경우.
- `<dialog>` 요소 대신 포커스 트랩을 구현하지 않은 `<div>`에 `role="dialog"`를 사용하는 경우 (`<dialog>` 요소 사용을 권장).

---

## Dropdown / Menu

### TSX 예제

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

interface MenuItem {
  label: string;
  onClick: () => void;
}

interface DropdownMenuProps {
  label: string;
  items: MenuItem[];
}

export function DropdownMenu({ label, items }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [isOpen, activeIndex]);

  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(0);
        break;
      case "ArrowUp":
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(items.length - 1);
        break;
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case "Escape":
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="dropdown">
      <button
        ref={buttonRef}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="dropdown-menu"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleButtonKeyDown}
      >
        {label}
      </button>
      {isOpen && (
        <ul
          ref={menuRef}
          id="dropdown-menu"
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <li
              key={index}
              ref={(el) => { itemRefs.current[index] = el; }}
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
                buttonRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  item.onClick();
                  setIsOpen(false);
                  buttonRef.current?.focus();
                }
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-expanded` | 트리거 버튼 | 메뉴의 열림/닫힘 상태를 나타냄 |
| `aria-haspopup="true"` | 트리거 버튼 | 버튼이 메뉴를 여는 것을 나타냄 |
| `aria-controls` | 트리거 버튼 | 메뉴 요소를 참조함 |
| `role="menu"` | `<ul>` | 컨테이너를 메뉴로 식별함 |
| `role="menuitem"` | `<li>` | 각 항목을 메뉴 아이템으로 식별함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Enter` / `Space` | 메뉴를 열거나 메뉴 아이템을 활성화함 |
| `ArrowDown` | 메뉴를 열거나 다음 아이템으로 이동함 |
| `ArrowUp` | 마지막 아이템에서 메뉴를 열거나 이전 아이템으로 이동함 |
| `Home` | 첫 번째 아이템으로 이동함 |
| `End` | 마지막 아이템으로 이동함 |
| `Escape` | 메뉴를 닫고 트리거로 포커스를 복귀함 |
| `Tab` | 메뉴를 닫고 다음 포커스 가능 요소로 이동함 |

### 흔한 실수

- 화살표 키 내비게이션을 구현하지 않는 경우 (Tab에만 의존).
- `aria-expanded`를 빠뜨리거나 열림/닫힘 시 토글하지 않는 경우.
- Escape로 메뉴를 닫을 때 버튼으로 포커스를 복귀시키지 않는 경우.
- 실제 메뉴 위젯을 열지 않는 요소에 `aria-haspopup="menu"`를 사용하는 경우.
- 사용자가 Tab으로 이동할 때 메뉴를 닫지 않는 경우.

---

## Tabs

### TSX 예제

```tsx
"use client";

import { useState, useRef } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  label: string;
}

export function Tabs({ tabs, label }: TabsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex = index;

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        newIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        e.preventDefault();
        newIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    setActiveTab(newIndex);
    tabRefs.current[newIndex]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={index === activeTab}
            aria-controls={`panel-${tab.id}`}
            tabIndex={index === activeTab ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
          hidden={index !== activeTab}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `role="tablist"` | 컨테이너 | 탭 요소들을 그룹화함 |
| `role="tab"` | 각 탭 버튼 | 요소를 탭으로 식별함 |
| `role="tabpanel"` | 콘텐츠 패널 | 탭의 콘텐츠 영역을 식별함 |
| `aria-selected` | 탭 버튼 | 활성 탭을 나타냄 |
| `aria-controls` | 탭 버튼 | 연결된 tabpanel을 참조함 |
| `aria-labelledby` | Tabpanel | 접근 가능한 이름을 위해 연결된 탭을 참조함 |
| `tabIndex={0 또는 -1}` | 탭 버튼 | 활성 탭만 탭 순서에 포함됨 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `ArrowRight` | 다음 탭으로 이동 (자동 활성화) |
| `ArrowLeft` | 이전 탭으로 이동 |
| `Home` | 첫 번째 탭으로 이동 |
| `End` | 마지막 탭으로 이동 |
| `Tab` | 활성 tabpanel 내부로 포커스 이동 |

**자동 활성화 vs. 수동 활성화:** 자동 모드(위 예제)에서는 화살표 키를 누르면 포커스 이동과 탭 활성화가 동시에 이루어집니다. 수동 모드에서는 화살표 키가 포커스만 이동하고 `Enter`/`Space`로 활성화합니다. 콘텐츠 로딩 비용이 높지 않다면 자동 활성화를 사용하세요.

### 흔한 실수

- 탭에 `<button>` 요소 대신 `<a>` 태그를 사용하는 경우.
- 모든 탭을 탭 순서에 넣는 경우 (활성 탭을 제외한 모든 탭은 `tabIndex={-1}`이어야 함).
- 탭 버튼에 `aria-selected`가 누락된 경우.
- `aria-labelledby`와 `aria-controls`를 통해 tabpanel과 탭을 연결하지 않는 경우.
- `hidden` 속성 대신 `display: none`을 사용하는 경우 (둘 다 동작하지만 일관성을 유지해야 함).

---

## Accordion

### TSX 예제

```tsx
"use client";

import { useState } from "react";

interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
}

export function Accordion({ items, allowMultiple = false }: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="accordion">
      {items.map((item) => {
        const isOpen = openItems.has(item.id);
        return (
          <div key={item.id}>
            <h3>
              <button
                aria-expanded={isOpen}
                aria-controls={`accordion-panel-${item.id}`}
                id={`accordion-header-${item.id}`}
                onClick={() => toggle(item.id)}
              >
                <span>{item.title}</span>
                <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
              </button>
            </h3>
            <div
              id={`accordion-panel-${item.id}`}
              role="region"
              aria-labelledby={`accordion-header-${item.id}`}
              hidden={!isOpen}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-expanded` | 헤더 버튼 | 섹션의 열림/닫힘 상태를 나타냄 |
| `aria-controls` | 헤더 버튼 | 콘텐츠 패널을 참조함 |
| `role="region"` | 콘텐츠 패널 | 패널을 랜드마크(landmark)로 식별함 (선택 사항, 6개 이하의 섹션에서만 사용) |
| `aria-labelledby` | 콘텐츠 패널 | 접근 가능한 이름을 위해 헤더 버튼을 참조함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Enter` / `Space` | 섹션을 열거나 닫음 |
| `Tab` | 다음 포커스 가능 요소로 이동 |

### 흔한 실수

- heading 요소 안에 버튼을 감싸지 않는 경우 (올바른 heading 의미론을 위해 필요).
- 헤더에 `<button>` 대신 `onClick`이 있는 `<div>`를 사용하는 경우.
- `aria-expanded`를 빠뜨리거나 패널 열림/닫힘 시 토글하지 않는 경우.
- CSS 애니메이션으로 숨겨진 콘텐츠가 여전히 스크린 리더에 접근 가능한 경우.
- 많은 섹션이 있을 때 모든 패널에 `role="region"`을 사용하는 경우 (6개 이하의 섹션에서만 사용해야 함).

---

## Toast / Notification

### TSX 예제

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
      className="toast-container"
      role="status"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    // 에러가 아닌 토스트만 자동 해제
    if (toast.type !== "error") {
      const timer = setTimeout(() => onDismiss(toast.id), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.type, onDismiss]);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className={`toast toast-${toast.type}`}
    >
      <p>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss ${toast.type} notification`}
      >
        &times;
      </button>
    </div>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-live="polite"` | 컨테이너 | 현재 작업을 방해하지 않고 새 토스트를 알림 |
| `aria-live="assertive"` | 컨테이너 | 긴급/오류 알림에 사용 |
| `role="status"` | 비긴급 토스트 | 정보성 메시지에 사용 |
| `role="alert"` | 오류 토스트 | 긴급 오류 메시지에 사용 (암묵적으로 `aria-live="assertive"` 포함) |
| `aria-atomic` | 컨테이너 | 전체 영역을 알릴지 변경된 부분만 알릴지를 결정함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` | 토스트가 포커스 가능한 경우 닫기 버튼으로 포커스 이동 |
| `Escape` | 선택적으로 포커스된 토스트를 해제함 |

### 흔한 실수

- 모든 토스트에 `role="alert"`를 사용하는 경우 (오류에만 사용하고, 정보/성공에는 `role="status"` 사용).
- 사용자가 읽기 전에 오류 토스트를 자동으로 해제하는 경우.
- 닫기 버튼을 제공하지 않는 경우 (일부 사용자는 메시지를 읽는 데 더 많은 시간이 필요함).
- 자동 해제 타이머가 너무 짧은 경우 (최소 5초 사용, WCAG 2.2.1 타이밍 조절 가능 기준 고려).
- 라이브 리전(live region) 컨테이너를 잊는 경우 -- `aria-live`를 동적으로 추가하면 작동하지 않으며, 콘텐츠가 주입되기 전에 컨테이너가 DOM에 존재해야 함.

---

## Navigation

### TSX 예제

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

interface NavigationProps {
  items: NavItem[];
}

export function Navigation({ items }: NavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <button
        aria-expanded={isMobileMenuOpen}
        aria-controls="main-nav-list"
        aria-label="Menu"
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <span aria-hidden="true">&#9776;</span>
      </button>
      <ul id="main-nav-list" hidden={!isMobileMenuOpen}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Breadcrumbs (탐색 경로)
interface BreadcrumbItem {
  href: string;
  label: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={item.href}>
            {index < items.length - 1 ? (
              <>
                <Link href={item.href}>{item.label}</Link>
                <span aria-hidden="true"> / </span>
              </>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-label` | `<nav>` | 여러 내비게이션 랜드마크가 있을 때 구분하기 위해 사용 |
| `aria-current="page"` | 활성 링크 | 내비게이션 내에서 현재 페이지를 나타냄 |
| `aria-expanded` | 모바일 토글 | 모바일 메뉴의 열림/닫힘 상태를 나타냄 |
| `aria-controls` | 모바일 토글 | 내비게이션 목록을 참조함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` | 내비게이션 내 링크들을 순서대로 이동 |
| `Enter` | 링크를 활성화함 |
| `Escape` | 모바일 메뉴를 닫음 (구현된 경우) |

### 흔한 실수

- 여러 `<nav>` 요소에 서로 다른 `aria-label` 값을 지정하지 않는 경우.
- 활성 링크에 `aria-current="page"`를 사용하지 않는 경우 (시각적 스타일링에만 의존).
- 내비게이션 컨테이너에 `<nav>` 대신 `<div>`를 사용하는 경우.
- Breadcrumbs: `<nav>`와 `<ol>` 대신 구분자가 있는 `<div>`를 사용하는 경우.
- Breadcrumb 구분자가 스크린 리더에 노출되는 경우 (구분자에 `aria-hidden="true"` 사용 필요).
- 접힌 상태의 모바일 내비게이션 목록을 보조 기술에서 숨기지 않는 경우.

---

## Table

### TSX 예제

```tsx
"use client";

import { useState } from "react";

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
}

interface SortableTableProps {
  caption: string;
  columns: Column[];
  data: Record<string, string | number>[];
}

export function SortableTable({ caption, columns, data }: SortableTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">(
    "ascending"
  );

  const handleSort = (key: string) => {
    if (sortColumn === key) {
      setSortDirection((d) =>
        d === "ascending" ? "descending" : "ascending"
      );
    } else {
      setSortColumn(key);
      setSortDirection("ascending");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === "ascending" ? cmp : -cmp;
  });

  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              aria-sort={
                sortColumn === col.key ? sortDirection : undefined
              }
            >
              {col.sortable ? (
                <button onClick={() => handleSort(col.key)}>
                  {col.label}
                  <span aria-hidden="true">
                    {sortColumn === col.key
                      ? sortDirection === "ascending"
                        ? " ▲"
                        : " ▼"
                      : " ⇅"}
                  </span>
                </button>
              ) : (
                col.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedData.map((row, index) => (
          <tr key={index}>
            {columns.map((col, colIndex) => {
              if (colIndex === 0) {
                return (
                  <th key={col.key} scope="row">
                    {row[col.key]}
                  </th>
                );
              }
              return <td key={col.key}>{row[col.key]}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `scope="col"` | `<thead>` 내의 `<th>` | 헤더를 해당 열과 연결함 |
| `scope="row"` | `<tbody>` 내의 `<th>` | 헤더를 해당 행과 연결함 |
| `aria-sort` | `<th>` | 정렬 방향을 나타냄 ("ascending", "descending", "none") |
| `<caption>` | `<table>` | 테이블에 접근 가능한 이름을 제공함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` | 정렬 가능한 열 헤더 버튼으로 이동 |
| `Enter` / `Space` | 정렬 가능한 열의 정렬을 토글함 |

### 흔한 실수

- `<caption>` 요소가 누락된 경우 (모든 데이터 테이블에는 접근 가능한 이름이 필요함).
- `<th>` 요소에 `scope` 속성을 사용하지 않는 경우.
- 레이아웃에 `<table>`을 사용하는 경우 (테이블은 데이터 표시에만 사용해야 함).
- 정렬 불가능한 열에 `aria-sort`를 설정하는 경우.
- 행 헤더에 `scope="row"`가 있는 `<th>`를 사용하지 않는 경우.
- 스크린 리더 사용자를 위한 정렬 방향 피드백이 누락된 경우.

---

## Tooltip

### TSX 예제

```tsx
"use client";

import { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2)}`);

  const show = () => setIsVisible(true);
  const hide = () => setIsVisible(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsVisible(false);
    }
  };

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      <span aria-describedby={isVisible ? tooltipId.current : undefined}>
        {children}
      </span>
      {isVisible && (
        <span
          id={tooltipId.current}
          role="tooltip"
          className="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `role="tooltip"` | 툴팁 요소 | 팝업을 툴팁으로 식별함 |
| `aria-describedby` | 트리거 요소 | 트리거를 툴팁 콘텐츠와 연결함 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` (포커스) | 트리거가 포커스를 받으면 툴팁을 표시함 |
| `Escape` | 툴팁을 숨김 |
| Blur | 포커스가 떠나면 툴팁을 숨김 |

### 흔한 실수

- 호버에서만 트리거하고 포커스에서는 트리거하지 않는 경우 (키보드 및 스크린 리더 사용자가 볼 수 없음).
- `aria-describedby` 대신 `aria-label`을 사용하는 경우 (툴팁은 접근 가능한 이름을 대체하는 것이 아니라 보충하는 것임).
- `Escape` 키로 해제하지 않는 경우 (WCAG 1.4.13 호버 또는 포커스 시 콘텐츠 기준).
- 사용자가 마우스를 툴팁 자체로 이동하면 콘텐츠가 사라지는 경우.
- 툴팁 안에 인터랙티브 콘텐츠를 넣는 경우 (툴팁에는 텍스트만 포함해야 함).
- 툴팁 요소에 `role="tooltip"`을 사용하지 않는 경우.

---

## Carousel / Slider

### TSX 예제

```tsx
"use client";

import { useState, useRef } from "react";

interface Slide {
  id: string;
  content: React.ReactNode;
  label: string;
}

interface CarouselProps {
  slides: Slide[];
  label: string;
}

export function Carousel({ slides, label }: CarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="carousel-controls">
        <button
          onClick={() => setIsAutoPlaying(!isAutoPlaying)}
          aria-label={isAutoPlaying ? "Stop automatic slide show" : "Start automatic slide show"}
        >
          {isAutoPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={prevSlide} aria-label="Previous slide">
          Previous
        </button>
        <button onClick={nextSlide} aria-label="Next slide">
          Next
        </button>
      </div>

      <div
        ref={liveRegionRef}
        aria-live={isAutoPlaying ? "off" : "polite"}
        aria-atomic="true"
      >
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slide.label} (${index + 1} of ${slides.length})`}
            hidden={index !== currentSlide}
          >
            {slide.content}
          </div>
        ))}
      </div>

      {/* 슬라이드 인디케이터 */}
      <div role="group" aria-label="Slide controls">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}: ${slide.label}`}
            aria-current={index === currentSlide ? "true" : undefined}
            className={index === currentSlide ? "active" : ""}
          />
        ))}
      </div>
    </section>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `aria-roledescription="carousel"` | 컨테이너 | 컴포넌트를 캐러셀(carousel)로 설명함 |
| `aria-roledescription="slide"` | 각 슬라이드 | 각 항목을 슬라이드(slide)로 설명함 |
| `aria-label` | 컨테이너, 슬라이드 | 접근 가능한 이름을 제공함 |
| `aria-live` | 콘텐츠 컨테이너 | 슬라이드 변경을 알림 (자동 재생 중에는 "off"로 설정) |
| `aria-current` | 점 인디케이터 | 현재 표시 중인 슬라이드를 나타냄 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `Tab` | 캐러셀 컨트롤로 이동 |
| `Enter` / `Space` | 버튼 활성화 (이전, 다음, 재생/일시정지, 점 인디케이터) |

### 흔한 실수

- 키보드 사용자가 캐러셀과 상호작용할 때 자동 재생을 일시정지하지 않는 경우.
- 자동 재생 중에 `aria-live`를 설정하는 경우 (계속되는 알림이 방해가 됨).
- 자동 재생을 위한 일시정지/중지 버튼이 없는 경우 (WCAG 2.2.2 일시정지, 중지, 숨기기 기준).
- 슬라이드 위치 정보를 제공하지 않는 경우 ("5개 중 2번째").
- `aria-label` 없이 `aria-roledescription`을 사용하는 경우 (roledescription은 역할 이름을 대체하므로 접근 가능한 이름이 필수).
- 접근 가능한 레이블이 없는 점 인디케이터.

---

## Combobox / Autocomplete

### TSX 예제

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

interface ComboboxProps {
  label: string;
  options: string[];
  onSelect: (value: string) => void;
}

export function Combobox({ label, options, onSelect }: ComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = "combobox-listbox";

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(e.target.value.length > 0);
    setActiveIndex(-1);
  };

  const selectOption = (value: string) => {
    setInputValue(value);
    setIsOpen(false);
    onSelect(value);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
        setActiveIndex((prev) =>
          Math.min(prev + 1, filteredOptions.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && filteredOptions[activeIndex]) {
          selectOption(filteredOptions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
        break;
    }
  };

  const activeDescendant =
    activeIndex >= 0 ? `option-${activeIndex}` : undefined;

  return (
    <div className="combobox-container">
      <label htmlFor="combobox-input">{label}</label>
      <div>
        <input
          ref={inputRef}
          id="combobox-input"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            // 옵션 클릭을 허용하기 위해 지연
            setTimeout(() => setIsOpen(false), 200);
          }}
        />
        {isOpen && filteredOptions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} suggestions`}
          >
            {filteredOptions.map((option, index) => (
              <li
                key={option}
                id={`option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

### 필수 ARIA 속성

| 속성 | 요소 | 목적 |
|-----------|---------|---------|
| `role="combobox"` | `<input>` | 입력 필드를 combobox로 식별함 |
| `aria-expanded` | `<input>` | listbox의 표시 여부를 나타냄 |
| `aria-controls` | `<input>` | listbox 요소를 참조함 |
| `aria-autocomplete="list"` | `<input>` | 제안 목록이 나타날 것을 나타냄 |
| `aria-activedescendant` | `<input>` | 현재 강조된 옵션을 참조함 |
| `role="listbox"` | `<ul>` | 제안 컨테이너를 식별함 |
| `role="option"` | `<li>` | 각 제안 항목을 식별함 |
| `aria-selected` | `<li>` | 강조된 옵션을 나타냄 |

### 키보드 인터랙션

| 키 | 동작 |
|-----|--------|
| `ArrowDown` | listbox를 열고 다음 옵션으로 이동 |
| `ArrowUp` | 이전 옵션으로 이동 |
| `Enter` | 강조된 옵션을 선택 |
| `Escape` | listbox를 닫음 |
| `Home` | 첫 번째 옵션으로 이동 |
| `End` | 마지막 옵션으로 이동 |
| 문자 입력 | 목록을 필터링함 |

### 흔한 실수

- `aria-activedescendant`를 사용하지 않는 경우 (포커스는 입력 필드에 유지되어야 하며, 시각적 강조는 `aria-activedescendant`로 관리해야 함).
- 포커스를 입력 필드에 유지하지 않고 DOM 포커스를 listbox 옵션으로 이동하는 경우.
- 스크린 리더 사용자에게 사용 가능한 결과 수를 알리지 않는 경우.
- 입력 필드에 `aria-autocomplete`가 누락된 경우.
- 사용자가 옵션을 클릭하기 전에 listbox를 닫는 경우 (blur 지연 또는 click 대신 mousedown 사용 필요).
- 결과가 없는 경우를 처리하지 않는 경우 (라이브 리전에서 "결과 없음"을 알려야 함).
