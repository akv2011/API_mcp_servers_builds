/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  AggregatedMarketsResponseDto,
  ProtocolPoolsDto,
} from './dto/market.dto';
import { MarketSearchQueryDto } from './dto/market-search.dto';
import { AaveService } from '../aave/aave.service';
import { MorphoService } from '../morpho/morpho.service';
import { SUPPORTED_CHAINS, SupportedChain } from '../chain';
import { getAddressesForMarket } from '../aave/constants/address-provider';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);
  private readonly CACHE_KEY_PREFIX = 'markets:';

  constructor(
    private readonly aaveService: AaveService,
    private readonly morphoService: MorphoService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private getCacheKey(query: MarketSearchQueryDto): string {
    const { protocol, chain, collateralTokenSymbol, borrowTokenSymbol } = query;
    return `${this.CACHE_KEY_PREFIX}${protocol || 'all'}:${chain || 'all'}:${
      collateralTokenSymbol || 'all'
    }:${borrowTokenSymbol || 'all'}`;
  }

  private filterMarkets(
    markets: AggregatedMarketsResponseDto,
    query: MarketSearchQueryDto,
  ): AggregatedMarketsResponseDto {
    const { collateralTokenSymbol, borrowTokenSymbol } = query;

    if (!collateralTokenSymbol && !borrowTokenSymbol) {
      return markets;
    }

    return {
      protocols: markets.protocols
        .map((protocol) => ({
          ...protocol,
          chains: protocol.chains
            .map((chain) => ({
              ...chain,
              pools: chain.pools
                .map((pool) => ({
                  ...pool,
                  assets: pool.assets.filter((asset) => {
                    const matchesCollateral =
                      !collateralTokenSymbol ||
                      asset.underlyingSymbol.toLowerCase() ===
                        collateralTokenSymbol.toLowerCase();
                    const matchesBorrow =
                      !borrowTokenSymbol ||
                      asset.underlyingSymbol.toLowerCase() ===
                        borrowTokenSymbol.toLowerCase();
                    return matchesCollateral || matchesBorrow;
                  }),
                }))
                .filter((pool) => pool.assets.length > 0),
            }))
            .filter((chain) => chain.pools.length > 0),
        }))
        .filter((protocol) => protocol.chains.length > 0),
    };
  }

  async getAllMarkets(
    query: MarketSearchQueryDto,
  ): Promise<AggregatedMarketsResponseDto> {
    try {
      const cacheKey = this.getCacheKey(query);

      const cachedData =
        await this.cacheManager.get<AggregatedMarketsResponseDto>(cacheKey);

      if (cachedData) {
        this.logger.log('Returning cached market data');
        return cachedData as AggregatedMarketsResponseDto;
      }

      this.logger.log('Cache miss - fetching fresh market data');
      const markets = await this.fetchAllMarkets(query);
      const filteredMarkets = this.filterMarkets(markets, query);

      // Cache the filtered results
      await this.cacheManager.set(cacheKey, filteredMarkets);

      return filteredMarkets;
    } catch (error) {
      this.logger.error('Error getting markets:', error);
      throw error;
    }
  }

  private async fetchAllMarkets(
    query: MarketSearchQueryDto,
  ): Promise<AggregatedMarketsResponseDto> {
    const { protocol, collateralTokenSymbol, borrowTokenSymbol } = query;
    this.logger.log('Getting markets with query:', query);
    const markets: AggregatedMarketsResponseDto = {
      protocols: [],
    };

    const fetchPromises: Promise<void>[] = [];

    // Use the same token for both collateral and borrow if either is specified
    const tokenSymbol = collateralTokenSymbol || borrowTokenSymbol;

    if (!protocol || protocol === 'aave') {
      fetchPromises.push(
        (async () => {
          try {
            this.logger.log('Fetching Aave markets...');
            const aaveMarkets = await this.getAaveMarkets(tokenSymbol);
            this.logger.log(
              'Aave markets result:',
              JSON.stringify(aaveMarkets, null, 2),
            );
            if (aaveMarkets.chains && aaveMarkets.chains.length > 0) {
              markets.protocols.push(aaveMarkets);
            } else {
              this.logger.warn('No Aave markets found');
            }
          } catch (error) {
            this.logger.error('Error fetching Aave markets:', error);
          }
        })(),
      );
    }

    if (!protocol || protocol === 'morpho') {
      fetchPromises.push(
        (async () => {
          try {
            this.logger.log('Fetching Morpho markets...');
            const morphoMarkets = await this.getMorphoMarkets(query);
            this.logger.log(
              'Morpho markets result:',
              JSON.stringify(morphoMarkets, null, 2),
            );
            if (morphoMarkets.chains && morphoMarkets.chains.length > 0) {
              markets.protocols.push(morphoMarkets);
            } else {
              this.logger.warn('No Morpho markets found');
            }
          } catch (error) {
            this.logger.error('Error fetching Morpho markets:', error);
          }
        })(),
      );
    }

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    return markets;
  }

  private async getAaveMarkets(
    tokenSymbol?: string,
  ): Promise<ProtocolPoolsDto> {
    const chains = SUPPORTED_CHAINS.filter((chain) => {
      const addresses = getAddressesForMarket(chain);
      return addresses.POOL && addresses.POOL_DATA_PROVIDER;
    });

    const chainResults = await Promise.all(
      chains.map(async (chain) => {
        try {
          return await this.aaveService.getMarketInfo(chain, tokenSymbol);
        } catch (error) {
          this.logger.error(`Error fetching Aave markets for ${chain}:`, error);
          return null;
        }
      }),
    );

    const validChainResults = chainResults
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .filter((result) => result.pools && result.pools.length > 0);

    return {
      protocol: 'aave',
      chains: validChainResults.map((result) => ({
        chain: result.chain,
        pools: [
          {
            name: result.name || `Aave v3 ${result.chain}`,
            poolId: getAddressesForMarket(result.chain).POOL || 'unknown',
            totalValueUsd: parseFloat(result.totalValueLocked || '0'),
            assets: result.pools.map((pool) => {
              this.logger.debug(
                `[DEBUG] Processing pool asset on ${result.chain}:
                 Address: ${pool.tokenAddress}
                 Symbol from pool: ${pool.symbol}
                 Underlying Symbol: ${pool.underlyingSymbol}`,
              );
              return {
                underlyingSymbol: pool.underlyingSymbol || pool.symbol,
                address: pool.tokenAddress,
                underlyingDecimals: pool.underlyingDecimals || 18,
                totalSupply: pool.totalSupply || '0',
                totalSupplyUsd: pool.totalSupplyUsd || '0',
                totalBorrow: pool.totalBorrow || '0',
                totalBorrowUsd: pool.totalBorrowUsd || '0',
                liquidity: pool.liquidity || '0',
                liquidityUsd: pool.liquidityUsd || '0',
                supplyApy: pool.supplyApy || '0',
                borrowApy: pool.borrowApy || '0',
                isCollateral: pool.isCollateral,
                ltv: pool.ltv
                  ? (parseInt(pool.ltv) / 10000).toFixed(2)
                  : '0.80',
                rewards: [],
              };
            }),
          },
        ],
      })),
    };
  }

  private async getMorphoMarkets(
    query: MarketSearchQueryDto,
  ): Promise<ProtocolPoolsDto> {
    this.logger.debug('Starting Morpho markets fetch with query:', query);
    const markets: ProtocolPoolsDto = {
      protocol: 'morpho',
      chains: [],
    };
    // Morpho supported chains
    const morphoChains = ['mainnet', 'base'] as const;
    // Filter chains based on query if provided
    const chainsToSearch = query.chain
      ? morphoChains.includes(query.chain as (typeof morphoChains)[number])
        ? [query.chain]
        : []
      : morphoChains;
    this.logger.debug('Searching Morpho chains:', chainsToSearch);

    // Special handling for same token in collateral and borrow
    const morphoQuery = { ...query };
    if (
      query.collateralTokenSymbol &&
      query.borrowTokenSymbol &&
      query.collateralTokenSymbol === query.borrowTokenSymbol
    ) {
      this.logger.debug(
        `Same token (${query.collateralTokenSymbol}) requested for both collateral and borrow - adjusting Morpho query`,
      );
      // For Morpho, we'll need to search for markets with this token as either collateral OR borrow
      // We'll do this by making separate queries and combining results
      const asCollateral = { ...query, borrowTokenSymbol: undefined };
      const asBorrow = { ...query, collateralTokenSymbol: undefined };
      
      // Use proper typing for combinedChains
      const combinedChains: Array<{
        chain: SupportedChain;
        pools: Array<{
          name: string;
          poolId: string;
          totalValueUsd: number;
          assets: any[];
        }>;
      }> = [];

      // First query for token as collateral
      for (const chain of chainsToSearch) {
        try {
          const collateralMarkets = await this.morphoService.getMarketInfo({
            ...asCollateral,
            chain: chain as SupportedChain,
          });

          if (collateralMarkets.chains && collateralMarkets.chains.length > 0) {
            combinedChains.push(...collateralMarkets.chains);
          }

          // Then query for token as borrow
          const borrowMarkets = await this.morphoService.getMarketInfo({
            ...asBorrow,
            chain: chain as SupportedChain,
          });

          if (borrowMarkets.chains && borrowMarkets.chains.length > 0) {
            // Combine results by chain
            for (const borrowChain of borrowMarkets.chains) {
              const existingChain = combinedChains.find(
                (c) => c.chain === borrowChain.chain,
              );
              if (existingChain) {
                // Merge pools, avoiding duplicates by poolId
                const existingPoolIds = new Set(
                  existingChain.pools.map((p) => p.poolId),
                );
                for (const pool of borrowChain.pools) {
                  if (!existingPoolIds.has(pool.poolId)) {
                    existingChain.pools.push(pool);
                  }
                }
              } else {
                combinedChains.push(borrowChain);
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Error fetching Morpho markets for chain ${chain}:`,
            error,
          );
        }
      }

      markets.chains = combinedChains;
      return markets;
    }

    // Normal case - different tokens or only one token specified
    for (const chain of chainsToSearch) {
      try {
        this.logger.debug(`Fetching Morpho market info for chain ${chain}...`);
        const marketInfo = await this.morphoService.getMarketInfo({
          ...morphoQuery,
          chain: chain as SupportedChain,
        });
        if (marketInfo && marketInfo.chains && marketInfo.chains.length > 0) {
          this.logger.debug(
            `Found ${marketInfo.chains.length} markets for chain ${chain}`,
          );
          markets.chains.push(...marketInfo.chains);
        } else {
          this.logger.warn(`No markets found for chain ${chain}`);
        }
      } catch (error) {
        this.logger.error(
          `Error fetching Morpho markets for chain ${chain}:`,
          error,
        );
      }
    }
    return markets;
  }
}
