import { Injectable, Inject } from '@nestjs/common';
import { encodeFunctionData, parseAbi } from 'viem';
import { Address } from 'viem';
import { ChainService, SupportedChain } from '../../chain';
import { RawTransaction } from '../../common/types/transaction.types';

// Minimal ERC20 ABI for the approve function
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

interface ApprovalParams {
  chain: SupportedChain;
  userAddress: Address;
  tokenAddress: Address;
  spenderAddress: Address;
  amount: bigint;
}

@Injectable()
export class TokenApprovalService {
  constructor(
    @Inject(ChainService) private readonly chainService: ChainService,
  ) {}

  /**
   * Generates the transaction object for approving an ERC20 token transfer.
   *
   * @param params - Parameters for the approval transaction.
   * @returns The raw transaction object.
   */
  async generateApprovalTransaction({
    chain,
    userAddress,
    tokenAddress,
    spenderAddress,
    amount,
  }: ApprovalParams): Promise<RawTransaction> {
    try {
      const client = this.chainService.getClient(chain);
      const chainId = this.chainService.getChainId(chain);

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spenderAddress, amount],
      });

      const nonce = await client.getTransactionCount({
        address: userAddress,
      });

      // Estimate gas - handle potential errors
      let maxFeePerGas: bigint | undefined;
      let maxPriorityFeePerGas: bigint | undefined;
      try {
        const gasEstimate = await client.estimateGas({
          account: userAddress,
          to: tokenAddress,
          data: data,
          value: 0n,
        });
        maxFeePerGas = gasEstimate; // Using estimateGas as maxFeePerGas for simplicity here, adjust if needed

        const feeData = await client.estimateFeesPerGas();
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } catch (gasError) {
        console.error(
          `Error estimating gas for approval on chain ${chain}:`,
          gasError,
        );
        // Decide how to handle gas estimation errors (e.g., throw, return defaults)
        // Setting to undefined will let the wallet/sender handle gas estimation
        maxFeePerGas = undefined;
        maxPriorityFeePerGas = undefined;
      }

      const tx: RawTransaction = {
        chainId,
        from: userAddress,
        to: tokenAddress,
        data,
        value: 0n, // Approve value is always 0
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };

      return tx;
    } catch (error) {
      console.error('Error generating approval transaction:', error);
      throw new Error('Failed to generate approval transaction.');
    }
  }
}
