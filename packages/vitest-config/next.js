import { configDefaults } from 'vitest/config';

/**
 * Next.js 앱용 Vitest 설정.
 *
 * `include`는 소비자 루트 전체를 훑는다. `src/**`로 좁혔더니 `components/`·
 * `lib/`에 테스트를 둔 기존 프로젝트에서 수집이 통째로 비었고, 아래
 * `passWithNoTests`가 그 상태를 초록불로 보고했다 — 실패가 아니라 **침묵**으로
 * 나타나는 최악의 조합이었다(my-blogs 실측: 테스트 30개 중 29개 누락).
 * FSD를 쓰든 안 쓰든 테스트가 어디 있든 잡히는 쪽이 안전하다.
 *
 * `exclude`는 vitest 기본값을 **대체**하지 코트에 얹지 않는다. 손으로 적으면
 * `node_modules/**` 같은 기본 제외가 조용히 사라지므로 `configDefaults`를
 * 펴고 Next 산출물만 더한다.
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
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/.next/**', '**/out/**', '**/coverage/**'],
    passWithNoTests: true,
  },
};
