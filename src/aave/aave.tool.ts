/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Injectable, Logger } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AaveService } from './aave.service';
import { SupportedChain, ChainService } from '../chain';
import { getMarketConfig } from './constants/market-config';
import { ApiProperty } from '@nestjs/swagger';
import { TokenService } from './services/token.service';
import { parseUnits } from 'viem';

@Injectable()
export class AaveTool {
  private readonly logger = new Logger(AaveTool.name);

  constructor(
    private readonly aaveService: AaveService,
    private readonly chainService: ChainService,
    private readonly tokenService: TokenService,
  ) {}

  @Tool({
    name: 'generate_aave_supply_tx',
    description:
      'Generates the transaction data required to supply assets to an Aave V3 pool. Does NOT send the transaction.',
    parameters: z.object({
      chain: z
        .enum([
          'mainnet',
          'mainnet-etherfi',
          'mainnet-lido',
          'arbitrum',
          'optimism',
          'base',
          'sonic',
        ])
        .describe('The chain to supply the token to'),
      asset: z
        .string()
        .describe('The token symbol to supply (e.g., WETH, USDC)'),
      amount: z.number().describe('The amount of tokens to supply'),
      on_behalf_of: z
        .string()
        .describe('The address to supply the tokens on behalf of'),
    }),
  })
  async aaveSupply(params: any, _context: Context) {
    this.logger.debug(
      `Entering aaveSupply with params: ${JSON.stringify(params)}`,
    );
    const marketConfig = getMarketConfig(params.chain);
    const tokenAddress = marketConfig?.tokenAddresses?.[params.asset];
    this.logger.debug(
      `Looked up token ${params.asset} on chain ${params.chain}. Address: ${tokenAddress}`,
    );
    if (!tokenAddress) {
      throw new Error(
        `Unsupported token ${params.asset} on chain ${params.chain}`,
      );
    }

    const client = this.chainService.getClient(params.chain as SupportedChain);
    const decimals = await this.tokenService.getDecimals(client, tokenAddress);
    this.logger.debug(`Using ${decimals} decimals for ${params.asset}`);

    const scaledAmount = parseUnits(params.amount.toString(), decimals);

    const result = await this.aaveService.supply(
      params.chain as SupportedChain,
      {
        tokenAddress,
        amount: scaledAmount,
        userAddress: params.on_behalf_of as `0x${string}`,
      },
    );

    this.logger.debug(`aaveSupply result: ${JSON.stringify(result)}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }

  @Tool({
    name: 'generate_aave_withdraw_tx',
    description:
      'Generates the transaction data required to withdraw assets from an Aave V3 pool. Does NOT send the transaction.',
    parameters: z.object({
      chain: z
        .enum([
          'mainnet',
          'mainnet-etherfi',
          'mainnet-lido',
          'arbitrum',
          'optimism',
          'base',
          'sonic',
        ])
        .describe('The chain to withdraw the token from'),
      asset: z
        .string()
        .describe('The token symbol to withdraw (e.g., WETH, USDC)'),
      amount: z.number().describe('The amount of tokens to withdraw'),
      on_behalf_of: z
        .string()
        .describe('The address to withdraw the tokens to'),
    }),
  })
  async aaveWithdraw(params: any, _context: Context) {
    this.logger.debug(
      `Entering aaveWithdraw with params: ${JSON.stringify(params)}`,
    );
    const marketConfig = getMarketConfig(params.chain);
    const tokenAddress = marketConfig?.tokenAddresses?.[params.asset];
    this.logger.debug(
      `Looked up token ${params.asset} on chain ${params.chain}. Address: ${tokenAddress}`,
    );
    if (!tokenAddress) {
      throw new Error(
        `Unsupported token ${params.asset} on chain ${params.chain}`,
      );
    }

    const client = this.chainService.getClient(params.chain as SupportedChain);
    const decimals = await this.tokenService.getDecimals(client, tokenAddress);
    this.logger.debug(`Using ${decimals} decimals for ${params.asset}`);

    const scaledAmount = parseUnits(params.amount.toString(), decimals);

    const result = await this.aaveService.withdraw(
      params.chain as SupportedChain,
      {
        tokenAddress,
        amount: scaledAmount,
        userAddress: params.on_behalf_of as `0x${string}`,
      },
    );

    this.logger.debug(`aaveWithdraw result: ${JSON.stringify(result)}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }

  @Tool({
    name: 'generate_aave_borrow_tx',
    description:
      'Generates the transaction data required to borrow assets from an Aave V3 pool. Requires sufficient collateral in the pool. Does NOT send the transaction.',
    parameters: z.object({
      chain: z
        .enum([
          'mainnet',
          'mainnet-etherfi',
          'mainnet-lido',
          'arbitrum',
          'optimism',
          'base',
          'sonic',
        ])
        .describe('The chain to borrow the token from'),
      asset: z
        .string()
        .describe('The token symbol to borrow (e.g., WETH, USDC)'),
      amount: z.number().describe('The amount of tokens to borrow'),
      on_behalf_of: z
        .string()
        .describe('The address to borrow the tokens on behalf of'),
    }),
  })
  async aaveBorrow(params: any, _context: Context) {
    this.logger.debug(
      `Entering aaveBorrow with params: ${JSON.stringify(params)}`,
    );
    const marketConfig = getMarketConfig(params.chain);
    const tokenAddress = marketConfig?.tokenAddresses?.[params.asset];
    this.logger.debug(
      `Looked up token ${params.asset} on chain ${params.chain}. Address: ${tokenAddress}`,
    );
    if (!tokenAddress) {
      throw new Error(
        `Unsupported token ${params.asset} on chain ${params.chain}`,
      );
    }

    const client = this.chainService.getClient(params.chain as SupportedChain);
    const decimals = await this.tokenService.getDecimals(client, tokenAddress);
    this.logger.debug(`Using ${decimals} decimals for ${params.asset}`);

    const scaledAmount = parseUnits(params.amount.toString(), decimals);

    const result = await this.aaveService.borrow(
      params.chain as SupportedChain,
      {
        tokenAddress,
        amount: scaledAmount,
        userAddress: params.on_behalf_of as `0x${string}`,
      },
    );

    this.logger.debug(`aaveBorrow result: ${JSON.stringify(result)}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }

  @Tool({
    name: 'generate_aave_repay_tx',
    description:
      'Generates the transaction data required to repay borrowed assets to an Aave V3 pool. Does NOT send the transaction.',
    parameters: z.object({
      chain: z
        .enum([
          'mainnet',
          'mainnet-etherfi',
          'mainnet-lido',
          'arbitrum',
          'optimism',
          'base',
          'sonic',
        ])
        .describe('The chain to repay the token to'),
      asset: z
        .string()
        .describe('The token symbol to repay (e.g., WETH, USDC)'),
      amount: z.number().describe('The amount of tokens to repay'),
      on_behalf_of: z
        .string()
        .describe('The address to repay the tokens on behalf of'),
    }),
  })
  async aaveRepay(params: any, _context: Context) {
    this.logger.debug(
      `Entering aaveRepay with params: ${JSON.stringify(params)}`,
    );
    const marketConfig = getMarketConfig(params.chain);
    const tokenAddress = marketConfig?.tokenAddresses?.[params.asset];
    this.logger.debug(
      `Looked up token ${params.asset} on chain ${params.chain}. Address: ${tokenAddress}`,
    );
    if (!tokenAddress) {
      throw new Error(
        `Unsupported token ${params.asset} on chain ${params.chain}`,
      );
    }

    const client = this.chainService.getClient(params.chain as SupportedChain);
    const decimals = await this.tokenService.getDecimals(client, tokenAddress);
    this.logger.debug(`Using ${decimals} decimals for ${params.asset}`);

    const scaledAmount = parseUnits(params.amount.toString(), decimals);

    const result = await this.aaveService.repay(
      params.chain as SupportedChain,
      {
        tokenAddress,
        amount: scaledAmount,
        userAddress: params.on_behalf_of as `0x${string}`,
      },
    );

    this.logger.debug(`aaveRepay result: ${JSON.stringify(result)}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
}

export class MarketSearchQueryDto {
  @ApiProperty({
    description: 'Chain to search for markets',
    required: false,
    enum: [
      'mainnet',
      'mainnet-etherfi',
      'mainnet-lido',
      'arbitrum',
      'optimism',
      'base',
      'sonic',
    ],
  })
  chain?: SupportedChain;

  @ApiProperty({
    description: 'Protocol to search for markets',
    required: false,
    enum: ['aave', 'morpho'],
  })
  protocol?: string;

  @ApiProperty({
    description: 'Pool ID to search for',
    required: false,
  })
  poolId?: string;

  @ApiProperty({
    description: 'Collateral token symbol to search for',
    required: false,
  })
  collateralTokenSymbol?: string;

  @ApiProperty({
    description: 'Borrow token symbol to search for',
    required: false,
  })
  borrowTokenSymbol?: string;

  @ApiProperty({
    description: 'Sort markets by APY',
    required: false,
    enum: ['supply_apy', 'borrow_apy'],
  })
  sortBy?: 'supply_apy' | 'borrow_apy';

  @ApiProperty({
    description: 'Limit number of results',
    required: false,
  })
  limit?: number;
}
