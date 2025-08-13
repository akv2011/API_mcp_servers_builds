/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-implied-eval */
// External dependencies
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  parseUnits,
  encodeFunctionData,
  createPublicClient,
  http,
  formatUnits,
  PublicClient,
  Hex,
  isAddress,
} from 'viem';
import { mainnet, base } from 'viem/chains';
import axios from 'axios';
import { getChainId } from '../common/utils/chain.utils';
// Morpho dependencies - import using pattern matching Compound Blue
import { DEFAULT_SLIPPAGE_TOLERANCE, MarketId } from '@morpho-org/blue-sdk';
import {
  fetchMarket,
  fetchToken,
  fetchUser,
  fetchPosition,
  fetchHolding,
} from '@morpho-org/blue-sdk-viem';
import { SimulationState } from '@morpho-org/simulation-sdk';
import { InputBundlerOperation } from '@morpho-org/bundler-sdk-viem';
// Import from our new config file
import {
  getChainIdForMorpho,
  PUBLIC_ALLOCATOR_SUPPLY_TARGET_UTILIZATION,
} from './config';
import { getBundlerAddresses } from './address-adapter';
// Services
import { MorphoGraphQLService } from './services/graphql.service';
// DTOs and types
import {
  MarketPoolDto,
  MarketAssetDto,
  ProtocolPoolsDto,
  MarketRewardDto,
} from '../markets/dto/market.dto';
import { PositionsResponseDto } from '../common/dto/position.dto';
// Constants and utils
import { MarketSearchQueryDto } from '../common/dto/market-search.dto';
import { SupportedChain } from '../common/types/chain.type';
// Add these imports
import {
  MorphoBorrowDto,
  MorphoBorrowResponseDto,
} from './dto/morpho-operation.dto';
import {
  MorphoEarnDepositDto,
  MorphoEarnWithdrawDto,
  MorphoEarnOperationResponseDto,
} from './dto/morpho-earn.dto';
/**
 * Addresses of Morpho Bundler contracts by chain
 * NOTE: This is no longer needed as we use addresses from the SDK
 */
// const MORPHO_BUNDLER_ADDRESSES: Record<number, Address> = { ... }
// Add this constant at the top with other constants
const MORPHO_SUPPORTED_CHAINS = ['mainnet', 'base'] as const;
type MorphoSupportedChain = (typeof MORPHO_SUPPORTED_CHAINS)[number];
// Define supported chains specifically for Earn
const MORPHO_EARN_SUPPORTED_CHAINS = ['mainnet', 'base'] as const;
type MorphoEarnSupportedChain = (typeof MORPHO_EARN_SUPPORTED_CHAINS)[number];
// --> Add ERC-4626 ABIs
const DEPOSIT_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'assets', type: 'uint256' },
      { internalType: 'address', name: 'receiver', type: 'address' },
    ],
    name: 'deposit',
    outputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
// --> Add Minimal ABIs needed for balance checks
const ERC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
] as const;
const ERC4626_BALANCE_OF_ABI = [
  // Shares balance
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
const ERC4626_REDEEM_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'shares', type: 'uint256' },
      { internalType: 'address', name: 'receiver', type: 'address' },
      { internalType: 'address', name: 'owner', type: 'address' },
    ],
    name: 'redeem',
    outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
// Interface for the vault structure in vaults-whitelist.json
interface CuratorInfo {
  name: string;
  // Add other curator fields if needed (e.g., image, url)
}
interface WhitelistedVault {
  address: Hex;
  chainId: number;
  description?: string;
  curators?: CuratorInfo[];
  asset?: {
    address: Hex;
    symbol: string;
    decimals: number;
    name?: string;
  };
}
// Moved TokenInfo and TokenList interfaces outside the class
interface TokenInfo {
  chainId: number;
  address: Hex;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}
