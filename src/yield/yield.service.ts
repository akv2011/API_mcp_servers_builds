/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { AaveService } from '../aave/aave.service';
import { MorphoService } from '../morpho/morpho.service';
import {
  GetYieldQueryDto,
  YieldOpportunityDto,
  YieldProtocol,
} from './dto/yield.dto';
import { SupportedChain } from '../common/types/chain.type';
import { getChainId } from '../common/utils/chain.utils';
import { MARKET_MAPPING } from '../aave/constants/address-provider';
import { Hex } from 'viem';

// Define Morpho types locally if not exported
const MORPHO_EARN_SUPPORTED_CHAINS = ['mainnet', 'base'] as const;
type MorphoEarnSupportedChain = (typeof MORPHO_EARN_SUPPORTED_CHAINS)[number];

// Define an interface for the expected data from AaveService
interface AavePoolData {
  symbol: string;
  tokenAddress: string;
  supplyApy: string; // APY as string
  totalSupplyUsd: string; // TVL as string
  // Add other potential fields if needed
  isCollateral?: boolean;
  ltv?: string;
  price?: string;
}

@Injectable()
export class YieldService {
  private readonly logger = new Logger(YieldService.name);

  constructor(
    private readonly aaveService: AaveService,
    private readonly morphoService: MorphoService,
  ) {}

