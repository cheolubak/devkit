/**
 * Next.js 앱용 Vitest 설정.
 *
 * `passWithNoTests: true`는 의도적이다. create-next-app은 테스트를 하나도
 * 만들지 않으므로, 갓 생성된 프로젝트에서 `pnpm test`가 exit 1로 실패한다.
 * 이 저장소 루트도 같은 이유로 --passWithNoTests를 쓴다(work-log 2026-07-26).
 *
 * 단 이 플래그 때문에 devkit의 자가검증은 `pnpm test`를 돌리지 않는다
 * (설계 5.4절) — 실패를 감춘 상태를 통과로 읽지 않기 위해서다.
 */
export default {
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
};
