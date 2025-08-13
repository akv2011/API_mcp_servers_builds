import { ApiProperty } from '@nestjs/swagger';
import { HyperliquidPositionDto } from './position.dto';

export class HyperliquidMarginSummaryDto {
  @ApiProperty({ description: 'Total account value', example: '12345.67' })
  accountValue: string;

  @ApiProperty({ description: 'Total margin used', example: '123.45' })
  totalMarginUsed: string;

  @ApiProperty({
    description: 'Total notional position value',
    example: '5000.00',
  })
  totalNtlPos: string;

  @ApiProperty({ description: 'Total raw USD value', example: '12345.67' })
  totalRawUsd: string;
}

// Add DTO for Cross Margin Summary
export class HyperliquidCrossMarginSummaryDto {
  @ApiProperty({
    description: 'Total account value (cross margin)',
    example: '12345.67',
  })
  accountValue: string;

  @ApiProperty({
    description: 'Total margin used (cross margin)',
    example: '123.45',
  })
  totalMarginUsed: string;

  @ApiProperty({
    description: 'Total notional position value (cross margin)',
    example: '5000.00',
  })
  totalNtlPos: string;

  @ApiProperty({
    description: 'Total raw USD value (cross margin)',
    example: '12345.67',
  })
  totalRawUsd: string;
}

export class ClearinghouseStateDto {
  @ApiProperty({ description: 'Isolated margin summary' })
  marginSummary: HyperliquidMarginSummaryDto;

  @ApiProperty({ description: 'Cross margin summary' })
  crossMarginSummary: HyperliquidCrossMarginSummaryDto;

  @ApiProperty({
    description: 'List of open positions',
    type: [HyperliquidPositionDto],
  })
  positions: HyperliquidPositionDto[];
}
