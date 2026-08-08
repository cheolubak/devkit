# TypeORM + pgvector RAG 패턴 (Ollama)

TypeORM 기반 문서 임베딩 + 시맨틱 검색 + RAG(Retrieval-Augmented Generation) 완전한 구현 예시. Ollama를 사용하여 임베딩과 LLM 추론 모두 로컬에서 무료로 수행한다.

## Entity

```typescript
// src/knowledge/entities/knowledge-chunk.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('knowledge_sources')
export class KnowledgeSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['pdf', 'web', 'text', 'markdown'], default: 'text' })
  sourceType: string;

  @Column({ nullable: true })
  sourceUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  chunks: KnowledgeChunk[];
}

@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => KnowledgeSource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_id' })
  source: KnowledgeSource;

  @Column({ name: 'source_id' })
  sourceId: string;

  @Column('text')
  content: string;

  @Column({ type: 'vector', nullable: true })
  embedding: string;

  @Column({ type: 'int', default: 0 })
  chunkIndex: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

## 텍스트 청킹 서비스

```typescript
// src/knowledge/chunking.service.ts
import { Injectable } from '@nestjs/common';

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
}

@Injectable()
export class ChunkingService {
  /**
   * 텍스트를 고정 크기 청크로 분할 (오버랩 포함)
   */
  splitText(text: string, options: ChunkOptions = {}): string[] {
    const { chunkSize = 1000, chunkOverlap = 200, separator = '\n\n' } = options;

    const segments = text.split(separator).filter((s) => s.trim());

    const chunks: string[] = [];
    let currentChunk = '';

    for (const segment of segments) {
      if (currentChunk.length + segment.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        if (chunkOverlap > 0) {
          currentChunk = currentChunk.slice(-chunkOverlap) + separator + segment;
        } else {
          currentChunk = segment;
        }
      } else {
        currentChunk = currentChunk ? currentChunk + separator + segment : segment;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Markdown 문서를 헤딩 기준으로 분할
   */
  splitMarkdown(markdown: string, maxChunkSize = 1500): string[] {
    const sections = markdown.split(/(?=^#{1,3}\s)/m);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const section of sections) {
      if (currentChunk.length + section.length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = section;
      } else {
        currentChunk += section;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
```

## Knowledge Repository (벡터 검색)

```typescript
// src/knowledge/knowledge.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';

export interface VectorSearchResult {
  chunk: KnowledgeChunk;
  similarity: number;
}

@Injectable()
export class KnowledgeRepository extends Repository<KnowledgeChunk> {
  constructor(private dataSource: DataSource) {
    super(KnowledgeChunk, dataSource.createEntityManager());
  }

  /** 코사인 유사도 기반 시맨틱 검색 */
  async semanticSearch(params: {
    embedding: number[];
    limit?: number;
    threshold?: number;
    sourceId?: string;
  }): Promise<VectorSearchResult[]> {
    const { embedding, limit = 5, threshold = 0.7, sourceId } = params;
    const vectorStr = `[${embedding.join(',')}]`;

    let qb = this.createQueryBuilder('chunk')
      .leftJoinAndSelect('chunk.source', 'source')
      .addSelect(`1 - (chunk.embedding <=> :embedding)`, 'similarity')
      .where(`chunk.embedding IS NOT NULL`)
      .andWhere(`1 - (chunk.embedding <=> :embedding) >= :threshold`)
      .setParameters({ embedding: vectorStr, threshold });

    if (sourceId) {
      qb = qb.andWhere('chunk.sourceId = :sourceId', { sourceId });
    }

    const results = await qb
      .orderBy('similarity', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return results.entities.map((entity, i) => ({
      chunk: entity,
      similarity: parseFloat(results.raw[i].similarity),
    }));
  }

  /** 하이브리드 검색: 벡터 + Full-Text Search */
  async hybridSearch(params: {
    embedding: number[];
    keyword: string;
    limit?: number;
    vectorWeight?: number;
  }): Promise<VectorSearchResult[]> {
    const { embedding, keyword, limit = 5, vectorWeight = 0.6 } = params;
    const textWeight = 1 - vectorWeight;
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.createQueryBuilder('chunk')
      .leftJoinAndSelect('chunk.source', 'source')
      .addSelect(
        `(
          :vw * (1 - (chunk.embedding <=> :embedding)) +
          :tw * COALESCE(ts_rank(
            to_tsvector('simple', chunk.content),
            plainto_tsquery('simple', :keyword)
          ), 0)
        )`,
        'score',
      )
      .where('chunk.embedding IS NOT NULL')
      .setParameters({
        embedding: vectorStr,
        keyword,
        vw: vectorWeight,
        tw: textWeight,
      })
      .orderBy('score', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return results.entities.map((entity, i) => ({
      chunk: entity,
      similarity: parseFloat(results.raw[i].score),
    }));
  }

  /** MMR(Maximal Marginal Relevance) 다양성 검색 */
  async mmrSearch(params: {
    embedding: number[];
    limit?: number;
    candidateCount?: number;
    lambda?: number;
  }): Promise<VectorSearchResult[]> {
    const { embedding, limit = 5, candidateCount = 20, lambda = 0.5 } = params;
    const vectorStr = `[${embedding.join(',')}]`;

    // 1단계: 후보군 조회
    const candidates = await this.createQueryBuilder('chunk')
      .addSelect(`1 - (chunk.embedding <=> :embedding)`, 'similarity')
      .where('chunk.embedding IS NOT NULL')
      .setParameters({ embedding: vectorStr })
      .orderBy('similarity', 'DESC')
      .limit(candidateCount)
      .getRawAndEntities();

    if (candidates.entities.length === 0) return [];

    // 2단계: MMR 알고리즘으로 다양성 확보
    const selected: VectorSearchResult[] = [];
    const remaining = candidates.entities.map((entity, i) => ({
      chunk: entity,
      similarity: parseFloat(candidates.raw[i].similarity),
    }));

    // 첫 번째: 가장 유사한 문서
    selected.push({ chunk: remaining[0].chunk, similarity: remaining[0].similarity });
    remaining.splice(0, 1);

    while (selected.length < limit && remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].similarity;
        const redundancy = selected.reduce(
          (max, s) => Math.max(max, s.similarity * remaining[i].similarity),
          0,
        );
        const mmrScore = lambda * relevance - (1 - lambda) * redundancy;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push({
        chunk: remaining[bestIdx].chunk,
        similarity: remaining[bestIdx].similarity,
      });
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }
}
```

## Ollama LLM Service (RAG 생성용)

```typescript
// src/llm/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = this.configService.get('OLLAMA_LLM_MODEL', 'llama3.2');
  }

  async chat(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.1,
          num_predict: 1024,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama LLM 오류: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.message.content;
  }
}
```

```typescript
// src/llm/llm.module.ts
import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
```

## RAG Service (검색 + 생성)

```typescript
// src/knowledge/rag.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService } from '../llm/llm.service';
import { KnowledgeRepository, VectorSearchResult } from './knowledge.repository';

export interface RagResponse {
  answer: string;
  sources: Array<{
    chunkId: string;
    sourceId: string;
    sourceName: string;
    content: string;
    similarity: number;
  }>;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private embeddingService: EmbeddingService,
    private llmService: LlmService,
    private knowledgeRepo: KnowledgeRepository,
  ) {}

  async ask(question: string, options?: { sourceId?: string; limit?: number }): Promise<RagResponse> {
    const { sourceId, limit = 5 } = options ?? {};

    // 1. 질문 임베딩 생성
    const embedding = await this.embeddingService.generateEmbedding(question);

    // 2. 관련 청크 검색
    const searchResults = await this.knowledgeRepo.semanticSearch({
      embedding,
      limit,
      threshold: 0.65,
      sourceId,
    });

    if (searchResults.length === 0) {
      return {
        answer: '관련된 정보를 찾을 수 없습니다.',
        sources: [],
      };
    }

    // 3. 컨텍스트 구성
    const context = searchResults
      .map((r, i) => `[출처 ${i + 1}] (유사도: ${(r.similarity * 100).toFixed(1)}%)\n${r.chunk.content}`)
      .join('\n\n---\n\n');

    // 4. Ollama LLM에 질문 + 컨텍스트 전달
    const answer = await this.llmService.chat([
      {
        role: 'system',
        content: `아래 제공된 컨텍스트만을 기반으로 질문에 답변하세요.
컨텍스트에 없는 내용은 "제공된 정보에서 확인할 수 없습니다"라고 답변하세요.
답변 시 관련 출처 번호를 [출처 N] 형태로 인용하세요.`,
      },
      {
        role: 'user',
        content: `컨텍스트:\n${context}\n\n질문: ${question}`,
      },
    ]);

    return {
      answer,
      sources: searchResults.map((r) => ({
        chunkId: r.chunk.id,
        sourceId: r.chunk.sourceId,
        sourceName: r.chunk.source?.name ?? '',
        content: r.chunk.content.slice(0, 200),
        similarity: r.similarity,
      })),
    };
  }
}
```

## Knowledge 인제스트 서비스

```typescript
// src/knowledge/knowledge-ingest.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingService } from '../embedding/embedding.service';
import { ChunkingService } from './chunking.service';
import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeSource, KnowledgeChunk } from './entities/knowledge-chunk.entity';

@Injectable()
export class KnowledgeIngestService {
  private readonly logger = new Logger(KnowledgeIngestService.name);

  constructor(
    private dataSource: DataSource,
    private embeddingService: EmbeddingService,
    private chunkingService: ChunkingService,
    private knowledgeRepo: KnowledgeRepository,
  ) {}

  /** 텍스트 문서를 청킹 + 임베딩하여 저장 */
  async ingestText(params: {
    name: string;
    content: string;
    sourceType?: string;
    sourceUrl?: string;
    metadata?: Record<string, any>;
    chunkSize?: number;
    chunkOverlap?: number;
  }) {
    const { name, content, sourceType = 'text', sourceUrl, metadata, chunkSize, chunkOverlap } = params;

    return this.dataSource.transaction(async (manager) => {
      // 소스 생성
      const source = manager.create(KnowledgeSource, {
        name,
        sourceType,
        sourceUrl,
        metadata,
      });
      const savedSource = await manager.save(source);

      // 청킹
      const chunks = this.chunkingService.splitText(content, { chunkSize, chunkOverlap });
      this.logger.log(`텍스트를 ${chunks.length}개 청크로 분할`);

      // 배치 임베딩
      const batchSize = 50; // Ollama 로컬이므로 배치 크기 조절
      const savedChunks: KnowledgeChunk[] = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await this.embeddingService.generateEmbeddings(batch);

        const chunkEntities = batch.map((text, j) =>
          manager.create(KnowledgeChunk, {
            sourceId: savedSource.id,
            content: text,
            embedding: `[${embeddings[j].join(',')}]`,
            chunkIndex: i + j,
          }),
        );

        const saved = await manager.save(chunkEntities);
        savedChunks.push(...saved);
        this.logger.log(`임베딩 완료: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
      }

      return { source: savedSource, chunksCount: savedChunks.length };
    });
  }
}
```

## Module 구성

```typescript
// src/knowledge/knowledge.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSource, KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeIngestService } from './knowledge-ingest.service';
import { ChunkingService } from './chunking.service';
import { RagService } from './rag.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeSource, KnowledgeChunk])],
  controllers: [KnowledgeController],
  providers: [KnowledgeRepository, KnowledgeIngestService, ChunkingService, RagService],
  exports: [RagService, KnowledgeIngestService],
})
export class KnowledgeModule {}
```

## Controller

```typescript
// src/knowledge/knowledge.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KnowledgeIngestService } from './knowledge-ingest.service';
import { RagService } from './rag.service';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private ingestService: KnowledgeIngestService,
    private ragService: RagService,
  ) {}

  @Post('ingest')
  @ApiOperation({ summary: '텍스트 문서 인제스트 (청킹 + 임베딩)' })
  async ingest(
    @Body() body: { name: string; content: string; sourceType?: string; sourceUrl?: string },
  ) {
    return this.ingestService.ingestText(body);
  }

  @Get('ask')
  @ApiOperation({ summary: 'RAG 기반 질문 응답' })
  @ApiQuery({ name: 'q', description: '질문' })
  @ApiQuery({ name: 'sourceId', required: false })
  async ask(@Query('q') question: string, @Query('sourceId') sourceId?: string) {
    return this.ragService.ask(question, { sourceId });
  }
}
```

## Migration

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeTables implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE knowledge_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        source_type VARCHAR DEFAULT 'text',
        source_url VARCHAR,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE knowledge_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(768),
        chunk_index INT DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // HNSW 벡터 인덱스
    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_embedding
      ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_source
      ON knowledge_chunks (source_id)
    `);

    // Full-Text Search 인덱스 (하이브리드 검색용)
    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_content_fts
      ON knowledge_chunks USING gin (to_tsvector('simple', content))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS knowledge_chunks`);
    await queryRunner.query(`DROP TABLE IF EXISTS knowledge_sources`);
  }
}
```

## Ollama 모델 비교

### 임베딩 모델

| 모델 | 차원 | 크기 | 특징 |
|------|------|------|------|
| `nomic-embed-text` | 768 | 274MB | 균형잡힌 품질/속도 (권장) |
| `all-minilm` | 384 | 23MB | 매우 빠름, 경량 |
| `mxbai-embed-large` | 1024 | 670MB | 고품질, 영어 최적화 |
| `snowflake-arctic-embed` | 1024 | 670MB | 최신, 다국어 지원 |

### LLM 모델 (RAG 생성용)

| 모델 | 크기 | 특징 |
|------|------|------|
| `llama3.2` | 2GB | 빠른 응답, 적은 메모리 |
| `llama3.2:3b` | 2GB | 가벼운 기본 모델 |
| `mistral` | 4.1GB | 좋은 품질/속도 균형 |
| `gemma2` | 5.4GB | 고품질 응답 |

```bash
# 모델 다운로드
ollama pull nomic-embed-text
ollama pull llama3.2
```
