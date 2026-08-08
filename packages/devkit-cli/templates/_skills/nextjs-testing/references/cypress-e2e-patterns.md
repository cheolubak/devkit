# Cypress E2E 테스트 패턴

### 페이지 네비게이션

```typescript
// cypress/e2e/navigation.cy.ts
describe('Navigation', () => {
  it('should navigate between pages', () => {
    cy.visit('/');

    cy.contains('상품').click();
    cy.url().should('include', '/products');
    cy.get('h1').should('contain', '상품 목록');

    cy.contains('회사 소개').click();
    cy.url().should('include', '/about');
  });

  it('should show 404 for unknown routes', () => {
    cy.visit('/unknown-page', { failOnStatusCode: false });
    cy.contains('페이지를 찾을 수 없습니다').should('be.visible');
  });
});
```

### 폼 제출 플로우

```typescript
// cypress/e2e/contact.cy.ts
describe('Contact Form', () => {
  beforeEach(() => {
    cy.visit('/contact');
  });

  it('should submit form successfully', () => {
    cy.intercept('POST', '/api/contact', {
      statusCode: 200,
      body: { success: true },
    }).as('submitContact');

    cy.get('input[name="name"]').type('홍길동');
    cy.get('input[name="email"]').type('hong@test.com');
    cy.get('textarea[name="message"]').type('문의 내용입니다.');
    cy.get('button[type="submit"]').click();

    cy.wait('@submitContact');
    cy.contains('문의가 접수되었습니다').should('be.visible');
  });

  it('should show validation errors on empty submit', () => {
    cy.get('button[type="submit"]').click();
    cy.get('[data-testid="error-name"]').should('be.visible');
    cy.get('[data-testid="error-email"]').should('be.visible');
  });
});
```

### 인증 플로우

```typescript
// cypress/e2e/auth.cy.ts
describe('Authentication', () => {
  it('should login and access dashboard', () => {
    cy.visit('/login');

    cy.get('input[name="email"]').type('admin@test.com');
    cy.get('input[name="password"]').type('P@ssw0rd!');
    cy.get('button[type="submit"]').click();

    cy.url().should('include', '/dashboard');
    cy.contains('대시보드').should('be.visible');
  });

  it('should redirect unauthenticated users to login', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });

  it('should logout', () => {
    // 세션 캐싱으로 빠른 로그인
    cy.session('admin', () => {
      cy.visit('/login');
      cy.get('input[name="email"]').type('admin@test.com');
      cy.get('input[name="password"]').type('P@ssw0rd!');
      cy.get('button[type="submit"]').click();
      cy.url().should('include', '/dashboard');
    });

    cy.visit('/dashboard');
    cy.get('[data-testid="logout-button"]').click();
    cy.url().should('include', '/login');
  });
});
```

### API 인터셉트/스텁

```typescript
// cypress/e2e/products.cy.ts
describe('Products Page', () => {
  beforeEach(() => {
    // API 응답 스텁
    cy.intercept('GET', '/api/products*', {
      fixture: 'products.json',
    }).as('getProducts');

    cy.visit('/products');
    cy.wait('@getProducts');
  });

  it('should display product list', () => {
    cy.get('[data-testid="product-card"]').should('have.length.greaterThan', 0);
  });

  it('should filter products by search', () => {
    cy.intercept('GET', '/api/products?search=키보드*', {
      body: [{ id: '1', name: '기계식 키보드', price: 89000 }],
    }).as('searchProducts');

    cy.get('input[placeholder="검색"]').type('키보드');
    cy.wait('@searchProducts');

    cy.get('[data-testid="product-card"]').should('have.length', 1);
    cy.contains('기계식 키보드').should('be.visible');
  });

  it('should handle API error', () => {
    cy.intercept('GET', '/api/products*', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('getProductsError');

    cy.visit('/products');
    cy.wait('@getProductsError');

    cy.contains('오류가 발생했습니다').should('be.visible');
  });

  it('should add product to cart', () => {
    cy.intercept('POST', '/api/cart', {
      statusCode: 200,
      body: { success: true },
    }).as('addToCart');

    cy.get('[data-testid="product-card"]').first().within(() => {
      cy.contains('장바구니').click();
    });

    cy.wait('@addToCart');
    cy.contains('장바구니에 추가되었습니다').should('be.visible');
  });
});
```
