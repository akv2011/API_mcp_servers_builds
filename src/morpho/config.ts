import { mainnet, base } from 'viem/chains';
import { SupportedChain } from '../common/types/chain.type';

// Mapping of our supported chains to their numeric IDs
export const CHAIN_ID_MAP: Record<SupportedChain, number> = {
  mainnet: mainnet.id, // 1
  base: base.id,
  mode: 0,
  'mainnet-etherfi': 0,
  'mainnet-lido': 0,
  arbitrum: 0,
  optimism: 0,
  sonic: 0,
  'mainnet-gho': 0,
};

// Helper function to get chain ID from our chain type
export function getChainIdForMorpho(chain: SupportedChain): number {
  return CHAIN_ID_MAP[chain] || mainnet.id; // Default to Ethereum mainnet
}

// Target utilization for the public allocator (like in Compound Blue)
export const PUBLIC_ALLOCATOR_SUPPLY_TARGET_UTILIZATION = '0.8'; // 80% target utilization
