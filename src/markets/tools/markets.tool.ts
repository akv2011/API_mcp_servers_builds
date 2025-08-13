import { Injectable } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { MarketsService } from '../markets.service';
import { PROTOCOLS, Protocol } from '../../positions/positions.controller';
import { SUPPORTED_CHAINS, SupportedChain } from '../../chain';
import { MarketSearchQueryDto } from '../dto/market-search.dto';

@Injectable()
export class MarketsTool {
  constructor(private readonly marketsService: MarketsService) {}

  @Tool({
    name: 'get_lending_markets',
    description:
      'Get all lending markets with optional filtering by chain, protocol, and token symbols',
    parameters: z.object({
      chain: z.enum(SUPPORTED_CHAINS).optional().describe('Filter by chain'),
      protocol: z.enum(PROTOCOLS).optional().describe('Filter by protocol'),
      asset: z.string().optional().describe('Token symbol to search for'),
      limit: z.number().optional().describe('Limit the number of results'),
      sort_by: z
        .enum(['supply_apy', 'borrow_apy'])
        .optional()
        .describe('Sort results by APY'),
    }),
  })
  async getMarkets(
    params: {
      chain?: SupportedChain;
      protocol?: Protocol;
      asset?: string;
      limit?: number;
      sort_by?: 'supply_apy' | 'borrow_apy';
    },
    _context: Context,
  ) {
    const query: MarketSearchQueryDto = {
      chain: params.chain,
      protocol: params.protocol,
      collateralTokenSymbol: params.asset,
      borrowTokenSymbol: params.asset,
    };

    const result = await this.marketsService.getAllMarkets(query);

    // Filter out empty protocols
    result.protocols = result.protocols.filter((protocol) => {
      // Keep only chains with non-empty pools
      protocol.chains = protocol.chains.filter((chain) => {
        // Keep only pools with matching assets
        chain.pools = chain.pools.filter((pool) => {
          if (!params.asset) return true;

          // For Morpho, we need to check both collateral and loan assets
          if (protocol.protocol === 'morpho') {
            return pool.assets.some(
              (asset) =>
                asset.underlyingSymbol.toLowerCase() ===
                params.asset?.toLowerCase(),
            );
          }

          // For Aave, we check each asset
          return pool.assets.some(
            (asset) =>
              asset.underlyingSymbol.toLowerCase() ===
              params.asset?.toLowerCase(),
          );
        });
        return chain.pools.length > 0;
      });
      return protocol.chains.length > 0;
    });

    // Sort results if requested
    if (params.sort_by) {
      result.protocols.forEach((protocol) => {
        protocol.chains.forEach((chain) => {
          chain.pools.forEach((pool) => {
            pool.assets.sort((a, b) => {
              const aValue = parseFloat(
                params.sort_by === 'supply_apy' ? a.supplyApy : a.borrowApy,
              );
              const bValue = parseFloat(
                params.sort_by === 'supply_apy' ? b.supplyApy : b.borrowApy,
              );
              return bValue - aValue; // Sort in descending order
            });
          });
        });
      });
    }

    // Apply limit if specified
    if (params.limit) {
      result.protocols.forEach((protocol) => {
        protocol.chains.forEach((chain) => {
          chain.pools.forEach((pool) => {
            pool.assets = pool.assets.slice(0, params.limit);
          });
        });
      });
    }

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
