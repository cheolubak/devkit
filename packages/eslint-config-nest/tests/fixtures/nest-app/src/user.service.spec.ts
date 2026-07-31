// Nest 테스트 파일의 관용구를 jest 없이 재현한다. 핵심은 언바운드
// 메서드 참조를 단언 함수에 넘기는 패턴으로, unbound-method가 여기서
// 발화하는지 측정하기 위한 것이다. 설계 4.4 참조.
import { UserRepository, UserService } from './idioms';

declare function expectCalled(received: unknown): void;
declare function describeBlock(name: string, body: () => void): void;
declare function itBlock(name: string, body: () => Promise<void>): void;

describeBlock('UserService', () => {
  itBlock('사용자를 조회한다', async () => {
    const service = new UserService(new UserRepository());
    const user = await service.getUser('1');

    // 언바운드 메서드 참조 — jest의 expect(service.getUser) 패턴과 같은 형태
    expectCalled(service.getUser);
    expectCalled(user);
  });
});
