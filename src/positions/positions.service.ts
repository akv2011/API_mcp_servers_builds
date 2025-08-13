// External dependencies
import { Injectable } from '@nestjs/common';
import { Address } from 'viem';

// Services
import { MorphoService } from '../morpho/morpho.service';

// DTOs and types
import {
  PositionsResponseDto,
  ProtocolPositionDto,
  ChainPositionsDto,
} from './dto/positions.dto';
import { Protocol } from './positions.controller';
import { AaveService } from 'src/aave/aave.service';
import { PositionsResponseDto as ProtocolPositionsResponseDto } from '../common/dto/position.dto';
import { SUPPORTED_CHAINS, SupportedChain } from '../chain';

@Injectable()
export class PositionsService {
  constructor(
    private readonly morphoService: MorphoService,
    private readonly aaveService: AaveService,
  ) {}

  async getChainPositions(
    address: Address,
    chain: SupportedChain,
    protocol?: Protocol,
  ): Promise<ChainPositionsDto | null> {
    // Get positions from both protocols if no filter, or just the requested protocol
    const shouldGetMorpho = !protocol || protocol === 'morpho';
    const shouldGetAave = !protocol || protocol === 'aave';

    const positionPromises: Promise<any>[] = [];
    if (shouldGetMorpho) {
      positionPromises.push(this.morphoService.getPositions(chain, address));
    }
    if (shouldGetAave) {
      positionPromises.push(this.aaveService.getPositions(chain, address));
    }

    const positionResults = await Promise.allSettled(positionPromises);

    let morphoPositions: ProtocolPositionsResponseDto = {
      positions: { pools: [] },
    };
    let aavePositions: ProtocolPositionsResponseDto = {
      positions: { pools: [] },
    };

    let resultIndex = 0;
    if (shouldGetMorpho) {
      const result = positionResults[resultIndex];
      if (result.status === 'fulfilled') {
        morphoPositions = result.value;
      }
      resultIndex++;
    }
    if (shouldGetAave) {
      const result = positionResults[resultIndex];
      if (result.status === 'fulfilled') {
        aavePositions = result.value;
      }
      resultIndex++;
    }

    const protocols: ProtocolPositionDto[] = [];

    // Process Morpho positions if requested and has data
    if (shouldGetMorpho && morphoPositions.positions.pools.length > 0) {
      const morphoProtocolPosition: ProtocolPositionDto = {
        protocol: 'morpho',
        totalSupplyUsd: 0,
        totalBorrowUsd: 0,
        netValueUsd: 0,
        pools: morphoPositions.positions.pools.map((pool) => ({
          name: pool.name,
          poolId: pool.poolId,
          assets: pool.assets.map((asset) => ({
            asset: asset.underlyingSymbol,
            supplyBalance: asset.supplyBalance,
            supplyBalanceUsd: Number(asset.supplyBalanceUsd),
            borrowBalance: asset.borrowBalance,
            borrowBalanceUsd: Number(asset.borrowBalanceUsd),
          })),
          healthFactor: pool.healthFactor,
        })),
      };

      // Calculate Morpho totals
      morphoProtocolPosition.totalSupplyUsd =
        morphoProtocolPosition.pools.reduce(
          (sum, pool) =>
            sum +
            pool.assets.reduce(
              (assetSum, asset) => assetSum + asset.supplyBalanceUsd,
              0,
            ),
          0,
        );
      morphoProtocolPosition.totalBorrowUsd =
        morphoProtocolPosition.pools.reduce(
          (sum, pool) =>
            sum +
            pool.assets.reduce(
              (assetSum, asset) => assetSum + asset.borrowBalanceUsd,
              0,
            ),
          0,
        );
      morphoProtocolPosition.netValueUsd =
        morphoProtocolPosition.totalSupplyUsd -
        morphoProtocolPosition.totalBorrowUsd;

      // Only add if there are actual positions and not already added
      if (
        (morphoProtocolPosition.totalSupplyUsd > 0 ||
          morphoProtocolPosition.totalBorrowUsd > 0) &&
        !protocols.some((p) => p.protocol === 'morpho')
      ) {
        protocols.push(morphoProtocolPosition);
      }
    }

    // Add Aave positions handling
    if (shouldGetAave && aavePositions?.positions?.pools?.length > 0) {
      const aaveProtocolPosition: ProtocolPositionDto = {
        protocol: 'aave',
        totalSupplyUsd: 0,
        totalBorrowUsd: 0,
        netValueUsd: 0,
        pools: aavePositions.positions.pools.map((pool) => ({
          name: pool?.name || 'Aave Pool',
          poolId: pool?.poolId || chain,
          assets: (pool?.assets || []).map((asset) => ({
            asset: asset?.underlyingSymbol || 'Unknown',
            supplyBalance: asset?.supplyBalance || '0',
            supplyBalanceUsd: parseFloat(asset?.supplyBalanceUsd || '0'),
            borrowBalance: asset?.borrowBalance || '0',
            borrowBalanceUsd: parseFloat(asset?.borrowBalanceUsd || '0'),
          })),
          healthFactor: pool?.healthFactor || '0',
        })),
      };

      // Calculate Aave totals
      aaveProtocolPosition.totalSupplyUsd = aaveProtocolPosition.pools.reduce(
        (sum, pool) =>
          sum +
          (pool.assets || []).reduce(
            (assetSum, asset) => assetSum + (asset.supplyBalanceUsd || 0),
            0,
          ),
        0,
      );

      aaveProtocolPosition.totalBorrowUsd = aaveProtocolPosition.pools.reduce(
        (sum, pool) =>
          sum +
          (pool.assets || []).reduce(
            (assetSum, asset) => assetSum + (asset.borrowBalanceUsd || 0),
            0,
          ),
        0,
      );

      aaveProtocolPosition.netValueUsd =
        aaveProtocolPosition.totalSupplyUsd -
        aaveProtocolPosition.totalBorrowUsd;

      // Only add if there are actual positions and not already added
      if (
        (aaveProtocolPosition.totalSupplyUsd > 0 ||
          aaveProtocolPosition.totalBorrowUsd > 0) &&
        !protocols.some((p) => p.protocol === 'aave')
      ) {
        protocols.push(aaveProtocolPosition);
      }
    }

    // If no protocols have positions, return null
    if (protocols.length === 0) {
      return null;
    }

    // Calculate chain totals
    const totalSupplyUsd = protocols.reduce(
      (sum, protocol) => sum + protocol.totalSupplyUsd,
      0,
    );
    const totalBorrowUsd = protocols.reduce(
      (sum, protocol) => sum + protocol.totalBorrowUsd,
      0,
    );
    const totalValueUsd = totalSupplyUsd - totalBorrowUsd;

    return {
      chain,
      totalValueUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      protocols,
    };
  }

  async getAllPositions(
    address: Address,
    protocol?: Protocol,
    chain?: SupportedChain,
  ): Promise<PositionsResponseDto> {
    const chainsToQuery = chain ? [chain] : SUPPORTED_CHAINS;

    // Get positions for all requested chains
    const chainPromises = chainsToQuery.map((chainId: SupportedChain) =>
      this.getChainPositions(address, chainId, protocol),
    );
    const chainResults = await Promise.all(chainPromises);

    // Filter out null results (chains with no positions)
    const chains = chainResults.filter(
      (result): result is ChainPositionsDto => result !== null,
    );

    // Calculate totals across all chains
    const totalSupplyUsd = chains.reduce(
      (sum, chain) => sum + chain.totalSupplyUsd,
      0,
    );
    const totalBorrowUsd = chains.reduce(
      (sum, chain) => sum + chain.totalBorrowUsd,
      0,
    );
    const totalValueUsd = totalSupplyUsd - totalBorrowUsd;

    return {
      totalValueUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      chains,
    };
  }
}
