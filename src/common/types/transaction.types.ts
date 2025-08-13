import { Address, Hex } from 'viem';

/**
 * Represents the parameters required to send a raw Ethereum transaction.
 */
export interface RawTransaction {
  chainId: number;
  from: Address;
  to: Address;
  data: Hex;
  value: bigint;
  nonce: number;
  maxFeePerGas?: bigint; // EIP-1559
  maxPriorityFeePerGas?: bigint; // EIP-1559
  gas?: bigint; // Legacy or explicit gas limit
  gasPrice?: bigint; // Legacy
}
