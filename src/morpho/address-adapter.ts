/**
 * This file provides a compatibility layer between different versions of the Morpho SDK.
 * It returns the bundler3 address from the SDK.
 */
import { addresses } from '@morpho-org/blue-sdk';
import { Address } from 'viem';
/**
 * Gets addresses from the SDK and returns the bundler3 address and adapter
 * @param chainId - The numeric chain ID
 * @returns Object with morpho and bundler properties
 */
export function getBundlerAddresses(chainId: number): {
  morpho: Address;
  bundler: {
    bundler: Address;
    generalAdapter1: Address;
  };
} {
  const chainAddresses = addresses[chainId];
  return {
    morpho: chainAddresses.morpho,
    bundler: {
      bundler: chainAddresses.bundler3.bundler3,
      generalAdapter1: chainAddresses.bundler3.generalAdapter1,
    },
  };
}
/**
 * A mock version of the adapter functionality used in Morpho Blue SDK v3+
 * Add this as needed for compatibility.
 */
export const mockAdapter = {
  generalAdapter1: undefined,
};
