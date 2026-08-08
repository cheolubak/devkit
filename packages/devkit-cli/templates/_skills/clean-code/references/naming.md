# 네이밍: 의도를 드러내는 이름

이름은 코드에서 가장 자주 읽히는 인터페이스다. 잘 지은 이름은 주석을 없애고, 못 지은 이름은 매번 정의로 점프하게 만든다.

## 목차
- [의도를 드러내는 이름](#의도를-드러내는-이름)
- [검색 가능성과 매직 값](#검색-가능성과-매직-값)
- [불리언·함수·값의 품사 규칙](#불리언함수값의-품사-규칙)
- [일관된 어휘](#일관된-어휘)
- [도메인 용어 우선](#도메인-용어-우선)
- [흔한 안티패턴](#흔한-안티패턴)

## 의도를 드러내는 이름

이름은 **왜 존재하는가, 무엇을 하는가, 어떻게 쓰는가**에 답해야 한다.

```typescript
// ✕ 맥락이 이름 밖에 있다
const list = data.filter((x) => x[3] === 1);

// ○ 이름이 도메인을 말한다
const OPEN_STATUS = 1;
const openTickets = tickets.filter((ticket) => ticket.status === OPEN_STATUS);
```

- **정신적 매핑을 강요하지 않는다.** `x`, `tmp`, `e2`처럼 독자가 "이게 뭐였지" 하고 번역해야 하는 이름은 피한다. 반복 변수 `i`는 짧은 루프에서만 허용.
- 길이는 **스코프에 비례**한다. 3줄짜리 화살표 함수의 `u`는 괜찮지만, 파일 전역 상태의 `u`는 죄악이다.

## 검색 가능성과 매직 값

숫자·문자열 리터럴이 코드에 흩어지면 의미도 없고 바꿀 때 전부 찾아야 한다. **명명 상수**로 올린다.

```typescript
// ✕
setTimeout(poll, 604800000);
if (user.role === 3) { /* ... */ }

// ○
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setTimeout(poll, ONE_WEEK_MS);

enum Role { Guest = 1, Member, Admin }
if (user.role === Role.Admin) { /* ... */ }
```

예외: `0`, `1`, `-1` 같은 자명한 값은 문맥상 명확하면 그대로 둔다(`arr.length - 1`).

## 불리언·함수·값의 품사 규칙

| 대상 | 규칙 | 예 |
|------|------|-----|
| 불리언 변수/속성 | `is/has/can/should/did` 접두 | `isActive`, `hasAccess`, `canEdit` |
| 부수효과 있는 함수 | 동사(구) | `sendEmail`, `revokeToken` |
| 값 반환 함수 | `get/fetch/compute/build` + 명사 | `getUserById`, `computeTotal` |
| 컬렉션 | 복수형 | `users`, `activeOrders` |
| 변환 함수 | `toX` / `fromX` | `toDTO`, `fromEntity` |

- 불리언 이름은 **긍정형**으로. `isNotReady`는 `!isReady`보다 읽기 나쁘다. 이중 부정(`!isNotReady`)은 금지.
- 이벤트 핸들러는 `handleX` / prop은 `onX` (`onClick` → `handleClick`).

## 일관된 어휘

한 개념에는 하나의 단어를 정해 프로젝트 전체에서 고수한다. `fetchUser`, `getUser`, `retrieveUser`, `loadUser`가 공존하면 독자는 이들이 다른 일을 한다고 의심하게 된다.

- 데이터 조회: `fetch`(원격) / `get`(로컬·계산) 중 하나로 규약을 정한다.
- 생성: `create` vs `make` vs `build` 중 하나.
- 삭제: `delete` vs `remove` vs `destroy` 중 하나.

반대로 **다른 개념에 같은 단어**를 재사용하지 않는다(`add`가 어떤 곳은 산술, 어떤 곳은 컬렉션 삽입이면 헷갈린다 → `sum` / `append`로 구분).

## 도메인 용어 우선

비즈니스가 쓰는 언어를 코드에 그대로 반영하면(유비쿼터스 언어) 기획·코드·대화가 한 어휘를 공유한다.

```typescript
// ✕ 일반 명사 — 도메인 지식이 코드에 없다
class DataProcessor { handle(items: Item[]) {} }

// ○ 도메인이 코드에 드러난다
class InvoiceIssuer { issue(lineItems: LineItem[]): Invoice {} }
```

기술 용어(`Repository`, `Controller`, `UseCase`)와 도메인 용어(`Invoice`, `Shipment`)를 조합하되, **도메인 명사를 기술 접미어로 덮지 않는다**(`InvoiceManager`보다 `InvoiceIssuer`가 하는 일이 분명).

## 흔한 안티패턴

| 안티패턴 | 문제 | 대안 |
|----------|------|------|
| `data`, `info`, `value`, `obj`, `item`(모호한 맥락) | 아무 의미도 없다 | 무엇의 데이터인지: `payload`, `userProfile` |
| `manager`, `processor`, `handler`, `helper`, `util` | 책임이 불명확한 잡동사니 신호 | 실제 동작으로: `PriceCalculator`, `EmailSender` |
| `flag`, `temp`, `foo` | 의도 없음 | `isDeleted`, `previousTotal` |
| `getData()`, `doWork()` | 무엇을 얻고 무슨 일을 하는지 없음 | `getInvoiceLines()`, `settlePayment()` |
| 헝가리안 표기(`strName`, `iCount`) | 타입은 컴파일러가 안다 | `name`, `count` |
| 접미 숫자(`user1`, `user2`) | 구분 근거가 없음 | `sender`, `recipient` |

> 좋은 이름은 한 번에 나오지 않는다. **처음엔 대충 짓고, 코드가 명확해진 뒤 다시 이름을 짓는다.** 이름 바꾸기는 IDE가 안전하게 해주는 가장 값싼 리팩터링이다.
