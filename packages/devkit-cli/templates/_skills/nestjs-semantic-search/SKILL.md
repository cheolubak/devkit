---
name: nestjs-semantic-search
description: "NestJS PostgreSQL 시맨틱 검색.\nAPPLIES: pgvector·임베딩·유사도 검색·RAG를 NestJS에서 구현할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"시맨틱 검색\", \"벡터 검색\", \"pgvector\", \"임베딩\", \"RAG\", \"유사도 검색\", \"semantic search\", \"vector search\", \"AI 검색\", \"자연어 검색\", NestJS에서 벡터/시맨틱 검색 구현 시.\nSKIP: 일반 SQL 쿼리/풀텍스트 검색은 nestjs-database."
---

> 참조:
> - [references/typeorm-pgvector-rag.md](references/typeorm-pgvector-rag.md) - TypeORM + pgvector 문서 임베딩·시맨틱 검색·RAG 전체 구현 (Ollama)
> - [references/prisma-pgvector-search.md](references/prisma-pgvector-search.md) - Prisma + pgvector 벡터·하이브리드 검색·RAG 전체 구현 (Ollama)

# NestJS PostgreSQL Semantic Search (pgvector)

## 개요

PostgreSQL의 pgvector 확장을 사용하여 NestJS에서 시맨틱 검색(벡터 유사도 검색)을 구현하는 패턴. Ollama(로컬 무료)로 텍스트를 벡터로 변환하고, pgvector로 유사도 검색을 수행한다.

## 핵심 구성요소

1. **pgvector 확장** — PostgreSQL 벡터 타입 및 유사도 연산자
2. **Embedding Service** — 텍스트 → 벡터 변환 (Ollama 로컬 서버)
3. **Vector Entity/Model** — 벡터 컬럼을 포함하는 DB 모델
4. **Search Service** — 유사도 검색 + 하이브리드 검색 로직
5. **인덱스** — HNSW 또는 IVFFlat으로 검색 성능 최적화

## 임베딩 제공자 비교 (무료)

| 방식 | 모델 | 차원 | 특징 |
|------|------|------|------|
| **Ollama** (권장) | `nomic-embed-text` | 768 | 로컬 서버, HTTP API, 빠름 |
| Ollama | `all-minilm` | 384 | 경량, 빠름, 품질 보통 |
| Ollama | `mxbai-embed-large` | 1024 | 고품질, 느림 |
| Transformers.js | `all-MiniLM-L6-v2` | 384 | 서버 불필요, Node.js 내장 |

## 사전 요구사항

```bash
# Ollama 설치 (macOS)
brew install ollama
ollama serve          # 서버 시작 (기본 http://localhost:11434)
ollama pull nomic-embed-text   # 임베딩 모델 다운로드
ollama pull llama3.2           # RAG용 LLM 모델 (선택)

# NestJS 패키지 (TypeORM 사용 시)
pnpm add @nestjs/typeorm typeorm pg

# NestJS 패키지 (Prisma 사용 시)
pnpm add @prisma/client
pnpm add -D prisma
```

PostgreSQL에 pgvector 확장 설치:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Part 1: Embedding Service (Ollama)

```typescript
// src/embedding/embedding.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  readonly dimensions: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = this.configService.get('EMBEDDING_MODEL', 'nomic-embed-text');
    this.dimensions = this.configService.get('EMBEDDING_DIMENSIONS', 768);
  }

  async onModuleInit() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama 서버 응답 오류: ${res.status}`);
      this.logger.log(`Ollama 연결 확인 (${this.baseUrl}), 모델: ${this.model}`);
    } catch (e) {
      this.logger.warn(`Ollama 서버에 연결할 수 없습니다: ${this.baseUrl}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const input = text.replace(/\n/g, ' ').trim();
    if (!input) return [];

    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input }),
    });

    if (!res.ok) {
      throw new Error(`Ollama 임베딩 오류: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const inputs = texts.map((t) => t.replace(/\n/g, ' ').trim());

    // Ollama /api/embed는 배열 input을 지원
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: inputs }),
    });

    if (!res.ok) {
      throw new Error(`Ollama 배치 임베딩 오류: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.embeddings;
  }
}
```

```typescript
// src/embedding/embedding.module.ts
import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

@Global()
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
```

---

## Part 2: TypeORM 패턴

### Entity

```typescript
// src/document/entities/document.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ type: 'vector', nullable: true })
  embedding: string; // pgvector는 문자열 '[0.1,0.2,...]' 형태로 저장/조회

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Migration (pgvector 초기화 + HNSW 인덱스)

```typescript
// src/database/migrations/XXXXXX-CreateDocumentTable.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentTable implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // HNSW 인덱스 (코사인 유사도)
    await queryRunner.query(`
      CREATE INDEX idx_documents_embedding
      ON documents USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS documents`);
  }
}
```

### Search Repository

```typescript
// src/document/document.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Document } from './entities/document.entity';

