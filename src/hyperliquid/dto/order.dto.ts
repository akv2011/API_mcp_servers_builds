import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Define the possible values for the side property
type OrderSide = 'A' | 'B';
// Define possible values for TIF (Time In Force) - including FrontendMarket & LiquidationMarket from errors
type TIF = 'Gtc' | 'Alo' | 'Ioc' | 'FrontendMarket' | 'LiquidationMarket'; // Add other values if applicable
// Define possible values for OrderType (match SDK strings exactly)
type OrderType =
  | 'Limit'
  | 'Market'
  | 'Stop Limit'
  | 'Stop Market'
  | 'Take Profit Limit'
  | 'Take Profit Market'; // Added based on linter error

export class HyperliquidOrderDto {
  @ApiProperty({ description: 'Order ID', example: 12345, type: Number })
  oid: number;

  @ApiProperty({ description: 'Asset symbol', example: 'ETH', type: String })
  asset: string; // Mapped from 'coin' in the SDK Order part

  @ApiProperty({
    description: "Order side ('A' for Ask/Short, 'B' for Bid/Long)",
    example: 'B',
    enum: ['A', 'B'],
  })
  side: OrderSide;

  @ApiProperty({
    description: 'Limit price of the order',
    example: '3000.5',
    type: String,
  })
  limitPx: string;

  @ApiProperty({
    description: 'Size of the order',
    example: '0.5',
    type: String,
  })
  sz: string;

  @ApiProperty({
    description: 'Timestamp of order placement (milliseconds)',
    example: 1678886400000,
    type: Number,
  })
  timestamp: number;

  @ApiProperty({
    description: 'Original size of the order at placement',
    example: '0.5',
    type: String,
  })
  origSz: string; // Re-added based on Order type definition

  @ApiProperty({
    description: 'Whether the order is a trigger order',
    example: false,
    type: Boolean,
  })
  isTrigger: boolean;

  @ApiProperty({
    description: 'Trigger price for trigger orders',
    example: '3100.0',
    type: String,
  })
  triggerPx: string;

  @ApiProperty({
    description: 'Condition for triggering the order',
    example: '>=',
    type: String,
  })
  triggerCondition: string; // Note: SDK type is string, might need more specific enum if possible

  @ApiProperty({
    description: 'Whether the order reduces position size only',
    example: true,
    type: Boolean,
  })
  reduceOnly: boolean;

  @ApiProperty({
    description: 'Order type',
    example: 'Limit',
    enum: [
      'Limit',
      'Market',
      'Stop Limit',
      'Stop Market',
      'Take Profit Market',
    ], // Updated enum values
  })
  orderType: OrderType;

  @ApiPropertyOptional({
    description: 'Time-in-force option',
    example: 'Gtc',
    enum: ['Gtc', 'Alo', 'Ioc', 'FrontendMarket', 'LiquidationMarket'], // Updated enum values
  })
  tif?: TIF | null;

  @ApiPropertyOptional({
    description: 'Client Order ID (null if not set)',
    example: '0x123...',
    type: String,
    nullable: true,
  })
  cloid?: string | null; // Mapped from Hex | null

  @ApiProperty({
    description: 'Indicates if the order is a position TP/SL order',
    example: false,
    type: Boolean,
  })
  isPositionTpsl: boolean;

  // Children omitted for simplicity
}
