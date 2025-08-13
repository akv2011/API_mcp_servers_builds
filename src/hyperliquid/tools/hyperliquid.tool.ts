import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Context, Tool } from '@rekog/mcp-nest';
import { HyperliquidService } from '../hyperliquid.service';
import { Address } from 'viem';

// Define the Zod schema for the parameters
const GetHyperliquidPositionsParams = z.object({
  address: z.string().describe('Ethereum address to fetch positions for'),
});

// Zod schema for getOpenOrders parameters
const GetHyperliquidOpenOrdersParams = z.object({
  user: z
    .string()
    .refine((val) => /^0x[a-fA-F0-9]{40}$/.test(val), {
      message: 'Invalid Ethereum address format',
    })
    .describe('User wallet address to fetch open orders for'),
});

@Injectable()
export class HyperliquidTool {
  private readonly logger = new Logger(HyperliquidTool.name);

  constructor(private readonly hyperliquidService: HyperliquidService) {}

  @Tool({
    name: 'get_hyperliquid_positions',
    description:
      'Retrieves the full clearinghouse state (positions and margin) for a given address on Hyperliquid',
    parameters: GetHyperliquidPositionsParams,
  })
  async getOpenPositions(
    params: z.infer<typeof GetHyperliquidPositionsParams>,
    _context: Context,
  ) {
    try {
      const state = await this.hyperliquidService.getOpenPositions({
        user: params.address as Address,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
      };
    } catch (error) {
      this.logger.error(
        `Error in HyperliquidTool getOpenPositions: ${error.message}`,
        error.stack,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';
      return {
        content: [
          { type: 'text', text: `Error: ${errorMessage}`, isError: true },
        ],
      };
    }
  }

  @Tool({
    name: 'get_hyperliquid_open_orders',
    description: 'Get open orders for a user on Hyperliquid',
    parameters: GetHyperliquidOpenOrdersParams,
  })
  async getOpenOrdersTool(
    params: z.infer<typeof GetHyperliquidOpenOrdersParams>,
    _context: Context,
  ) {
    try {
      const orders = await this.hyperliquidService.getOpenOrders({
        user: params.user as Address,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
      };
    } catch (error) {
      this.logger.error(
        `Error in HyperliquidTool getOpenOrdersTool: ${error.message}`,
        error.stack,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';
      return {
        content: [
          { type: 'text', text: `Error: ${errorMessage}`, isError: true },
        ],
      };
    }
  }
}
