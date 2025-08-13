import {
  Controller,
  Get,
  Param,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HyperliquidService } from './hyperliquid.service';
import { Address } from 'viem';
import { HyperliquidOrderDto } from './dto/order.dto';
import { ClearinghouseStateDto } from './dto/clearinghouse-state.dto';

@ApiTags('Hyperliquid')
@Controller('hyperliquid')
export class HyperliquidController {
  private readonly logger = new Logger(HyperliquidController.name);

  constructor(private readonly hyperliquidService: HyperliquidService) {}

  @Get('positions/:address')
  @ApiOperation({
    summary: 'Get Hyperliquid clearinghouse state (positions and margin)',
    description:
      'Retrieves the full clearinghouse state, including open positions and margin summary, for a given address on Hyperliquid',
  })
  @ApiParam({
    name: 'address',
    description: 'Ethereum address to fetch positions for',
    example: '0x1234567890123456789012345678901234567890',
  })
  @ApiResponse({
    status: 200,
    description:
      'Clearinghouse state including positions and margin summary, or null if not found',
    type: ClearinghouseStateDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid address format',
  })
  async getOpenPositions(
    @Param('address') address: string,
  ): Promise<ClearinghouseStateDto | null> {
    const state = await this.hyperliquidService.getOpenPositions({
      user: address as Address,
    });
    return state;
  }

  @Get('open-orders/:user')
  @ApiOperation({ summary: 'Get open orders for a user on Hyperliquid' })
  @ApiParam({
    name: 'user',
    type: 'string',
    description: 'User wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved open orders.',
    type: [HyperliquidOrderDto],
  })
  @ApiResponse({ status: 400, description: 'Invalid address format.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async getOpenOrders(
    @Param('user') user: Address,
  ): Promise<HyperliquidOrderDto[]> {
    this.logger.log(`Fetching open orders for user: ${user}`);
    // Basic address validation (can be enhanced)
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      this.logger.warn(`Invalid address format received: ${user}`);
      // Consider throwing BadRequestException for better error handling
      throw new BadRequestException('Invalid address format');
    }
    return this.hyperliquidService.getOpenOrders({ user });
  }
}
