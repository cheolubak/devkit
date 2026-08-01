export interface Ctx {
  /** 생성될 프로젝트의 절대경로 */
  targetDir: string;
  /** 이 저장소 루트의 절대경로 */
  toolkitRoot: string;
  /** 프로젝트 이름 (= basename(targetDir)) */
  name: string;
  log: (message: string) => void;
}

export type StepKind = 'delegate' | 'removeFiles' | 'copyOverlay' | 'mergeJson' | 'linkDeps' | 'makeDirs' | 'compose';

export interface Step {
  kind: StepKind;
  label: string;
  /** 스냅샷 테스트용 직렬화. 실행하지 않고 레시피를 검사할 수 있게 한다. */
  describe: () => unknown;
  run: (ctx: Ctx) => Promise<void>;
}

export type ProjectType = 'nest' | 'next' | 'monorepo';

export interface RecipeOptions {
  skipInstall?: boolean;
  skipVerify?: boolean;
}

export type Recipe = (options?: RecipeOptions) => Step[];
