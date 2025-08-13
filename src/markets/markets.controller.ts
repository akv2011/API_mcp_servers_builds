import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { MarketsService } from './markets.service';
import { MarketSearchQueryDto } from './dto/market-search.dto';
import { AggregatedMarketsResponseDto } from './dto/market.dto';
import { PROTOCOLS } from '../positions/positions.controller';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all markets' })
  @ApiQuery({
    name: 'protocol',
    enum: PROTOCOLS,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all markets',
    type: AggregatedMarketsResponseDto,
  })
  async getMarkets(
    @Query() query: MarketSearchQueryDto,
  ): Promise<AggregatedMarketsResponseDto> {
    return this.marketsService.getAllMarkets(query);
  }
}
