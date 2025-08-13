import { ApiProperty } from '@nestjs/swagger';

export class HyperliquidPositionDto {
  @ApiProperty({
    description: 'Trading pair symbol',
    example: 'ETH-USD',
  })
  symbol: string;

  @ApiProperty({
    description: 'Entry price of the position',
    example: 3500.25,
  })
  entryPrice: number;

  @ApiProperty({
    description: 'Current market price',
    example: 3550.75,
  })
  markPrice: number;

  @ApiProperty({
    description: 'Position size',
    example: 1.5,
  })
  size: number;

  @ApiProperty({
    description: 'Position side (long/short)',
    enum: ['long', 'short'],
    example: 'long',
  })
  side: 'long' | 'short';

  @ApiProperty({
    description: 'Position leverage',
    example: 10,
  })
  leverage: number;

  @ApiProperty({
    description: 'Type of leverage (cross/isolated)',
    example: 'cross',
  })
  leverageType: string;

  @ApiProperty({
    description: 'Maximum allowed leverage',
    example: 50,
    required: false,
  })
  maxLeverage?: number;

  @ApiProperty({
    description: 'Unrealized profit/loss',
    example: 125.5,
  })
  unrealizedPnl: number;

  @ApiProperty({
    description: 'Price at which position will be liquidated',
    example: 3200.0,
  })
  liquidationPrice: number;

  @ApiProperty({
    description: 'Amount of margin used',
    example: 500.0,
  })
  marginUsed: number;

  @ApiProperty({
    description: 'Total position value',
    example: 5000.0,
  })
  positionValue: number;

  @ApiProperty({
    description: 'Current funding rate',
    example: 0.0001,
  })
  fundingRate: number;

  @ApiProperty({
    description: 'Total funding paid/received',
    example: -2.5,
  })
  fundingPaid: number;

  @ApiProperty({
    description: 'Funding paid/received since position opened',
    example: -1.25,
  })
  fundingSinceOpen: number;

  @ApiProperty({
    description: 'Funding paid/received since last position change',
    example: -0.5,
  })
  fundingSinceChange: number;

  @ApiProperty({
    description: 'Return on equity percentage',
    example: 25.5,
  })
  roe: number;

  @ApiProperty({
    description: 'Unique identifier for the position',
    example: 'ETH-USD-long-1234567890',
  })
  positionId: string;
}
