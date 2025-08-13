import { Injectable, Logger } from '@nestjs/common';
import { Address, Hex } from 'viem';
// We'll use dynamic import for GraphQLClient
import type { GraphQLClient } from 'graphql-request';
import { gql } from 'graphql-request';

import {
  MorphoGraphQLResponse,
  MarketQueryResponse,
} from '../types/graphql.types';

// Define query as a string literal

// Interface for a simple asset structure (used ONLY in rewards now)
interface RewardAsset {
  address: Hex;
  symbol: string;
}

// Interface for the reward structure within the vault state
interface VaultReward {
  asset: RewardAsset;
  supplyApr: number | null;
}

// Interface for the structure of the vault state data
interface VaultState {
  dailyNetApy?: number | null; // <-- Use this for Total APY
  dailyApy?: number | null; // <-- Use this for Base APY
  rewards?: VaultReward[] | null;
  totalSupply?: string | null;
  totalAssets?: string | null;
  totalAssetsUsd?: string | null;
}

// Interface for the liquidity data within the vault
interface VaultLiquidity {
  usd: string | null;
}

// Asset interface for vault's underlying asset
interface VaultAsset {
  id: string;
  address: Hex;
  decimals: number;
  symbol: string;
  name: string;
}

// Main interface for the vault data
interface VaultData {
  address: Hex;
  name: string | null;
  symbol: string | null; // This symbol should represent the underlying asset
  asset: VaultAsset | null; // This is the underlying asset of the vault
  state: VaultState | null;
  liquidity: VaultLiquidity | null;
}

interface GetVaultDataResponse {
  vaultByAddress: VaultData | null;
}

// Add interface for the vaults query response
interface VaultsQueryResponse {
  vaults: {
    items: VaultItem[];
  };
}

interface VaultItem {
  address: Hex;
  symbol: string;
  name: string;
  whitelisted: boolean;
  asset: VaultAsset | null;
  chain: {
    id: number;
    network: string;
  };
  metadata?: {
    description?: string;
    forumLink?: string;
    image?: string;
    curators?: Array<{
      name: string;
      image?: string;
      url?: string;
    }>;
  };
}

// ---> End Type Definition <---

@Injectable()
export class MorphoGraphQLService {
  private readonly logger = new Logger(MorphoGraphQLService.name);
  private readonly clients: Record<number, GraphQLClient> = {};

  private async getClient(chainId: number): Promise<GraphQLClient> {
    if (!this.clients[chainId]) {
      // Dynamically import GraphQLClient
      const { GraphQLClient } = await import('graphql-request');
      this.clients[chainId] = new GraphQLClient(
        `https://blue-api.morpho.org/graphql`,
      );
    }
    return this.clients[chainId];
  }

