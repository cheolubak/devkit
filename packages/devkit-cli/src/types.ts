import type { JsonObject } from './ops/merge-json.js';

export interface Ctx {
  /** 생성될 프로젝트의 절대경로 */
  targetDir: string;
  /**
   * 툴킷 저장소 루트의 절대경로. **게시본으로 실행하면 `null` 이다** —
   * 그 경우 툴킷 저장소라는 것이 존재하지 않는다(설계 3.2절). 검사를
   * 생략한다는 뜻이 아니라 대상이 없다는 뜻이다.
   */
  toolkitRoot: string | null;
  /** 프로젝트 이름 (= basename(targetDir)) */
  name: string;
  log: (message: string) => void;
}

export type StepKind = 'delegate' | 'removeFiles' | 'copyOverlay' | 'mergeJson' | 'registryDeps' | 'makeDirs' | 'compose';

/**
 * 쓰기 전에 계산해 둔 변경. update 는 이것을 사람에게 보여주고 확인을 받은
 * 뒤 같은 바이트를 쓴다(설계 5.1절).
 */
export type PlannedChange =
  | { kind: 'file'; relPath: string; content: string }
  | { kind: 'json'; file: string; patch: JsonObject }
  /**
   * 무시 파일(.gitignore). 통째로 덮으면 사용자가 추가한 규칙이 사라지므로
   * 줄 단위로 병합한다(설계 2.1절). `lines` 는 없으면 더할 템플릿 줄,
   * `block` 은 devkit 구분자 안에 들어갈 내용이다.
   */
  | { kind: 'ignore'; file: string; lines: string[]; block: string[] };

export interface Step {
  kind: StepKind;
  label: string;
  /** 스냅샷 테스트용 직렬화. 실행하지 않고 레시피를 검사할 수 있게 한다. */
  describe: () => unknown;
  /**
   * 이 단계가 만들 최종 내용. 아무것도 쓰지 않는다.
   *
   * run 은 이것을 호출해 쓰므로 계획과 실제가 갈라질 수 없다(설계 5.2절).
   * delegate·removeFiles·makeDirs 는 재적용 대상이 아니라 갖지 않는다.
   */
  plan?: (ctx: Ctx) => Promise<PlannedChange[]>;
  /**
   * compose 전용. update 가 하위 레시피까지 따라 들어가기 위해 노출한다 —
   * monorepo 가 next 를 apps/web 에 합성한 구조를 update 가 복제하지 않는다.
   */
  children?: { steps: Step[]; mapCtx: (ctx: Ctx) => Ctx };
  /**
   * removeFiles 전용. update 는 이 단계를 **실행하지 않지만** 계획에는
   * 반영해야 한다 — monorepo 는 next 를 합성한 뒤 apps/web 의
   * eslint.config.mjs·.claude 를 지운다. 무시하면 update 가 매번
   * 되살리고, 그 파일들은 저장소 전체 린트를 죽인다(설계 5.7절).
   */
  removes?: string[];
  run: (ctx: Ctx) => Promise<void>;
}

export type ProjectType = 'nest' | 'next' | 'monorepo';

export interface RecipeOptions {
  skipInstall?: boolean;
  skipVerify?: boolean;
}

export type Recipe = (options?: RecipeOptions) => Step[];
