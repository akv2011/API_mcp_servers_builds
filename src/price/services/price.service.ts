import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import { SupportedChain } from '../../chain/types/chain.type';
import { TokenCacheService } from '../../token/services/token-cache.service';
import { TokenPriceService } from '../../token/interfaces/token.interface';

interface DexScreenerTokenResponse {
  pairs: Array<{
    chainId: string;
    dexId: string;
    priceUsd: string;
    priceNative: string;
    baseToken: {
      address: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      symbol: string;
    };
    liquidity: {
      usd: number;
    };
  }>;
}

interface CoinGeckoTokenResponse {
  [tokenId: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

// Maps common token symbols to CoinGecko IDs
const COINGECKO_ID_MAP: Record<string, string> = {
  // Ethereum tokens
  WETH: 'ethereum',
  wstETH: 'wrapped-steth',
  WBTC: 'wrapped-bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  LINK: 'chainlink',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  BAL: 'balancer',
  GHO: 'gho',
  rETH: 'rocket-pool-eth',
  cbETH: 'coinbase-wrapped-staked-eth',
  FRAX: 'frax',
  MKR: 'maker',
  SNX: 'synthetix-network-token',
  UNI: 'uniswap',
  LDO: 'lido-dao',
  ENS: 'ethereum-name-service',
  ONE_INCH: '1inch',
  RPL: 'rocket-pool',
  sDAI: 'stake-dao',
  STG: 'stargate-finance',
  KNC: 'kyber-network-crystal',
  FXS: 'frax-share',
  crvUSD: 'curve-dao-token',
  PYUSD: 'paypal-usd',
  weETH: 'wrapped-eth',
  osETH: 'stader-eth',
  USDe: 'ethena-usd',
  ETHx: 'stader-eth',
  sUSDe: 'sperax-usd',
  tBTC: 'threshold-network-token',
  USDS: 'sperax-usd',
  rsETH: 'stakewise',
  LBTC: 'liquity-bitcoin',

  // Arbitrum tokens
  ARB: 'arbitrum',
  EURS: 'stasis-eurs',
  MAI: 'mai',
  USDCn: 'usd-coin',

  // Optimism tokens
  OP: 'optimism',
  sUSD: 'nusd',

  // Base tokens
  USDbC: 'usd-coin',
  cbBTC: 'wrapped-bitcoin',

  // Sonic tokens
  SONIC: 'sonic',
};

@Injectable()
export class PriceService implements TokenPriceService {
  private readonly logger = new Logger(PriceService.name);
  private priceCache: Map<string, { price: bigint; timestamp: number }> =
    new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(
    @Inject(forwardRef(() => TokenCacheService))
    private readonly tokenCacheService: TokenCacheService,
  ) {}

  // Static prices for stablecoins and tokens without reliable price sources
  private readonly STATIC_PRICES: Record<string, number> = {
    GHO: 1.0, // GHO is a stablecoin pegged to $1
    USDbC: 1.0, // Base stablecoin
    USDC: 1.0, // USDC stablecoin
    USDT: 1.0, // Tether
    DAI: 1.0, // DAI stablecoin
    FRAX: 1.0, // Frax
    LUSD: 1.0, // Liquity USD
    sUSD: 1.0, // Synthetix USD
    PYUSD: 1.0, // PayPal USD
    USDe: 1.0, // Ethena USD
    sUSDe: 1.0, // Sperax USD
    USDS: 1.0, // Sperax USD
    crvUSD: 1.0, // Curve USD
    USDCn: 1.0, // Native USDC
    sDAI: 1.0, // Staked DAI
    EURS: 1.08, // STASIS EURO (approximate USD value)
  };

  /**
   * Get token price using TokenCacheService to find CoinGecko ID
   * This is the preferred method for getting token prices
   */
  async getTokenPriceFromCache(symbol: string): Promise<bigint> {
    try {
      const cacheKey = `price-${symbol}`;
      const now = Date.now();
      const cached = this.priceCache.get(cacheKey);

      if (cached && now - cached.timestamp < this.CACHE_DURATION) {
        return cached.price;
      }

      // Get token info from cache without updating price
      const token = await this.tokenCacheService.findToken(
        symbol,
        'symbol',
        false,
      );
      if (!token) {
        this.logger.warn(`No token found in cache for symbol: ${symbol}`);
        return 0n;
      }

      try {
        const response = await axios.get<CoinGeckoTokenResponse>(
          `https://api.coingecko.com/api/v3/simple/price?ids=${token.id}&vs_currencies=usd&include_24hr_change=true`,
        );

        if (response.data[token.id]?.usd) {
          const price = BigInt(Math.floor(response.data[token.id].usd * 1e8));
          this.priceCache.set(cacheKey, { price, timestamp: now });
          return price;
        }
      } catch (error) {
        this.logger.warn(
          `CoinGecko price fetch failed for ${symbol}: ${error.message}`,
        );
      }

      // If CoinGecko fails, try to use the cached price from token data
      if (token.current_price) {
        const price = BigInt(Math.floor(token.current_price * 1e8));
        this.priceCache.set(cacheKey, { price, timestamp: now });
        return price;
      }

      return 0n;
    } catch (error) {
      this.logger.error(`Error fetching price for ${symbol}: ${error.message}`);
      return 0n;
    }
  }

  // Continue to support the original method for backward compatibility
  async getDexScreenerPrice(
    chain: SupportedChain,
    symbol: string,
    tokenAddress: string,
  ): Promise<bigint> {
    return this.getTokenPrice(chain, symbol, tokenAddress);
  }

  // The new, more robust price fetching method
  async getTokenPrice(
    chain: SupportedChain,
    symbol: string,
    tokenAddress?: string,
  ): Promise<bigint> {
    try {
      const cacheKey = `${chain}-${symbol}`;
      const now = Date.now();
      const cached = this.priceCache.get(cacheKey);

      if (cached && now - cached.timestamp < this.CACHE_DURATION) {
        return cached.price;
      }

      // Try fetching price using different methods in sequence
      let price: bigint | null = null;

      // 1. Try static price if it's a stablecoin or known price
      if (this.STATIC_PRICES[symbol]) {
        price = BigInt(Math.floor(this.STATIC_PRICES[symbol] * 1e8));
      }

      // 2. Try CoinGecko API if not a static price
      if (!price) {
        price = await this.fetchCoinGeckoPrice(symbol);
      }

      // 3. Try 1inch API as a fallback for Ethereum tokens
      if (
        !price &&
        tokenAddress &&
        (chain === 'mainnet' || chain.startsWith('mainnet-'))
      ) {
        price = await this.fetch1InchPrice(symbol, tokenAddress);
      }

      // 4. Try DexScreener as a last resort
      if (!price && tokenAddress) {
        price = await this.fetchDexScreenerPrice(tokenAddress);
      }

      // If we still don't have a price, return 0
      if (!price) {
        this.logger.warn(`Could not fetch price for ${symbol} on ${chain}`);
        return 0n;
      }

      // Cache the price
      this.priceCache.set(cacheKey, { price, timestamp: now });

      return price;
    } catch (error) {
      this.logger.error(`Error fetching price for ${symbol}: ${error.message}`);
      return 0n;
    }
  }

  private async fetchCoinGeckoPrice(symbol: string): Promise<bigint | null> {
    try {
      const coinId = COINGECKO_ID_MAP[symbol];
      if (!coinId) {
        return null;
      }

      const response = await axios.get<CoinGeckoTokenResponse>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
      );

      if (response.data[coinId]?.usd) {
        return BigInt(Math.floor(response.data[coinId].usd * 1e8));
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `CoinGecko price fetch failed for ${symbol}: ${error.message}`,
      );
      return null;
    }
  }

  private async fetch1InchPrice(
    symbol: string,
    tokenAddress: string,
  ): Promise<bigint | null> {
    try {
      // 1inch uses Ethereum mainnet for price quotes
      const response = await axios.get(
        `https://api.1inch.io/v5.0/1/quote?fromTokenAddress=${tokenAddress}&toTokenAddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&amount=1000000000000000000`,
      );

      if (response.data?.toTokenAmount) {
        // Convert USDT amount to USD (assuming 1 USDT = $1)
        const amount = BigInt(response.data.toTokenAmount as string);
        const price = (amount * BigInt(1e8)) / BigInt(1e6); // USDT has 6 decimals
        return price;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `1inch price fetch failed for ${symbol}: ${error.message}`,
      );
      return null;
    }
  }

  private async fetchDexScreenerPrice(
    tokenAddress: string,
  ): Promise<bigint | null> {
    try {
      const response = await axios.get<DexScreenerTokenResponse>(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      );

      const pairs = response.data.pairs;
      if (!pairs?.length) {
        return null;
      }

      return BigInt(Math.floor(Number(pairs[0].priceUsd) * 1e8));
    } catch (error) {
      this.logger.warn(
        `DexScreener price fetch failed for ${tokenAddress}: ${error.message}`,
      );
      return null;
    }
  }
}
