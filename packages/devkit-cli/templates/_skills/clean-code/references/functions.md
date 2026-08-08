# 함수 설계

작은 함수는 이름이 곧 문서가 되고, 테스트·재사용·디버깅이 쉬워진다. 함수 설계의 핵심 질문은 "이 함수는 **한 가지 일**을 **한 추상화 레벨**에서 하는가?"이다.

## 목차
- [작게, 한 가지만](#작게-한-가지만)
- [단일 추상화 레벨](#단일-추상화-레벨)
- [인자 다루기](#인자-다루기)
- [부수효과와 명령-조회 분리](#부수효과와-명령-조회-분리)
- [가드 절과 중첩 평탄화](#가드-절과-중첩-평탄화)

## 작게, 한 가지만

함수가 하는 일을 "그리고(and)" 없이 한 문장으로 말할 수 없다면 여러 일을 하는 것이다.

```typescript
// ✕ "요청을 검증하고 사용자를 만들고 이메일을 보내고 응답을 포맷한다"
async function register(req: Request) {
  if (!req.email.includes('@')) throw new Error('bad email');
  const hash = await bcrypt.hash(req.password, 10);
  const user = await db.users.insert({ email: req.email, hash });
  await mailer.send(user.email, 'Welcome');
  return { id: user.id, email: user.email };
}

// ○ 최상위 함수는 단계의 "목차"만 읽힌다
async function register(req: RegisterDto): Promise<UserView> {
  const credentials = await hashCredentials(req);
  const user = await userRepository.create(credentials);
  await welcomeMailer.send(user);
  return toUserView(user);
}
```

각 하위 함수는 독립적으로 테스트·재사용 가능하고, `register`를 읽는 사람은 세부 구현에 빠지지 않고 흐름을 파악한다.

## 단일 추상화 레벨

한 함수 안에서 **고수준 개념과 저수준 세부**가 섞이면 독자의 시선이 위아래로 튄다.

```typescript
// ✕ 고수준(주문 처리)과 저수준(문자열 포맷·비트 연산)이 한 곳에
function renderReceipt(order: Order): string {
  const lines = order.items.map((i) => `${i.name.padEnd(20)} ${i.price}`);
  const total = order.items.reduce((s, i) => s + i.price, 0);
  return lines.join('\n') + '\n' + '-'.repeat(21) + `\nTOTAL ${total}`;
}

// ○ 각 레벨을 함수로 분리 — renderReceipt는 "무엇을", 하위는 "어떻게"
function renderReceipt(order: Order): string {
  return [renderLines(order.items), renderDivider(), renderTotal(order)].join('\n');
}
```

**신문 은유:** 파일을 위에서 아래로 읽으면 고수준→저수준으로 자연스럽게 내려가도록 함수를 배치한다(호출하는 함수를 호출되는 함수보다 위에).

## 인자 다루기

- **개수는 적을수록 좋다.** 0~2개가 이상적, 3개는 상한. 그 이상은 **파라미터 객체**로 묶는다.

```typescript
// ✕ 순서를 외워야 하고 boolean이 무슨 뜻인지 호출부에서 안 보인다
createUser('kim', 'kim@x.com', true, false, 30);

// ○ 이름 있는 필드 — 호출부가 자기설명적
createUser({ name: 'kim', email: 'kim@x.com', isAdmin: true, isVerified: false, ageDays: 30 });
```

- **불리언 인자는 함수가 두 갈래 일을 한다는 신호.** `render(true)`보다 `renderExpanded()` / `renderCollapsed()`로 나누는 편이 명확하다.
- **출력 인자(인자를 변형해 결과를 되돌려받기)를 피한다.** 반환값으로 돌려준다. `appendTo(list, item)`가 `list`를 변형하면 놀랍다 → 새 배열을 반환하거나 메서드로 만든다.
- 인자 순서에 자연스러운 관례가 있으면 따른다(`copy(source, destination)`처럼).

## 부수효과와 명령-조회 분리

**명령-조회 분리(CQS):** 함수는 상태를 바꾸거나(command) 값을 반환하거나(query) 둘 중 하나만 한다.

```typescript
// ✕ 조회처럼 생겼는데 몰래 상태를 바꾼다 (숨은 부수효과)
function getUser(id: string): User {
  const user = cache.get(id) ?? db.load(id);
  cache.set(id, user);          // 부수효과가 이름에 없다
  lastAccessed = Date.now();    // 또 다른 부수효과
  return user;
}

// ○ 조회는 순수하게, 상태 변경은 이름이 드러나는 명령으로
function findUser(id: string): User | null { return cache.get(id) ?? null; }
function loadAndCacheUser(id: string): User { /* ... */ }
```

- 함수 이름이 약속하지 않은 일(전역 변경, I/O, 로깅 외 부수효과)을 하지 않는다.
- 순수 함수(같은 입력 → 같은 출력, 부수효과 없음)를 기본으로 하고, 부수효과는 **경계로 밀어낸다**(가장자리에서만 DB/네트워크를 만진다).

## 가드 절과 중첩 평탄화

깊은 중첩은 인지 부하의 주범이다. **예외·조기 종료 케이스를 함수 앞부분에서 처리하고 반환**하면, 핵심 경로가 들여쓰기 없이 평탄해진다.

```typescript
// ✕ 화살표 모양 — 핵심 로직이 3단계 안쪽에
function process(order: Order | null): Result {
  if (order) {
    if (order.isPaid) {
      if (order.items.length > 0) {
        return ship(order);
      } else {
        return fail('empty');
      }
    } else {
      return fail('unpaid');
    }
  } else {
    return fail('no order');
  }
}

// ○ 가드 절로 실패를 먼저 걷어냄 — 성공 경로가 마지막에 평탄하게
function process(order: Order | null): Result {
  if (!order) return fail('no order');
  if (!order.isPaid) return fail('unpaid');
  if (order.items.length === 0) return fail('empty');
  return ship(order);
}
```

- 중첩이 여전히 깊으면 **안쪽 블록을 함수로 추출**한다.
- `else`는 종종 불필요하다. `if`에서 반환하면 뒤 코드가 자연스럽게 else 역할을 한다.
- 반복문 안의 복잡한 분기는 `continue`/`break` 가드로 평탄화한다.
