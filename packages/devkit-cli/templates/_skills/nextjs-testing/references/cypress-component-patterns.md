# Cypress 컴포넌트 테스트 패턴

### 기본 컴포넌트 마운트

```tsx
// cypress/component/button.cy.tsx
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('should render with text', () => {
    cy.mount(<Button>클릭</Button>);
    cy.contains('클릭').should('be.visible');
  });

  it('should apply variant classes', () => {
    cy.mount(<Button variant="destructive">삭제</Button>);
    cy.get('button').should('have.class', 'bg-destructive');
  });

  it('should be disabled', () => {
    cy.mount(<Button disabled>비활성</Button>);
    cy.get('button').should('be.disabled');
  });
});
```

### 인터랙션 + 콜백 검증

```tsx
// cypress/component/counter.cy.tsx
import { Counter } from '@/components/counter';

describe('Counter', () => {
  it('should call onChange when incremented', () => {
    const onChange = cy.stub().as('onChange');
    cy.mount(<Counter initialValue={0} onChange={onChange} />);

    cy.contains('+').click();

    cy.get('@onChange').should('have.been.calledWith', 1);
  });

  it('should display current count', () => {
    cy.mount(<Counter initialValue={5} />);
    cy.get('[data-testid="count"]').should('have.text', '5');
  });

  it('should not go below zero', () => {
    cy.mount(<Counter initialValue={0} />);
    cy.contains('-').click();
    cy.get('[data-testid="count"]').should('have.text', '0');
  });
});
```

### 폼 컴포넌트

```tsx
// cypress/component/login-form.cy.tsx
import { LoginForm } from '@/components/login-form';

describe('LoginForm', () => {
  it('should submit with valid credentials', () => {
    const onSubmit = cy.stub().as('onSubmit');
    cy.mount(<LoginForm onSubmit={onSubmit} />);

    cy.get('input[name="email"]').type('user@test.com');
    cy.get('input[name="password"]').type('P@ssw0rd!');
    cy.get('button[type="submit"]').click();

    cy.get('@onSubmit').should('have.been.calledOnce');
  });

  it('should show validation errors', () => {
    cy.mount(<LoginForm onSubmit={cy.stub()} />);

    cy.get('button[type="submit"]').click();

    cy.contains('이메일을 입력해주세요').should('be.visible');
    cy.contains('비밀번호를 입력해주세요').should('be.visible');
  });

  it('should toggle password visibility', () => {
    cy.mount(<LoginForm onSubmit={cy.stub()} />);

    cy.get('input[name="password"]').should('have.attr', 'type', 'password');
    cy.get('[data-testid="toggle-password"]').click();
    cy.get('input[name="password"]').should('have.attr', 'type', 'text');
  });
});
```

### Next.js 기능 포함 컴포넌트

```tsx
// cypress/component/product-card.cy.tsx
import { ProductCard } from '@/components/product-card';

// next/image와 next/link는 Cypress 컴포넌트 테스트에서 자동으로 처리됨
// (framework: 'next' 설정 시)

describe('ProductCard', () => {
  const product = {
    id: '1',
    name: '테스트 상품',
    price: 15000,
    image: '/products/test.jpg',
    href: '/products/1',
  };

  it('should render product info', () => {
    cy.mount(<ProductCard {...product} />);

    cy.contains('테스트 상품').should('be.visible');
    cy.contains('₩15,000').should('be.visible');
    cy.get('img').should('have.attr', 'src').and('include', 'test.jpg');
  });

  it('should link to product page', () => {
    cy.mount(<ProductCard {...product} />);
    cy.get('a').should('have.attr', 'href', '/products/1');
  });
});
```
