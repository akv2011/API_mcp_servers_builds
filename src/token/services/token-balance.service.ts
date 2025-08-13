import { Injectable, Logger } from '@nestjs/common';
import {
  createConfig,
  EVM,
  getToken,
  getTokenBalance,
  getTokenBalances,
  getTokens,
  Token,
  TokenAmount,
} from '@lifi/sdk';
import { TokenCacheService } from './token-cache.service';
import { SupportedChain } from '../../chain/types/chain.type';
import {
  getChainId,
  mapChainToCoinGeckoPlatform,
  mapCoinGeckoPlatformToChain,
  isSupportedCoinGeckoPlatform,
  filterSupportedPlatforms,
  CHAIN_CONFIGS,
} from 'src/chain/utils/chain.utils';
import { Address, formatUnits } from 'viem';

export interface TokenBalanceRequest {
  chain: SupportedChain;
  tokenIdentifier: string; // Can be a symbol or contract address
}

export interface TokenBalanceResponse {
  chain: SupportedChain;
  chainId: number;
  token: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  };
  balance: string;
  balanceRaw: string;
  balanceUSD?: string;
}

export interface SerializedTokenAmount
  extends Omit<TokenAmount, 'amount' | 'blockNumber'> {
  amount: string;
  blockNumber: string;
  formattedAmount?: string;
}

@Injectable()
export class TokenBalanceService {
  private readonly logger = new Logger(TokenBalanceService.name);

  constructor(private readonly tokenCacheService: TokenCacheService) {}

  onModuleInit() {
    createConfig({
      integrator: 'matrix',
      providers: [EVM()],
    });
  }

  /**
   * Helper method to log supported platforms for a token (useful for debugging)
   * @param tokenId Token identifier
   * @param platforms Token platforms data from CoinGecko
   */
  private logSupportedPlatforms(
    tokenId: string,
    platforms: Record<string, string>,
  ): void {
    const supportedPlatforms = filterSupportedPlatforms(platforms);

    if (Object.keys(supportedPlatforms).length > 0) {
      this.logger.debug(
        `Token ${tokenId} available on supported platforms: ${JSON.stringify(supportedPlatforms)}`,
      );
    } else {
      this.logger.debug(
        `Token ${tokenId} not available on any supported platform`,
      );
    }
  }