interface TokenList {
  name: string;
  timestamp: string;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  tags: object;
  logoURI: string;
  keywords: string[];
  tokens: TokenInfo[];
}
@Injectable()
export class MorphoService {
  private readonly logger = new Logger(MorphoService.name);
  // --> Add RPC Clients
  private readonly mainnetClient: PublicClient;
  private readonly baseClient: PublicClient;
  // Cache for token list
  private tokenListCache: TokenList | null = null;
  private tokenListCacheTime: number = 0;
  private isFetchingTokenList: boolean = false;
  private readonly TOKEN_LIST_CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  private readonly TOKEN_LIST_URL = 'https://tokens.uniswap.org/';
  // Use Coingecko token list as additional source - much more comprehensive
  private readonly COINGECKO_TOKEN_LIST_URL =
    'https://tokens.coingecko.com/uniswap/all.json';
  // Add additional token lists to check - will be populated in constructor
  private readonly ADDITIONAL_TOKEN_LISTS: string[] = [];
  // Cache for vault whitelist
  private vaultWhitelistCache: WhitelistedVault[] | null = null;
  private vaultWhitelistCacheTime: number = 0;
  private isFetchingVaultWhitelist: boolean = false;
  private readonly VAULT_WHITELIST_CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  constructor(
    private readonly graphqlService: MorphoGraphQLService,
    private readonly configService: ConfigService, // Inject ConfigService
  ) {
    // --> Initialize RPC Clients
    const mainnetRpcUrl = this.configService.get<string>('MAINNET_RPC_URL');
    const baseRpcUrl = this.configService.get<string>('BASE_RPC_URL');
    // @ts-ignore - Suppressing persistent viem type incompatibility error
    this.mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(mainnetRpcUrl),
    });
    // @ts-ignore - Suppressing persistent viem type incompatibility error
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(baseRpcUrl),
    });

    // Initialize ADDITIONAL_TOKEN_LISTS with Coingecko token list
    this.ADDITIONAL_TOKEN_LISTS.push(this.COINGECKO_TOKEN_LIST_URL);
    // Add any other token list URLs here if needed
  }
  // --> Add helper to get the correct client
  private _getRpcClient(chain: MorphoEarnSupportedChain): PublicClient {
    switch (chain) {
      case 'mainnet':
        return this.mainnetClient;
      case 'base':
        return this.baseClient;
      default:
        // This case should be unreachable due to the MorphoEarnSupportedChain type
        // Log and throw an error defensively.
        this.logger.error(
          `Unsupported chain passed to _getRpcClient: ${chain as string}`,
        );
        throw new InternalServerErrorException(
          `Invalid chain for RPC client: ${chain as string}`,
        );
    }
  }
  async getPositions(
    chain: SupportedChain,
    address: Address,
  ): Promise<PositionsResponseDto> {
    // Check if chain is supported by Morpho
    if (!MORPHO_SUPPORTED_CHAINS.includes(chain as MorphoSupportedChain)) {
      return { positions: { pools: [] } };
    }
    const chainId = getChainId(chain);
    const data = await this.graphqlService.getUserPositions(address, chainId);
    const user = data.userByAddress;
    if (!user || !user.marketPositions) {
      return { positions: { pools: [] } };
    }
    const pools = user.marketPositions.map((position) => {
      return {
        name: `${position.market.collateralAsset.symbol} / ${position.market.loanAsset.symbol}`,
        poolId: position.market.uniqueKey,
        healthFactor: position.healthFactor,
        assets: [
          // collateral
          {
            underlyingSymbol: position.market.collateralAsset.symbol,
            underlyingDecimals: position.market.collateralAsset.decimals,
            supplyBalance: position.collateral,
            supplyBalanceUsd: position.collateralUsd,
            borrowBalance: '0',
            borrowBalanceUsd: '0',
            collateralFactor: position.market.lltv,
            supplyApy: 0,
            borrowApy: 0,
            underlyingPriceUsd: position.market.collateralAsset.priceUsd,
            totalSupply: position.market.state.collateralAssets,
            totalSupplyUsd: position.market.state.collateralAssetsUsd,
            totalBorrow: position.market.state.borrowAssets,
            totalBorrowUsd: position.market.state.borrowAssetsUsd,
            liquidity: position.market.state.liquidityAssets,
            liquidityUsd: position.market.state.liquidityAssetsUsd,
            rewards: position.market.state.rewards.map((reward) => ({
              rewardToken: reward.asset.address,
              rewardSymbol: reward.asset.symbol,
              apy: Number(reward.supplyApr) * 100,
            })),
          },
          // borrow
          {
            underlyingSymbol: position.market.loanAsset.symbol,
            underlyingDecimals: position.market.loanAsset.decimals,
            supplyBalance: '0',
            supplyBalanceUsd: '0',
            borrowBalance: position.borrowAssets,
            borrowBalanceUsd: position.borrowAssetsUsd,
            collateralFactor: position.market.lltv,
            supplyApy: 0,
            borrowApy: Number(position.market.state.borrowApy) * 100,
            underlyingPriceUsd: position.market.loanAsset.priceUsd,
            totalSupply: position.market.state.borrowAssets,
            totalSupplyUsd: position.market.state.borrowAssetsUsd,
            totalBorrow: position.market.state.collateralAssets,
            totalBorrowUsd: position.market.state.collateralAssetsUsd,
            liquidity: position.market.state.liquidityAssets,
            liquidityUsd: position.market.state.liquidityAssetsUsd,
            rewards: position.market.state.rewards.map((reward) => ({
              rewardToken: reward.asset.address,
              rewardSymbol: reward.asset.symbol,
              apy: Number(reward.borrowApr) * 100,
            })),
          },
        ],
      };
    });
    return { positions: { pools } };
  }
  async getMarketInfo(query: MarketSearchQueryDto): Promise<ProtocolPoolsDto> {
    // Only search chains that Morpho supports
    const requestedChain = query.chain as MorphoSupportedChain;
    if (query.chain && !MORPHO_SUPPORTED_CHAINS.includes(requestedChain)) {
      return {
        protocol: 'morpho',
        chains: [],
      };
    }
    const chainsToSearch = query.chain
      ? [requestedChain]
      : MORPHO_SUPPORTED_CHAINS;
    const allPools: (MarketPoolDto & { chain: MorphoSupportedChain })[] = [];
    for (const chain of chainsToSearch) {
      try {
        const chainId = getChainId(chain);
        const data = await this.graphqlService.getMarkets(chainId);
        // Check if we have valid data
        if (!data || !data.markets || !data.markets.items) {
          this.logger.warn(`No markets data available for chain ${chain}`);
          continue;
        }
        // Filter out invalid or incomplete market data first
        const validMarkets = data.markets.items.filter(
          (market) =>
            market &&
            market.collateralAsset &&
            market.loanAsset &&
            market.state &&
            market.collateralAsset.symbol &&
            market.loanAsset.symbol,
        );
        this.logger.log(
          `Found ${validMarkets.length} valid markets out of ${data.markets.items.length} total for chain ${chain}`,
        );
        // Now continue with filters using only valid markets
        const filteredMarkets = validMarkets.filter((market) => {
          // Add debugging for all queries to understand what's being filtered
          this.logger.debug(
            `Filtering market: ${market.collateralAsset.symbol}/${market.loanAsset.symbol} (ID: ${market.uniqueKey}) ` +
              `Query: collateral=${query.collateralTokenSymbol || 'any'}, borrow=${query.borrowTokenSymbol || 'any'}, poolId=${query.poolId || 'any'} ` +
              `Matches: poolId=${!query.poolId || market.uniqueKey === query.poolId}, ` +
              `collateral=${!query.collateralTokenSymbol || market.collateralAsset.symbol.toLowerCase() === query.collateralTokenSymbol.toLowerCase()}, ` +
              `borrow=${!query.borrowTokenSymbol || market.loanAsset.symbol.toLowerCase() === query.borrowTokenSymbol.toLowerCase()}`,
          );

          if (query.poolId && market.uniqueKey !== query.poolId) {
            return false;
          }

          if (
            query.collateralTokenSymbol &&
            market.collateralAsset.symbol.toLowerCase() !==
              query.collateralTokenSymbol.toLowerCase()
          ) {
            return false;
          }

          if (
            query.borrowTokenSymbol &&
            market.loanAsset.symbol.toLowerCase() !==
              query.borrowTokenSymbol.toLowerCase()
          ) {
            return false;
          }

          return true;
        });
        // Map the filtered markets to pools
        const pools = filteredMarkets.map((market) => {
          // Collateral Asset DTO
          const collateralAssetDto: MarketAssetDto = {
            underlyingSymbol: market.collateralAsset.symbol,
            totalSupply: market.state.supplyAssets || '0',
            totalSupplyUsd: market.state.supplyAssetsUsd || '0',
            totalBorrow: '0', // Not applicable to collateral asset itself
            totalBorrowUsd: '0', // Not applicable to collateral asset itself
            liquidity: '0', // Liquidity applies to the loan asset in the pair
            liquidityUsd: '0', // Liquidity applies to the loan asset in the pair
            supplyApy: market.state.supplyApy || '0',
            borrowApy: '0', // Not applicable to collateral asset itself
            isCollateral: true,
            ltv: market.lltv ? (Number(market.lltv) / 1e18).toFixed(2) : '0.00',
            rewards: (market.state.rewards || []) // Filter for supply rewards
              .filter((r) => r.supplyApr && parseFloat(r.supplyApr) > 0)
              .map((reward) => ({
                rewardTokenSymbol: reward.asset.symbol,
                rewardTokenAddress: reward.asset.address,
                rewardApr: reward.supplyApr || '0',
              })) as MarketRewardDto[],
          };
          // Loan Asset DTO
          const loanAssetDto: MarketAssetDto = {
            underlyingSymbol: market.loanAsset.symbol,
            totalSupply: '0', // Supply metrics apply to the collateral asset
            totalSupplyUsd: '0', // Supply metrics apply to the collateral asset
            totalBorrow: market.state.borrowAssets || '0',
            totalBorrowUsd: market.state.borrowAssetsUsd || '0',
            liquidity: market.state.liquidityAssets || '0',
            liquidityUsd: market.state.liquidityAssetsUsd || '0',
            supplyApy: '0', // Not applicable to the loan asset itself
            borrowApy: market.state.borrowApy || '0',
            isCollateral: false,
            ltv: '0', // LTV applies to the collateral asset
            rewards: (market.state.rewards || []) // Filter for borrow rewards
              .filter((r) => r.borrowApr && parseFloat(r.borrowApr) > 0)
              .map((reward) => ({
                rewardTokenSymbol: reward.asset.symbol,
                rewardTokenAddress: reward.asset.address,
                rewardApr: reward.borrowApr || '0',
              })) as MarketRewardDto[],
          };
          return {
            name: `${market.collateralAsset.symbol} / ${market.loanAsset.symbol}`,
            poolId: market.uniqueKey,
            rate: market.state.dailyNetBorrowApy
              ? (Number(market.state.dailyNetBorrowApy) * 100) / 1e18
              : 0,
            totalValueUsd: Number(
              market.state.supplyAssetsUsd + market.state.borrowAssetsUsd ||
                '0',
            ), // Total value locked is based on collateral .
            assets: [collateralAssetDto, loanAssetDto],
            chain,
          };
        });
        if (pools.length > 0) {
          allPools.push(...pools);
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch market info for chain ${chain}:`,
          error,
        );
        // Continue with other chains even if one fails
      }
    }
    // Group pools by chain
    const chainPools = new Map<MorphoSupportedChain, MarketPoolDto[]>();
    for (const pool of allPools) {
      if (!chainPools.has(pool.chain)) {
        chainPools.set(pool.chain, []);
      }
      const { chain: _, ...poolWithoutChain } = pool;
      chainPools.get(pool.chain)?.push(poolWithoutChain);
    }
    // Convert the map to the expected format
    const chains = Array.from(chainPools.entries()).map(([chain, pools]) => ({
      chain,
      pools,
    }));
    return {
      protocol: 'morpho',
      chains,
    };
  }
  /**
   * Dynamically load the Morpho SDK
   * This is needed because Morpho SDK is an ESM module
   * and we need to use dynamic import in a CommonJS environment
   */
  async loadMorphoSDK(): Promise<{ bundlerSdk: any }> {
    try {
      // Use a function constructor to evaluate the dynamic import at runtime
      // This prevents TypeScript from transforming it to require()
      const dynamicImport = new Function(
        'modulePath',
        'return import(modulePath)',
      );
      // Load the bundler SDK module
      const bundlerSdk = await dynamicImport('@morpho-org/bundler-sdk-viem');
      return { bundlerSdk };
    } catch (error) {
      this.logger.error('Failed to load Morpho SDK:', error);
      throw error;
    }
  }
  /**
   * Perform a bundled supply collateral and borrow operation on Morpho
   * @param chain The blockchain network
   * @param dto The borrow operation data
   * @returns Transaction data and simulation results
   */
  async borrow(
    chain: SupportedChain,
    dto: MorphoBorrowDto,
  ): Promise<MorphoBorrowResponseDto> {
    try {
      const { call_data, sender } = dto;
      const { collateral, borrow } = call_data;
      // Get chain ID using our config helper function
      const chainId = getChainIdForMorpho(chain);
      // Use our compatibility adapter to get addresses in the right format
      const { morpho, bundler } = getBundlerAddresses(chainId);
      const morphoAddress = morpho;
      const bundlerAddress = bundler.bundler;
      const morphoAdapterAddress = bundler.generalAdapter1 as Address;
      if (!morphoAdapterAddress) {
        throw new Error('Adapter address not found');
      }
      this.logger.log(`Using Morpho contract at address: ${morphoAddress}`);
      this.logger.log(`Using Morpho Bundler at address: ${bundlerAddress}`);
      // Skip logging generalAdapter1 since it might not be available
      // Find token details based on symbols for the selected chain
      let collateralTokenInfo;
      let borrowTokenInfo;

      try {
        this.logger.log(
          `Looking up collateral token: ${collateral.token} on chain ${chain}`,
        );
        collateralTokenInfo = await this.findTokenInfo(chain, collateral.token);
      } catch (error) {
        this.logger.error(`Collateral token lookup failed: ${error.message}`);
        throw new BadRequestException(
          `Collateral token '${collateral.token}' not found on chain ${chain}. Please verify the token symbol.`,
        );
      }

      try {
        this.logger.log(
          `Looking up borrow token: ${borrow.token} on chain ${chain}`,
        );
        borrowTokenInfo = await this.findTokenInfo(chain, borrow.token);
      } catch (error) {
        this.logger.error(`Borrow token lookup failed: ${error.message}`);
        throw new BadRequestException(
          `Borrow token '${borrow.token}' not found on chain ${chain}. Please verify the token symbol.`,
        );
      }

      // This check should never happen now with the try/catch blocks above, but keeping it as a safeguard
      if (!collateralTokenInfo || !borrowTokenInfo) {
        throw new BadRequestException(`Token not found for chain ${chain}`);
      }
      // Find the appropriate market ID for this token pair
      const marketId = await this.findMarketId(
        chain,
        collateralTokenInfo.address,
        borrowTokenInfo.address,
      );
      if (!marketId) {
        this.logger.error(
          `Market not found for ${collateral.token}/${borrow.token} on ${chain}.`,
        );
        throw new Error(
          `No market found for ${collateral.token}/${borrow.token} on ${chain}. Please verify that this market exists in Morpho and that both tokens are supported.`,
        );
      }
      this.logger.log(
        `Processing Morpho borrow operation on ${chain} for market ${marketId}`,
      );
      // Convert amounts to BigInt with proper decimals
      const collateralAmount = parseUnits(
        collateral.amount,
        collateralTokenInfo.decimals,
      );
      const borrowAmount = parseUnits(borrow.amount, borrowTokenInfo.decimals);
      const userAddress = sender as Address;
      // Format the market ID to match expected format
      const formattedMarketId = marketId.startsWith('0x')
        ? marketId
        : `0x${marketId}`;
      this.logger.log(`Using formatted market ID: ${formattedMarketId}`);
      this.logger.log(`Collateral amount: ${collateralAmount.toString()}`);
      this.logger.log(`Borrow amount: ${borrowAmount.toString()}`);
      this.logger.log(`User address: ${userAddress}`);
      try {
        // Use dynamic import for the SDK modules
        const { bundlerSdk } = await this.loadMorphoSDK();
        // Check if user is using a smart account
        const rpcClient = this._getRpcClient(chain as MorphoSupportedChain);
        // Get client to fetch on-chain data
        const publicClient = rpcClient;
        // Fetch block data (needed for SimulationState)
        const block = await publicClient.getBlock();
        // We need to cast to MarketId which is a branded `0x${string}` type
        const marketIdParam = formattedMarketId as `0x${string}` as MarketId;
        // Fetch all data needed for simulation state
        const [
          market,
          userInfo,
          adapterInfo,
          collateralToken,
          borrowToken,
          position,
          adapterPosition,
          collateralHolding,
          adapterCollateralHolding,
          borrowHolding,
          adapterBorrowHolding,
        ] = await Promise.all([
          fetchMarket(marketIdParam, publicClient),
          fetchUser(userAddress, publicClient),
          fetchUser(morphoAdapterAddress, publicClient),
          fetchToken(collateralTokenInfo.address, publicClient),
          fetchToken(borrowTokenInfo.address, publicClient),
          fetchPosition(userAddress, marketIdParam, publicClient),
          fetchPosition(morphoAdapterAddress, marketIdParam, publicClient),
          fetchHolding(userAddress, collateralTokenInfo.address, publicClient),
          fetchHolding(
            morphoAdapterAddress,
            collateralTokenInfo.address,
            publicClient,
          ),
          fetchHolding(userAddress, borrowTokenInfo.address, publicClient),
          fetchHolding(
            morphoAdapterAddress,
            borrowTokenInfo.address,
            publicClient,
          ),
        ]);
        // Log market liquidity data
        this.logger.log(
          `Market ${marketIdParam} data: liquidity=${market.liquidity?.toString()}, utilization=${market.utilization?.toString()}`,
        );
        // Create a simulation state exactly like Compound Blue does
        const marketKey = marketIdParam as string;
        const collateralKey = collateralTokenInfo.address as string;
        const borrowKey = borrowTokenInfo.address as string;
        const userKey = userAddress as string;
        const adapterKey = morphoAdapterAddress as string;
        const simulationState = new SimulationState({
          chainId,
          block,
          global: {
            feeRecipient: '0x0000000000000000000000000000000000000000',
          },
          markets: {
            [marketKey]: market,
          },
          tokens: {
            [collateralKey]: collateralToken,
            [borrowKey]: borrowToken,
          },
          users: {
            [userKey]: userInfo,
            [adapterKey]: adapterInfo,
          },
          positions: {
            [userKey]: {
              [marketKey]: position,
            },
            [adapterKey]: {
              [marketKey]: adapterPosition,
            },
          },
          holdings: {
            [userKey]: {
              [collateralKey]: collateralHolding,
              [borrowKey]: borrowHolding,
            },
            [adapterKey]: {
              [collateralKey]: adapterCollateralHolding,
              [borrowKey]: adapterBorrowHolding,
            },
          },
        });
        // Create input operations for bundler
        const inputOperations: InputBundlerOperation[] = [];
        // Add supply collateral operation if amount > 0
        if (collateralAmount > 0n) {
          inputOperations.push({
            type: 'Blue_SupplyCollateral',
            sender: userAddress,
            address: morphoAddress as Address,
            args: {
              id: marketIdParam,
              onBehalf: userAddress,
              assets: collateralAmount,
              data: '0x',
            },
          } as InputBundlerOperation);
        }
        // Add borrow operation if amount > 0
        if (borrowAmount > 0n) {
          inputOperations.push({
            type: 'Blue_Borrow',
            sender: userAddress,
            address: morphoAddress as Address,
            args: {
              id: marketIdParam,
              onBehalf: userAddress,
              receiver: userAddress,
              assets: borrowAmount,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          } as InputBundlerOperation);
        }
        try {
          // Log input operations before populate
          this.logger.log(
            'Input operations:',
            JSON.stringify(inputOperations, null, 2),
          );
          // Populate and finalize the bundle exactly like Compound Blue does
          let { operations } = bundlerSdk.populateBundle(
            inputOperations,
            simulationState,
            {
              publicAllocatorOptions: {
                enabled: true,
                defaultSupplyTargetUtilization:
                  PUBLIC_ALLOCATOR_SUPPLY_TARGET_UTILIZATION,
              },
              // approvalOptions: {
              //   enabled: true,
              // },
              // authorizationOptions: {
              //   enabled: true,
              //   forceAuthorize: true,
              // },
            },
          );
          // Log populated operations
          this.logger.log(
            'Populated operations:',
            JSON.stringify(operations, null, 2),
          );
          const hasSetAuthorization = operations.some(
            (op) => op.type === 'Blue_SetAuthorization',
          );
          this.logger.log('Has Blue_SetAuthorization:', hasSetAuthorization);
          if (hasSetAuthorization) {
            const authOp = operations.find(
              (op) => op.type === 'Blue_SetAuthorization',
            );
            this.logger.log(
              'Authorization operation:',
              JSON.stringify(authOp, null, 2),
            );
          }
          operations = bundlerSdk.finalizeBundle(
            operations,
            simulationState,
            userAddress,
          );
          // Always set supportsSignature to false to handle all approvals as transactions
          const bundle = bundlerSdk.encodeBundle(
            operations,
            simulationState,
            false, // Always false to handle all approvals through transactions
          );

          // Log detailed bundle requirements for debugging
          this.logger.log(
            `Bundle has ${bundle.requirements.txs.length} transaction requirements`,
          );
          this.logger.log(
            `Bundle requirements: ${JSON.stringify(bundle.requirements, null, 2)}`,
          );

          // Extract all approval transactions that need to be executed first
          const approvalTransactions: Array<{
            to: string;
            data: string;
            value: string;
            description: string;
          }> = [];

          // Process all transaction requirements from the bundle
          if (bundle.requirements && bundle.requirements.txs) {
            this.logger.log(
              `Bundle has ${bundle.requirements.txs.length} transaction requirements`,
            );
            this.logger.log(
              `Bundle requirements: ${JSON.stringify(bundle.requirements, null, 2)}`,
            );

            // Loop through each transaction requirement and extract relevant info
            for (const txReq of bundle.requirements.txs) {
              if (txReq.tx && txReq.tx.to && txReq.tx.data) {
                // Add to approval transactions with proper description based on type
                approvalTransactions.push({
                  to: txReq.tx.to,
                  data: txReq.tx.data,
                  value: txReq.tx.value?.toString() || '0',
                  description: txReq.type || 'approval', // Use type for description or default to 'approval'
                });

                this.logger.log(
                  `Added ${txReq.type} transaction to approvalTransactions`,
                );
              } else {
                this.logger.warn(
                  `Incomplete transaction requirement: ${JSON.stringify(txReq)}`,
                );
              }
            }
          }

          // Get the final transaction data - this is executed AFTER all approvals
          const txData = await bundle.tx();

          // The flow should be:
          // 1. First execute all approvalTransactions
          // 2. Wait for confirmations
          // 3. Then execute the main transaction (txData)

          return {
            transactionData: {
              to: txData.to,
              data: txData.data,
              value: txData.value?.toString() || '0',
            },
            approvalTransactions, // These must be executed first
            simulation: {
              market: marketId,
              collateral: {
                token: collateral.token,
                address: collateralTokenInfo.address,
                amount: collateral.amount,
                decimals: collateralTokenInfo.decimals,
              },
              borrow: {
                token: borrow.token,
                address: borrowTokenInfo.address,
                amount: borrow.amount,
                decimals: borrowTokenInfo.decimals,
              },
              operations: [
                ...(collateralAmount > 0n
                  ? [{ type: 'Supply Collateral', token: collateral.token }]
                  : []),
                ...(borrowAmount > 0n
                  ? [{ type: 'Borrow', token: borrow.token }]
                  : []),
              ],
              message:
                approvalTransactions.length > 0
                  ? 'Approval transactions required before the main transaction.'
                  : 'No approvals needed. Ready to execute main transaction.',
            },
            chainId: getChainId(chain),
          };
        } catch (error) {
          // Specific handling for market liquidity errors
          if (
            error.message &&
            error.message.includes('insufficient liquidity on market')
          ) {
            this.logger.error(
              `Market liquidity error: ${error.message}`,
              error.stack,
            );
            throw new BadRequestException(
              'The requested borrow amount exceeds available market liquidity. Try a smaller amount or a different market.',
            );
          }
          // Re-throw other errors
          this.logger.error(
            `Error in SDK operations: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      } catch (error) {
        this.logger.error(
          `Error in Morpho borrow: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Error in Morpho borrow: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  /**
   * Finds the Morpho Earn Vault information based on a single identifier (address or name query).
   * Auto-detects if the identifier is an address.
   */
  private async findEarnVaultInfo(
    chain: MorphoEarnSupportedChain,
    vaultIdentifier: string | undefined, // Accept single identifier
  ): Promise<WhitelistedVault | undefined> {
    // Throw error immediately if no identifier is provided
    if (!vaultIdentifier) {
      this.logger.error('findEarnVaultInfo called without vaultIdentifier.');
      throw new BadRequestException(
        'vaultIdentifier must be provided in the request body.',
      );
    }
    // --- Fetch/Refresh Whitelist Cache --- (existing logic)
    const now = Date.now();
    if (
      !this.vaultWhitelistCache ||
      now - this.vaultWhitelistCacheTime > this.VAULT_WHITELIST_CACHE_DURATION
    ) {
      if (this.isFetchingVaultWhitelist) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.findEarnVaultInfo(chain, vaultIdentifier);
      }
      this.isFetchingVaultWhitelist = true;
      try {
        this.logger.log(
          `Fetching or refreshing vault whitelist from GraphQL API`,
        );

        // Use GraphQL API instead of URL
        const vaults = await this.graphqlService.getWhitelistedVaults();

        // Map to expected format
        const whitelistedVaults = vaults.map((vault) => ({
          address: vault.address,
          chainId: vault.chain.id,
          description: vault.metadata?.description || vault.name,
          curators:
            vault.metadata?.curators?.map((curator) => ({
              name: curator.name,
            })) || [],
          asset: vault.asset
            ? {
                address: vault.asset.address,
                symbol: vault.asset.symbol,
                decimals: vault.asset.decimals,
                name: vault.asset.name,
              }
            : undefined,
        }));

        this.vaultWhitelistCache = whitelistedVaults;
        this.vaultWhitelistCacheTime = now;
        this.logger.log('Successfully fetched and cached vault whitelist.');
      } catch (error) {
        this.logger.error(
          `Failed to fetch vault whitelist: ${error.message}`,
          error.stack,
        );
        this.isFetchingVaultWhitelist = false;
        throw new InternalServerErrorException(
          'Failed to fetch vault whitelist data.',
        );
      } finally {
        this.isFetchingVaultWhitelist = false;
      }
    }
    if (!this.vaultWhitelistCache) {
      throw new InternalServerErrorException(
        'Vault whitelist cache is unavailable.',
      );
    }
    // --- End Cache Logic ---
    const targetChainId = getChainId(chain);
    let isLikelyAddress = false;
    // Auto-detect if identifier is an address
    try {
      isLikelyAddress = isAddress(vaultIdentifier);
    } catch (_e) {
      /* ignore errors from isAddress if format is weird */
    }
    this.logger.debug(
      `Vault identifier "${vaultIdentifier}" is likely an address: ${isLikelyAddress}`,
    );
    // 1. If it looks like an address, try direct match first
    if (isLikelyAddress) {
      this.logger.debug(
        `Searching for vault by address: ${vaultIdentifier} on chain ${chain}`,
      );
      const vault = this.vaultWhitelistCache.find(
        (v) =>
          v.chainId === targetChainId &&
          v.address.toLowerCase() === vaultIdentifier.toLowerCase(),
      );
      if (vault) {
        this.logger.debug(`Found vault by address: ${vault.address}`);
        return vault; // Exact address match found
      } else {
        // Address not found in whitelist for this chain
        this.logger.warn(
          `Vault address ${vaultIdentifier} not found in whitelist for chain ${chain}.`,
        );
        // Don't throw yet, maybe it was a name query that happens to look like an address
        // Fall through to name query search below.
      }
    }
    // 2. Treat as name query (either initially or as fallback if address match failed)
    this.logger.debug(
      `Searching for vault by name query: "${vaultIdentifier}" on chain ${chain}`,
    );
    const queryLower = vaultIdentifier.toLowerCase();
    const foundVaults = this.vaultWhitelistCache.filter(
      (vault) =>
        vault.chainId === targetChainId &&
        ((vault.description?.toLowerCase().includes(queryLower) ?? false) ||
          (vault.curators?.some((c) =>
            c.name.toLowerCase().includes(queryLower),
          ) ??
            false)),
    );
    if (foundVaults.length === 1) {
      this.logger.debug(
        `Found unique vault by name query: ${foundVaults[0].address}`,
      );
      return foundVaults[0];
    } else if (foundVaults.length > 1) {
      this.logger.warn(
        `Multiple vaults found for identifier "${vaultIdentifier}". Fetching details...`,
      );
      // Fetch details for each matching vault (existing logic)
      const detailedPromises = foundVaults.map(async (v) => {
        // ... fetch vaultData, format APY/TVL, create detail string ...
        const vaultData = await this.getEarnVaultPublicData(
          v.address,
          targetChainId,
        );
        const curatorNames = v.curators?.map((c) => c.name).join(', ') || 'N/A';
        const desc = v.description || 'No description';
        const apyValue = vaultData?.state?.dailyNetApy;
        const apyString =
          apyValue !== undefined && apyValue !== null
            ? (apyValue * 100).toFixed(2) + '%'
            : 'N/A';
        const tvlValue = vaultData?.state?.totalAssetsUsd;
        let tvlString = 'N/A';
        if (tvlValue !== undefined && tvlValue !== null) {
          try {
            tvlString =
              '$' +
              parseFloat(tvlValue).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
          } catch (_formatError) {
            // Provide the warning message to the logger
            this.logger.warn(
              `Failed to format TVL value ${tvlValue} for vault ${v.address}`,
            );
            tvlString = `$${tvlValue}`; // Fallback
          }
        }
        return `\n  - Address: ${v.address}, APY: ${apyString}, TVL: ${tvlString}, Curator(s): ${curatorNames}, Description: "${desc}"`;
      });
      const vaultDetails = (await Promise.all(detailedPromises)).join('');
      throw new BadRequestException(
        `Multiple vaults match identifier "${vaultIdentifier}":${vaultDetails}\nPlease use the specific vaultAddress or refine your query.`,
      );
    } else {
      // No vaults found by either address (if attempted) or name query
      this.logger.warn(
        `No vaults found matching identifier "${vaultIdentifier}" on chain ${chain}.`,
      );
      throw new BadRequestException(
        `No vault found matching identifier "${vaultIdentifier}" on chain ${chain}.`,
      );
    }
  }
  /**
   * PUBLIC: Gets a list of whitelisted vaults from the Morpho GraphQL API.
   * @returns Array of WhitelistedVault objects or null on error
   */
  async getEarnVaultWhitelist(): Promise<WhitelistedVault[] | null> {
    const currentTime = Date.now();
    if (
      !this.vaultWhitelistCache ||
      currentTime - this.vaultWhitelistCacheTime >
        this.VAULT_WHITELIST_CACHE_DURATION
    ) {
      if (this.isFetchingVaultWhitelist) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.getEarnVaultWhitelist();
      }
      this.isFetchingVaultWhitelist = true;
      try {
        this.logger.log(
          'Fetching or refreshing vault whitelist from GraphQL API',
        );

        // Use the GraphQL service instead of the hardcoded URL
        const vaults = await this.graphqlService.getWhitelistedVaults();

        // Map the vaults to the WhitelistedVault format
        const whitelistedVaults: WhitelistedVault[] = vaults.map((vault) => ({
          address: vault.address,
          chainId: vault.chain.id,
          description: vault.metadata?.description || vault.name,
          curators:
            vault.metadata?.curators?.map((curator) => ({
              name: curator.name,
            })) || [],
          asset: vault.asset
            ? {
                address: vault.asset.address,
                symbol: vault.asset.symbol,
                decimals: vault.asset.decimals,
                name: vault.asset.name,
              }
            : undefined,
        }));

        this.vaultWhitelistCache = whitelistedVaults;
        this.vaultWhitelistCacheTime = currentTime;
        this.logger.log(
          `Successfully fetched and cached ${whitelistedVaults.length} vaults from GraphQL API.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch vault whitelist from GraphQL API: ${error.message}`,
          error.stack,
        );
        this.isFetchingVaultWhitelist = false;
        return null;
      } finally {
        this.isFetchingVaultWhitelist = false;
      }
    }
    return this.vaultWhitelistCache;
  }
  /**
   * PUBLIC: Fetches public data for a specific vault using the GraphQL service.
   * @param address Vault address
   * @param chainId Numeric chain ID
   * @returns Vault data (structure defined by GraphQL query) or null on error.
   */
  async getEarnVaultPublicData(address: Hex, chainId: number): Promise<any> {
    this.logger.debug(
      `Fetching public vault data for ${address} on chain ${chainId}`,
    );
    try {
      // Directly call the GraphQL service method
      return await this.graphqlService.getVaultData(address, chainId);
    } catch (error) {
      this.logger.error(
        `Error fetching public vault data for ${address} via GraphQL service: ${error.message}`,
        error.stack,
      );
      // Return null on error to allow YieldService to proceed partially
      return null;
    }
  }
  /**
   * Generate transaction data for depositing assets into a Morpho Earn Vault,
   * after checking user's wallet balance.
   */
  async depositToEarnVault(
    chain: SupportedChain,
    depositDto: MorphoEarnDepositDto,
  ): Promise<MorphoEarnOperationResponseDto> {
    if (
      !MORPHO_EARN_SUPPORTED_CHAINS.includes(chain as MorphoEarnSupportedChain)
    ) {
      throw new BadRequestException(
        `Morpho Earn is not supported on chain: ${chain}. Supported: ${MORPHO_EARN_SUPPORTED_CHAINS.join(', ')}`,
      );
    }
    const earnChainDeposit = chain as MorphoEarnSupportedChain;
    const {
      assetSymbol: depositAsset,
      amount: depositAmount,
      userAddress: depositUser,
      vaultIdentifier: depositVault,
    } = depositDto;
    this.logger.log(
      `Processing Morpho Earn deposit for ${depositAmount} ${depositAsset} on ${earnChainDeposit} by ${depositUser} (Identifier: ${depositVault ?? 'N/A'})`,
    );
    try {
      // Find Vault using the single identifier
      const vaultInfo = await this.findEarnVaultInfo(
        earnChainDeposit,
        depositVault,
      );
      if (!vaultInfo) {
        // findEarnVaultInfo now throws specific errors, so this might be redundant
        throw new InternalServerErrorException(
          `Could not identify a unique vault using the provided identifier.`,
        );
      }
      this.logger.log(
        `Identified target Earn Vault: ${vaultInfo.address} (${vaultInfo.description ?? 'No description'})`,
      );
      // Find token info using the assetSymbol PROVIDED IN THE DTO
      // We still need this to get decimals etc.
      const tokenInfo = await this.findTokenInfo(
        earnChainDeposit,
        depositAsset,
      );
      if (!tokenInfo) {
        throw new BadRequestException(
          `Token ${depositAsset} not found or supported on ${earnChainDeposit}`,
        );
      }
      // --- Verification Step: Check if the identified vault actually handles the specified assetSymbol ---
      // This requires fetching the vault's underlying asset, which might be from description or GraphQL
      // For now, let's add a basic check against description (can be enhanced later)
      const descriptionLower = (vaultInfo.description ?? '').toLowerCase();
      const symbolLower = depositAsset.toLowerCase();
      // Simple check: Does description contain the symbol (word boundary might be better)?
      // A more robust check would involve fetching actual vault data (e.g., underlying asset address)
      // and comparing it with tokenInfo.address.
      if (!descriptionLower.includes(symbolLower)) {
        this.logger.warn(
          `Potential mismatch: Vault ${vaultInfo.address} description "${vaultInfo.description}" may not match provided assetSymbol "${depositAsset}". Continuing, but verify vault selection.`,
        );
        // Consider throwing a BadRequestException here for stricter validation
        // throw new BadRequestException(`Vault ${vaultInfo.address} identified does not appear to be for asset ${depositAsset}. Check vault description or provide correct identifiers.`);
      } else {
        this.logger.debug(
          `Vault description "${vaultInfo.description}" seems consistent with assetSymbol "${depositAsset}".`,
        );
      }
      // --- End Verification Step ---
      const depositAmountBigInt = parseUnits(depositAmount, tokenInfo.decimals);
      const rpcClient = this._getRpcClient(earnChainDeposit);
      // Fetch user's wallet balance
      let walletBalance = '0';
      let walletBalanceBigInt = 0n;
      try {
        walletBalanceBigInt = (await rpcClient.readContract({
          address: tokenInfo.address,
          abi: ERC20_BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args: [depositUser],
        })) as bigint;
        walletBalance = formatUnits(walletBalanceBigInt, tokenInfo.decimals);
        this.logger.log(
          `User ${depositUser} wallet balance: ${walletBalance} ${depositAsset}`,
        );
      } catch (balanceError) {
        this.logger.error(
          `Failed to fetch wallet balance for ${depositAsset} (${tokenInfo.address}) for user ${depositUser} on ${earnChainDeposit}: ${balanceError.message}`,
        );
        // Decide if this should be fatal - maybe allow proceeding without balance check?
        // For now, let's throw an error if balance check fails.
        throw new InternalServerErrorException(
          'Failed to verify user wallet balance.',
        );
      }
      // Check if balance is sufficient
      if (walletBalanceBigInt < depositAmountBigInt) {
        throw new BadRequestException(
          `Insufficient wallet balance. Need ${depositAmount} ${depositAsset}, but only have ${walletBalance} ${depositAsset}.`,
        );
      }

      // Check token allowance and generate approval transaction if needed
      // This is the new code to handle approvals similar to the borrow function
      const approvalTransactions: Array<{
        to: string;
        data: string;
        value: string;
        description: string;
      }> = [];

      try {
        // Check current token allowance
        const currentAllowance = await rpcClient.readContract({
          address: tokenInfo.address,
          abi: [
            {
              constant: true,
              inputs: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
              ],
              name: 'allowance',
              outputs: [{ name: '', type: 'uint256' }],
              type: 'function',
            },
          ],
          functionName: 'allowance',
          args: [depositUser, vaultInfo.address],
        });

        this.logger.log(
          `Current allowance for ${depositUser} to vault ${vaultInfo.address}: ${formatUnits(
            currentAllowance as bigint,
            tokenInfo.decimals,
          )} ${depositAsset}`,
        );

        // Check if approval is needed
        if ((currentAllowance as bigint) < depositAmountBigInt) {
          this.logger.log(
            `Generating approval transaction for ${depositAmount} ${depositAsset}`,
          );

          // Generate approval transaction data
          const approvalData = encodeFunctionData({
            abi: [
              {
                constant: false,
                inputs: [
                  { name: 'spender', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
                name: 'approve',
                outputs: [{ name: '', type: 'bool' }],
                type: 'function',
              },
            ],
            functionName: 'approve',
            args: [vaultInfo.address, depositAmountBigInt],
          });

          // Add approval transaction to the list
          approvalTransactions.push({
            to: tokenInfo.address,
            data: approvalData,
            value: '0',
            description: 'token_approval',
          });

          this.logger.log(
            `Added token approval transaction for ${depositAsset}`,
          );
        } else {
          this.logger.log(
            `No approval needed, current allowance is sufficient`,
          );
        }
      } catch (allowanceError) {
        this.logger.error(
          `Failed to check token allowance: ${allowanceError.message}`,
          allowanceError.stack,
        );
        // Continue without checking allowance, the user's wallet will handle the error
      }

      // Encode function data
      const depositData = encodeFunctionData({
        abi: DEPOSIT_ABI,
        functionName: 'deposit',
        args: [depositAmountBigInt, depositUser],
      });
      // --- APY Fetching & Vault Info ---
      let apyPercent: number | null = null;
      let projectedMonthlyEarnings: string | null = null;
      let projectedYearlyEarnings: string | null = null;
      let vaultName: string | null = null; // <-- Add variable
      let vaultSymbol: string | null = null; // <-- Add variable
      const curatorName: string | null =
        vaultInfo.curators?.map((c) => c.name).join(', ') ?? null; // <-- Get curator from vaultInfo
      try {
        const numericChainId = getChainId(earnChainDeposit); // Get numeric ID
        const vaultData = await this.graphqlService.getVaultData(
          vaultInfo.address,
          numericChainId,
        );
        if (vaultData) {
          vaultName = vaultData.name;
          vaultSymbol = vaultData.symbol;
          if (vaultData?.state?.dailyNetApy != null) {
            const netApy = vaultData.state.dailyNetApy;
            apyPercent = netApy * 100;
            // Calculate projections based on the deposit amount
            const depositAmountNumeric = parseFloat(depositAmount);
            if (!isNaN(depositAmountNumeric)) {
              const yearly = depositAmountNumeric * netApy;
              const monthly = yearly / 12;
              // Convert to fixed-point string for DTO
              projectedYearlyEarnings = yearly > 0 ? yearly.toFixed(2) : '0.00';
              projectedMonthlyEarnings =
                monthly > 0 ? monthly.toFixed(2) : '0.00';
            } else {
              this.logger.warn(
                `Could not parse deposit amount '${depositAmount}' for earning projection calculation.`,
              );
            }
            this.logger.log(
              `Fetched Vault APY: ${apyPercent}%. Projected Yearly: ${projectedYearlyEarnings}, Monthly: ${projectedMonthlyEarnings} (based on deposit amount)`,
            );
          } else {
            this.logger.warn(
              `Could not parse dailyNetApy data from vault state for vault ${vaultInfo.address} on chain ${earnChainDeposit} (ID: ${numericChainId}). APY will be null. State: ${JSON.stringify(vaultData?.state)}`,
            );
          }
        } else {
          this.logger.warn(
            `Could not fetch vault data (name/symbol/state) for vault ${vaultInfo.address} on chain ${earnChainDeposit} (ID: ${numericChainId}). Name, Symbol, APY will be null.`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to fetch APY/Vault data: ${error.message}`);
        // Don't fail the simulation if APY fetch fails, just log it.
      }
      // --- End APY Fetching & Vault Info ---
      // Construct response
      return {
        simulation: {
          vault: vaultInfo.address,
          asset: {
            token: depositAsset,
            address: tokenInfo.address,
            amount: depositAmount,
            decimals: tokenInfo.decimals,
          },
          operationType: 'Deposit',
          message:
            approvalTransactions.length > 0
              ? `Simulated deposit of ${depositAmount} ${depositAsset} into vault ${vaultInfo.address}. Wallet balance sufficient. Approval transaction required before the main transaction.`
              : `Simulated deposit of ${depositAmount} ${depositAsset} into vault ${vaultInfo.address}. Wallet balance sufficient. No approvals needed.`,
          walletBalance: walletBalance,
          vaultPosition: undefined,
          apyPercent: apyPercent,
          projectedMonthlyEarnings: projectedMonthlyEarnings,
          projectedYearlyEarnings: projectedYearlyEarnings,
          vaultName: vaultName,
          vaultSymbol: vaultSymbol,
          curatorName: curatorName,
        },
        transactionData: {
          to: vaultInfo.address,
          data: depositData,
          value: '0',
        },
        approvalTransactions:
          approvalTransactions.length > 0 ? approvalTransactions : undefined,
        chainId: getChainId(earnChainDeposit),
      };
    } catch (error) {
      // Catch specific errors thrown above, otherwise log and re-throw generic
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Error in depositToEarnVault: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to prepare deposit transaction.',
      );
    }
  }
  /**
   * Generate transaction data for withdrawing assets from a Morpho Earn Vault,
   * after checking user's share balance.
   */
  async withdrawFromEarnVault(
    chain: SupportedChain,
    withdrawDto: MorphoEarnWithdrawDto,
  ): Promise<MorphoEarnOperationResponseDto> {
    if (
      !MORPHO_EARN_SUPPORTED_CHAINS.includes(chain as MorphoEarnSupportedChain)
    ) {
      throw new BadRequestException(
        `Morpho Earn is not supported on chain: ${chain}. Supported: ${MORPHO_EARN_SUPPORTED_CHAINS.join(', ')}`,
      );
    }
    const earnChainWithdraw = chain as MorphoEarnSupportedChain;
    const {
      assetSymbol: withdrawAsset,
      amount: withdrawAmount,
      userAddress: withdrawUser,
      vaultIdentifier: withdrawVault,
    } = withdrawDto;
    this.logger.log(
      `Preparing withdraw tx data for ${withdrawAmount} ${withdrawAsset} shares on ${earnChainWithdraw} for ${withdrawUser} (Identifier: ${withdrawVault ?? 'N/A'})`,
    );
    let vaultInfo: WhitelistedVault | undefined;
    let tokenInfo: TokenInfo | undefined;
    let vaultPositionBigInt: bigint | undefined;
    let vaultPosition: string | undefined;

    // For withdraw operations, we don't need approval transactions since the user is withdrawing
    // their own shares from the vault, but we'll include an empty array for consistency
    const approvalTransactions: Array<{
      to: string;
      data: string;
      value: string;
      description: string;
    }> = [];

    try {
      // Find Vault using the single identifier
      vaultInfo = await this.findEarnVaultInfo(
        earnChainWithdraw,
        withdrawVault,
      );
      if (!vaultInfo) {
        throw new InternalServerErrorException(
          `Could not identify a unique vault using the provided identifier.`,
        );
      }
      this.logger.debug(
        `Identified target Earn Vault: ${vaultInfo.address} (${vaultInfo.description ?? 'No description'})`,
      );
      // Find token info using the assetSymbol (still needed for decimals)
      tokenInfo = await this.findTokenInfo(earnChainWithdraw, withdrawAsset);
      if (!tokenInfo) {
        throw new InternalServerErrorException(
          `Token info for ${withdrawAsset} not found on ${earnChainWithdraw}, despite vault existing.`,
        );
      }
      this.logger.debug(
        `Found token info for ${withdrawAsset}: Decimals ${tokenInfo.decimals}`,
      );
      // --- Verification Step (Similar to deposit) ---
      const descriptionLower = (vaultInfo.description ?? '').toLowerCase();
      const symbolLower = withdrawAsset.toLowerCase();
      if (!descriptionLower.includes(symbolLower)) {
        this.logger.warn(
          `Potential mismatch: Vault ${vaultInfo.address} description "${vaultInfo.description}" may not match provided assetSymbol "${withdrawAsset}". Continuing, but verify vault selection.`,
        );
        // Consider throwing: throw new BadRequestException(...)
      } else {
        this.logger.debug(
          `Vault description "${vaultInfo.description}" seems consistent with assetSymbol "${withdrawAsset}".`,
        );
      }
      // --- End Verification Step ---
      const rpcClient = this._getRpcClient(earnChainWithdraw);
      // Fetch User's Share Balance (existing logic, uses vaultInfo.address)
      try {
        vaultPositionBigInt = (await rpcClient.readContract({
          address: vaultInfo.address, // Use identified vault address
          abi: ERC4626_BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args: [withdrawUser as Address],
        })) as bigint;
        vaultPosition = formatUnits(vaultPositionBigInt, tokenInfo.decimals); // Use token decimals
        this.logger.log(
          `User ${withdrawUser} vault share balance: ${vaultPosition} shares in ${withdrawAsset} vault`,
        );
      } catch (balanceError) {
        this.logger.error(
          `Failed to fetch vault share balance for ${withdrawUser} in ${vaultInfo.address || 'unknown vault'}: ${balanceError.message}`,
          balanceError.stack,
        );
        throw new InternalServerErrorException(
          'Failed to verify user vault share balance.',
        );
      }
      // Check share balance (amount is shares for withdraw)
      const requestedAmountBigInt = parseUnits(
        withdrawAmount,
        tokenInfo.decimals,
      ); // Use token decimals
      if (vaultPositionBigInt < requestedAmountBigInt) {
        throw new BadRequestException(
          `Insufficient share balance to withdraw ${withdrawAmount} shares. Balance: ${vaultPosition}`,
        );
      }
      // Generate Transaction Data (existing logic, uses vaultInfo.address)
      const transactionData = encodeFunctionData({
        abi: ERC4626_REDEEM_ABI,
        functionName: 'redeem',
        args: [
          requestedAmountBigInt,
          withdrawUser as Address,
          withdrawUser as Address,
        ],
      });
      this.logger.log(
        `Generated redeem transaction data for ${withdrawUser} to vault ${vaultInfo.address}`,
      );
      // Fetch APY/Vault Info (existing logic, uses vaultInfo.address)
      let apyPercent: number | null = null;
      let projectedMonthlyEarnings: string | null = null;
      let projectedYearlyEarnings: string | null = null;
      let vaultName: string | null = null;
      let vaultSymbol: string | null = null;
      const curatorName: string | null =
        vaultInfo.curators?.map((c) => c.name).join(', ') ?? null;
      try {
        const numericChainId = getChainId(earnChainWithdraw);
        const vaultData = await this.graphqlService.getVaultData(
          vaultInfo.address,
          numericChainId,
        );
        if (vaultData) {
          vaultName = vaultData.name;
          vaultSymbol = vaultData.symbol;
          if (vaultData?.state?.dailyNetApy != null) {
            const netApy = vaultData.state.dailyNetApy;
            apyPercent = netApy * 100;
            const withdrawAmountNumeric = parseFloat(withdrawAmount);
            if (!isNaN(withdrawAmountNumeric)) {
              const yearly = withdrawAmountNumeric * netApy;
              const monthly = yearly / 12;
              projectedYearlyEarnings = yearly > 0 ? yearly.toFixed(2) : '0.00';
              projectedMonthlyEarnings =
                monthly > 0 ? monthly.toFixed(2) : '0.00';
            } else {
              this.logger.warn(
                `Could not parse withdraw amount '${withdrawAmount}' for earning projection calculation.`,
              );
            }
            this.logger.log(
              `Fetched Vault APY: ${apyPercent}%. Projected Yearly: ${projectedYearlyEarnings}, Monthly: ${projectedMonthlyEarnings} (based on withdraw amount)`,
            );
          } else {
            this.logger.warn(
              `Could not parse dailyNetApy data from vault state for vault ${vaultInfo.address} on chain ${earnChainWithdraw} (ID: ${numericChainId}). APY will be null. State: ${JSON.stringify(vaultData?.state)}`,
            );
          }
        } else {
          this.logger.warn(
            `Could not fetch vault data (name/symbol/state) for vault ${vaultInfo.address} on chain ${earnChainWithdraw} (ID: ${numericChainId}). Name, Symbol, APY will be null.`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to fetch APY/Vault data: ${error.message}`);
      }
      // --- End APY Fetching & Vault Info ---
      // Simulate Transaction & Generate Calldata (existing logic)
      try {
        return {
          simulation: {
            vault: vaultInfo.address,
            asset: {
              token: withdrawAsset,
              address: tokenInfo.address,
              amount: withdrawAmount,
              decimals: tokenInfo.decimals,
            },
            operationType: 'Withdraw',
            message: `Simulated withdrawal of ${withdrawAmount} ${withdrawAsset} shares from vault ${vaultInfo.address}. Share balance sufficient. No approvals needed.`,
            walletBalance: undefined,
            vaultPosition: vaultPosition,
            apyPercent: apyPercent,
            projectedMonthlyEarnings: projectedMonthlyEarnings,
            projectedYearlyEarnings: projectedYearlyEarnings,
            vaultName: vaultName,
            vaultSymbol: vaultSymbol,
            curatorName: curatorName,
          },
          transactionData: {
            to: vaultInfo.address,
            data: transactionData,
            value: '0',
          },
          approvalTransactions:
            approvalTransactions.length > 0 ? approvalTransactions : undefined,
          chainId: getChainId(earnChainWithdraw),
        };
      } catch (error) {
        this.logger.error(
          `Could not fetch wallet balance for ${withdrawUser}: ${error.message}`,
        );
        throw error;
      }
    } catch (error) {
      // Catch specific errors thrown above, otherwise log and re-throw generic
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Error in withdrawFromEarnVault: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to prepare withdraw transaction.',
      );
    }
  }
  // This is the CORRECT implementation using the token list
  async findTokenInfo(
    chain: SupportedChain,
    symbol: string,
  ): Promise<TokenInfo | undefined> {
    const now = Date.now();
    // Check cache first
    if (
      this.tokenListCache &&
      now - this.tokenListCacheTime < this.TOKEN_LIST_CACHE_DURATION
    ) {
      this.logger.debug('Using cached token list.');
    } else {
      // Prevent concurrent fetches
      while (this.isFetchingTokenList) {
        this.logger.debug('Waiting for ongoing token list fetch...');
        await new Promise((resolve) => setTimeout(resolve, 200)); // Wait 200ms
      }
      // Check cache again after waiting (another thread might have fetched it)
      if (
        this.tokenListCache &&
        now - this.tokenListCacheTime < this.TOKEN_LIST_CACHE_DURATION
      ) {
        this.logger.debug('Using cached token list obtained while waiting.');
      } else {
        this.isFetchingTokenList = true;
        try {
          this.logger.log(`Fetching token list from ${this.TOKEN_LIST_URL}...`);
          const response = await axios.get<TokenList>(this.TOKEN_LIST_URL);
          if (response.data && response.data.tokens) {
            this.tokenListCache = response.data;
            this.tokenListCacheTime = now;
            this.logger.log(
              `Successfully fetched and cached token list (${this.tokenListCache.tokens.length} tokens).`,
            );

            // Try to fetch and merge additional token lists
            try {
              this.logger.log('Fetching additional token lists...');
              for (const listUrl of this.ADDITIONAL_TOKEN_LISTS) {
                try {
                  const additionalResponse = await axios.get(listUrl);
                  let additionalTokens: TokenInfo[] = [];

                  // Handle different token list formats
                  if (additionalResponse.data.tokens) {
                    // Standard token list format
                    additionalTokens = additionalResponse.data.tokens;
                  } else if (Array.isArray(additionalResponse.data)) {
                    // Simple array format
                    additionalTokens = additionalResponse.data;
                  }

                  if (additionalTokens.length > 0) {
                    // Merge with main token list, avoiding duplicates
                    const currentAddresses = new Set(
                      this.tokenListCache.tokens.map(
                        (t) => `${t.chainId}-${t.address.toLowerCase()}`,
                      ),
                    );

                    const newTokens = additionalTokens.filter(
                      (token) =>
                        !currentAddresses.has(
                          `${token.chainId}-${token.address.toLowerCase()}`,
                        ),
                    );

                    if (newTokens.length > 0) {
                      this.tokenListCache.tokens = [
                        ...this.tokenListCache.tokens,
                        ...newTokens,
                      ];
                      this.logger.log(
                        `Added ${newTokens.length} tokens from ${listUrl}. Total tokens: ${this.tokenListCache.tokens.length}`,
                      );
                    }
                  }
                } catch (listError) {
                  this.logger.warn(
                    `Failed to fetch or parse additional token list from ${listUrl}: ${listError.message}`,
                  );
                  // Continue with next list
                }
              }
            } catch (additionalListsError) {
              this.logger.warn(
                `Error while processing additional token lists: ${additionalListsError.message}`,
              );
              // Continue with the main list
            }
          } else {
            throw new Error('Invalid token list format received.');
          }
        } catch (error) {
          this.logger.error(
            `Failed to fetch token list: ${error.message}`,
            error.stack,
          );
          // Reset cache but don't throw, allow proceeding if previous cache exists (stale)
          this.tokenListCache = null;
          this.tokenListCacheTime = 0;
        } finally {
          this.isFetchingTokenList = false;
        }
      }
    }

    if (!this.tokenListCache) {
      this.logger.error(
        'Cannot find token info: Token list cache is empty and fetch failed.',
      );
      return undefined; // Or throw an error if token info is absolutely required
    }

    // Find token by symbol and chain ID
    let targetChainId: number;
    switch (chain) {
      case 'mainnet':
        targetChainId = mainnet.id;
        break;
      case 'base':
        targetChainId = base.id;
        break;
      // Add other supported chains here if necessary
      default:
        this.logger.error(
          `Unsupported chain provided to findTokenInfo: ${chain}`,
        );
        return undefined;
    }

    try {
      // 1. Try to find token in standard token lists first
      const symbolUpperCase = symbol.toUpperCase();
      const foundToken = this.tokenListCache.tokens.find(
        (t) =>
          t.symbol.toUpperCase() === symbolUpperCase &&
          t.chainId === targetChainId,
      );

      if (foundToken) {
        this.logger.debug(
          `Found token ${symbol} on chain ${chain} (ID: ${targetChainId}): Address ${foundToken.address}, Decimals ${foundToken.decimals}`,
        );
        // Ensure address is Hex type
        return { ...foundToken, address: foundToken.address as Hex };
      }

      // 2. Try to find token in GraphQL market data
      this.logger.warn(
        `Token ${symbol} not found on chain ${chain} (ID: ${targetChainId}) in token lists. Trying GraphQL API...`,
      );

      try {
        const marketData = await this.graphqlService.getMarkets(targetChainId);
        if (marketData?.markets?.items) {
          for (const market of marketData.markets.items) {
            // Skip invalid markets
            if (!market || !market.collateralAsset || !market.loanAsset) {
              continue;
            }

            // Check collateral asset
            if (
              market.collateralAsset.symbol &&
              market.collateralAsset.symbol.toUpperCase() === symbolUpperCase
            ) {
              this.logger.log(
                `Found token ${symbol} in GraphQL market data as collateral asset: ${market.collateralAsset.address}`,
              );
              return {
                chainId: targetChainId,
                address: market.collateralAsset.address as Hex,
                name: market.collateralAsset.symbol,
                symbol: market.collateralAsset.symbol,
                decimals: Number(market.collateralAsset.decimals),
                logoURI: '',
              };
            }

            // Check loan asset
            if (
              market.loanAsset.symbol &&
              market.loanAsset.symbol.toUpperCase() === symbolUpperCase
            ) {
              this.logger.log(
                `Found token ${symbol} in GraphQL market data as loan asset: ${market.loanAsset.address}`,
              );
              return {
                chainId: targetChainId,
                address: market.loanAsset.address as Hex,
                name: market.loanAsset.symbol,
                symbol: market.loanAsset.symbol,
                decimals: Number(market.loanAsset.decimals),
                logoURI: '',
              };
            }
          }
        }
      } catch (graphqlError) {
        this.logger.error(
          `Failed to search for token in GraphQL market data: ${graphqlError.message}`,
        );
      }

      // 3. Try using Morpho's direct market data
      this.logger.warn(
        `Token ${symbol} not found in GraphQL data. Trying Morpho market data...`,
      );

      try {
        // Get all markets without filters to find token addresses
        const marketsResponse =
          await this.graphqlService.getAllMarketsForBorrow(targetChainId);
        const markets = marketsResponse?.markets?.items || [];

        for (const market of markets) {
          // Check collateral asset
          if (
            market.collateralAsset &&
            market.collateralAsset.symbol &&
            market.collateralAsset.symbol.toUpperCase() === symbolUpperCase
          ) {
            const tokenAddress = market.collateralAsset.address as Address;
            // Get RPC client for the chain
            const rpcClient = this._getRpcClient(chain as MorphoSupportedChain);

            // Use Morpho's fetchToken to get on-chain token data
            try {
              const onChainToken = await fetchToken(tokenAddress, rpcClient);

              this.logger.log(
                `Found token ${symbol} in Morpho markets and verified on-chain at ${tokenAddress}`,
              );

              return {
                chainId: targetChainId,
                address: tokenAddress,
                name: onChainToken.name || market.collateralAsset.symbol,
                symbol: onChainToken.symbol || market.collateralAsset.symbol,
                decimals:
                  onChainToken.decimals ||
                  Number(market.collateralAsset.decimals),
                logoURI: '',
              };
            } catch (onChainError) {
              // If on-chain verification fails, still use the market data
              this.logger.warn(
                `On-chain verification failed for ${tokenAddress}, using market data: ${onChainError.message}`,
              );

              return {
                chainId: targetChainId,
                address: tokenAddress,
                name: market.collateralAsset.symbol,
                symbol: market.collateralAsset.symbol,
                decimals: Number(market.collateralAsset.decimals),
                logoURI: '',
              };
            }
          }

          // Check loan asset
          if (
            market.loanAsset &&
            market.loanAsset.symbol &&
            market.loanAsset.symbol.toUpperCase() === symbolUpperCase
          ) {
            const tokenAddress = market.loanAsset.address as Address;
            // Get RPC client for the chain
            const rpcClient = this._getRpcClient(chain as MorphoSupportedChain);

            // Use Morpho's fetchToken to get on-chain token data
            try {
              const onChainToken = await fetchToken(tokenAddress, rpcClient);

              this.logger.log(
                `Found token ${symbol} in Morpho markets and verified on-chain at ${tokenAddress}`,
              );

              return {
                chainId: targetChainId,
                address: tokenAddress,
                name: onChainToken.name || market.loanAsset.symbol,
                symbol: onChainToken.symbol || market.loanAsset.symbol,
                decimals:
                  onChainToken.decimals || Number(market.loanAsset.decimals),
                logoURI: '',
              };
            } catch (onChainError) {
              // If on-chain verification fails, still use the market data
              this.logger.warn(
                `On-chain verification failed for ${tokenAddress}, using market data: ${onChainError.message}`,
              );

              return {
                chainId: targetChainId,
                address: tokenAddress,
                name: market.loanAsset.symbol,
                symbol: market.loanAsset.symbol,
                decimals: Number(market.loanAsset.decimals),
                logoURI: '',
              };
            }
          }
        }
      } catch (morphoMarketsError) {
        this.logger.error(
          `Failed to fetch token from Morpho markets: ${morphoMarketsError.message}`,
        );
      }

      // 4. If we still can't find the token, throw an error
      throw new BadRequestException(
        `Token ${symbol} not found on chain ${chain}. Please verify the token symbol.`,
      );
    } catch (error) {
      // If it's already a BadRequestException, just rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Error in findTokenInfo: ${error.message}`);
      throw new BadRequestException(
        `Failed to find token ${symbol} on chain ${chain}`,
      );
    }
  }
  /**
   * Find the market ID for a collateral/borrow token pair
   */
  private async findMarketId(
    chain: SupportedChain,
    collateralAddress: Address,
    borrowAddress: Address,
  ): Promise<string | null> {
    try {
      this.logger.log(
        `Finding market ID for collateral: ${collateralAddress}, borrow: ${borrowAddress}`,
      );
      // Convert chain name to chain ID
      const chainId = getChainIdForMorpho(chain);
      // Get ALL markets information from the GraphQL service without filters
      this.logger.log(
        `Fetching markets from API for chain ${chain} (chainId: ${chainId})`,
      );
      const marketsResponse =
        await this.graphqlService.getAllMarketsForBorrow(chainId);
      // Extract markets array from the response
      const markets = marketsResponse?.markets?.items || [];
      // Debug log market count
      this.logger.log(
        `Found ${markets.length} markets on ${chain} (chainId: ${chainId}) for borrow operations`,
      );
      // If we didn't get any markets, don't try to process them
      if (!markets.length) {
        this.logger.warn(
          `No markets returned from GraphQL API for chain ${chain}`,
        );
        return null;
      }
      // Log each market for debugging (with null checks)
      let validMarketCount = 0;
      markets.forEach((market, index) => {
        // Skip markets with missing data
        if (!market || !market.collateralAsset || !market.loanAsset) {
          this.logger.log(
            `Market ${index + 1}: [INVALID DATA - Missing required fields]`,
          );
          return; // Skip this iteration
        }
        validMarketCount++;
        this.logger.log(`Market ${index + 1}: 
          Collateral: ${market.collateralAsset.symbol || 'UNKNOWN'} (${market.collateralAsset.address || 'UNKNOWN'}), 
          Loan: ${market.loanAsset.symbol || 'UNKNOWN'} (${market.loanAsset.address || 'UNKNOWN'})
          Key: ${market.uniqueKey || 'UNKNOWN'}`);
      });
      this.logger.log(
        `Found ${validMarketCount} valid markets out of ${markets.length} total`,
      );
      // Find an exact match (with null checks)
      const market = markets.find(
        (m) =>
          m &&
          m.collateralAsset &&
          m.loanAsset &&
          m.collateralAsset.address &&
          m.loanAsset.address &&
          m.collateralAsset.address.toLowerCase() ===
            collateralAddress.toLowerCase() &&
          m.loanAsset.address.toLowerCase() === borrowAddress.toLowerCase(),
      );
      // If a match is found, return its uniqueKey
      if (market && market.uniqueKey) {
        this.logger.log(`Found market with ID: ${market.uniqueKey}`);
        return market.uniqueKey;
      } else if (market) {
        this.logger.error(`Found market but it has no uniqueKey`);
      }
      // No market found - throw clear error
      this.logger.error(
        `No market found for the provided token pair on ${chain}. Available markets logged above.`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Error finding market ID: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
  private async fetchTokenList(): Promise<TokenList> {
    if (
      this.tokenListCache &&
      Date.now() - this.tokenListCacheTime < this.TOKEN_LIST_CACHE_DURATION
    ) {
      return this.tokenListCache;
    }

    if (this.isFetchingTokenList) {
      // Wait for the other request to finish
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.fetchTokenList();
    }

    try {
      this.isFetchingTokenList = true;
      const response = await fetch(this.TOKEN_LIST_URL);
      const data = await response.json();
      const currentList: TokenList = data;

      // Add tokens from additional sources
      try {
        // Fetch Coingecko token list which has more comprehensive coverage
        const coingeckoResponse = await fetch(this.COINGECKO_TOKEN_LIST_URL);
        const coingeckoData = await coingeckoResponse.json();

        if (coingeckoData?.tokens?.length > 0) {
          this.logger.log(
            `Found ${coingeckoData.tokens.length} tokens in Coingecko list`,
          );

          // Map current tokens by address (lowercase for case-insensitive comparison)
          const tokensByAddress = new Map<string, TokenInfo>();
          currentList.tokens.forEach((token) => {
            tokensByAddress.set(token.address.toLowerCase(), token);
          });

          // Add tokens from Coingecko that don't exist in the current list
          coingeckoData.tokens.forEach((token) => {
            const address = token.address.toLowerCase();
            if (!tokensByAddress.has(address)) {
              currentList.tokens.push(token);
            }
          });
        }
      } catch (error) {
        this.logger.error(
          `Error fetching Coingecko token list: ${error.message}`,
        );
      }

      this.tokenListCache = currentList;
      this.tokenListCacheTime = Date.now();
      return currentList;
    } catch (error) {
      this.logger.error(`Error fetching token list: ${error.message}`);
      if (this.tokenListCache) {
        return this.tokenListCache;
      }
      return {
        name: 'Empty Token List',
        timestamp: new Date().toISOString(),
        version: {
          major: 1,
          minor: 0,
          patch: 0,
        },
        tags: {},
        logoURI: '',
        keywords: [],
        tokens: [],
      };
    } finally {
      this.isFetchingTokenList = false;
    }
  }
}
