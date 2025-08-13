import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Headers,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  TokenCacheService,
  ExtendedTokenData,
  MarketChartResponse,
} from '../services/token-cache.service';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiHeader,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  TokenBalanceService,
  TokenBalanceRequest,
  TokenBalanceResponse,
} from '../services/token-balance.service';
import { TokenApprovalService } from '../services/token-approval.service';
import { SupportedChain, SUPPORTED_CHAINS } from '../../chain/types/chain.type';
import { Address, parseUnits, isAddress } from 'viem';
import { RawTransaction } from '../../common/types/transaction.types';
import { GenerateApprovalDto } from '../dto/generate-approval.dto';

// Define response interface
interface GetTokenResponse {
  token: ExtendedTokenData;
  historicalData?: MarketChartResponse | null;
}

// Mapping from SupportedChain to CoinGecko Platform ID
// NOTE: This might need adjustment based on exact CoinGecko IDs
const chainToPlatformId: Partial<Record<SupportedChain, string>> = {
  mainnet: 'ethereum',
  optimism: 'optimistic-ethereum',
  base: 'base',
  arbitrum: 'arbitrum-one',
  // polygon: 'polygon-pos', // Removed unsupported chain
  // Add other supported chains as needed (e.g., mode, sonic, etc. if they have CG IDs)
};

@ApiTags('tokens')
@Controller('tokens')
export class TokenController {
  private readonly logger = new Logger(TokenController.name);

  constructor(
    private readonly tokenCacheService: TokenCacheService,
    private readonly configService: ConfigService,
    private readonly tokenBalanceService: TokenBalanceService,
    private readonly tokenApprovalService: TokenApprovalService,
  ) {}

  @Get('cache/status')
  @ApiOperation({ summary: 'Get token cache status' })
  @ApiQuery({
    name: 'detailed',
    required: false,
    type: Boolean,
    description:
      'Whether to return detailed status including page refresh history',
  })
  @ApiResponse({
    status: 200,
    description: 'Cache status retrieved successfully',
  })
  getCacheStatus(@Query('detailed') detailed?: string) {
    const isDetailed = detailed === 'true';

    return {
      cacheStatus: isDetailed
        ? this.tokenCacheService.getDetailedCacheStatus()
        : this.tokenCacheService.getCacheStatus(),
    };
  }

