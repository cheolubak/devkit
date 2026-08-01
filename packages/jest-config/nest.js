/**
 * NestJS 유닛 테스트용 Jest 설정.
 *
 * rootDir이 'src'인 것은 nest new의 기본값을 그대로 따른 것이다.
 * 소비자는 이 객체를 spread해 덮어쓸 수 있다.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