  async getUserPositions(
    address: Address,
    chainId: number,
  ): Promise<MorphoGraphQLResponse> {
    const query = `
      query User($address: String!, $chainId: Int) {
        userByAddress(address: $address, chainId: $chainId) {
          address
          marketPositions {
            borrowAssets
            borrowAssetsUsd
            collateral
            collateralUsd
            healthFactor
            supplyAssetsUsd
            supplyAssets
            market {
              collateralAsset {
                address
                name
                symbol
                decimals
                priceUsd
              }
              loanAsset {
                address
                name
                symbol
                decimals
                priceUsd
              }
              uniqueKey
              lltv
              state {
                liquidityAssets
                liquidityAssetsUsd
                borrowApy
                borrowAssets
                borrowAssetsUsd
                collateralAssetsUsd
                collateralAssets
                utilization
                dailyNetBorrowApy
                rewards {
                  asset {
                    address
                    decimals
                    priceUsd
                    symbol
                  }
                  borrowApr
                  supplyApr
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      address,
      chainId,
    };

    try {
      const client = await this.getClient(chainId);
      return await client.request(query, variables);
    } catch (error) {
      this.logger.error('Failed to fetch user positions:', error);
      throw new Error('Failed to fetch user positions from GraphQL API');
    }
  }

  async getMarkets(chainId: number): Promise<MarketQueryResponse> {
    const query = `
      query Markets($orderBy: MarketOrderBy, $orderDirection: OrderDirection, $where: MarketFilters) {
        markets(orderBy: $orderBy, orderDirection: $orderDirection, where: $where) {
          items {
            collateralAsset {
              address
              symbol
              priceUsd
              decimals
            }
            loanAsset {
              address
              symbol
              priceUsd
              decimals
            }
            lltv
            uniqueKey
            state {
              borrowApy
              borrowAssets
              borrowAssetsUsd
              collateralAssets
              collateralAssetsUsd
              supplyApy
              supplyAssets
              supplyAssetsUsd
              dailyNetBorrowApy
              utilization
              rewards {
                asset {
                  address
                  symbol
                  priceUsd
                  decimals
                }
                supplyApr
                borrowApr
              }
            }
          }
        }
      }
    `;

    // Create variables with appropriate filters
    const variables = {
      orderBy: 'SupplyAssetsUsd',
      orderDirection: 'Desc',
      where: {
        chainId_in: [chainId],
        whitelisted: true,
        // Remove the USD filters that were excluding low-activity markets
        // borrowAssetsUsd_gte: 100,
        // supplyAssetsUsd_gte: 100,
      },
    };

    try {
      this.logger.log(`Fetching all markets for chain ID: ${chainId}`);
      const client = await this.getClient(chainId);
      const response = await client.request<MarketQueryResponse>(
        query,
        variables,
      );
      this.logger.log(
        `Retrieved ${response?.markets?.items?.length || 0} markets from the GraphQL API`,
      );
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch markets:', error);
      throw new Error('Failed to fetch markets from GraphQL API');
    }
  }

  /**
   * Get all markets for a chain without any USD filters
   * This is specifically for borrow operations where we need to see all markets
   * regardless of their activity level
   */
  async getAllMarketsForBorrow(chainId: number): Promise<MarketQueryResponse> {
    const query = `
      query Markets($orderBy: MarketOrderBy, $orderDirection: OrderDirection, $where: MarketFilters, $first: Int, $skip: Int) {
        markets(orderBy: $orderBy, orderDirection: $orderDirection, where: $where, first: $first, skip: $skip) {
          items {
            collateralAsset {
              address
              symbol
              priceUsd
              decimals
            }
            loanAsset {
              address
              symbol
              priceUsd
              decimals
            }
            lltv
            uniqueKey
            state {
              borrowApy
              borrowAssets
              borrowAssetsUsd
              collateralAssets
              collateralAssetsUsd
              supplyApy
              supplyAssets
              supplyAssetsUsd
              dailyNetBorrowApy
              utilization
              rewards {
                asset {
                  address
                  symbol
                  priceUsd
                  decimals
                }
                supplyApr
                borrowApr
              }
            }
          }
        }
      }
    `;

    // No USD filters for this query - we want ALL markets
    const baseVariables = {
      orderBy: 'SupplyAssetsUsd',
      orderDirection: 'Desc',
      where: {
        chainId_in: [chainId],
        // No USD filters here - we want all markets including low activity ones
      },
      first: 100,
      skip: 0,
    };

    try {
      this.logger.log(
        `Fetching ALL markets for chain ID ${chainId} (for borrow operations)`,
      );
      const client = await this.getClient(chainId);

      // First batch of markets
      const response = await client.request<MarketQueryResponse>(
        query,
        baseVariables,
      );
      const firstBatchItems = response?.markets?.items || [];
      this.logger.log(
        `Retrieved ${firstBatchItems.length} markets in first batch`,
      );

      // If we got a full page of 100 items, try getting more pages
      let allItems = [...firstBatchItems];
      let currentBatch = 1;
      let hasMoreItems = firstBatchItems.length === 100;

      // Maximum of 5 pages to avoid infinite loops (500 markets should be enough)
      const MAX_PAGES = 5;

      while (hasMoreItems && currentBatch < MAX_PAGES) {
        const skip = currentBatch * 100;
        this.logger.log(
          `Fetching additional batch ${currentBatch + 1} (skip=${skip})`,
        );

        try {
          const batchResponse = await client.request<MarketQueryResponse>(
            query,
            {
              ...baseVariables,
              skip: skip,
            },
          );

          const batchItems = batchResponse?.markets?.items || [];
          this.logger.log(
            `Retrieved ${batchItems.length} markets in batch ${currentBatch + 1}`,
          );

          // Add items to our collection
          allItems = [...allItems, ...batchItems];

          // Continue if we got a full page
          hasMoreItems = batchItems.length === 100;
          currentBatch++;
        } catch (error) {
          this.logger.error(
            `Error fetching batch ${currentBatch + 1}: ${error.message}`,
          );
          // Break the loop if we get an error
          hasMoreItems = false;
        }
      }

      this.logger.log(
        `Retrieved ${allItems.length} total markets from the GraphQL API for borrow operations`,
      );

      // Construct full response with all items
      return {
        markets: {
          items: allItems,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch markets for borrow:', error);
      // Return empty result to allow the fallback to work
      return { markets: { items: [] } };
    }
  }

  async getVaultData(
    vaultAddress: Hex,
    chainId: number,
  ): Promise<VaultData | null> {
    const query = gql`
      query GetVaultData($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          name
          symbol
          asset {
            id
            address
            decimals
            symbol
            name
          }
          state {
            dailyNetApy
            dailyApy
            totalSupply
            totalAssets
            totalAssetsUsd
            rewards {
              supplyApr
              asset {
                address
                symbol
              }
            }
          }
          liquidity {
            usd
          }
        }
      }
    `;

    try {
      const variables = { address: vaultAddress, chainId: chainId };
      this.logger.debug(
        `Executing GraphQL query GetVaultData with variables: ${JSON.stringify(variables)}`,
      );
      const client = await this.getClient(chainId);
      const response = await client.request<GetVaultDataResponse>(
        query,
        variables,
      );
      this.logger.debug(
        `Received GraphQL response for GetVaultData: ${JSON.stringify(response)}`,
      );
      return response.vaultByAddress;
    } catch (error) {
      this.logger.error(
        `GraphQL query GetVaultData failed for vault ${vaultAddress} on chain ${chainId}: ${error.message}`,
        error.stack,
      );
      return null; // Return null on error
    }
  }

  /**
   * Get all whitelisted vaults directly from the GraphQL API
   * @returns Array of vault items with their associated data
   */
  async getWhitelistedVaults(): Promise<VaultItem[]> {
    const query = gql`
      query GetVaults($first: Int, $skip: Int) {
        vaults(first: $first, skip: $skip) {
          items {
            address
            symbol
            name
            whitelisted
            asset {
              id
              address
              decimals
              symbol
              name
            }
            chain {
              id
              network
            }
            metadata {
              description
              forumLink
              image
              curators {
                image
                name
                url
              }
            }
          }
        }
      }
    `;

    try {
      this.logger.log('Fetching whitelisted vaults from GraphQL API');
      // Use mainnet chain ID for the client, but the query itself doesn't filter by chain
      const client = await this.getClient(1); // Using mainnet chain ID

      // Fetch vaults with pagination
      const pageSize = 100;
      let skip = 0;
      let allVaults: VaultItem[] = [];
      let hasMore = true;

      // Fetch up to 10 pages (1000 vaults) to avoid infinite loops
      const maxPages = 10;
      let currentPage = 0;

      while (hasMore && currentPage < maxPages) {
        const variables = { first: pageSize, skip };
        this.logger.log(
          `Fetching vaults page ${currentPage + 1} (skip=${skip})`,
        );

        const response = await client.request<VaultsQueryResponse>(
          query,
          variables,
        );
        const vaults = response.vaults.items || [];

        if (vaults.length === 0) {
          hasMore = false;
        } else {
          allVaults = [...allVaults, ...vaults];
          skip += pageSize;
          currentPage++;

          // If we got less than pageSize, we've reached the end
          hasMore = vaults.length === pageSize;
        }
      }

      // Filter to only include whitelisted vaults
      const whitelistedVaults = allVaults.filter(
        (vault) => vault.whitelisted === true,
      );

      this.logger.log(
        `Retrieved ${whitelistedVaults.length} whitelisted vaults out of ${allVaults.length} total vaults`,
      );

      return whitelistedVaults;
    } catch (error) {
      this.logger.error(
        `Failed to fetch whitelisted vaults: ${error.message}`,
        error.stack,
      );
      return []; // Return empty array on error
    }
  }
}
