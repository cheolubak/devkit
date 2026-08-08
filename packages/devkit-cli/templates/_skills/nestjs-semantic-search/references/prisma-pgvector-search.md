# Prisma + pgvector 시맨틱 검색 패턴 (Ollama)

Prisma 기반 pgvector 설정, 벡터 검색, 하이브리드 검색, RAG 완전한 구현 예시. Ollama를 사용하여 모든 AI 연산을 로컬에서 무료로 수행한다.

## Schema

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

model KnowledgeSource {
  id         String   @id @default(uuid())
  name       String
  sourceType String   @default("text") @map("source_type")
  sourceUrl  String?  @map("source_url")
  metadata   Json?
  createdAt  DateTime @default(now()) @map("created_at")
  chunks     KnowledgeChunk[]

  @@map("knowledge_sources")
}

model KnowledgeChunk {
  id         String          @id @default(uuid())
  source     KnowledgeSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  sourceId   String          @map("source_id")
  content    String
  embedding  Unsupported("vector(768)")?
  chunkIndex Int             @default(0) @map("chunk_index")
  metadata   Json?
  createdAt  DateTime        @default(now()) @map("created_at")
  updatedAt  DateTime        @updatedAt @map("updated_at")

  @@map("knowledge_chunks")
}
```

pgvector의 `vector` 타입은 Prisma에서 `Unsupported`이므로, 벡터 관련 CRUD는 모두 raw query로 처리해야 한다.

## Migration (수동 SQL)

```sql
-- prisma/migrations/XXXXXX_add_pgvector/migration.sql
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW 인덱스 (코사인 유사도)
CREATE INDEX idx_documents_embedding
ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_knowledge_chunks_embedding
ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Full-Text Search 인덱스 (하이브리드 검색용)
CREATE INDEX idx_knowledge_chunks_content_fts
ON knowledge_chunks USING gin (to_tsvector('simple', content));
```

`npx prisma migrate dev --create-only` 후 위 SQL을 migration 파일에 추가한다.

## PrismaService 확장

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** 벡터를 SQL 문자열로 변환하는 헬퍼 */
  vectorToSql(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
```

## Document 벡터 검색 서비스

