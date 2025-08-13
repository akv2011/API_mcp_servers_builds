export const SUPPORTED_CHAINS = [
  'base',
  'mode',
  'mainnet',
  'mainnet-gho',
  'mainnet-etherfi',
  'mainnet-lido',
  'arbitrum',
  'optimism',
  'sonic',
] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];
