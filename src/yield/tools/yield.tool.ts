import { Injectable, Logger } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { YieldService } from '../yield.service';
import { YieldProtocol } from '../dto/yield.dto';
import {
  SUPPORTED_CHAINS,
  SupportedChain,
} from '../../common/types/chain.type';

@Injectable()
export class YieldTool {
  private readonly logger = new Logger(YieldTool.name);

  constructor(private readonly yieldService: YieldService) {}

  @Tool({
    name: 'get_yield_opportunities',
    description: 'Get yield opportunities across protocols',
    parameters: z.object({
      chain: z
        .string()
        .optional()
        .describe(
          'Filter opportunities by blockchain network (e.g., "mainnet", "base")',
        ),
      asset: z
        .string()
        .optional()
        .describe(
          'Filter opportunities by underlying asset symbol (e.g., "USDC")',
        ),
      protocol: z
        .string()
        .optional()
        .describe('Filter opportunities by protocol (aave or morpho)'),
      min_apy: z
        .number()
        .optional()
        .describe('Minimum Annual Percentage Yield (APY) filter'),
      limit: z
        .number()
        .optional()
        .describe(
          'Maximum number of opportunities to return. If not specified, returns all results.',
        ),
    }),
  })
  async getYieldOpportunities(
    { chain, asset, protocol, min_apy, limit },
    _context: Context,
  ) {
    try {
      // Validate and transform chain parameter
      let validChain: SupportedChain | undefined = undefined;
      if (chain && chain !== '') {
        if (SUPPORTED_CHAINS.includes(chain as SupportedChain)) {
          validChain = chain as SupportedChain;
        } else {
          this.logger.warn(`Invalid chain parameter: ${chain}`);
        }
      }

      // Validate and transform protocol parameter
      let validProtocol: YieldProtocol | undefined = undefined;
      if (protocol && protocol !== '') {
        if (protocol === 'aave') {
          validProtocol = YieldProtocol.AAVE;
        } else if (protocol === 'morpho') {
          validProtocol = YieldProtocol.MORPHO;
        } else {
          this.logger.warn(`Invalid protocol parameter: ${protocol}`);
        }
      }

      // Validate asset parameter
      const validAsset = asset && asset !== '' ? asset : undefined;

      // Fix for MCP integration: handle limit parameter robustly
      // Convert to number if it's a string, and handle 0 or negative values
      let validLimit: number | undefined = undefined;
      
      if (limit !== undefined) {
        // Convert to number if it's a string
        const numericLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
        // Only use positive values, otherwise set to undefined (no limit)
        validLimit = numericLimit > 0 ? numericLimit : undefined;
      }

      this.logger.log(
        `DEBUG: Original limit: ${limit}, type: ${typeof limit}, validLimit: ${validLimit}, type: ${typeof validLimit}`
      );

      this.logger.log(
        `Calling getTopYieldOpportunities with: chain=${validChain}, asset=${validAsset}, protocol=${validProtocol}, minApy=${min_apy}, limit=${validLimit}`,
      );

      const opportunities = await this.yieldService.getTopYieldOpportunities({
        chain: validChain,
        asset: validAsset,
        protocol: validProtocol,
        minApy: min_apy,
        limit: validLimit,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ opportunities }) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
      };
    }
  }
}
