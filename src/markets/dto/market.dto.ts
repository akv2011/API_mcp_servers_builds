import { ApiProperty } from '@nestjs/swagger';
import { SupportedChain, SUPPORTED_CHAINS } from '../../chain';

export class MarketRewardDto {
  @ApiProperty()
  rewardTokenSymbol: string;

  @ApiProperty()
  rewardTokenAddress: string;

  @ApiProperty()
  rewardApr: string;
}

export class MarketAssetDto {
  @ApiProperty()
  underlyingSymbol: string;

  @ApiProperty()
  totalSupply: string;

  @ApiProperty()
  totalSupplyUsd: string;

  @ApiProperty()
  totalBorrow: string;

  @ApiProperty()
  totalBorrowUsd: string;

  @ApiProperty()
  liquidity: string;

  @ApiProperty()
  liquidityUsd: string;

  @ApiProperty()
  supplyApy: string;

  @ApiProperty()
  borrowApy: string;

  @ApiProperty()
  isCollateral: boolean;

  @ApiProperty()
  ltv: string;

  @ApiProperty({ type: [MarketRewardDto] })
  rewards: MarketRewardDto[];
}

export class MarketPoolDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  poolId: string;

  @ApiProperty()
  totalValueUsd: number;

  @ApiProperty({ type: [MarketAssetDto] })
  assets: MarketAssetDto[];
}

export class ChainMarketsDto {
  @ApiProperty({ enum: SUPPORTED_CHAINS })
  chain: SupportedChain;

  @ApiProperty({ type: [MarketPoolDto] })
  pools: MarketPoolDto[];
}

export class ProtocolPoolsDto {
  @ApiProperty()
  protocol: string;

  @ApiProperty({ type: [ChainMarketsDto] })
  chains: ChainMarketsDto[];
}

export class AggregatedMarketsResponseDto {
  @ApiProperty({ type: [ProtocolPoolsDto] })
  protocols: ProtocolPoolsDto[];
}
