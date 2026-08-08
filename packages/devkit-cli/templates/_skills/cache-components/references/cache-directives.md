# Cache Directives 레퍼런스

`'use cache'` 지시어와 캐시 핸들러에 대한 레퍼런스입니다.

## 지시어: `'use cache'`

함수 또는 파일을 캐시 가능하도록 표시합니다. 캐시된 출력은 Partial Prerendering 중 정적 셸에 포함됩니다.

### 구문

```tsx
// 파일 수준 (모든 export에 적용)
'use cache'

export async function getData() {
  /* ... */
}

// 함수 수준
async function Component() {
  'use cache'
  // ...
}
```

### 변형

| 지시어                 | 설명                           | 캐시 저장소              |
| ---------------------- | ------------------------------ | ------------------------ |
| `'use cache'`          | 표준 캐시 (기본값)             | Default 핸들러 + Remote  |
| `'use cache: remote'`  | 플랫폼 원격 캐시               | Remote 핸들러만          |
| `'use cache: private'` | 요청별 프라이빗 캐시           | Default 핸들러 (요청 범위) |

### `'use cache: remote'`

플랫폼별 원격 캐시 핸들러를 사용합니다. 네트워크 왕복이 필요합니다.

```tsx
async function HeavyComputation() {
  'use cache: remote'
  cacheLife('days')

  return await expensiveCalculation()
}
```

### `'use cache: private'`

요청별 프라이빗 캐시 범위를 생성합니다. 모든 사용자와 요청 간에 캐시 결과를 공유하는 `'use cache'`와 달리, `'use cache: private'`는 캐시된 데이터가 현재 요청에만 범위가 지정되도록 보장합니다. 동일한 서버 인스턴스 내에서도 요청 간 데이터가 유출되어서는 안 되는 규정 준수 시나리오에 유용합니다.

```tsx
async function UserComplianceData({ userId }: { userId: string }) {
  'use cache: private'
  cacheLife('seconds')

  // 데이터는 이 요청 내에서만 캐시됨 - 요청 간에 공유되지 않음
  return await fetchSensitiveReport(userId)
}
```

**사용 시기**: 런타임 데이터를 함수 매개변수로 추출할 수 없고 규정 준수 요구사항으로 인해 요청 간 캐시 출력 공유가 불가능한 경우에만 사용합니다. 이것은 최후의 수단 변형입니다 — 대부분의 경우 매개변수화된 인자와 함께 `'use cache'`를 사용하는 것이 좋습니다.

### 캐시 핸들러 이해하기

Next.js는 **캐시 핸들러**를 사용하여 캐시된 데이터를 저장하고 검색합니다. 지시어 변형에 따라 사용되는 핸들러가 결정됩니다:

| 핸들러    | 설명                                                                        |
| --------- | --------------------------------------------------------------------------- |
| `default` | 선택적 영속성이 있는 로컬 인메모리 캐시. 빠르며 단일 서버 범위             |
| `remote`  | 플랫폼별 분산 캐시. 네트워크 왕복 필요, 다중 서버 범위                     |

**변형이 핸들러에 매핑되는 방식:**

- `'use cache'` → **두 가지 모두** default와 remote 핸들러를 사용합니다. 빠른 접근을 위해 로컬에, 인스턴스 간 공유를 위해 원격에 캐시됩니다
- `'use cache: remote'` → **원격 핸들러만** 사용합니다. 로컬 캐시를 건너뛰고 항상 분산 캐시에서 가져옵니다

**각 변형의 사용 시기:**

| 사용 사례                                 | 권장 변형              |
| ----------------------------------------- | ---------------------- |
| 대부분의 캐시 데이터                      | `'use cache'`          |
| 전역적으로 공유할 무거운 연산             | `'use cache: remote'`  |
| 전역적으로 일관성이 필요한 데이터         | `'use cache: remote'`  |
| 규정 준수: 요청 간 공유 불가              | `'use cache: private'` |

### 규칙

1. **반드시 async여야 함** - 모든 캐시 함수는 Promise를 반환해야 합니다
2. **첫 번째 문장** - `'use cache'`는 함수 본문의 첫 번째 문장이어야 합니다
3. **런타임 API 사용 불가** - `cookies()`, `headers()`, `searchParams`를 직접 호출할 수 없습니다 (예외: `'use cache: private'`는 요청 간 공유되지 않으므로 요청 범위 접근을 허용합니다)
4. **직렬화 가능한 인자** - 모든 인자는 직렬화 가능해야 합니다 (함수, 클래스 인스턴스 불가)
5. **직렬화 가능한 반환값** - 캐시 함수는 직렬화 가능한 데이터를 반환해야 합니다 (함수, 클래스 인스턴스 불가)
