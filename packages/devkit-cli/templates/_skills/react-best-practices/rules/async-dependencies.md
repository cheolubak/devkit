---
title: 의존성 기반 병렬화
impact: CRITICAL
impactDescription: 2-10배 개선
tags: async, parallelization, dependencies, better-all
---

## 의존성 기반 병렬화

부분적인 의존성이 있는 작업의 경우, `better-all`을 사용하여 병렬성을 최대화하세요. 각 작업을 가능한 가장 빠른 시점에 자동으로 시작합니다.

**잘못된 예 (profile이 불필요하게 config를 기다림):**

```typescript
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
const profile = await fetchProfile(user.id)
```

**올바른 예 (config와 profile이 병렬로 실행):**

```typescript
import { all } from 'better-all'

const { user, config, profile } = await all({
  async user() { return fetchUser() },
  async config() { return fetchConfig() },
  async profile() {
    return fetchProfile((await this.$.user).id)
  }
})
```

**추가 의존성 없는 대안:**

모든 프로미스를 먼저 생성하고 마지막에 `Promise.all()`을 수행할 수도 있습니다.

```typescript
const userPromise = fetchUser()
const profilePromise = userPromise.then(user => fetchProfile(user.id))

const [user, config, profile] = await Promise.all([
  userPromise,
  fetchConfig(),
  profilePromise
])
```

참고: [https://github.com/shuding/better-all](https://github.com/shuding/better-all)
