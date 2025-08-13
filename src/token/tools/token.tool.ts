import { Injectable, Logger } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import {
  TokenCacheService,
  ExtendedTokenData,
} from '../services/token-cache.service';
import { TokenBalanceService } from '../services/token-balance.service';
import { TokenApprovalService } from '../services/token-approval.service';
import { SupportedChain, SUPPORTED_CHAINS } from '../../chain/types/chain.type';
import { Address, isAddress, parseUnits } from 'viem';

// --- Constants ---

// TODO: Move this to a shared constants file
const chainToPlatformId: Partial<Record<SupportedChain, string>> = {
  mainnet: 'ethereum',
  optimism: 'optimism-ethereum', // Note: CoinGecko uses 'optimistic-ethereum'
  base: 'base',
  arbitrum: 'arbitrum-one',
  // Add other supported chains from SupportedChain type as needed
};

// Create a mutable copy using spread syntax for z.enum
const SUPPORTED_CHAINS_ZOD = z.enum([...SUPPORTED_CHAINS] as [
  string,
  ...string[],
]);

// --- Zod Schemas ---

const TokenInfoSchema = z.object({
  query: z
    .string()
    .describe('Token symbol, name, or contract address to search for'),
  type: z
    .enum(['symbol', 'name', 'address'])
    .optional()
    .describe(
      'Type of search to perform. Options are "symbol", "name", or "address". If not provided, will auto-detect based on query',
    ),
  historical_days: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Number of past days to fetch historical price data for (e.g., 7, 30)',
    ),
});

const MultipleTokenBalanceSchema = z.object({
  wallet_address: z
    .string()
    .refine(isAddress, { message: 'Invalid wallet address format.' })
    .describe('The wallet address to check the balances for'),
  tokens: z
    .array(
      z.object({
        chain: SUPPORTED_CHAINS_ZOD.describe(
          'The chain where the token exists (e.g., mainnet, optimism, arbitrum)',
        ),
        token_identifier: z
          .string()
          .describe(
            'The token symbol or contract address to check the balance for',
          ),
      }),
    )
    .min(1)
    .describe('Array of tokens to check balances for'),
});

const WalletBalanceSchema = z.object({
  wallet_address: z
    .string()
    .refine(isAddress, { message: 'Invalid wallet address format.' })
    .describe('The wallet address to check balances for'),
});

const TokenApproveSchema = z.object({
  chain: SUPPORTED_CHAINS_ZOD.describe(
    'The chain where the token exists (e.g., optimism, base)',
  ),
  owner: z
    .string()
    .refine(isAddress, { message: 'Invalid owner address format.' })
    .describe('The address of the token owner initiating the approval'),
  tokenIdentifier: z
    .string()
    .min(1)
    .describe(
      'The symbol or contract address of the token to approve (e.g., USDC)',
    ),
  spender: z
    .string()
    .refine(isAddress, { message: 'Invalid spender address format.' })
    .describe('The address of the contract/wallet to grant approval to'),
  amount: z
    .string()
    .describe("The human-readable amount to approve (e.g., '100.5')"),
});

// --- Tool Class ---

@Injectable()
export class TokenTool {
  private readonly logger = new Logger(TokenTool.name);

  constructor(
    private readonly tokenCacheService: TokenCacheService,
    private readonly tokenBalanceService: TokenBalanceService,
    private readonly tokenApprovalService: TokenApprovalService,
  ) {}

