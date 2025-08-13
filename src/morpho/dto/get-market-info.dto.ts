import { ApiProperty } from '@nestjs/swagger';

export class MarketInfoResponseDto {
  @ApiProperty({
    description: 'Market ID',
    example:
      '0x144bf18d6bf4c59602548a825034f73bf1d20177fc5f975fc69d5a5eba929b45',
  })
  marketId: string;

  @ApiProperty({
    description: 'Collateral token address',
    example: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6',
  })
  collateralToken: string;

  @ApiProperty({
    description: 'Collateral token symbol',
    example: 'wsuperOETHb',
  })
  collateralTokenSymbol: string;

  @ApiProperty({
    description: 'Borrow token address',
    example: '0x4200000000000000000000000000000000000006',
  })
  borrowToken: string;

  @ApiProperty({
    description: 'Borrow token symbol',
    example: 'WETH',
  })
  borrowTokenSymbol: string;

  @ApiProperty({
    description: 'Market utilization (scaled by WAD)',
    example: '920000000000000000',
  })
  utilization: string;

  @ApiProperty({
    description: 'Market liquidity in loan assets',
    example: '23000000',
  })
  liquidity: string;

  @ApiProperty({
    description: 'Supply APY at target (scaled by WAD)',
    example: '30000000000000000',
  })
  apyAtTarget: string;

  @ApiProperty({
    description: 'Borrow APY (scaled by WAD)',
    example: '80000000000000000',
  })
  borrowApy: string;

  @ApiProperty({
    description: 'Total supply in assets',
    example: '1000000000000000000',
  })
  totalSupplyAssets: string;

  @ApiProperty({
    description: 'Total borrow in assets',
    example: '500000000000000000',
  })
  totalBorrowAssets: string;
}

export class RewardDto {
  @ApiProperty({
    description: 'Reward token address',
    example: '0x1234...',
  })
  rewardToken: string;

  @ApiProperty({
    description: 'Reward token symbol',
    example: 'MORPHO',
  })
  rewardSymbol: string;

  @ApiProperty({
    description: 'Supply APR for the reward',
    example: '0.1',
  })
  supplyApr: string;

  @ApiProperty({
    description: 'Borrow APR for the reward',
    example: '0.05',
  })
  borrowApr: string;
}

export class MarketAssetDto {
  @ApiProperty({
    description: 'Asset symbol',
    example: 'WETH',
  })
  underlyingSymbol: string;

  @ApiProperty({
    description: 'Total supply in native units',
    example: '1000000000000000000',
  })
  totalSupply: string;

  @ApiProperty({
    description: 'Total supply in USD',
    example: '1500.5',
  })
  totalSupplyUsd: string;

  @ApiProperty({
    description: 'Total borrow in native units',
    example: '500000000000000000',
  })
  totalBorrow: string;

  @ApiProperty({
    description: 'Total borrow in USD',
    example: '750.25',
  })
  totalBorrowUsd: string;

  @ApiProperty({
    description: 'Available liquidity in native units',
    example: '500000000000000000',
  })
  liquidity: string;

  @ApiProperty({
    description: 'Available liquidity in USD',
    example: '750.25',
  })
  liquidityUsd: string;

  @ApiProperty({
    description: 'Supply APY',
    example: '0.05',
  })
  supplyApy: string;

  @ApiProperty({
    description: 'Borrow APY',
    example: '0.08',
  })
  borrowApy: string;

  @ApiProperty({
    description: 'Is collateral',
    example: true,
  })
  isCollateral: boolean;

  @ApiProperty({
    description: 'Reward APRs',
    type: [RewardDto],
  })
  rewards: RewardDto[];
}

export class MarketPoolDto {
  @ApiProperty({
    description: 'Pool name',
    example: 'WETH/USDC',
  })
  name: string;

  @ApiProperty({
    description: 'Pool ID',
    example: '0x123...',
  })
  poolId: string;

  @ApiProperty({
    description: 'Loan to value ratio',
    example: '0.8',
  })
  lltv: string;

  @ApiProperty({
    description: 'Market assets',
    type: [MarketAssetDto],
  })
  assets: MarketAssetDto[];
}

export class MarketsResponseDto {
  @ApiProperty({
    description: 'Market pools',
    type: [MarketPoolDto],
  })
  pools: MarketPoolDto[];
}
