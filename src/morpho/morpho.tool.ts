import { Injectable } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { MorphoService } from './morpho.service';
import { SupportedChain } from '../chain';

@Injectable()
export class MorphoTool {
  constructor(private readonly morphoService: MorphoService) {}

  @Tool({
    name: 'generate_morpho_borrow_tx',
    description: 'Borrow assets from Morpho Blue by supplying collateral',
    parameters: z.object({
      chain: z
        .enum(['mainnet', 'base'])
        .describe('The blockchain network to use'),
      supply_asset: z
        .string()
        .describe(
          'The token symbol to supply as collateral (e.g., "WETH", "wstETH")',
        ),
      supply_amount: z.number().describe('The amount of collateral to supply'),
      borrow_asset: z
        .string()
        .describe('The token symbol to borrow (e.g., "USDC", "DAI")'),
      borrow_amount: z.number().describe('The amount to borrow'),
      user_address: z
        .string()
        .describe('The user address to borrow on behalf of'),
    }),
  })
  async morphoBorrow(
    {
      chain,
      supply_asset,
      supply_amount,
      borrow_asset,
      borrow_amount,
      user_address,
    },

    _context: Context,
  ) {
    const result = await this.morphoService.borrow(chain as SupportedChain, {
      sender: user_address,
      call_data: {
        chain: chain as SupportedChain,
        collateral: {
          token: supply_asset,
          amount: supply_amount.toString(),
        },
        borrow: {
          token: borrow_asset,
          amount: borrow_amount.toString(),
        },
      },
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }

  @Tool({
    name: 'generate_morpho_vault_deposit_tx',
    description: 'Deposit assets into a Morpho Earn Vault',
    parameters: z.object({
      chain: z.enum(['mainnet', 'base']).describe('The blockchain network'),
      asset_symbol: z
        .string()
        .describe('The asset symbol to deposit (e.g., "WETH", "USDC")'),
      amount: z.number().describe('The amount to deposit'),
      user_address: z
        .string()
        .describe('The user address to deposit on behalf of'),
      vault_identifier: z
        .string()
        .optional()
        .describe('Optional: Vault address or descriptive name'),
    }),
  })
  async morphoVaultDeposit(
    { chain, asset_symbol, amount, user_address, vault_identifier },
    _context: Context,
  ) {
    try {
      const result = await this.morphoService.depositToEarnVault(
        chain as SupportedChain,
        {
          assetSymbol: asset_symbol,
          amount: amount.toString(),
          userAddress: user_address as any, // Type conversion handled by service
          vaultIdentifier: vault_identifier,
        },
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
      };
    }
  }

  @Tool({
    name: 'generate_morpho_vault_withdraw_tx',
    description: 'Withdraw assets from a Morpho Earn Vault',
    parameters: z.object({
      chain: z.enum(['mainnet', 'base']).describe('The blockchain network'),
      asset_symbol: z
        .string()
        .describe('The asset symbol to withdraw (e.g., "WETH", "USDC")'),
      amount: z.number().describe('The amount of shares to withdraw'),
      user_address: z
        .string()
        .describe('The user address to withdraw on behalf of'),
      vault_identifier: z
        .string()
        .optional()
        .describe('Optional: Vault address or descriptive name'),
    }),
  })
  async morphoVaultWithdraw(
    { chain, asset_symbol, amount, user_address, vault_identifier },
    _context: Context,
  ) {
    try {
      const result = await this.morphoService.withdrawFromEarnVault(
        chain as SupportedChain,
        {
          assetSymbol: asset_symbol,
          amount: amount.toString(),
          userAddress: user_address as any, // Type conversion handled by service
          vaultIdentifier: vault_identifier,
        },
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
      };
    }
  }
}
