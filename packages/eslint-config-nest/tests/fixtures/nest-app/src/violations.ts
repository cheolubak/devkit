import type { UserService } from './idioms';

export class BadService {
  constructor(private readonly service: UserService) {}

  // await 누락 — no-floating-promises가 잡아야 한다.
  // Nest에서 가장 빈번한 사고이며 컴파일은 통과한다.
  run(): void {
    this.service.getUser('1');
  }
}
