/**
 * NestJS e2e 테스트용 Jest 설정.
 *
 * rootDir이 '.'인 것은 이 설정이 프로젝트 루트에서 참조되기 때문이다.
 * nest new의 test/jest-e2e.json은 그 파일 위치를 기준으로 '.'을 썼으나,
 * 여기서는 소비자가 루트의 jest-e2e.config.js에서 참조하므로 동일하게 '.'이다.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
