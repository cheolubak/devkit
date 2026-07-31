// 프로덕션 파일에서 언바운드 메서드 참조. nest/test-idioms 완화가
// spec 파일 밖으로 새면 이 파일에서 unbound-method가 사라진다.
import { UserService } from './idioms';

declare function register(handler: unknown): void;

export function wire(service: UserService): void {
  register(service.getUser);
}
