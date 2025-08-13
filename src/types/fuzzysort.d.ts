declare module 'fuzzysort' {
  interface FuzzysortOptions {
    key?: string;
    keys?: string[];
    limit?: number;
    threshold?: number;
    allowTypo?: boolean;
  }

  interface FuzzysortResult {
    target: string;
    score: number;
    indexes: number[];
    obj: any;
  }

  interface Fuzzysort {
    go(
      search: string,
      targets: any[] | string[],
      options?: FuzzysortOptions,
    ): FuzzysortResult[];
    goAsync(
      search: string,
      targets: any[] | string[],
      options?: FuzzysortOptions,
    ): Promise<FuzzysortResult[]>;
    highlight(
      result: FuzzysortResult,
      open?: string,
      close?: string,
    ): string | null;
    prepare(target: string): PreparedTarget;
    single(search: string, target: string): FuzzysortResult | null;
    new (search: string, target: string): FuzzysortResult | null;
  }

  type PreparedTarget = {
    target: string;
    _prepared: boolean;
    _targetLen: number;
    _targetLower: string;
    _keyLen: number;
    _keyLower: string;
  };

  const fuzzysort: Fuzzysort;
  export = fuzzysort;
}
