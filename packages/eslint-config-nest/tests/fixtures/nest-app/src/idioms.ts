// 실제 Nest 코드가 하는 일만 담는다: 데코레이터를 소비하고, 생성자
// 주입을 쓰고, 서비스·컨트롤러·모듈을 선언한다.
import { Controller, Get, Injectable, Module } from './decorator-stubs';

export interface User {
  id: string;
  name: string;
}

@Injectable()
export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return await Promise.resolve({ id, name: 'test' });
  }
}

@Injectable()
export class UserService {
  // 생성자 파라미터 프로퍼티 — Nest DI의 표준 형태
  constructor(private readonly repo: UserRepository) {}

  async getUser(id: string): Promise<User | null> {
    return await this.repo.findById(id);
  }
}

@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get()
  async list(): Promise<User[]> {
    const user = await this.service.getUser('1');
    return user === null ? [] : [user];
  }
}

// 데코레이터만 있는 빈 클래스 — Nest 모듈의 표준 형태
@Module({ providers: [UserService, UserRepository] })
export class UserModule {}