  async getTopYieldOpportunities(
    query: GetYieldQueryDto,
  ): Promise<YieldOpportunityDto[]> {
    this.logger.log(
      `Fetching yield opportunities with query: ${JSON.stringify(query)}`,
    );
    this.logger.log(
      `DEBUG: Raw limit value: ${query.limit}, type: ${typeof query.limit}`,
    );
    const { chain, asset, protocol, minApy, limit } = query;

    let allOpportunities: YieldOpportunityDto[] = [];

    // --- Fetch from Aave ---
    if (!protocol || protocol === YieldProtocol.AAVE) {
      try {
        // Get supported Aave chains from address-provider
        const aaveChainsToFetch: SupportedChain[] = chain
          ? [chain]
          : this.getAaveSupportedChains();

        this.logger.log(
          `Fetching Aave opportunities from chains: ${aaveChainsToFetch.join(', ')}`,
        );

        const aavePromises = aaveChainsToFetch.map(async (aaveChain) => {
          this.logger.log(`Fetching Aave market data for ${aaveChain}`);
          const marketData = await this.aaveService.getMarketInfo(aaveChain);
          if (
            marketData?.pools &&
            Array.isArray(marketData.pools) &&
            !marketData.error
          ) {
            this.logger.log(
              `Found ${marketData.pools.length} pools for ${aaveChain}`,
            );
            const mappedOpportunities: YieldOpportunityDto[] =
              marketData.pools.map((pool: AavePoolData) => {
                const opportunity: YieldOpportunityDto = {
                  protocol: YieldProtocol.AAVE,
                  chain: aaveChain,
                  assetSymbol: pool.symbol ?? 'Unknown',
                  assetAddress: pool.tokenAddress ?? '0x',
                  apy: String(pool.supplyApy ?? '0.00'),
                  tvlUsd: String(pool.totalSupplyUsd ?? '0.00'),
                  name: pool.symbol ?? 'Unknown',
                  availableLiquidityUsd: undefined, // Aave typically doesn't expose simple available liquidity for supply side
                  yieldType: 'Supply',
                  rewards: undefined, // Aave rewards mapping needs separate logic if required
                  // rewardApr: undefined, // Remove old field assignment here too
                  // rewardTokenSymbol: undefined, // Remove old field assignment here too
                };
                return opportunity;
              });
            return mappedOpportunities;
          } else {
            this.logger.warn(
              `Could not fetch or process Aave market data for ${aaveChain}: ${marketData?.error || 'Pool data missing'}`,
            );
            return [];
          }
        });

        const aaveResults: YieldOpportunityDto[][] =
          await Promise.all(aavePromises);
        const flattenedAaveOps: YieldOpportunityDto[] = aaveResults
          .filter((result) => Array.isArray(result) && result.length > 0)
          .flat();
        allOpportunities = allOpportunities.concat(flattenedAaveOps);
        this.logger.log(
          `Fetched ${allOpportunities.length} initial Aave opportunities.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch Aave opportunities: ${error.message}`,
          error.stack,
        );
      }
    }

    // --- Fetch from Morpho Earn ---
    if (!protocol || protocol === YieldProtocol.MORPHO) {
      try {
        const allVaults = await this.morphoService.getEarnVaultWhitelist();
        if (!allVaults) {
          this.logger.warn('Could not fetch Morpho vault whitelist.');
        } else {
          const morphoChainsToFetch: MorphoEarnSupportedChain[] = chain
            ? MORPHO_EARN_SUPPORTED_CHAINS.includes(
                chain as MorphoEarnSupportedChain,
              )
              ? [chain as MorphoEarnSupportedChain]
              : []
            : [...MORPHO_EARN_SUPPORTED_CHAINS];

          const morphoPromises = morphoChainsToFetch.map(
            async (morphoChain) => {
              const chainId = getChainId(morphoChain); // Use imported getChainId
              const chainVaults = allVaults.filter(
                (v) => v.chainId === chainId,
              );

              const vaultDataPromises = chainVaults.map(async (vaultMeta) => {
                if (!vaultMeta?.address) return null;

                const vaultData =
                  await this.morphoService.getEarnVaultPublicData(
                    vaultMeta.address,
                    chainId,
                  );

                if (!vaultData) {
                  this.logger.warn(
                    `Skipping vault ${vaultMeta.address} on ${morphoChain}: Failed to fetch public data.`,
                  );
                  return null;
                }

                // --- Check for essential data (Update check) ---
                if (!vaultData?.state?.dailyNetApy || !vaultData.symbol) {
                  this.logger.warn(
                    `Skipping vault ${vaultMeta.address} on ${morphoChain}: Missing essential data (dailyNetApy or symbol) in API response. Symbol: ${vaultData?.symbol}, dailyNetApy: ${vaultData?.state?.dailyNetApy}`,
                  );
                  return null;
                }
                // --- End Check ---

                // --- Use the vault's own token information ---
                // Get the underlying token data directly from the vault
                const vaultSymbol = vaultData.symbol;

                // Check for asset info from multiple sources (in order of preference)
                // 1. From vault data API response
                // 2. From whitelist metadata (new)
                // 3. Fallback (skip)
                let tokenInfo: {
                  chainId: number;
                  address: Hex;
                  name: string;
                  symbol: string;
                  decimals: number;
                  logoURI: string;
                } | null = null;

                if (vaultData.asset && vaultData.asset.address) {
                  // Source 1: Use data from the GraphQL vault data response
                  tokenInfo = {
                    chainId: getChainId(morphoChain),
                    address: vaultData.asset.address as Hex,
                    name:
                      vaultData.asset.name ||
                      vaultData.asset.symbol ||
                      vaultSymbol,
                    symbol:
                      vaultData.asset.symbol ||
                      vaultSymbol.replace(/^[a-z]+/, ''),
                    decimals: vaultData.asset.decimals || 18,
                    logoURI: vaultData.asset.logoURI || '',
                  };
                  this.logger.log(
                    `Using token info from vault data for ${vaultMeta.address}: ${tokenInfo.symbol} (${tokenInfo.address})`,
                  );
                } else if (vaultMeta.asset && vaultMeta.asset.address) {
                  // Source 2: Use asset data from the whitelist vault metadata
                  tokenInfo = {
                    chainId: getChainId(morphoChain),
                    address: vaultMeta.asset.address as Hex,
                    name: vaultMeta.asset.name || vaultMeta.asset.symbol,
                    symbol: vaultMeta.asset.symbol,
                    decimals: vaultMeta.asset.decimals,
                    logoURI: '',
                  };
                  this.logger.log(
                    `Using token info from whitelist metadata for ${vaultMeta.address}: ${tokenInfo.symbol} (${tokenInfo.address})`,
                  );
                } else {
                  // No asset information available from either source
                  this.logger.warn(
                    `Skipping vault ${vaultMeta.address} on ${morphoChain}: Missing asset information in both vault data and whitelist metadata`,
                  );
                  return null;
                }

                // Now continue with the rest of the vault processing using the tokenInfo object
                // Calculate APY, Curator Name, Liquidity, TVL & Deposits
                const apy = (vaultData.state.dailyNetApy * 100).toFixed(2);
                const curatorName =
                  vaultMeta.curators?.map((c) => c.name).join(', ') ??
                  undefined;
                const liquidityValue = parseFloat(
                  vaultData?.liquidity?.usd || '0',
                );
                const availableLiquidityUsd = liquidityValue.toFixed(2);
                const tvlUsd = vaultData.state?.totalAssetsUsd ?? undefined;
                const totalDepositsUnits =
                  vaultData.state?.totalAssets ?? undefined;
                const vaultName = vaultData.name || 'Unnamed Vault';
                const descriptiveName = curatorName
                  ? `${vaultName} (${curatorName})`
                  : vaultName;

                // Extract Base APY
                const baseApyValue = vaultData.state?.dailyApy;
                const baseApy = baseApyValue
                  ? (baseApyValue * 100).toFixed(2)
                  : undefined;

                // Extract rewards if available
                const mappedRewards = vaultData.state?.rewards?.map(
                  (reward: any) => {
                    const apyValue = reward?.supplyApr;
                    const rewardApy = apyValue
                      ? (apyValue * 100).toFixed(2)
                      : '0.00';
                    const symbol = reward?.asset?.symbol || 'Unknown';
                    const address = reward?.asset?.address || '0x';
                    return {
                      apy: rewardApy,
                      symbol,
                      address,
                    };
                  },
                );

                const filteredRewards = mappedRewards?.filter(
                  (r) => r.symbol !== 'Unknown' && r.address !== '0x',
                );

                // Use the tokenInfo (which is guaranteed to be non-null at this point)
                // to create the opportunity
                const opportunity: YieldOpportunityDto = {
                  protocol: YieldProtocol.MORPHO,
                  chain: morphoChain,
                  assetSymbol: tokenInfo!.symbol,
                  assetAddress: tokenInfo!.address,
                  apy: apy,
                  baseApy: baseApy,
                  tvlUsd: tvlUsd,
                  availableLiquidityUsd: availableLiquidityUsd,
                  totalDepositsUnits: totalDepositsUnits,
                  name: descriptiveName,
                  yieldType: 'Vault Deposit',
                  rewards:
                    filteredRewards && filteredRewards.length > 0
                      ? filteredRewards
                      : undefined,
                  vaultAddress: vaultMeta.address,
                };
                return opportunity;
              });

              // Await all data fetches and filter nulls
              const chainOpportunities: YieldOpportunityDto[] = (
                await Promise.all(vaultDataPromises)
              ).filter((opp): opp is YieldOpportunityDto => opp !== null);
              return chainOpportunities;
            },
          );

          const morphoResults = await Promise.all(morphoPromises);
          const flattenedMorphoOps: YieldOpportunityDto[] =
            morphoResults.flat();
          allOpportunities = allOpportunities.concat(flattenedMorphoOps);
          this.logger.log(
            `Added ${flattenedMorphoOps.length} Morpho Earn opportunities.`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch Morpho Earn opportunities: ${error.message}`,
          error.stack,
        );
      }
    }

    // --- Filtering ---
    let filteredOpportunities = allOpportunities;

    // Filter by asset symbol (case-insensitive)
    if (asset) {
      filteredOpportunities = filteredOpportunities.filter(
        (opp) => opp.assetSymbol.toLowerCase() === asset.toLowerCase(),
      );
      this.logger.log(
        `Filtered by asset ${asset}: ${filteredOpportunities.length} opportunities remaining.`,
      );
    }

    // Filter by minimum APY
    if (minApy !== undefined) {
      filteredOpportunities = filteredOpportunities.filter((opp) => {
        // Handle '<0.01' case and potential parsing errors
        const apyNum = parseFloat(opp.apy);
        return !isNaN(apyNum) && apyNum >= minApy;
      });
      this.logger.log(
        `Filtered by minApy ${minApy}%: ${filteredOpportunities.length} opportunities remaining.`,
      );
    }

    // --- Sorting ---
    filteredOpportunities.sort((a, b) => {
      // Handle '<0.01' - treat as 0 for sorting purposes
      const apyA = parseFloat(a.apy.replace('<', '')) || 0;
      const apyB = parseFloat(b.apy.replace('<', '')) || 0;
      return apyB - apyA; // Sort descending
    });

    // --- Limit Results ---
    const totalCount = filteredOpportunities.length;

    // Debug log for limit value
    this.logger.log(`DEBUG: Applying limit: ${limit}, type: ${typeof limit}`);

    // Handle the limit more robustly:
    // 1. Convert to number if it's a string
    // 2. Treat values like 0, -1, and undefined as "no limit"
    let finalOpportunities: YieldOpportunityDto[];
    
    const numericLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    
    if (numericLimit === undefined || numericLimit <= 0) {
      // No limit, return all opportunities
      finalOpportunities = filteredOpportunities;
      this.logger.log(`Using no limit, returning all ${filteredOpportunities.length} opportunities`);
    } else {
      // Apply the limit
      finalOpportunities = filteredOpportunities.slice(0, numericLimit);
      this.logger.log(`Applied limit of ${numericLimit}, returning ${finalOpportunities.length} opportunities`);
    }

    this.logger.log(
      `Returning ${finalOpportunities.length} opportunities out of ${totalCount} total.`,
    );

    return finalOpportunities;
  }

  /**
   * Returns Aave supported chains by checking which chains have configured markets
   * @returns Array of supported chains for Aave
   */
  private getAaveSupportedChains(): SupportedChain[] {
    // Get chains from MARKET_MAPPING in address-provider
    const supportedChains = Object.keys(MARKET_MAPPING) as SupportedChain[];

    this.logger.log(
      `Using Aave supported chains: ${supportedChains.join(', ')}`,
    );
    return supportedChains;
  }
}