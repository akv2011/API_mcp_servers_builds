import { SupportedChain } from '../../chain';
import {
  getTokenAddressesForMarket,
  isMarketConfigured,
} from './address-provider';

export type AaveMarketConfig = {
  /** Chain identifier used in our application */
  chainId: SupportedChain;
  /** Display name for UI */
  displayName: string;
  /** Description for UI */
  description: string;
  /** Whether market is in testnet or mainnet */
  isTestnet: boolean;
  /** Token symbols that are supported on this market */
  supportedTokens: string[];
  /** Price feed decimals for each token */
  priceFeedDecimals: Record<string, number>;
  /** Token addresses mapped by symbol */
  tokenAddresses?: Record<string, `0x${string}`>;
  /** Whether market is configured with addresses */
  isConfigured?: boolean;
  /** Whether market is featured/promoted */
  isFeatured: boolean;
};

/**
 * Aave market configurations
 */
export const AAVE_MARKETS: AaveMarketConfig[] = [
  {
    chainId: 'mainnet',
    displayName: 'Aave v3 Ethereum',
    description: 'Aave v3 on Ethereum Mainnet',
    isTestnet: false,
    supportedTokens: [
      'WETH',
      'WBTC',
      'USDC',
      'USDT',
      'DAI',
      'LINK',
      'wstETH',
      'ETH',
      'AAVE',
      'CRV',
      'BAL',
      'GHO',
      'rETH',
      'cbETH',
      'FRAX',
      'MKR',
      'SNX',
      'UNI',
      'pyUSD',
    ],
    priceFeedDecimals: {
      WETH: 8,
      WBTC: 8,
      USDC: 8,
      USDT: 8,
      DAI: 8,
      LINK: 8,
      wstETH: 18,
      ETH: 8,
      AAVE: 8,
      CRV: 8,
      BAL: 8,
      GHO: 8,
      rETH: 18,
      cbETH: 8,
      FRAX: 8,
      MKR: 8,
      SNX: 8,
      UNI: 8,
      pyUSD: 8,
    },
    isFeatured: true,
  },
  {
    chainId: 'mainnet-etherfi',
    displayName: 'Aave v3 EtherFi',
    description: 'Aave v3 on EtherFi Market',
    isTestnet: false,
    supportedTokens: ['USDC', 'weETH', 'FRAX', 'pyUSD'],
    priceFeedDecimals: {
      USDC: 6,
      weETH: 18,
      FRAX: 18,
      pyUSD: 6,
    },
    isFeatured: true,
  },
  {
    chainId: 'base',
    displayName: 'Aave v3 Base',
    description: 'Aave v3 on Base',
    isTestnet: false,
    supportedTokens: [
      'WETH',
      'cbETH',
      'USDbC',
      'wstETH',
      'USDC',
      'weETH',
      'cbBTC',
      'GHO',
      'ezETH',
      'EURC',
      'LBTC',
      'wrsETH',
    ],
    priceFeedDecimals: {
      WETH: 8,
      cbETH: 8,
      USDbC: 8,
      wstETH: 18,
      USDC: 8,
      weETH: 8,
      cbBTC: 8,
      GHO: 8,
      ezETH: 8,
      EURC: 6,
      LBTC: 8,
      wrsETH: 18,
    },
    isFeatured: true,
  },
  {
    chainId: 'mainnet-lido',
    displayName: 'Aave v3 Lido',
    description: 'Aave v3 on Lido',
    isTestnet: false,
    supportedTokens: [
      'wstETH',
      'WETH',
      'USDS',
      'USDC',
      'ezETH',
      'sUSDe',
      'GHO',
      'rsETH',
    ],
    priceFeedDecimals: {
      wstETH: 18,
      WETH: 8,
      USDS: 8,
      USDC: 8,
      ezETH: 8,
      sUSDe: 8,
      GHO: 8,
      rsETH: 18,
    },
    isFeatured: true,
  },
  {
    chainId: 'arbitrum',
    displayName: 'Aave v3 Arbitrum',
    description: 'Aave v3 on Arbitrum',
    isTestnet: false,
    supportedTokens: [
      'DAI',
      'LINK',
      'USDC',
      'WBTC',
      'WETH',
      'USDT',
      'AAVE',
      'EURS',
      'wstETH',
      'MAI',
      'rETH',
      'LUSD',
      'USDCn',
      'FRAX',
      'ARB',
      'weETH',
      'GHO',
      'ezETH',
    ],
    priceFeedDecimals: {
      WETH: 8,
      WBTC: 8,
      USDC: 8,
      USDT: 8,
      DAI: 8,
      LINK: 8,
      wstETH: 18,
      AAVE: 8,
      ARB: 8,
      rETH: 18,
      FRAX: 8,
      LUSD: 8,
      EURS: 8,
      MAI: 8,
      USDCn: 8,
      weETH: 18,
      GHO: 8,
      ezETH: 18,
    },
    isFeatured: true,
  },
  {
    chainId: 'optimism',
    displayName: 'Aave v3 Optimism',
    description: 'Aave v3 on Optimism',
    isTestnet: false,
    supportedTokens: [
      'DAI',
      'LINK',
      'USDC',
      'WBTC',
      'WETH',
      'USDT',
      'AAVE',
      'sUSD',
      'OP',
      'wstETH',
      'LUSD',
      'MAI',
      'rETH',
      'USDCn',
      'ETH',
    ],
    priceFeedDecimals: {
      ETH: 8,
      WETH: 8,
      WBTC: 8,
      USDC: 8,
      USDT: 8,
      DAI: 8,
      LINK: 8,
      wstETH: 18,
      AAVE: 8,
      OP: 8,
      rETH: 18,
      FRAX: 8,
      LUSD: 8,
      sUSD: 8,
      MAI: 8,
      USDCn: 8,
    },
    isFeatured: true,
  },
  {
    chainId: 'sonic',
    displayName: 'Aave v3 Sonic',
    description: 'Aave v3 on Sonic',
    isTestnet: false,
    supportedTokens: ['SONIC', 'wS', 'S', 'USDC.e'],
    priceFeedDecimals: {
      SONIC: 8,
      wS: 8,
      S: 8,
      'USDC.e': 8,
    },
    isFeatured: false,
  },
];

/**
 * Initialize market configurations by adding dynamic properties
 * that come from the Aave Address Book
 */
export const initializeMarketConfigs = (): AaveMarketConfig[] => {
  return AAVE_MARKETS.map((market) => {
    const isConfigured = isMarketConfigured(market.chainId);
    const tokenAddresses = getTokenAddressesForMarket(market.chainId);

    return {
      ...market,
      isConfigured,
      tokenAddresses,
    };
  });
};

/**
 * Get a market configuration by chain ID
 */
export const getMarketConfig = (
  chainId: SupportedChain,
): AaveMarketConfig | undefined => {
  const market = AAVE_MARKETS.find((m) => m.chainId === chainId);

  if (!market) {
    return undefined;
  }

  const isConfigured = isMarketConfigured(chainId);
  const tokenAddresses = getTokenAddressesForMarket(chainId);

  return {
    ...market,
    isConfigured,
    tokenAddresses,
  };
};

/**
 * Get all available market configurations
 */
export const getAllMarketConfigs = (): AaveMarketConfig[] => {
  return initializeMarketConfigs();
};