```typescript
// src/document/document-search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  metadata: any;
  similarity: number;
}

@Injectable()
export class DocumentSearchService {
  private readonly logger = new Logger(DocumentSearchService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  /** 문서 생성 (임베딩 포함) */
  async createWithEmbedding(data: { title: string; content: string; metadata?: any }) {
    const embedding = await this.embeddingService.generateEmbedding(
      `${data.title}\n${data.content}`,
    );
    const vectorStr = this.prisma.vectorToSql(embedding);

    // Unsupported 타입이므로 raw query로 insert
    const [doc] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO documents (id, title, content, embedding, metadata, created_at, updated_at)
      VALUES (gen_random_uuid(), ${data.title}, ${data.content}, ${vectorStr}::vector, ${JSON.stringify(data.metadata ?? {})}::jsonb, NOW(), NOW())
      RETURNING id
    `;

    return this.prisma.document.findUnique({ where: { id: doc.id } });
  }

  /** 임베딩 업데이트 */
  async updateEmbedding(id: string, text: string) {
    const embedding = await this.embeddingService.generateEmbedding(text);
    const vectorStr = this.prisma.vectorToSql(embedding);

    await this.prisma.$executeRaw`
      UPDATE documents SET embedding = ${vectorStr}::vector, updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  }

  /** 코사인 유사도 시맨틱 검색 */
  async semanticSearch(query: string, limit = 10, threshold = 0.7): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.generateEmbedding(query);
    const vectorStr = this.prisma.vectorToSql(embedding);

    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        id,
        title,
        content,
        metadata,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM documents
      WHERE embedding IS NOT NULL
        AND embedding <=> ${vectorStr}::vector <= ${1 - threshold}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }

  /** 하이브리드 검색: 벡터 유사도 + Full-Text Search */
  async hybridSearch(params: {
    query: string;
    limit?: number;
    vectorWeight?: number;
  }): Promise<SearchResult[]> {
    const { query, limit = 10, vectorWeight = 0.7 } = params;
    const textWeight = 1 - vectorWeight;
    const embedding = await this.embeddingService.generateEmbedding(query);
    const vectorStr = this.prisma.vectorToSql(embedding);

    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        id,
        title,
        content,
        metadata,
        (
          ${vectorWeight} * (1 - (embedding <=> ${vectorStr}::vector)) +
          ${textWeight} * COALESCE(
            ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', ${query})),
            0
          )
        ) AS similarity
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;
  }

  /** L2 거리 기반 검색 (유클리드 거리) */
  async searchByL2Distance(query: string, limit = 10): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.generateEmbedding(query);
    const vectorStr = this.prisma.vectorToSql(embedding);

    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        id,
        title,
        content,
        metadata,
        embedding <-> ${vectorStr}::vector AS distance
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
  }

  /** 기존 문서 일괄 임베딩 (backfill) */
  async backfillEmbeddings(batchSize = 50): Promise<number> {
    const docs = await this.prisma.$queryRaw<Array<{ id: string; title: string; content: string }>>`
      SELECT id, title, content FROM documents
      WHERE embedding IS NULL
      LIMIT ${batchSize}
    `;

    if (docs.length === 0) return 0;

    const texts = docs.map((d) => `${d.title}\n${d.content}`);
    const embeddings = await this.embeddingService.generateEmbeddings(texts);

    for (let i = 0; i < docs.length; i++) {
      const vectorStr = this.prisma.vectorToSql(embeddings[i]);
      await this.prisma.$executeRaw`
        UPDATE documents SET embedding = ${vectorStr}::vector, updated_at = NOW()
        WHERE id = ${docs[i].id}::uuid
      `;
    }

    this.logger.log(`${docs.length}개 문서 임베딩 완료`);
    return docs.length;
  }
}
```

## Knowledge RAG 서비스 (Prisma)

```typescript
// src/knowledge/knowledge-rag.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService } from '../llm/llm.service';
import { ChunkingService } from './chunking.service';

interface ChunkSearchResult {
  id: string;
  source_id: string;
  source_name: string;
  content: string;
  similarity: number;
}

@Injectable()
export class KnowledgeRagService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
    private llmService: LlmService,
    private chunkingService: ChunkingService,
  ) {}

  /** 텍스트 인제스트: 청킹 + 임베딩 + 저장 */
  async ingest(params: { name: string; content: string; sourceType?: string }) {
    const source = await this.prisma.knowledgeSource.create({
      data: { name: params.name, sourceType: params.sourceType ?? 'text' },
    });

    const chunks = this.chunkingService.splitText(params.content, {
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    // 배치 임베딩
    const batchSize = 50;
    let totalChunks = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.embeddingService.generateEmbeddings(batch);

      for (let j = 0; j < batch.length; j++) {
        const vectorStr = this.prisma.vectorToSql(embeddings[j]);
        await this.prisma.$executeRaw`
          INSERT INTO knowledge_chunks (id, source_id, content, embedding, chunk_index, created_at, updated_at)
          VALUES (gen_random_uuid(), ${source.id}::uuid, ${batch[j]}, ${vectorStr}::vector, ${i + j}, NOW(), NOW())
        `;
      }
      totalChunks += batch.length;
    }

    return { sourceId: source.id, chunksCount: totalChunks };
  }

  /** RAG 질문 응답 */
  async ask(question: string, options?: { sourceId?: string; limit?: number }) {
    const { sourceId, limit = 5 } = options ?? {};
    const embedding = await this.embeddingService.generateEmbedding(question);
    const vectorStr = this.prisma.vectorToSql(embedding);

    // 관련 청크 검색
    let results: ChunkSearchResult[];

    if (sourceId) {
      results = await this.prisma.$queryRaw<ChunkSearchResult[]>`
        SELECT c.id, c.source_id, s.name AS source_name, c.content,
               1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
        FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.embedding IS NOT NULL
          AND c.source_id = ${sourceId}::uuid
          AND 1 - (c.embedding <=> ${vectorStr}::vector) >= 0.65
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    } else {
      results = await this.prisma.$queryRaw<ChunkSearchResult[]>`
        SELECT c.id, c.source_id, s.name AS source_name, c.content,
               1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
        FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.embedding IS NOT NULL
          AND 1 - (c.embedding <=> ${vectorStr}::vector) >= 0.65
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    }

    if (results.length === 0) {
      return { answer: '관련된 정보를 찾을 수 없습니다.', sources: [] };
    }

    // 컨텍스트 구성 + Ollama LLM 호출
    const context = results
      .map((r, i) => `[출처 ${i + 1}] (${r.source_name}, 유사도: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`)
      .join('\n\n---\n\n');

    const answer = await this.llmService.chat([
      {
        role: 'system',
        content: `제공된 컨텍스트만을 기반으로 질문에 답변하세요. 컨텍스트에 없는 내용은 "확인할 수 없습니다"라고 답변하세요. 출처를 [출처 N] 형태로 인용하세요.`,
      },
      { role: 'user', content: `컨텍스트:\n${context}\n\n질문: ${question}` },
    ]);

    return {
      answer,
      sources: results.map((r) => ({
        chunkId: r.id,
        sourceId: r.source_id,
        sourceName: r.source_name,
        content: r.content.slice(0, 200),
        similarity: r.similarity,
      })),
    };
  }
}
```

## Controller

```typescript
// src/document/document.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentSearchService } from './document-search.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private searchService: DocumentSearchService) {}

  @Post()
  @ApiOperation({ summary: '문서 생성 (임베딩 자동 생성)' })
  create(@Body() body: { title: string; content: string; metadata?: any }) {
    return this.searchService.createWithEmbedding(body);
  }

  @Get('search')
  @ApiOperation({ summary: '시맨틱 검색' })
  @ApiQuery({ name: 'q', description: '검색 쿼리' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'threshold', required: false })
  search(
    @Query('q') query: string,
    @Query('limit') limit?: number,
    @Query('threshold') threshold?: number,
  ) {
    return this.searchService.semanticSearch(query, limit, threshold);
  }

  @Get('hybrid-search')
  @ApiOperation({ summary: '하이브리드 검색 (벡터 + 키워드)' })
  hybridSearch(@Query('q') query: string, @Query('limit') limit?: number) {
    return this.searchService.hybridSearch({ query, limit });
  }

  @Post('backfill-embeddings')
  @ApiOperation({ summary: '임베딩 없는 문서 일괄 임베딩' })
  backfill(@Query('batchSize') batchSize?: number) {
    return this.searchService.backfillEmbeddings(batchSize);
  }
}
```

## 성능 최적화 팁

### 1. 인덱스 파라미터 튜닝

```sql
-- HNSW: ef_search 값 조정 (검색 시 탐색 범위, 기본 40)
SET hnsw.ef_search = 100;  -- 높을수록 정확, 느림

-- IVFFlat: probes 값 조정 (기본 1)
SET ivfflat.probes = 10;  -- 높을수록 정확, 느림
```

### 2. Ollama 성능 최적화

```bash
# GPU 가속 확인 (NVIDIA)
ollama run nomic-embed-text --verbose

# 동시 요청 수 설정
OLLAMA_NUM_PARALLEL=4 ollama serve

# Keep-alive로 모델을 메모리에 유지
OLLAMA_KEEP_ALIVE=24h ollama serve
```

### 3. 대용량 배치 처리

```typescript
// 대용량 backfill 시 cursor 기반 배치
async backfillAll() {
  let processed = 0;
  let batch: number;

  do {
    batch = await this.backfillEmbeddings(50);
    processed += batch;
  } while (batch > 0);

  return { totalProcessed: processed };
}
```

### 4. 임베딩 차원 선택 가이드

| 차원 | 모델 | DB 저장 크기/행 | 검색 속도 | 품질 |
|------|------|----------------|----------|------|
| 384 | `all-minilm` | ~1.5KB | 빠름 | 보통 |
| 768 | `nomic-embed-text` | ~3KB | 보통 | 좋음 |
| 1024 | `mxbai-embed-large` | ~4KB | 느림 | 높음 |

소규모 프로젝트는 384, 일반적인 프로덕션은 768 권장.
