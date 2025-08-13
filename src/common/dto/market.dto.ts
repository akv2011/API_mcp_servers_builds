import { SupportedChain } from '../types/chain.type';

export interface RewardDto {
  rewardToken: string;
  rewardSymbol: string;
  apy: string;
}

export interface MarketAssetDto {
  underlyingSymbol: string;
  underlyingDecimals?: number;
  totalSupply: string;
  totalSupplyUsd: string;
  totalBorrow: string;
  totalBorrowUsd: string;
  liquidity: string;
  liquidityUsd: string;
  supplyApy: string;
  borrowApy: string;
  isCollateral: boolean;
  ltv: string;
  rewards: RewardDto[];
}

export interface MarketPoolDto {
  name: string;
  poolId: string;
  totalValueUsd: number;
  assets: MarketAssetDto[];
}

export interface ChainPoolsDto {
  chain: SupportedChain;
  pools: MarketPoolDto[];
}

export interface ProtocolPoolsDto {
  protocol: string;
  chains: ChainPoolsDto[];
}

export interface AggregatedMarketsResponseDto {
  protocols: ProtocolPoolsDto[];
}
