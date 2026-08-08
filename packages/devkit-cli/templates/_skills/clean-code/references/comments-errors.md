# 주석과 에러 처리

주석과 에러 처리는 "정상 경로가 아닌 것"을 다루는 코드다. 둘 다 **핵심 로직을 흐리지 않으면서, 필요한 정보만 명확히** 남기는 게 목표다.

## 목차
- [주석: why를 남긴다](#주석-why를-남긴다)
- [나쁜 주석 유형](#나쁜-주석-유형)
- [좋은 주석 유형](#좋은-주석-유형)
- [에러를 삼키지 않는다](#에러를-삼키지-않는다)
- [예외 vs Result 타입](#예외-vs-result-타입)
- [null/부재 다루기](#null부재-다루기)
- [NestJS 예외 연계](#nestjs-예외-연계)

## 주석: why를 남긴다

**코드는 what을, 주석은 why를 말한다.** 코드가 스스로 설명하도록 이름과 구조를 먼저 고치고, 그래도 남는 배경 지식만 주석으로 남긴다. 주석은 유지보수되지 않으면 거짓말이 되므로, **적을수록 좋고 있으면 정확해야** 한다.

```typescript
// ✕ 코드를 번역한 주석 — 코드가 바뀌면 거짓이 된다
i++; // i를 1 증가

// ○ 코드로는 알 수 없는 이유
// Safari는 0ms setTimeout을 즉시 실행하지 않아 최소 4ms를 준다 (WebKit 버그 #12345)
setTimeout(flush, 4);
```

## 나쁜 주석 유형

| 유형 | 예 | 왜 나쁜가 |
|------|-----|-----------|
| 중복 주석 | `// 이름을 반환` 위의 `return name` | 코드가 이미 말함 |
| 주석 처리된 코드 | `// const old = ...` | 버전 관리가 할 일. 지운다 |
| 이력 주석 | `// 2024-01 김 수정` | git blame이 함 |
| 변명 주석 | `// 이건 좀 이상하지만 돌아감` | 이상하면 고친다 |
| 잡음 주석 | `/** 생성자 */ constructor()` | 정보 0 |
| 이름 대체 주석 | `const d; // 만료일` | 이름을 `expiryDate`로 |

## 좋은 주석 유형

- **의도/배경 설명**: 왜 이 방식인지, 어떤 트레이드오프를 택했는지.
- **경고**: `// 이 순서를 바꾸면 데드락` 같은 함정.
- **결과 증폭**: 사소해 보이지만 중요한 결정(`// 반올림하지 않음: 회계 감사 요구사항`).
- **TODO/FIXME**: 티켓 링크와 함께. `// TODO(#421): 페이지네이션 추가`. 방치된 TODO는 부채이므로 주기적으로 청소.
- **공개 API의 JSDoc**: 라이브러리·공유 모듈의 계약. 내부 구현 함수엔 과한 JSDoc보다 좋은 이름.

## 에러를 삼키지 않는다

가장 위험한 안티패턴은 **조용한 실패**다. 에러를 잡고 아무것도 안 하면 버그가 프로덕션까지 침묵 속에 흘러간다.

```typescript
// ✕ 삼킴 — 무엇이 왜 실패했는지 영영 모른다
try {
  await chargeCard(order);
} catch {}

// ✕ 로그만 찍고 정상인 척 — 호출자는 성공했다고 믿는다
try { await chargeCard(order); } catch (e) { console.log(e); }

// ○ 복구 가능하면 의미 있게 처리, 아니면 문맥을 붙여 다시 던진다
try {
  await chargeCard(order);
} catch (err) {
  throw new PaymentError(`결제 실패 order=${order.id}`, { cause: err });
}
```

- catch에서 **의식적으로 결정**한다: (1) 복구한다, (2) 대체값으로 진행한다, (3) 문맥을 더해 다시 던진다. "그냥 로그"는 대개 세 번째를 회피한 것.
- 잡을 거면 **구체적으로.** 광범위한 `catch (e)`로 예상 못 한 에러까지 삼키지 않는다.

## 예외 vs Result 타입

| 상황 | 선택 |
|------|------|
| **예외적·복구 불가** (DB 다운, 프로그래밍 오류) | `throw` 예외 |
| **예상된 실패가 흔하고 호출자가 반드시 분기** (검증 실패, 조회 없음) | `Result`/유니온 반환 |
| 도메인 규칙 위반 | 커스텀 도메인 예외 |

```typescript
// 예상된 실패를 타입으로 강제 — 호출자가 성공/실패를 반드시 다루게 된다
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parseAmount(input: string): Result<number, 'NOT_A_NUMBER' | 'NEGATIVE'> {
  const n = Number(input);
  if (Number.isNaN(n)) return { ok: false, error: 'NOT_A_NUMBER' };
  if (n < 0) return { ok: false, error: 'NEGATIVE' };
  return { ok: true, value: n };
}
```

Result 타입 설계(discriminated union) 자체는 typescript-patterns 참조.

## null/부재 다루기

- **null을 반환하지도, 인자로 받지도 않으려 노력**한다. 컬렉션은 `null` 대신 **빈 배열**을 반환한다(호출자가 매번 null 체크할 필요 없음).
- 부재가 정상이면 `T | null`을 명시하고 옵셔널 체이닝(`?.`)·널 병합(`??`)으로 다룬다. 부재가 비정상이면 예외.
- `!`(non-null assertion)로 타입을 억지로 우기지 않는다 — 실제로 null일 수 있으면 런타임에 터진다.

## NestJS 예외 연계

NestJS에서는 도메인/서비스 계층에서 **의미 있는 예외를 던지고**, 전역 **예외 필터**가 HTTP 응답으로 변환하게 한다(관심사 분리).

```typescript
// 서비스: 도메인 언어로 던진다 (HTTP를 모른다)
if (!order) throw new OrderNotFoundError(id);

// 예외 필터: 도메인 예외 → HTTP 상태 매핑을 한 곳에서
@Catch(OrderNotFoundError)
export class OrderExceptionFilter implements ExceptionFilter {
  catch(err: OrderNotFoundError, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(404).json({ message: err.message });
  }
}
```

예외 필터 설정·계층별 예외 설계 상세는 nestjs-error-handling 스킬 참조. 여기서는 **"서비스는 도메인 예외, 변환은 필터"** 라는 분리 원칙만 기억한다.
