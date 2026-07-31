// Nest 관용구를 의존성 없이 재현한다. 데코레이터의 출처는 규칙 판정에
// 영향을 주지 않으므로 @nestjs/* 를 설치하지 않는다.
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
