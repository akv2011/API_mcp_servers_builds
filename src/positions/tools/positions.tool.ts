import { Injectable } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { Address } from 'viem';
import { PositionsService } from '../positions.service';
import { PROTOCOLS, Protocol } from '../positions.controller';
import { SUPPORTED_CHAINS, SupportedChain } from '../../chain';

@Injectable()
export class PositionsTool {
  constructor(private readonly positionsService: PositionsService) {}

  @Tool({
    name: 'get_lending_positions',
    description: `Get user lending positions across all chains or for a specific chain.
Returns user positions filtered by optional chain and protocol parameters.
- If chain is specified, returns positions for that chain only
- If protocol is specified, returns positions for that protocol only
- If neither is specified, returns all positions across all chains
- Empty positions and chains with no positions are filtered out`,
    parameters: z.object({
      address: z
        .string()
        .describe(
          'Ethereum address to get positions for (e.g. 0x1155b614971f16758C92c4890eD338C9e3ede6b7)',
        ),
      protocol: z
        .enum(PROTOCOLS)
        .optional()
        .describe('Filter positions by protocol'),
      chain: z
        .enum(SUPPORTED_CHAINS)
        .optional()
        .describe('Filter positions by chain'),
    }),
  })
  async getPositions(
    params: {
      address: Address;
      protocol?: Protocol;
      chain?: SupportedChain;
    },
    _context: Context,
  ) {
    const result = await this.positionsService.getAllPositions(
      params.address,
      params.protocol,
      params.chain,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
}
