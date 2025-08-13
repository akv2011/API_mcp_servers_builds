import {
  AaveV3Ethereum,
  AaveV3Base,
  AaveV3Optimism,
  AaveV3Arbitrum,
  AaveV3Sonic,
  AaveV3EthereumLido,
  AaveV3EthereumEtherFi,
} from '@bgd-labs/aave-address-book';

/**
 * Maps chain identifiers used in our app to Aave markets
 */
export const MARKET_MAPPING = {
  base: AaveV3Base,
  mainnet: AaveV3Ethereum,
  'mainnet-lido': AaveV3EthereumLido,
  'mainnet-etherfi': AaveV3EthereumEtherFi,
  arbitrum: AaveV3Arbitrum,
  optimism: AaveV3Optimism,
  sonic: AaveV3Sonic,
  // Additional markets can be added here
  // 'avalanche': AaveV3Avalanche,
  // 'polygon': AaveV3Polygon,
  // 'bnb': AaveV3BNB,
  // 'gnosis': AaveV3Gnosis,
  // 'metis': AaveV3Metis,
  // 'scroll': AaveV3Scroll,
};

/**
 * Structure of contract addresses needed for Aave interaction
 */
export type AaveMarketAddresses = {
  POOL?: `0x${string}`;
  POOL_DATA_PROVIDER?: `0x${string}`;
  UI_POOL_DATA_PROVIDER?: `0x${string}`;
  UI_INCENTIVE_DATA_PROVIDER?: `0x${string}`;
  WALLET_BALANCE_PROVIDER?: `0x${string}`;
};

/**
 * Retrieves all needed contract addresses for a given chain
 * @param chainId The chain identifier used in our app
 * @returns Contract addresses for the specified chain
 */
export function getAddressesForMarket(chainId: string): AaveMarketAddresses {
  const market = MARKET_MAPPING[chainId as keyof typeof MARKET_MAPPING];

  if (!market) {
    return {};
  }

  return {
    POOL: market.POOL as `0x${string}`,
    POOL_DATA_PROVIDER: market.AAVE_PROTOCOL_DATA_PROVIDER as `0x${string}`,
    UI_POOL_DATA_PROVIDER: market.UI_POOL_DATA_PROVIDER as `0x${string}`,
    UI_INCENTIVE_DATA_PROVIDER:
      market.UI_INCENTIVE_DATA_PROVIDER as `0x${string}`,
    WALLET_BALANCE_PROVIDER: market.WALLET_BALANCE_PROVIDER as `0x${string}`,
  };
}

/**
 * Checks if a market has addresses configured in the Address Book
 * @param chainId The chain identifier used in our app
 * @returns True if the market is configured
 */
export function isMarketConfigured(chainId: string): boolean {
  const market = MARKET_MAPPING[chainId as keyof typeof MARKET_MAPPING];
  return !!market && !!market.POOL && !!market.AAVE_PROTOCOL_DATA_PROVIDER;
}

/**
 * Gets all supported token addresses for a given market
 * @param chainId The chain identifier used in our app
 * @returns An object containing token addresses
 */
export function getTokenAddressesForMarket(
  chainId: string,
): Record<string, `0x${string}`> {
  const market = MARKET_MAPPING[chainId as keyof typeof MARKET_MAPPING];

  if (!market || !market.ASSETS) {
    return {};
  }

  const result: Record<string, `0x${string}`> = {};

  // Convert ASSETS to flattened record of token name -> token address
  for (const [tokenSymbol, data] of Object.entries(market.ASSETS || {})) {
    if (data && typeof data === 'object' && 'UNDERLYING' in data) {
      result[tokenSymbol] = data.UNDERLYING as `0x${string}`;
    }
  }

  return result;
}
