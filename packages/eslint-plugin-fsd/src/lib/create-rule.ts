import type { Rule } from 'eslint';
import type { FsdLocation } from './types';
import { parsePath } from './parse-path';
import { resolveImport } from './resolve-import';

export interface ImportCheckContext {
  from: FsdLocation;
  to: FsdLocation;
  source: string;
}

interface CreateImportRuleOptions {
  meta: { docs: string };
  messages: Record<string, string>;
  check: (
    ctx: ImportCheckContext,
  ) => { messageId: string; data?: Record<string, string> } | null;
}

const DEFAULT_ALIASES = ['@', '~'];

export function createImportRule(opts: CreateImportRuleOptions): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      docs: { description: opts.meta.docs },
      schema: [
        {
          type: 'object',
          properties: { alias: { type: 'array', items: { type: 'string' } } },
          additionalProperties: false,
        },
      ],
      messages: opts.messages,
    },
    create(context) {
      const importer = context.filename;
      const from = parsePath(importer);
      if (from === null) return {};

      const option = (context.options[0] ?? {}) as { alias?: string[] };
      const aliases = option.alias ?? DEFAULT_ALIASES;

      function handle(node: { source?: { value?: unknown } | null }): void {
        const src = node.source?.value;
        if (typeof src !== 'string') return;
        const targetPath = resolveImport(src, importer, aliases);
        if (targetPath === null) return;
        const to = parsePath(targetPath);
        if (to === null) return;
        const result = opts.check({ from: from!, to, source: src });
        if (result) {
          context.report({
            node: node as never,
            messageId: result.messageId,
            data: result.data,
          });
        }
      }

      return {
        ImportDeclaration: handle,
        ImportExpression: (node) =>
          handle({ source: (node as { source?: { value?: unknown } }).source }),
        ExportNamedDeclaration: handle,
        ExportAllDeclaration: handle,
      };
    },
  };
}
