// Nest 데코레이터를 의존성 없이 재현한 스텁. 데코레이터의 출처는 규칙
// 판정에 영향을 주지 않으므로 @nestjs/* 를 설치하지 않는다.
//
// 이 파일은 측정 대상이 아니다. 실제 Nest 코드는 데코레이터를 소비할 뿐
// 정의하지 않으므로, 여기서 나오는 발화(미사용 파라미터 등)는 스텁이
// 만들어낸 인공물이지 Nest 관용구가 아니다. 관용구 측정은 idioms.ts에서만
// 한다.
export function Injectable(): ClassDecorator {
  return () => undefined;
}

export function Module(_meta: { providers?: unknown[] }): ClassDecorator {
  return () => undefined;
}

export function Controller(_prefix: string): ClassDecorator {
  return () => undefined;
}

export function Get(): MethodDecorator {
  return () => undefined;
}
