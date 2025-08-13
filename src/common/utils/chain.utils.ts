import { SupportedChain } from '../types/chain.type';

const chainIds: Record<SupportedChain, number> = {
  mainnet: 1,
  'mainnet-etherfi': 1,
  'mainnet-lido': 1,
  'mainnet-gho': 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  sonic: 146,
  mode: 34443,
};

export function getChainId(chain: SupportedChain): number {
  return chainIds[chain];
}
