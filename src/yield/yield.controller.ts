import { Controller, Get, Query, Logger } from '@nestjs/common';
import { YieldService } from './yield.service';
import { GetYieldQueryDto, YieldResponseDto } from './dto/yield.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('yield')
@Controller('yield')
export class YieldController {
  private readonly logger = new Logger(YieldController.name);

  constructor(private readonly yieldService: YieldService) {}

  @Get()
  @ApiOperation({ summary: 'Get top yield opportunities across protocols' })
  @ApiResponse({
    status: 200,
    description: 'List of yield opportunities',
    type: YieldResponseDto,
  })
  async getTopYieldOpportunities(
    @Query() query: GetYieldQueryDto,
  ): Promise<YieldResponseDto> {
    this.logger.log(
      `Received request for yield opportunities: ${JSON.stringify(query)}`,
    );
    const opportunities =
      await this.yieldService.getTopYieldOpportunities(query);
    return { opportunities };
  }
}