export interface SearchResult {
  document: Document;
  similarity: number;
}

@Injectable()
export class DocumentRepository extends Repository<Document> {
  constructor(private dataSource: DataSource) {
    super(Document, dataSource.createEntityManager());
  }

  /** 코사인 유사도 검색 */
  async searchByVector(
    embedding: number[],
    limit = 10,
    threshold = 0.7,
  ): Promise<SearchResult[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.createQueryBuilder('doc')
      .select('doc')
      .addSelect(`1 - (doc.embedding <=> :embedding)`, 'similarity')
      .where(`1 - (doc.embedding <=> :embedding) >= :threshold`)
      .setParameters({ embedding: vectorStr, threshold })
      .orderBy('similarity', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return results.entities.map((entity, i) => ({
      document: entity,
      similarity: parseFloat(results.raw[i].similarity),
    }));
  }

  /** 하이브리드 검색: 벡터 유사도 + 키워드 매칭 */
  async hybridSearch(params: {
    embedding: number[];
    keyword?: string;
    limit?: number;
    vectorWeight?: number;
  }): Promise<SearchResult[]> {
    const { embedding, keyword, limit = 10, vectorWeight = 0.7 } = params;
    const textWeight = 1 - vectorWeight;
    const vectorStr = `[${embedding.join(',')}]`;

    let qb = this.createQueryBuilder('doc');

    if (keyword) {
      qb = qb.addSelect(
        `(
          :vectorWeight * (1 - (doc.embedding <=> :embedding)) +
          :textWeight * ts_rank(to_tsvector('simple', doc.content), plainto_tsquery('simple', :keyword))
        )`,
        'score',
      );
      qb = qb.where(`doc.embedding IS NOT NULL`);
      qb = qb.setParameters({ embedding: vectorStr, keyword, vectorWeight, textWeight });
    } else {
      qb = qb.addSelect(`1 - (doc.embedding <=> :embedding)`, 'score');
      qb = qb.where(`doc.embedding IS NOT NULL`);
      qb = qb.setParameters({ embedding: vectorStr });
    }

    const results = await qb
      .orderBy('score', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return results.entities.map((entity, i) => ({
      document: entity,
      similarity: parseFloat(results.raw[i].score),
    }));
  }
}
```

---

## Part 3: Prisma 패턴

### Schema

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

model Document {
  id        String   @id @default(uuid())
  title     String
  content   String
  embedding Unsupported("vector(768)")?
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("documents")
}
```

### Prisma 벡터 검색 (Raw Query)

```typescript
// src/document/document.service.ts (Prisma)
@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  async search(query: string, limit = 10, threshold = 0.7) {
    const embedding = await this.embeddingService.generateEmbedding(query);
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; content: string; metadata: any; similarity: number }>
    >`
      SELECT id, title, content, metadata,
             1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM documents
      WHERE embedding IS NOT NULL
        AND embedding <=> ${vectorStr}::vector <= ${1 - threshold}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;

    return results;
  }
}
```

---

## Part 4: 서비스 통합

### Document Service (TypeORM 기준)

```typescript
// src/document/document.service.ts
@Injectable()
export class DocumentService {
  constructor(
    private documentRepo: DocumentRepository,
    private embeddingService: EmbeddingService,
  ) {}

  async create(dto: CreateDocumentDto) {
    const embedding = await this.embeddingService.generateEmbedding(
      `${dto.title}\n${dto.content}`,
    );

    const doc = this.documentRepo.create({
      title: dto.title,
      content: dto.content,
      embedding: `[${embedding.join(',')}]`,
      metadata: dto.metadata,
    });

    return this.documentRepo.save(doc);
  }

  async search(query: string, limit = 10) {
    const embedding = await this.embeddingService.generateEmbedding(query);
    return this.documentRepo.searchByVector(embedding, limit);
  }