  // --- Token Info Tool ---
  @Tool({
    name: 'get_token_info', // Renamed from get_token_metrics for clarity
    description:
      'Get token data (like name, symbol, address on different chains, price, market cap) by its symbol, name, or a specific contract address (case insensitive).',
    parameters: TokenInfoSchema,
  })
  async getTokenInfo(
    params: z.infer<typeof TokenInfoSchema>,
    _context: Context,
  ) {
    this.logger.debug(
      `Tool 'get_token_info' called with params: ${JSON.stringify({
        query: params.query,
        type: params.type || 'auto-detect',
      })}`,
    );

    const normalizedQuery = params.query.trim();
    const token = await this.tokenCacheService.findToken(
      normalizedQuery,
      params.type,
      true, // includePriceData = true
    );

    if (!token) {
      this.logger.debug(`No token found for query: ${normalizedQuery}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              token: null,
            }),
          },
        ],
      };
    }

    this.logger.debug(
      `Found token: ${token.symbol} (${token.name}) - Market Cap: $${token.market_cap?.toLocaleString() ?? 'N/A'}`,
    );

    let historicalData: any = null;
    if (params.historical_days && token.id) {
      try {
        this.logger.debug(
          `Fetching historical data for ${token.id} over ${params.historical_days} days`,
        );
        // TODO: Implement this method in TokenCacheService
        historicalData = await this.tokenCacheService.getHistoricalPriceData(
          token.id,
          params.historical_days,
        );
        this.logger.debug(
          `Successfully fetched historical data for ${token.id}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch historical data for ${token.id}: ${error.message}`,
        );
        // Non-fatal, just log and continue without historical data
        historicalData = {
          error: `Failed to fetch historical data: ${error.message}`,
        };
      }
    }

    const responseData: {
      token: ExtendedTokenData;
      historicalData?: any;
      cacheInfo: any;
    } = {
      token,
      historicalData, // Will be null if not requested or if fetch failed
      cacheInfo: {
        lastUpdated: this.tokenCacheService.lastUpdated
          ? new Date(this.tokenCacheService.lastUpdated).toISOString()
          : 'Not available', // Handle case where lastUpdated might be 0
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseData, null, 2),
        },
      ],
    };
  }

  // --- Token Balance Tools ---
  @Tool({
    name: 'get_token_balances',
    description:
      'Get the balances of specific tokens on specific chains for a given wallet address.',
    parameters: MultipleTokenBalanceSchema,
  })
  async getMultipleTokenBalances(
    params: z.infer<typeof MultipleTokenBalanceSchema>,
    _context: Context,
  ) {
    this.logger.log(
      `Tool 'get_token_balances' called for wallet ${params.wallet_address}`,
    );

    try {
      // Convert the tokens array to the format expected by the service
      const tokenRequests = params.tokens.map((token) => ({
        chain: token.chain as SupportedChain, // Cast is safe due to Zod validation
        tokenIdentifier: token.token_identifier,
      }));

      const balances = await this.tokenBalanceService.getTokenBalances(
        params.wallet_address,
        tokenRequests,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ balances }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error in 'get_token_balances' for wallet ${params.wallet_address}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        content: [
          {
            isError: true,
            type: 'text',
            text: `Error getting token balances: ${errorMessage}. Please check the wallet address, token identifiers, and ensure the chains are supported (${SUPPORTED_CHAINS.join(', ')}).`,
          },
        ],
      };
    }
  }

  @Tool({
    name: 'get_wallet_balance',
    description:
      'Get all known token balances for a wallet across all supported chains.',
    parameters: WalletBalanceSchema,
  })
  async getWalletBalance(
    params: z.infer<typeof WalletBalanceSchema>,
    _context: Context,
  ) {
    this.logger.log(
      `Tool 'get_wallet_balance' called for address ${params.wallet_address}`,
    );

    try {
      const balances = await this.tokenBalanceService.getWalletBalance(
        params.wallet_address as Address, // Cast is safe due to Zod validation
      );

      if (!balances || balances.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No token balances found for wallet ${params.wallet_address}. This could mean the wallet holds no tokens on the supported chains or there was an issue fetching data.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ balances }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error in 'get_wallet_balance' for wallet ${params.wallet_address}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        content: [
          {
            isError: true,
            type: 'text',
            text: `Error getting wallet balance: ${errorMessage}. Please ensure the wallet address is correct.`,
          },
        ],
      };
    }
  }

  // --- Token Approval Tool ---
  @Tool({
    name: 'generate_token_approval_tx', // Renamed from token_approve
    description:
      'Generates the necessary transaction data (like data, to, value) required to approve an ERC20 token for spending by another address (the spender). This is often needed before interacting with DeFi protocols (e.g., supplying liquidity, swapping tokens). Does NOT send the transaction.',
    parameters: TokenApproveSchema,
  })
  async generateApprovalTransaction(
    inputs: z.infer<typeof TokenApproveSchema>,
    _context: Context,
  ): Promise<{ content: { type: string; text: string; isError?: boolean }[] }> {
    this.logger.log(
      `[generate_token_approval_tx TOOL INPUT] Received amount: ${JSON.stringify(
        inputs.amount,
      )}, Type: ${typeof inputs.amount}`,
    );
    this.logger.log(
      `[generate_token_approval_tx TOOL INPUT] Full inputs: ${JSON.stringify(
        inputs,
        null,
        2,
      )}`,
    );
    this.logger.log(
      `Tool 'generate_token_approval_tx' called for owner ${inputs.owner} token ${inputs.tokenIdentifier} spender ${inputs.spender}`,
    );
    const { chain, owner, tokenIdentifier, spender, amount } = inputs;

    try {
      const platformId = chainToPlatformId[chain as SupportedChain];
      if (!platformId) {
        this.logger.error(
          `Internal configuration error: No platform ID mapping found for chain: ${chain}`,
        );
        return {
          content: [
            {
              isError: true,
              type: 'text',
              text: `Error: Internal configuration error - No platform ID mapping for chain: ${chain}. Supported chains: ${Object.keys(chainToPlatformId).join(', ')}.`,
            },
          ],
        };
      }

      // --- Token Resolution ---
      let foundToken: ExtendedTokenData | null = null;
      let tokenAddressOnChain: Address | null = null;
      const lowerCaseIdentifier = tokenIdentifier.toLowerCase();

      if (isAddress(tokenIdentifier)) {
        const potentialToken =
          await this.tokenCacheService.getTokenByContractAddress(
            tokenIdentifier,
          );
        if (
          potentialToken?.platforms?.[platformId]?.toLowerCase() ===
          lowerCaseIdentifier
        ) {
          foundToken = potentialToken;
          tokenAddressOnChain = tokenIdentifier as Address;
        }
      } else {
        const potentialToken = await this.tokenCacheService.findToken(
          tokenIdentifier, // Use original case for cache lookup if needed, though cache might be case-insensitive
          'symbol',
        );
        if (potentialToken?.platforms?.[platformId]) {
          foundToken = potentialToken;
          if (foundToken.platforms) {
            // Check needed for type safety
            tokenAddressOnChain = foundToken.platforms[platformId] as Address;
          }
        }
      }

      if (!foundToken || !tokenAddressOnChain) {
        this.logger.warn(
          `Token lookup failed: ID="${tokenIdentifier}", Chain="${chain}", PlatformID="${platformId}"`,
        );
        return {
          content: [
            {
              isError: true,
              type: 'text',
              text: `Error: Token "${tokenIdentifier}" not found on chain "${chain}". Please verify the token identifier and chain. Common symbols might exist on multiple chains; try using the contract address if the symbol is ambiguous.`,
            },
          ],
        };
      }

      // --- Amount Conversion ---
      let amountBigInt: bigint;
      const decimalsFromCache = foundToken.decimals;

      let finalDecimals: number;
      const lowerSymbol = foundToken.symbol?.toLowerCase();

      if (lowerSymbol === 'usdc' || lowerSymbol === 'usdt') {
        finalDecimals = 6;
        if (
          decimalsFromCache !== 6 &&
          decimalsFromCache !== undefined &&
          decimalsFromCache !== null
        ) {
          this.logger.warn(
            `Overriding decimals for ${foundToken.symbol}. Using 6 instead of cached value: ${decimalsFromCache}`,
          );
        }
      }
      // else if (lowerSymbol === 'eurc') {
      //    finalDecimals = 18;
      //    // Optional logging if cache differs
      // }
      else {
        finalDecimals = decimalsFromCache ?? 18;
        if (decimalsFromCache === null || decimalsFromCache === undefined) {
          this.logger.warn(
            `Decimals missing for ${foundToken.symbol} in cache. Defaulting to 18.`,
          );
        }
      }
      const decimalsStr = finalDecimals.toString();

      try {
        if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) < 0) {
          throw new Error('Amount must be a non-negative number string.');
        }
        amountBigInt = parseUnits(amount, finalDecimals);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Unknown parsing error';
        this.logger.error(
          `Failed to parse amount "${amount}" for token ${foundToken.symbol} (using ${finalDecimals} decimals): ${message}`,
        );
        return {
          content: [
            {
              isError: true,
              type: 'text',
              text: `Error: Invalid amount format "${amount}" for token ${foundToken.symbol} (expected ${decimalsStr} decimals). ${message}`,
            },
          ],
        };
      }

      const txData =
        await this.tokenApprovalService.generateApprovalTransaction({
          chain: chain as SupportedChain,
          userAddress: owner as Address,
          tokenAddress: tokenAddressOnChain,
          spenderAddress: spender as Address,
          amount: amountBigInt,
        });

      this.logger.log(
        `Successfully generated approval tx data for owner ${owner} token ${tokenAddressOnChain}`,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(txData, null, 2) }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';
      this.logger.error(
        `Error in 'generate_token_approval_tx': ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        content: [
          {
            isError: true,
            type: 'text',
            text: `Error: Failed to generate approval transaction data. ${errorMessage}`,
          },
        ],
      };
    }
  }
}
