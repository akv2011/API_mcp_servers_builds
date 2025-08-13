import {
  Chain as ViemChain,
  base,
  mode,
  mainnet,
  arbitrum,
  optimism,
  sonic,
} from 'viem/chains';
import { SupportedChain } from '../types/chain.type';

export const CHAIN_CONFIGS: Record<SupportedChain, ViemChain> = {
  base,
  mode,
  mainnet,
  // Creating custom configurations for special Ethereum markets
  'mainnet-gho': {
    ...mainnet,
    name: 'Ethereum GHO Market',
  },
  'mainnet-etherfi': {
    ...mainnet,
    name: 'Ethereum EtherFi Market',
  },
  'mainnet-lido': {
    ...mainnet,
    name: 'Ethereum Lido Market',
  },
  arbitrum,
  optimism,
  // Placeholder for Sonic chain - update when official config available
  sonic,
};

/**
 * Mapping of CoinGecko platform IDs to our SupportedChain type
 */
export const COINGECKO_PLATFORM_TO_CHAIN: Record<string, SupportedChain> = {
  base: 'base',
  mode: 'mode',
  ethereum: 'mainnet',
  'arbitrum-one': 'arbitrum',
  'optimistic-ethereum': 'optimism',
  sonic: 'sonic',
};

/**
 * Mapping of our SupportedChain type to CoinGecko platform IDs
 */
export const CHAIN_TO_COINGECKO_PLATFORM: Record<SupportedChain, string> = {
  base: 'base',
  mode: 'mode',
  mainnet: 'ethereum',
  'mainnet-gho': 'ethereum', // All Ethereum markets use the same platform ID
  'mainnet-etherfi': 'ethereum',
  'mainnet-lido': 'ethereum',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  sonic: 'sonic',
};

export function getChainConfig(chain: SupportedChain): ViemChain {
  const config = CHAIN_CONFIGS[chain];
  if (!config) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  return config;
}

export function getChainId(chain: SupportedChain): number {
  return getChainConfig(chain).id;
}

/**
 * Maps a CoinGecko platform ID to our supported chain
 * @param platformId CoinGecko platform ID
 * @returns SupportedChain or null if not supported
 */
export function mapCoinGeckoPlatformToChain(
  platformId: string,
): SupportedChain | null {
  return COINGECKO_PLATFORM_TO_CHAIN[platformId] || null;
}

/**
 * Maps our chain to a CoinGecko platform ID
 * @param chain Our supported chain
 * @returns CoinGecko platform ID
 */
export function mapChainToCoinGeckoPlatform(chain: SupportedChain): string {
  return CHAIN_TO_COINGECKO_PLATFORM[chain];
}

/**
 * Checks if a CoinGecko platform ID is supported in our system
 * @param platformId CoinGecko platform ID
 * @returns boolean indicating if the platform is supported
 */
export function isSupportedCoinGeckoPlatform(platformId: string): boolean {
  return !!COINGECKO_PLATFORM_TO_CHAIN[platformId];
}

/**
 * Filters CoinGecko token platforms to only include contract addresses for chains we support
 * @param platforms Token platforms from CoinGecko (platform name -> contract address)
 * @returns Filtered platforms with only supported chains
 */
export function filterSupportedPlatforms(
  platforms: Record<string, string>,
): Record<string, string> {
  const filteredPlatforms: Record<string, string> = {};

  Object.entries(platforms).forEach(([platform, address]) => {
    if (isSupportedCoinGeckoPlatform(platform)) {
      filteredPlatforms[platform] = address;
    }
  });

  return filteredPlatforms;
}

/**
 * Maps CoinGecko platforms to our chain format with contract addresses
 * @param platforms Token platforms from CoinGecko (platform name -> contract address)
 * @returns Platforms mapped to our chain format (chain -> contract address)
 */
export function mapPlatformsToChains(
  platforms: Record<string, string>,
): Record<SupportedChain, string> {
  const chainAddresses: Partial<Record<SupportedChain, string>> = {};

  Object.entries(platforms).forEach(([platform, address]) => {
    const chain = mapCoinGeckoPlatformToChain(platform);
    if (chain) {
      chainAddresses[chain] = address;
    }
  });

  return chainAddresses as Record<SupportedChain, string>;
}