  @Post('cache/refresh')
  @ApiOperation({ summary: 'Manually refresh the token cache' })
  @ApiHeader({ name: 'x-api-key', description: 'API Key for authentication' })
  @ApiResponse({ status: 200, description: 'Cache refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refreshCache(@Headers('x-api-key') apiKey: string) {
    const adminApiKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!apiKey || apiKey !== adminApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.tokenCacheService.updateTokenCache();

    return {
      success: true,
      message: 'Cache refresh completed successfully',
      cacheStatus: this.tokenCacheService.getDetailedCacheStatus(),
    };
  }

  @Get('balances/multiple')
  @ApiOperation({ summary: 'Get token balances for a wallet address' })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'The wallet address to check balances for',
    example: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0',
  })
  @ApiQuery({
    name: 'tokens',
    required: true,
    type: String,
    description:
      'JSON array of token requests in format [{chain: string, tokenIdentifier: string}]',
    example:
      '[{"chain":"mainnet","tokenIdentifier":"ETH"},{"chain":"optimism","tokenIdentifier":"OP"}]',
  })
  @ApiResponse({
    status: 200,
    description: 'Token balances retrieved successfully',
  })
  async getTokenBalances(
    @Query('walletAddress') walletAddress: string,
    @Query('tokens') tokensJson: string,
  ): Promise<{ balances: TokenBalanceResponse[] }> {
    // Parse the JSON string into an array of token requests
    const tokensArray = JSON.parse(tokensJson);

    // Validate that each chain is a supported chain
    const tokens: TokenBalanceRequest[] = tokensArray.map((token: any) => {
      const chain = token.chain as SupportedChain;
      if (!SUPPORTED_CHAINS.includes(chain)) {
        throw new Error(
          `Unsupported chain: ${chain}. Supported chains are: ${SUPPORTED_CHAINS.join(', ')}`,
        );
      }
      return {
        chain,
        tokenIdentifier: token.tokenIdentifier,
      };
    });

    const balances = await this.tokenBalanceService.getTokenBalances(
      walletAddress,
      tokens,
    );

    return { balances };
  }

  @Get('balances/single')
  @ApiOperation({ summary: 'Get a single token balance for a wallet address' })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'The wallet address to check balance for',
    example: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0',
  })
  @ApiQuery({
    name: 'chain',
    required: true,
    enum: SUPPORTED_CHAINS,
    description: 'The chain where the token exists',
    example: 'mainnet',
  })
  @ApiQuery({
    name: 'tokenIdentifier',
    required: true,
    type: String,
    description: 'Token symbol or contract address',
    example: 'ETH',
  })
  @ApiResponse({
    status: 200,
    description: 'Token balance retrieved successfully',
  })
  async getTokenBalance(
    @Query('walletAddress') walletAddress: string,
    @Query('chain') chain: SupportedChain,
    @Query('tokenIdentifier') tokenIdentifier: string,
  ): Promise<{ balance: TokenBalanceResponse | null }> {
    const balance = await this.tokenBalanceService.getTokenBalance(
      walletAddress,
      {
        chain,
        tokenIdentifier,
      },
    );

    return { balance };
  }

  @Get('balances/wallet')
  @ApiOperation({
    summary: 'Get all token balances for a wallet across all supported chains',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'The wallet address to check balances for',
    example: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balances retrieved successfully',
  })
  async getWalletBalance(
    @Query('walletAddress') walletAddress: string,
  ): Promise<{ balances: TokenBalanceResponse[] }> {
    const balances = await this.tokenBalanceService.getWalletBalance(
      walletAddress as Address,
    );
    return { balances };
  }

  @Post('approve')
  @ApiOperation({ summary: 'Generate transaction data for token approval' })
  @ApiBody({ type: GenerateApprovalDto })
  @ApiResponse({
    status: 200,
    description: 'Approval transaction data generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters (validation error)',
  })
  @ApiResponse({
    status: 404,
    description: 'Token not found on specified chain',
  })
  async generateApprovalTransaction(
    @Body() body: GenerateApprovalDto,
  ): Promise<RawTransaction> {
    const { chain, owner, tokenIdentifier, spender, amount } = body;

    // --- Platform ID Check ---
    const platformId = chainToPlatformId[chain];
    if (!platformId) {
      this.logger.error(`No platform ID mapping found for chain: ${chain}`);
      throw new InternalServerErrorException(
        `Platform ID mapping missing for chain: ${chain}`,
      );
    }

    // --- Token Resolution ---
    let foundToken: ExtendedTokenData | null = null;
    let tokenAddressOnChain: Address | null = null;

    if (isAddress(tokenIdentifier)) {
      const potentialToken =
        await this.tokenCacheService.getTokenByContractAddress(tokenIdentifier);
      if (
        potentialToken?.platforms?.[platformId]?.toLowerCase() ===
        tokenIdentifier.toLowerCase()
      ) {
        foundToken = potentialToken;
        tokenAddressOnChain = tokenIdentifier as Address;
      }
    } else {
      const potentialToken = await this.tokenCacheService.findToken(
        tokenIdentifier,
        'symbol',
      );
      console.log('🚀 ~ TokenController ~ potentialToken:', potentialToken);
      if (potentialToken?.platforms?.[platformId]) {
        foundToken = potentialToken;
        if (foundToken.platforms) {
          tokenAddressOnChain = foundToken.platforms[platformId] as Address;
        }
      }
    }

    if (!foundToken || !tokenAddressOnChain) {
      this.logger.warn(
        `Token lookup failed: ID="${tokenIdentifier}", Chain="${chain}", PlatformID="${platformId}"`,
      );
      throw new NotFoundException(
        `Token "${tokenIdentifier}" not found on chain "${chain}" with platform ID "${platformId}".`,
      );
    }

    // --- Amount Conversion ---
    let amountBigInt: bigint;
    try {
      amountBigInt = parseUnits(amount, foundToken.decimals! as number);
    } catch (e) {
      this.logger.error(
        `Failed to parse amount "${amount}" for token ${foundToken.symbol} with decimals ${foundToken.decimals}.`,
        e.stack,
      );
      throw new BadRequestException(
        `Invalid amount format or value for token ${foundToken.symbol} (decimals: ${foundToken.decimals}). Error: ${e.message}`,
      );
    }

    // --- Call Service ---
    try {
      return await this.tokenApprovalService.generateApprovalTransaction({
        chain,
        userAddress: owner,
        tokenAddress: tokenAddressOnChain,
        spenderAddress: spender,
        amount: amountBigInt,
      });
    } catch (error) {
      this.logger.error(
        `Error calling TokenApprovalService for chain ${chain}, owner ${owner}, token ${tokenAddressOnChain}, spender ${spender}, amount ${amountBigInt}:`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to generate approval transaction data due to an internal error.',
      );
    }
  }

  @Get(':query')
  @ApiOperation({ summary: 'Get token by symbol, name, or contract address' })
  @ApiParam({
    name: 'query',
    description: 'Token symbol, name, or contract address to search for',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['symbol', 'name', 'address'],
    description:
      'Type of search to perform. If not provided, will auto-detect based on query',
  })
  @ApiQuery({
    name: 'historical_days',
    required: false,
    type: Number,
    description:
      'Number of past days to fetch historical price data for (e.g., 7, 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Token data retrieved successfully',
  })
  async getToken(
    @Param('query') query: string,
    @Query('type') type?: 'symbol' | 'name' | 'address',
    @Query(
      'historical_days',
      new DefaultValuePipe(0),
      new ParseIntPipe({ optional: true }),
    )
    historical_days?: number,
  ): Promise<GetTokenResponse> {
    const token = await this.tokenCacheService.findToken(query, type, true);

    if (!token) {
      throw new NotFoundException(`Token not found for query: ${query}`);
    }

    let historicalData: MarketChartResponse | null = null;
    if (historical_days && historical_days > 0 && token.id) {
      try {
        this.logger.debug(
          `Controller: Fetching historical data for ${token.id} over ${historical_days} days`,
        );
        historicalData = await this.tokenCacheService.getHistoricalPriceData(
          token.id,
          historical_days,
        );
      } catch (error) {
        this.logger.warn(
          `Controller: Failed to fetch historical data for ${token.id}: ${error.message}`,
        );
        // Optionally include error info in response
        // historicalData = { error: `Failed to fetch historical data: ${error.message}` };
      }
    }

    const response: GetTokenResponse = {
      token,
    };

    if (historicalData) {
      response.historicalData = historicalData;
    }

    return response;
  }
}
