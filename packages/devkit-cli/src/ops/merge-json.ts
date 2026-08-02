import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 패치를 재귀 병합한 새 객체를 반환한다. 원본은 변경하지 않는다.
 *
 * - null 값 → 키 삭제
 * - 객체 값 → 재귀 병합
 * - 배열 값 → 교체
 */
export function applyPatch(target: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }
    const current = result[key];
    result[key] = isPlainObject(value)
      ? applyPatch(isPlainObject(current) ? current : {}, value)
      : value;
  }

  return result;
}

export function hasPath(obj: JsonObject, path: string): boolean {
  let cursor: Json = obj;
  for (const segment of path.split('.')) {
    if (!isPlainObject(cursor) || !(segment in cursor)) return false;
    cursor = cursor[segment];
  }
  return true;
}

export interface MergeJsonOptions {
  required?: string[];
  file?: string;
}

export function mergeJson(patch: JsonObject, options: MergeJsonOptions = {}): Step {
  const file = options.file ?? 'package.json';
  const required = options.required ?? [];

  return {
    kind: 'mergeJson',
    label: `${file} 병합`,
    describe: () => ({ file, patch, required }),
    // 패치는 정적이므로 대상 파일을 읽지 않는다. 기준 내용을 무엇으로 볼지는
    // 조립자가 정한다 — create 는 디스크, update 는 가상 파일맵이다(설계 5.4절).
    plan: () => Promise.resolve([{ kind: 'json', file, patch }]),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;

      if (!isPlainObject(parsed)) {
        throw new Error(`Invalid JSON in ${file}: expected object`);
      }

      // required 는 생성 시점 전용 가드다 — 위임 대상(공식 CLI)의 산출물이
      // 바뀌었는지 본다. plan 에 두지 않는 것이 요구다: 여기 적힌 키들은
      // 이 패치가 지우는 대상이라 기존 프로젝트에는 없다(설계 1.2절).
      for (const key of required) {
        if (!hasPath(parsed, key)) {
          throw new Error(
            `${file}에 '${key}'가 없습니다. 위임 대상(공식 CLI)의 산출물이 바뀌었을 수 있습니다. ` +
              `해당 레시피를 재검증하세요 (설계 6.2절).`,
          );
        }
      }

      const merged = applyPatch(parsed, patch);
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      ctx.log(`  병합: ${file}`);
    },
  };
}