  async hybridSearch(query: string, limit = 10) {
    const embedding = await this.embeddingService.generateEmbedding(query);
    return this.documentRepo.hybridSearch({
      embedding,
      keyword: query,
      limit,
    });
  }

  /** 기존 문서의 임베딩 일괄 생성 */
  async backfillEmbeddings(batchSize = 100) {
    const docs = await this.documentRepo.find({
      where: { embedding: null as any },
      take: batchSize,
    });

    if (docs.length === 0) return 0;

    const texts = docs.map((d) => `${d.title}\n${d.content}`);
    const embeddings = await this.embeddingService.generateEmbeddings(texts);

    for (let i = 0; i < docs.length; i++) {
      docs[i].embedding = `[${embeddings[i].join(',')}]`;
    }

    await this.documentRepo.save(docs);
    return docs.length;
  }
}
```

### Controller

```typescript
// src/document/document.controller.ts
@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private documentService: DocumentService) {}

  @Post()
  @ApiOperation({ summary: '문서 생성 (임베딩 자동 생성)' })
  create(@Body() dto: CreateDocumentDto) {
    return this.documentService.create(dto);
  }

  @Get('search')
  @ApiOperation({ summary: '시맨틱 검색' })
  @ApiQuery({ name: 'q', description: '검색 쿼리' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Query('q') query: string, @Query('limit') limit?: number) {
    return this.documentService.search(query, limit);
  }

  @Get('hybrid-search')
  @ApiOperation({ summary: '하이브리드 검색 (벡터 + 키워드)' })
  hybridSearch(@Query('q') query: string, @Query('limit') limit?: number) {
    return this.documentService.hybridSearch(query, limit);
  }
}
```

---

## pgvector 연산자 및 인덱스

> **정렬은 반드시 거리 연산자 오름차순으로 한다.** HNSW·IVFFlat 인덱스는 `ORDER BY embedding <=> $vec`(ASC) 형태에만 적용된다. `1 - (embedding <=> $vec) AS similarity`를 만들어 `ORDER BY similarity DESC`로 정렬하면 **인덱스를 타지 못하고 전건 스캔**이 된다 — 결과는 같아서 눈에 띄지 않고, 데이터가 늘어난 뒤에야 느려진다. 유사도(0~1)가 필요하면 정렬은 거리로 하고 `1 - distance` 변환은 SELECT 목록이나 애플리케이션에서 한다. 임계값도 `similarity >= t` 대신 `distance <= 1 - t`로 뒤집어 쓴다.

| 연산자 | 의미 | 인덱스 ops 클래스 |
|--------|------|-------------------|
| `<=>` | 코사인 거리 | `vector_cosine_ops` |
| `<->` | L2 (유클리드) 거리 | `vector_l2_ops` |
| `<#>` | 내적 (음수) | `vector_ip_ops` |

### 인덱스 전략

```sql
-- HNSW (권장: 높은 recall, 빠른 검색)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat (대용량 데이터, 빌드 빠름)
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- rows / 1000 ~ sqrt(rows)
```

| | HNSW | IVFFlat |
|---|------|---------|
| **빌드 속도** | 느림 | 빠름 |
| **검색 품질** | 높음 | 보통 |
| **메모리** | 높음 | 보통 |
| **추천** | 100만 건 이하 | 대용량 |

---

## 환경변수

```env
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
OLLAMA_LLM_MODEL=llama3.2
```

## 체크리스트

- [ ] Ollama 설치 및 서버 실행 확인 (`ollama serve`)
- [ ] 임베딩 모델 다운로드 (`ollama pull nomic-embed-text`)
- [ ] PostgreSQL에 pgvector 확장 설치 확인
- [ ] 임베딩 차원 수가 모델과 일치하는지 확인 (`nomic-embed-text`: 768)
- [ ] HNSW 또는 IVFFlat 인덱스 생성
- [ ] 임베딩 생성 실패 시 retry/fallback 처리
- [ ] 검색 결과 threshold 튜닝 (0.7이 일반적 시작점)
- [ ] Prisma 사용 시 `Unsupported` 타입이므로 raw query 필수
- [ ] 프로덕션 배포 시 Ollama GPU 서버 별도 구성 고려

## 참고

- `nestjs-database` 스킬: TypeORM/Prisma 기본 설정
- `nestjs-config` 스킬: 환경변수 관리
- `nestjs-error-handling` 스킬: 외부 서비스 에러 처리