  /**
   * Helper method to extract token contract address for a chain from token platforms data
   * @param platforms Token platforms data from CoinGecko
   * @param chain Target chain to find the contract address for
   * @returns Contract address if found, undefined otherwise
   */
  private getTokenAddressForChain(
    platforms: Record<string, string>,
    chain: SupportedChain,
  ): string | undefined {
    // First try direct mapping using our utility function
    const platformId = mapChainToCoinGeckoPlatform(chain);

    if (platformId && platforms[platformId]) {
      return platforms[platformId];
    }

    // Fallback: iterate through supported platforms
    for (const [platform, address] of Object.entries(platforms)) {
      if (isSupportedCoinGeckoPlatform(platform)) {
        const mappedChain = mapCoinGeckoPlatformToChain(platform);
        if (mappedChain === chain) {
          return address;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the balance of a token for a wallet address
   *
   * @param walletAddress The address of the wallet
   * @param request The token balance request containing chain and token identifier
   * @returns Token balance information
   */
  async getTokenBalance(
    walletAddress: string,
    request: TokenBalanceRequest,
  ): Promise<TokenBalanceResponse | null> {
    try {
      // Convert chain name to chain ID
      const chainId = getChainId(request.chain);

      // First, try to find the token using our token cache service
      const tokenData = await this.tokenCacheService.findToken(
        request.tokenIdentifier,
        undefined,
        true,
      );

      // Get the appropriate contract address for the requested chain
      let tokenAddress: string | undefined;

      if (tokenData?.platforms) {
        // Log supported platforms for debugging
        this.logSupportedPlatforms(
          request.tokenIdentifier,
          tokenData.platforms,
        );

        // Use our helper method to get the contract address
        tokenAddress = this.getTokenAddressForChain(
          tokenData.platforms,
          request.chain,
        );

        if (tokenAddress) {
          this.logger.debug(
            `Found contract address ${tokenAddress} for token ${request.tokenIdentifier} on chain ${request.chain}`,
          );
        }
      } else if (request.tokenIdentifier.startsWith('0x')) {
        // If the request already contains a contract address, use it directly
        tokenAddress = request.tokenIdentifier;
      }

      if (!tokenAddress) {
        this.logger.warn(
          `No contract address found for token ${request.tokenIdentifier} on chain ${request.chain} (chainId: ${chainId})`,
        );
        return null;
      }

      // Get token details using LIFI SDK
      const token = await getToken(chainId, tokenAddress);
      if (!token) {
        this.logger.warn(
          `Token not found for address ${tokenAddress} on chain ${request.chain} (chainId: ${chainId})`,
        );
        return null;
      }

      // Get the token balance using LIFI SDK
      const balance = await getTokenBalance(walletAddress, token);
      this.logger.debug(
        `Balance for ${JSON.stringify(token)} on wallet ${walletAddress}: ${JSON.stringify(balance)}`,
      );
      if (!balance) {
        return {
          chain: request.chain,
          chainId: chainId,
          token: {
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            decimals: token.decimals,
          },
          balance: '0',
          balanceRaw: '0',
          balanceUSD: '0',
        };
      }

      // Convert balance to string (handles both string and bigint types)
      const balanceStr = balance.amount ? String(balance.amount) : '0';

      // Return the formatted response
      return {
        chain: request.chain,
        chainId: chainId,
        token: {
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          decimals: token.decimals,
        },
        balance: formatUnits(BigInt(balanceStr), token.decimals),
        balanceRaw: balanceStr, // Using amount as LIFI SDK doesn't have rawAmount
        balanceUSD: token.priceUSD
          ? (
              parseFloat(formatUnits(BigInt(balanceStr), token.decimals)) *
              parseFloat(token.priceUSD)
            ).toString()
          : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching token balance for ${request.tokenIdentifier} on chain ${
          request.chain
        }: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get the balance of multiple tokens for a wallet address
   *
   * @param walletAddress The address of the wallet
   * @param requests Array of token balance requests
   * @returns Array of token balance information
   */
  async getTokenBalances(
    walletAddress: string,
    requests: TokenBalanceRequest[],
  ): Promise<TokenBalanceResponse[]> {
    try {
      // Process each request in parallel
      const balancePromises = requests.map((request) =>
        this.getTokenBalance(walletAddress, request).catch((error) => {
          this.logger.error(
            `Failed to get balance for token ${request.tokenIdentifier} on chain ${
              request.chain
            }: ${error.message}`,
          );
          return null;
        }),
      );

      // Wait for all promises to resolve
      const results = await Promise.all(balancePromises);

      // Filter out any null results (failed requests)
      return results.filter(
        (result): result is TokenBalanceResponse => result !== null,
      );
    } catch (error) {
      this.logger.error(
        `Error fetching multiple token balances: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get all token balances across all supported chains for a wallet address
   *
   * @param address The wallet address to check balances for
   * @returns Array of token balance information
   */
  async getWalletBalance(address: Address): Promise<TokenBalanceResponse[]> {
    try {
      this.logger.log(`Getting all token balances for wallet ${address}`);

      const tokensResponse = await getTokens();
      const balances: TokenBalanceResponse[] = [];
      const tokens: Token[] = [];

      // Create a map of unique chain configs by chainId
      const uniqueChainConfigs = new Map();

      // Deduplicate chains by chainId
      for (const [, chain] of Object.entries(CHAIN_CONFIGS)) {
        if (!uniqueChainConfigs.has(chain.id)) {
          uniqueChainConfigs.set(chain.id, chain);
        }
      }

      for (const [, chain] of uniqueChainConfigs.entries()) {
        this.logger.debug(
          `Fetching tokens for chain ${chain.name} (${chain.id})`,
        );

        const _tokens = tokensResponse.tokens[chain.id];
        if (!_tokens || _tokens.length === 0) {
          this.logger.debug(
            `No tokens found for chain ${chain.name} (${chain.id})`,
          );
          continue;
        }

        tokens.push(..._tokens);
      }

      const tokenBalances = await getTokenBalances(address, tokens);

      // Convert LIFI token balances to our TokenBalanceResponse format
      balances.push(
        ...tokenBalances
          .filter(
            (balance) => balance.amount !== undefined && balance.amount > 0n,
          )
          .map((balance) => {
            // Find the chain name by comparing chain IDs
            const chainConfig = Object.entries(CHAIN_CONFIGS).find(
              ([, config]) => Number(config.id) === Number(balance.chainId),
            );
            const chainName = chainConfig?.[0] as SupportedChain;

            return {
              chain: chainName,
              chainId: balance.chainId,
              token: {
                symbol: balance.symbol,
                name: balance.name,
                address: balance.address,
                decimals: balance.decimals,
              },
              balance: formatUnits(balance.amount || 0n, balance.decimals),
              balanceRaw: balance.amount?.toString() || '0',
              balanceUSD: balance.priceUSD
                ? (
                    Number(
                      formatUnits(balance.amount || 0n, balance.decimals),
                    ) * Number(balance.priceUSD)
                  ).toString()
                : undefined,
            };
          }),
      );

      return balances;
    } catch (error) {
      this.logger.error(
        `Error fetching wallet balance for ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
