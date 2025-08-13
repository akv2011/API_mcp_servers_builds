import { Injectable, Logger } from '@nestjs/common';
import { SupportedChain } from '../chain';
import { AaveOperationParams } from './dto/aave-operation.dto';
import { SupabaseService } from '../database';
import { ChainService } from '../chain';
import { POOL_DATA_PROVIDER_ABI, POOL_ABI } from './constants/abi';
import { encodeFunctionData, PublicClient, Address, erc20Abi } from 'viem';
import {
  ATOKEN_ABI,
  DEBT_TOKEN_ABI,
  POOL_SUPPLY_ABI,
  POOL_REPAY_ABI,
} from '../aave/constants/abi';
import { TokenService } from './services/token.service';
import { PriceService } from '../price';
import { getAddressesForMarket } from './constants/address-provider';
import { getMarketConfig } from './constants/market-config';
import { MarketPoolDto } from '../markets/dto/market.dto';
import { getChainId } from '../common/utils/chain.utils';
// Update borrow ABI
const POOL_BORROW_ABI = [
  {
    name: 'borrow',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
// Add withdraw ABI
const POOL_WITHDRAW_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;
// Interface definitions
interface ReserveToken {
  symbol: string;
  tokenAddress: `0x${string}`;
  displaySymbol?: string;
  originalSymbol?: string;
  name?: string;
  isBridged?: boolean;
}
interface ReserveConfig {
  [index: number]: bigint | boolean;
}
interface ReserveData {
  [index: number]: bigint;
}
// Define the structured response type to match Morpho's format
export interface AaveOperationResponseDto {
  transactionData: {
    to: string;
    data: string;
    value: string;
    functionName?: string;
    functionSignature?: string;
  };
  approvalTransactions?: Array<{
    to: string;
    data: string;
    value: string;
    description: string;
    functionName?: string;
    functionSignature?: string;
  }>;
  simulation: {
    market: string;
    asset: {
      token: string;
      address: string;
      amount: string;
      decimals: number;
    };
    operations: Array<{
      type: string;
      token: string;
    }>;
    message: string;
  };
  chainId: number;
}
@Injectable()
export class AaveService {
  private readonly logger = new Logger(AaveService.name);
  private readonly chainService: ChainService;
  private readonly tokenService: TokenService;
  private readonly priceService: PriceService;
  // Add cache for token decimals to avoid repeated calls
  private tokenDecimalsCache: Record<string, number> = {};
  constructor(
    private readonly supabaseService: SupabaseService,
    tokenService: TokenService,
    priceService: PriceService,
    chainService: ChainService,
  ) {
    this.chainService = chainService;
    this.tokenService = tokenService;
    this.priceService = priceService;
    // Logger level is set in the global configuration
  }
  // Update the main APY calculation to handle all cases properly
  private calculateApy(ratePerSecond: bigint): string {
    // Handle zero rate case
    if (ratePerSecond === 0n) {
      return '0.00';
    }
    try {
      // Log the raw rate value for debugging
      this.logger.debug(`Raw rate value: ${ratePerSecond.toString()}`);
      // Define the RAY constant (10^27)
      const RAY = 1_000_000_000_000_000_000_000_000_000n;
      const SECONDS_PER_YEAR = 31536000;
      // Aave's standard formula is APY = ((1 + rate/secondsPerYear)^secondsPerYear) - 1
      // But rates above 1.0 RAY need special handling
      // For rates >= 1.0 RAY, subtract 1.0 RAY first
      // This is because rates close to 1.0 RAY represent a base (1.0) plus a small interest rate
      let adjustedRate = ratePerSecond;
      if (adjustedRate >= RAY) {
        adjustedRate = adjustedRate - RAY;
      }
      // Convert rate from bigint to number for math operations
      const ratePerSecondDecimal = Number(adjustedRate) / Number(RAY);
      // Calculate APY using the proper formula from Aave docs
      const apy =
        (Math.pow(
          1 + ratePerSecondDecimal / SECONDS_PER_YEAR,
          SECONDS_PER_YEAR,
        ) -
          1) *
        100;
      // Handle very small rates
      if (apy < 0.01 && apy > 0) {
        return '<0.01';
      }
      return apy.toFixed(2);
    } catch (error) {
      this.logger.error(`Error calculating APY: ${error.message}`);
      return '0.00';
    }
  }
  // Use the same calculation for supply APY
  private calculateSupplyApy(liquidityRate: bigint): string {
    return this.calculateApy(liquidityRate);
  }
  // Update the USD calculation in getMarketInfo method:
  private calculateUsdValue(
    amount: bigint,
    price: bigint,
    tokenDecimals: number,
    priceFeedDecimals: number,
  ): string {
    try {
      // Convert the amount from token units to actual tokens using the token's decimal places
      const amountNum = Number(amount.toString()) / Math.pow(10, tokenDecimals);
      // Convert the price from price units to USD using the price feed's decimal places
      const priceNum =
        Number(price.toString()) / Math.pow(10, priceFeedDecimals);
      // Calculate the USD value and format to 2 decimal places
      const usdValue = amountNum * priceNum;
      // Log values for debugging
      this.logger.debug(
        `USD Calculation - Amount: ${amountNum}, Price: ${priceNum}, USD Value: ${usdValue}`,
      );
      return usdValue.toFixed(2);
    } catch (error) {
      this.logger.error(`Error calculating USD value: ${error.message}`);
      return '0.00';
    }
  }
  // Replace the PRICE_FEED_DECIMALS and VALID_RESERVES with a function that uses market config
  private getPriceFeedDecimals(chain: SupportedChain, symbol: string): number {
    const marketConfig = getMarketConfig(chain);
    if (!marketConfig) {
      return 8; // Default to 8 if no config found
    }
    return marketConfig.priceFeedDecimals[symbol] || 8;
  }
  private getValidReserves(chain: SupportedChain): string[] {
    const marketConfig = getMarketConfig(chain);
    if (!marketConfig) {
      return [];
    }
    return marketConfig.supportedTokens;
  }
  // Add debug logging for rate values
  private logRateValue(name: string, value: bigint) {
    // Convert to string for safe display
    const valueStr = value.toString();
    this.logger.debug(
      `Rate value for ${name}: ${valueStr} (length: ${valueStr.length})`,
    );
  }
  async getMarketInfo(chain: SupportedChain, tokenSymbol?: string) {
    try {
      // Get addresses for the specified chain from the address provider
      const addresses = getAddressesForMarket(chain);
      const marketConfig = getMarketConfig(chain);
      // Check if addresses are available
      if (!addresses.POOL_DATA_PROVIDER || !addresses.POOL) {
        this.logger.warn(
          `Missing required addresses for ${chain} market. POOL: ${addresses.POOL}, POOL_DATA_PROVIDER: ${addresses.POOL_DATA_PROVIDER}`,
        );
        return {
          pools: [],
          protocol: 'aave',
          chain,
        };
      }
      const client = this.chainService.getClient(chain);
      // Get all supported reserve tokens
      try {
        const reserves = (await client.readContract({
          address: addresses.POOL_DATA_PROVIDER as `0x${string}`,
          abi: POOL_DATA_PROVIDER_ABI,
          functionName: 'getAllReservesTokens',
        })) as ReserveToken[];
        // Get detailed token info for each reserve
        const reservesWithInfo = await Promise.all(
          reserves.map(async (reserve) => {
            try {
              // Get token name and symbol from the token contract
              const [name, symbol] = await Promise.all([
                client.readContract({
                  address: reserve.tokenAddress,
                  abi: erc20Abi,
                  functionName: 'name',
                }),
                client.readContract({
                  address: reserve.tokenAddress,
                  abi: erc20Abi,
                  functionName: 'symbol',
                }),
              ]);
              this.logger.debug(
                `[DEBUG] Token ${reserve.tokenAddress} on ${chain}:
                 Raw name from contract: ${name}
                 Raw symbol from contract: ${symbol}
                 Original symbol from Aave: ${reserve.symbol}`,
              );
              // Use the token's actual symbol from the contract
              const contractSymbol = symbol.toString();
              // Determine the correct display symbol (some bridged tokens don't report correct symbols)
              let displaySymbol = contractSymbol;
              // For USDC variants, we need special handling based on the token address
              if (contractSymbol === 'USDC') {
                // Bridged USDC on Optimism
                if (
                  chain === 'optimism' &&
                  reserve.tokenAddress ===
                    '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
                ) {
                  displaySymbol = 'USDC.e';
                }
                // Bridged USDC on Arbitrum
                if (
                  chain === 'arbitrum' &&
                  reserve.tokenAddress ===
                    '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
                ) {
                  displaySymbol = 'USDC.e';
                }
              }
              this.logger.debug(
                `[DEBUG] Final symbol for ${reserve.tokenAddress} on ${chain}:
                 Contract Symbol: ${contractSymbol}
                 Display Symbol: ${displaySymbol}
                 Original Symbol: ${reserve.symbol}`,
              );
              return {
                ...reserve,
                name: name.toString(),
                originalSymbol: reserve.symbol,
                symbol: contractSymbol,
                displaySymbol: displaySymbol,
                underlyingSymbol: displaySymbol,
                isBridged: displaySymbol.includes('.e'),
              };
            } catch (error) {
              this.logger.error(
                `Error getting token info for ${reserve.tokenAddress}: ${error.message}`,
              );
              return reserve;
            }
          }),
        );
        // Filter reserves based on market-specific configuration and token symbol
        let validReserves = reservesWithInfo;
        if (marketConfig?.supportedTokens) {
          validReserves = validReserves.filter((reserve) =>
            marketConfig.supportedTokens.includes(reserve.symbol),
          );
        }
        // Apply token symbol filter if provided
        if (tokenSymbol) {
          validReserves = validReserves.filter((reserve) => {
            const searchSymbol = tokenSymbol.toLowerCase();
            const displaySymbol = (
              reserve.displaySymbol || reserve.symbol
            ).toLowerCase();
            const originalSymbol =
              reserve.originalSymbol?.toLowerCase() ||
              reserve.symbol.toLowerCase();
            // Match either the display symbol or original symbol
            // For USDC search, include all variants
            return (
              displaySymbol === searchSymbol ||
              originalSymbol === searchSymbol ||
              (searchSymbol === 'usdc' &&
                (displaySymbol.startsWith('usdc') || displaySymbol === 'usdbc'))
            );
          });
        }
        // If no matching reserves found after filtering, return early
        if (validReserves.length === 0) {
          this.logger.debug(
            `No matching reserves found for ${chain}${
              tokenSymbol ? ` and token ${tokenSymbol}` : ''
            }`,
          );
          return {
            pools: [],
            protocol: 'aave',
            chain,
          };
        }
        // Get data for each reserve
        const assets = await Promise.all(
          validReserves.map(async (reserve) => {
            try {
              const reserveConfig = (await client.readContract({
                address: addresses.POOL_DATA_PROVIDER as `0x${string}`,
                abi: POOL_DATA_PROVIDER_ABI,
                functionName: 'getReserveConfigurationData',
                args: [reserve.tokenAddress],
              })) as ReserveConfig;
              const reserveData = (await client.readContract({
                address: addresses.POOL as `0x${string}`,
                abi: POOL_ABI,
                functionName: 'getReserveData',
                args: [reserve.tokenAddress],
              })) as ReserveData;
              const aTokenAddress = reserveData[8] as unknown as `0x${string}`; // Index 8 is aToken address
              const debtTokenAddress =
                reserveData[10] as unknown as `0x${string}`; // Index 10 is variableDebtToken address
              // Get total supply from aToken
              const totalSupply = (await client.readContract({
                address: aTokenAddress,
                abi: ATOKEN_ABI,
                functionName: 'totalSupply',
              })) as bigint;
              // Get total borrow from debt token
              const totalBorrow = (await client.readContract({
                address: debtTokenAddress,
                abi: DEBT_TOKEN_ABI,
                functionName: 'totalSupply',
              })) as bigint;
              // Get token decimals for proper scaling
              const tokenDecimals = await this.tokenService.getDecimals(
                client,
                reserve.tokenAddress,
              );
              const priceFeedDecimals = this.getPriceFeedDecimals(
                chain,
                reserve.symbol,
              );
              // Get token price in USD
              const priceUsd = await this.calculateAssetPrice(
                chain,
                reserve.symbol,
              );
              const priceBigInt = BigInt(
                Math.floor(Number(priceUsd) * 10 ** 8),
              ); // Convert to BigInt with 8 decimals precision
              // Calculate USD values
              const totalSupplyUsd = this.calculateUsdValue(
                totalSupply,
                priceBigInt,
                tokenDecimals,
                priceFeedDecimals,
              );
              const totalBorrowUsd = this.calculateUsdValue(
                totalBorrow,
                priceBigInt,
                tokenDecimals,
                priceFeedDecimals,
              );
              // Calculate available liquidity (supply - borrow)
              const liquidity = totalSupply - totalBorrow;
              const liquidityUsd = this.calculateUsdValue(
                liquidity,
                priceBigInt,
                tokenDecimals,
                priceFeedDecimals,
              );
              // Get variable borrow rate
              const variableBorrowRate = reserveData[4]; // Index 4 is variable borrow rate
              // Log the actual rate values for debugging
              this.logRateValue('liquidityRate', reserveData[2]);
              this.logRateValue('variableBorrowRate', variableBorrowRate);
              // Get supply and borrow APYs
              const liquidityRate = reserveData[2]; // Index 3 is liquidity rate
              const supplyApy = this.calculateSupplyApy(liquidityRate);
              const borrowApy = this.calculateApy(variableBorrowRate);
              // Return token data with APYs and proper symbol display
              return {
                symbol: reserve.displaySymbol || reserve.symbol,
                underlyingSymbol: reserve.displaySymbol || reserve.symbol,
                tokenAddress: reserve.tokenAddress,
                aTokenAddress,
                debtTokenAddress,
                totalSupply: totalSupply.toString(),
                totalSupplyUsd,
                totalBorrow: totalBorrow.toString(),
                totalBorrowUsd,
                liquidity: liquidity.toString(),
                liquidityUsd,
                supplyApy,
                borrowApy,
                isCollateral: Boolean(reserveConfig[5]),
                ltv: (reserveConfig[1] as bigint).toString(),
                price: priceUsd,
              };
            } catch (error) {
              // Log individual reserve errors but continue processing other reserves
              this.logger.error(
                `Error processing reserve ${reserve.symbol} for ${chain} market:`,
                error,
              );
              return null;
            }
          }),
        );
        // Filter out any reserves that failed to process
        const validAssets = assets.filter((asset) => asset !== null);
        // Calculate total TVL across all assets
        const totalTvl = validAssets
          .reduce((total, asset) => {
            return total + Number(asset.totalSupplyUsd);
          }, 0)
          .toFixed(2);
        // Add market display name from config
        const marketName = marketConfig?.displayName || `Aave v3 ${chain}`;
        return {
          pools: validAssets,
          protocol: 'aave',
          chain,
          name: marketName,
          totalValueLocked: totalTvl,
        };
      } catch (error) {
        // Handle RPC connection errors specifically
        if (
          error.message?.includes('getaddrinfo ENOTFOUND') ||
          error.message?.includes('fetch failed') ||
          error.message?.includes('HTTP request failed')
        ) {
          this.logger.error(
            `Network connection error for ${chain} market. Please check the RPC URL configuration.`,
          );
        } else {
          this.logger.error(
            `Error fetching Aave market info for ${chain}:`,
            error,
          );
        }
        // Return empty result for any RPC or contract errors
        return {
          pools: [],
          protocol: 'aave',
          chain,
          error: `Unable to connect to ${chain} network. The RPC endpoint may be unavailable.`,
        };
      }
    } catch (error) {
      this.logger.error(`Error fetching Aave market info:`, error);
      throw error;
    }
  }
  async getPositions(chain: SupportedChain, address: string) {
    try {
      // Get addresses for the specified chain from the address provider
      const addresses = getAddressesForMarket(chain);
      // Check if addresses are available
      if (!addresses.POOL || !addresses.POOL_DATA_PROVIDER) {
        this.logger.warn(
          `Missing required addresses for ${chain} market. POOL: ${addresses.POOL}, POOL_DATA_PROVIDER: ${addresses.POOL_DATA_PROVIDER}`,
        );
        return {
          positions: {
            pools: [],
          },
        };
      }
      try {
        const client = this.chainService.getClient(chain);
        // Get all reserves first and filter valid ones
        const reserves = (await client.readContract({
          address: addresses.POOL_DATA_PROVIDER as `0x${string}`,
          abi: POOL_DATA_PROVIDER_ABI,
          functionName: 'getAllReservesTokens',
        })) as ReserveToken[];
        // Filter reserves based on market-specific configuration
        let validReserves = reserves;
        if (this.getValidReserves(chain)) {
          validReserves = reserves.filter((reserve) =>
            this.getValidReserves(chain).includes(reserve.symbol),
          );
        }
        // Get user account data
        const accountData = (await client.readContract({
          address: addresses.POOL,
          abi: POOL_ABI,
          functionName: 'getUserAccountData',
          args: [address],
        })) as [bigint, bigint, bigint, bigint, bigint, bigint];
        const [
          totalCollateralBase,
          totalDebtBase,
          availableBorrowsBase,
          currentLiquidationThreshold,
          _ltv,
          _healthFactor,
        ] = accountData;
        // Calculate collateralization ratio if there is debt
        const collateralizationRatio =
          totalDebtBase > 0n
            ? (Number(totalCollateralBase) / Number(totalDebtBase)).toFixed(2)
            : '∞';
        // Handle health factor - if no debt, return infinity
        const displayHealthFactor =
          totalDebtBase === 0n
            ? '∞'
            : (Number(_healthFactor) / 1e18).toFixed(2);
        // Get user's assets
        const assets = await Promise.all(
          validReserves.map(async (reserve) => {
            try {
              // Get reserve data for APYs and token addresses
              const reserveData = (await client.readContract({
                address: addresses.POOL as `0x${string}`,
                abi: POOL_ABI,
                functionName: 'getReserveData',
                args: [reserve.tokenAddress],
              })) as ReserveData;
              const aTokenAddress = reserveData[8] as unknown as `0x${string}`;
              const debtTokenAddress =
                reserveData[10] as unknown as `0x${string}`;
              // Get supply and borrow balances
              const supplyBalance = (await client.readContract({
                address: aTokenAddress,
                abi: ATOKEN_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`],
              })) as bigint;
              const borrowBalance = (await client.readContract({
                address: debtTokenAddress,
                abi: DEBT_TOKEN_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`],
              })) as bigint;
              if (supplyBalance === 0n && borrowBalance === 0n) return null;
              // Get price and calculate USD values
              const priceUsd = await this.priceService.getTokenPrice(
                chain,
                reserve.symbol,
                reserve.tokenAddress,
              );
              const tokenDecimals = await this.tokenService.getDecimals(
                client,
                reserve.tokenAddress,
              );
              // Calculate USD values directly using the price and balance
              const supplyUsd =
                (Number(supplyBalance) / 10 ** tokenDecimals) *
                (Number(priceUsd) / 1e8);
              const borrowUsd =
                (Number(borrowBalance) / 10 ** tokenDecimals) *
                (Number(priceUsd) / 1e8);
              // Calculate APYs
              const supplyApy = this.calculateApy(reserveData[2]); // currentLiquidityRate
              const borrowApy = this.calculateApy(reserveData[4]); // currentVariableBorrowRate
              // Get token symbol directly from the contract
              const symbol = await client.readContract({
                address: reserve.tokenAddress,
                abi: erc20Abi,
                functionName: 'symbol',
              });
              // Use the contract's symbol directly
              let displaySymbol = symbol.toString();
              // For USDC variants, we need special handling based on the token address
              if (displaySymbol === 'USDC') {
                // Bridged USDC on Optimism
                if (
                  chain === 'optimism' &&
                  reserve.tokenAddress ===
                    '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
                ) {
                  displaySymbol = 'USDC.e';
                }
                // Bridged USDC on Arbitrum
                if (
                  chain === 'arbitrum' &&
                  reserve.tokenAddress ===
                    '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
                ) {
                  displaySymbol = 'USDC.e';
                }
              }
              return {
                symbol: displaySymbol,
                underlyingSymbol: displaySymbol,
                tokenAddress: reserve.tokenAddress,
                supplyBalance: supplyBalance.toString(),
                supplyBalanceUsd: supplyUsd.toFixed(2),
                borrowBalance: borrowBalance.toString(),
                borrowBalanceUsd: borrowUsd.toFixed(2),
                totalSupplyApy: supplyApy,
                totalBorrowApy: borrowApy,
                isCollateral: true,
                // rewards: []
              };
            } catch (error) {
              this.logger.warn(
                `Error getting position for ${reserve.symbol}: ${error.message}`,
              );
              return null;
            }
          }),
        );
        // Filter out null assets (zero balances)
        const userAssets = assets.filter(Boolean);
        // No positions found
        if (userAssets.length === 0) {
          return {
            positions: {
              pools: [],
            },
          };
        }
        // Return response in the correct format for positions
        return {
          positions: {
            pools: [
              {
                name: this.getMarketName(chain),
                poolId: addresses.POOL,
                healthFactor: displayHealthFactor,
                collateralizationRatio,
                totalCollateralUsd: (Number(totalCollateralBase) / 1e8).toFixed(
                  2,
                ),
                totalBorrowUsd: (Number(totalDebtBase) / 1e8).toFixed(2),
                availableBorrowUsd: (
                  Number(availableBorrowsBase) / 1e8
                ).toFixed(2),
                liquidationThreshold: (
                  Number(currentLiquidationThreshold) / 1e4
                ).toFixed(2),
                maxLtv: (Number(_ltv) / 1e4).toFixed(2),
                assets: userAssets
                  .filter(
                    (asset): asset is NonNullable<typeof asset> =>
                      asset !== null,
                  )
                  .map((asset) => ({
                    underlyingSymbol: asset.symbol,
                    supplyBalance: asset.supplyBalance,
                    supplyBalanceUsd: asset.supplyBalanceUsd,
                    borrowBalance: asset.borrowBalance,
                    borrowBalanceUsd: asset.borrowBalanceUsd,
                    supplyApy: asset.totalSupplyApy,
                    borrowApy: asset.totalBorrowApy,
                  })),
              },
            ],
          },
        };
      } catch (error) {
        this.logger.warn(
          `Error connecting to ${chain} for Aave positions: ${error.message}`,
        );
        return {
          positions: {
            pools: [],
          },
        };
      }
    } catch (error) {
      this.logger.error(`Error fetching Aave positions: ${error.message}`);
      return {
        positions: {
          pools: [],
        },
      };
    }
  }
  // Helper method to get market name
  private getMarketName(chain: SupportedChain): string {
    const marketConfig = getMarketConfig(chain);
    if (marketConfig?.displayName) {
      return marketConfig.displayName;
    }
    switch (chain) {
      case 'mainnet':
        return 'Aave V3 Ethereum';
      case 'mainnet-etherfi':
        return 'Aave V3 EtherFi';
      case 'mainnet-lido':
        return 'Aave V3 Lido';
      case 'base':
        return 'Aave V3 Base';
      case 'arbitrum':
        return 'Aave V3 Arbitrum';
      case 'optimism':
        return 'Aave V3 Optimism';
      case 'sonic':
        return 'Aave V3 Sonic';
      default:
        return `Aave V3 ${chain}`;
    }
  }
  /**
   * Supply assets to Aave
   * Contract: POOL (Aave V3 Pool)
   * Function: supply(asset, amount, onBehalfOf, referralCode)
   * Approval: ERC20.approve(spender, amount) for the pool contract
   */
  async supply(
    chain: SupportedChain,
    params: AaveOperationParams,
  ): Promise<AaveOperationResponseDto> {
    try {
      const addresses = getAddressesForMarket(chain);
      if (!addresses.POOL) {
        throw new Error(`Missing POOL address for ${chain} market`);
      }
      const client = this.chainService.getClient(chain);
      const poolAddress = addresses.POOL as Address;
      const tokenAddress = params.tokenAddress as Address;
      const userAddress = params.userAddress as Address;
      const supplyAmount = params.amount; // Assuming amount is already BigInt
      // Check token decimals for displaying human-readable amounts
      const tokenDecimals = await this.tokenService.getDecimals(
        client,
        tokenAddress,
      );

      // Get token symbol for better display
      const tokenSymbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      // Prepare the main supply transaction
      this.logger.log(`Preparing supply transaction.`);
      const encodedData = encodeFunctionData({
        abi: POOL_SUPPLY_ABI,
        functionName: 'supply',
        args: [
          tokenAddress, // asset
          supplyAmount, // amount
          userAddress, // onBehalfOf
          0, // referralCode (typically 0)
        ],
      });
      // Check if token approval is needed
      const allowance = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [userAddress, poolAddress],
      });
      const approvalTransactions: {
        to: string;
        data: string;
        value: string;
        description: string;
      }[] = [];
      if (allowance < supplyAmount) {
        // Create approval transaction data
        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [poolAddress, supplyAmount],
        });
        approvalTransactions.push({
          to: tokenAddress,
          data: approvalData,
          value: '0',
          description: `Approve ${tokenSymbol} for Aave supply`,
        });
      }
      // Format the amount for display
      const readableAmount = (
        Number(supplyAmount) /
        10 ** tokenDecimals
      ).toString();

      // Prepare the market name
      const marketConfig = getMarketConfig(chain);
      const marketName = marketConfig?.displayName || `Aave V3 ${chain}`;
      // Return response in the same format as Morpho
      return {
        transactionData: {
          to: poolAddress,
          data: encodedData,
          value: '0',
        },
        approvalTransactions:
          approvalTransactions.length > 0 ? approvalTransactions : undefined,
        simulation: {
          market: marketName,
          asset: {
            token: tokenSymbol.toString(),
            address: tokenAddress,
            amount: readableAmount,
            decimals: tokenDecimals,
          },
          operations: [
            {
              type: 'Supply',
              token: tokenSymbol.toString(),
            },
          ],
          message: `This transaction will supply ${readableAmount} ${tokenSymbol} to the Aave V3 market.`,
        },
        chainId: getChainId(chain),
      };
    } catch (error) {
      this.logger.error(
        `Error preparing Aave supply tx: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  /**
   * Withdraw assets from Aave
   * Contract: POOL (Aave V3 Pool)
   * Function: withdraw(asset, amount, to)
   * No approval required
   */
  async withdraw(
    chain: SupportedChain,
    params: AaveOperationParams,
  ): Promise<AaveOperationResponseDto> {
    try {
      // Get addresses for the specified chain from the address provider
      const addresses = getAddressesForMarket(chain);
      // Check if the POOL address is available
      if (!addresses.POOL) {
        throw new Error(`Missing POOL address for ${chain} market`);
      }
      const client = this.chainService.getClient(chain);
      const poolAddress = addresses.POOL as Address;
      const tokenAddress = params.tokenAddress as Address;
      const userAddress = params.userAddress as Address;
      const withdrawAmount = params.amount;
      // Get token details for display
      const tokenDecimals = await this.tokenService.getDecimals(
        client,
        tokenAddress,
      );
      const tokenSymbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      // Find aToken address (needed to check balance)
      const reserveData = (await client.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'getReserveData',
        args: [tokenAddress],
      })) as ReserveData;
      const aTokenAddress = reserveData[8] as unknown as `0x${string}`;
      // Check user's aToken balance
      const aTokenBalance = await client.readContract({
        address: aTokenAddress,
        abi: ATOKEN_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      });
      // Verify user has enough balance
      if (aTokenBalance < withdrawAmount) {
        throw new Error(
          `Insufficient balance. Available: ${Number(aTokenBalance) / 10 ** tokenDecimals} ${tokenSymbol}`,
        );
      }
      const encodedData = encodeFunctionData({
        abi: POOL_WITHDRAW_ABI,
        functionName: 'withdraw',
        args: [tokenAddress, withdrawAmount, userAddress],
      });
      // Format the amount for display
      const readableAmount = (
        Number(withdrawAmount) /
        10 ** tokenDecimals
      ).toString();

      // Prepare the market name
      const marketConfig = getMarketConfig(chain);
      const marketName = marketConfig?.displayName || `Aave V3 ${chain}`;
      // No approval needed for withdrawals
      return {
        transactionData: {
          to: poolAddress,
          data: encodedData,
          value: '0',
        },
        simulation: {
          market: marketName,
          asset: {
            token: tokenSymbol.toString(),
            address: tokenAddress,
            amount: readableAmount,
            decimals: tokenDecimals,
          },
          operations: [
            {
              type: 'Withdraw',
              token: tokenSymbol.toString(),
            },
          ],
          message: `This transaction will withdraw ${readableAmount} ${tokenSymbol} from the Aave V3 market.`,
        },
        chainId: getChainId(chain),
      };
    } catch (error) {
      this.logger.error(`Error preparing withdraw tx: ${error.message}`);
      throw error;
    }
  }
  /**
   * Borrow assets from Aave
   * Contract: POOL (Aave V3 Pool)
   * Function: borrow(asset, amount, interestRateMode, referralCode, onBehalfOf)
   * Requires collateral to be supplied first
   */
  async borrow(
    chain: SupportedChain,
    params: AaveOperationParams,
  ): Promise<AaveOperationResponseDto> {
    try {
      // Get addresses for the specified chain from the address provider
      const addresses = getAddressesForMarket(chain);
      // Check if the POOL address is available
      if (!addresses.POOL) {
        throw new Error(`Missing POOL address for ${chain} market`);
      }
      const client = this.chainService.getClient(chain);
      const poolAddress = addresses.POOL as Address;
      const tokenAddress = params.tokenAddress as Address;
      const userAddress = params.userAddress as Address;
      const borrowAmount = params.amount;
      // Get token details for display
      const tokenDecimals = await this.tokenService.getDecimals(
        client,
        tokenAddress,
      );
      const tokenSymbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      // Check user account data first for borrowing capacity
      const accountData = (await client.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'getUserAccountData',
        args: [userAddress],
      })) as [bigint, bigint, bigint, bigint, bigint, bigint];

      const [
        totalCollateralBase,
        totalDebtBase,
        availableBorrowsBase,
        currentLiquidationThreshold,
        _ltv,
        _healthFactor,
      ] = accountData;

      if (availableBorrowsBase === 0n) {
        throw new Error(
          'No collateral available for borrowing. Please supply collateral first.',
        );
      }
      // Check price of the token to ensure borrowing within limits
      const priceUsd = await this.priceService.getTokenPrice(
        chain,
        tokenSymbol.toString(),
        tokenAddress,
      );

      // Convert the borrow amount to USD value
      const borrowAmountUsd =
        (Number(borrowAmount) / 10 ** tokenDecimals) * (Number(priceUsd) / 1e8);
      const availableBorrowsUsd = Number(availableBorrowsBase) / 1e8;

      if (borrowAmountUsd > availableBorrowsUsd) {
        throw new Error(
          `Borrow amount exceeds available borrowing capacity. Maximum available: $${availableBorrowsUsd.toFixed(2)}`,
        );
      }
      // Prepare borrow transaction data
      const encodedData = encodeFunctionData({
        abi: POOL_BORROW_ABI,
        functionName: 'borrow',
        args: [tokenAddress, borrowAmount, 2n, 0, userAddress], // Variable rate (2)
      });
      // Format amounts for display
      const readableAmount = (
        Number(borrowAmount) /
        10 ** tokenDecimals
      ).toString();

      // Calculate what the health factor will be after the borrow
      const newDebtUsd = Number(totalDebtBase) / 1e8 + borrowAmountUsd;
      const newHealthFactor =
        newDebtUsd > 0
          ? ((Number(totalCollateralBase) / 1e8) *
              Number(currentLiquidationThreshold)) /
            1e4 /
            newDebtUsd
          : Number.MAX_SAFE_INTEGER;

      // Add warning if health factor will be low
      let message = `This transaction will borrow ${readableAmount} ${tokenSymbol} from the Aave V3 market.`;
      if (newHealthFactor < 1.5) {
        message += ` WARNING: Your health factor after this borrow will be ${newHealthFactor.toFixed(2)}, which is dangerously low. Consider borrowing less.`;
      } else if (newHealthFactor < 2.0) {
        message += ` Note: Your health factor after this borrow will be ${newHealthFactor.toFixed(2)}.`;
      }
      // Prepare the market name
      const marketConfig = getMarketConfig(chain);
      const marketName = marketConfig?.displayName || `Aave V3 ${chain}`;
      // No approval needed for borrowing
      return {
        transactionData: {
          to: poolAddress,
          data: encodedData,
          value: '0',
        },
        simulation: {
          market: marketName,
          asset: {
            token: tokenSymbol.toString(),
            address: tokenAddress,
            amount: readableAmount,
            decimals: tokenDecimals,
          },
          operations: [
            {
              type: 'Borrow',
              token: tokenSymbol.toString(),
            },
          ],
          message: message,
        },
        chainId: getChainId(chain),
      };
    } catch (error) {
      this.logger.error(`Error preparing borrow tx: ${error.message}`);
      throw error;
    }
  }
  /**
   * Repay borrowed assets to Aave
   * Contract: POOL (Aave V3 Pool)
   * Function: repay(asset, amount, interestRateMode, onBehalfOf)
   * Approval: ERC20.approve(spender, amount) for the pool contract
   */
  async repay(
    chain: SupportedChain,
    params: AaveOperationParams,
  ): Promise<AaveOperationResponseDto> {
    try {
      const addresses = getAddressesForMarket(chain);
      if (!addresses.POOL) {
        throw new Error(`Missing POOL address for ${chain} market`);
      }
      const client = this.chainService.getClient(chain);
      const poolAddress = addresses.POOL as Address;
      const tokenAddress = params.tokenAddress as Address;
      const userAddress = params.userAddress as Address;
      const repayAmount = params.amount;
      // Get token details for display
      const tokenDecimals = await this.tokenService.getDecimals(
        client,
        tokenAddress,
      );
      const tokenSymbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      // Determine interest rate mode by checking debt balances
      const reserveData = (await client.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'getReserveData',
        args: [tokenAddress],
      })) as ReserveData;
      const stableDebtToken = reserveData[9] as unknown as Address;
      const variableDebtToken = reserveData[10] as unknown as Address;
      // Fetch both debt balances
      const stableDebt = (await client.readContract({
        address: stableDebtToken,
        abi: DEBT_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;

      const variableDebt = (await client.readContract({
        address: variableDebtToken,
        abi: DEBT_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      // Determine which debt to repay
      let interestRateMode: bigint;
      let debtType: string;

      if (variableDebt > 0n) {
        interestRateMode = 2n; // Variable
        debtType = 'Variable';
      } else if (stableDebt > 0n) {
        interestRateMode = 1n; // Stable
        debtType = 'Stable';
      } else {
        throw new Error(`No debt found for ${tokenSymbol}`);
      }
      // Check user's token balance
      const userTokenBalance = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [userAddress],
      });
      if (userTokenBalance < repayAmount) {
        throw new Error(
          `Insufficient ${tokenSymbol} balance. You have ${Number(userTokenBalance) / 10 ** tokenDecimals} but trying to repay ${Number(repayAmount) / 10 ** tokenDecimals}`,
        );
      }
      // Check if token approval is needed
      const allowance = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [userAddress, poolAddress],
      });
      const approvalTransactions: {
        to: string;
        data: string;
        value: string;
        description: string;
      }[] = [];
      if (allowance < repayAmount) {
        // Create approval transaction data
        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [poolAddress, repayAmount],
        });
        approvalTransactions.push({
          to: tokenAddress,
          data: approvalData,
          value: '0',
          description: `Approve ${tokenSymbol} for Aave repayment`,
        });
      }
      // Prepare repay transaction
      const encodedData = encodeFunctionData({
        abi: POOL_REPAY_ABI,
        functionName: 'repay',
        args: [tokenAddress, repayAmount, interestRateMode, userAddress],
      });
      // Format amounts for display
      const readableAmount = (
        Number(repayAmount) /
        10 ** tokenDecimals
      ).toString();

      // Prepare the market name
      const marketConfig = getMarketConfig(chain);
      const marketName = marketConfig?.displayName || `Aave V3 ${chain}`;
      return {
        transactionData: {
          to: poolAddress,
          data: encodedData,
          value: '0',
        },
        approvalTransactions:
          approvalTransactions.length > 0 ? approvalTransactions : undefined,
        simulation: {
          market: marketName,
          asset: {
            token: tokenSymbol.toString(),
            address: tokenAddress,
            amount: readableAmount,
            decimals: tokenDecimals,
          },
          operations: [
            {
              type: `Repay (${debtType})`,
              token: tokenSymbol.toString(),
            },
          ],
          message: `This transaction will repay ${readableAmount} ${tokenSymbol} to the Aave V3 market, reducing your ${debtType} rate debt.`,
        },
        chainId: getChainId(chain),
      };
    } catch (error) {
      this.logger.error(`Error preparing repay tx: ${error.message}`);
      throw error;
    }
  }
  // Fix the asset price calculation to properly use fallback prices
  async calculateAssetPrice(
    chain: SupportedChain,
    symbol: string,
  ): Promise<string> {
    try {
      // Get token address from market config, if available
      const marketConfig = getMarketConfig(chain);
      const tokenAddress = marketConfig?.tokenAddresses?.[symbol] as
        | Address
        | undefined;
      // Use PriceService to get the token price (which uses CoinGecko as primary source)
      const priceBigInt = await this.priceService.getTokenPrice(
        chain,
        symbol,
        tokenAddress,
      );
      // Convert the BigInt price (with 8 decimals) to a string with decimal point
      const priceNumber = Number(priceBigInt) / 1e8;
      // Format to 2 decimal places
      return priceNumber.toFixed(2);
    } catch (error) {
      this.logger.error(`Error getting price for ${symbol}: ${error.message}`);
      // Default to $1 if the price service fails completely
      return '1.00';
    }
  }
  // Fix the token decimal lookup to use the proper token addresses
  private async getTokenDecimals(
    client: PublicClient,
    tokenAddress: `0x${string}`,
  ): Promise<number> {
    // Check cache first
    const cacheKey = `${tokenAddress}`;
    if (this.tokenDecimalsCache[cacheKey]) {
      return this.tokenDecimalsCache[cacheKey];
    }
    // If not in cache, fetch from chain
    try {
      const decimals = await this.tokenService.getDecimals(
        client,
        tokenAddress,
      );
      this.tokenDecimalsCache[cacheKey] = decimals;
      return decimals;
    } catch (error) {
      this.logger.error(
        `Error fetching decimals for token ${tokenAddress}:`,
        error,
      );
      return 18; // Default to 18 if not found
    }
  }
  async getMarkets(chain: SupportedChain): Promise<MarketPoolDto[]> {
    try {
      const marketInfo = await this.getMarketInfo(chain);
      if (
        !marketInfo ||
        !marketInfo.pools ||
        !Array.isArray(marketInfo.pools)
      ) {
        console.warn(`No valid market info returned for Aave on ${chain}`);
        return [];
      }
      return marketInfo.pools.map((pool: any) => ({
        name: `Aave ${pool.symbol || 'Unknown'} Pool`,
        poolId: pool.tokenAddress || 'aave',
        totalValueUsd: parseFloat((pool.totalSupplyUsd as string) || '0'),
        assets: [
          {
            underlyingSymbol: pool.symbol || 'Unknown',
            totalSupply: pool.totalSupply || '0',
            totalSupplyUsd: pool.totalSupplyUsd || '0',
            totalBorrow: pool.totalBorrow || '0',
            totalBorrowUsd: pool.totalBorrowUsd || '0',
            liquidity: pool.liquidity || '0',
            liquidityUsd: pool.liquidityUsd || '0',
            supplyApy: pool.supplyApy || '0',
            borrowApy: pool.borrowApy || '0',
            isCollateral: pool.isCollateral || false,
            ltv: pool.ltv || '0',
            rewards: [],
          },
        ],
      }));
    } catch (error) {
      console.error(`Error getting Aave markets for ${chain}:`, error);
      return [];
    }
  }
}
