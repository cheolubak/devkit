---
title: localStorage 데이터 버전 관리 및 최소화
impact: MEDIUM
impactDescription: 스키마 충돌 방지, 저장 크기 감소
tags: client, localStorage, storage, versioning, data-minimization
---

## localStorage 데이터 버전 관리 및 최소화

키에 버전 접두사를 추가하고 필요한 필드만 저장하세요. 스키마 충돌과 민감한 데이터의 우발적 저장을 방지합니다.

**잘못된 예:**

```typescript
// 버전 없음, 모든 것을 저장, 에러 처리 없음
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))
const data = localStorage.getItem('userConfig')
```

**올바른 예:**

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // 시크릿/프라이빗 브라우징, 할당량 초과, 또는 비활성화 시 에러 발생
  }
}

function loadConfig() {
  try {
    const data = localStorage.getItem(`userConfig:${VERSION}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// v1에서 v2로 마이그레이션
function migrate() {
  try {
    const v1 = localStorage.getItem('userConfig:v1')
    if (v1) {
      const old = JSON.parse(v1)
      saveConfig({ theme: old.darkMode ? 'dark' : 'light', language: old.lang })
      localStorage.removeItem('userConfig:v1')
    }
  } catch {}
}
```

**서버 응답에서 최소한의 필드만 저장:**

```typescript
// User 객체에는 20개 이상의 필드가 있지만, UI에 필요한 것만 저장
function cachePrefs(user: FullUser) {
  try {
    localStorage.setItem('prefs:v1', JSON.stringify({
      theme: user.preferences.theme,
      notifications: user.preferences.notifications
    }))
  } catch {}
}
```

**항상 try-catch로 감싸세요:** `getItem()`과 `setItem()`은 시크릿/프라이빗 브라우징 (Safari, Firefox), 할당량 초과, 또는 비활성화 시 에러를 발생시킵니다.

**이점:** 버전 관리를 통한 스키마 진화, 저장 크기 감소, 토큰/PII/내부 플래그 저장 방지.
