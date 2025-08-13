import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SUPPORTED_CHAINS,
  SupportedChain,
} from '../../common/types/chain.type';

export enum YieldProtocol {
  AAVE = 'aave',
  MORPHO = 'morpho',
  // Add other protocols later if needed
}

export class GetYieldQueryDto {
  @ApiPropertyOptional({
    enum: SUPPORTED_CHAINS,
    description: 'Filter opportunities by blockchain network',
    example: 'mainnet',
  })
  @IsOptional()
  @IsEnum(SUPPORTED_CHAINS)
  chain?: SupportedChain;

  @ApiPropertyOptional({
    description: 'Filter opportunities by underlying asset symbol',
    example: 'USDC',
  })
  @IsOptional()
  @IsString()
  asset?: string;

  @ApiPropertyOptional({
    enum: YieldProtocol,
    description: 'Filter opportunities by protocol',
    example: YieldProtocol.AAVE,
  })
  @IsOptional()
  @IsEnum(YieldProtocol)
  protocol?: YieldProtocol;

  @ApiPropertyOptional({
    type: Number,
    description: 'Minimum Annual Percentage Yield (APY) filter',
    example: 5.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minApy?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Maximum number of opportunities to return. If not specified, returns all results. Use -1 to explicitly request all opportunities.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  limit?: number;
}

// Define a class for individual reward details
export class RewardDetailDto {
  @ApiProperty({
    description: 'Annual Percentage Yield (APY) for this specific reward.',
    example: '1.66',
  })
  @IsString()
  apy: string;

  @ApiProperty({
    description: 'Symbol of the reward token.',
    example: 'SEAM',
  })
  @IsString()
  symbol: string;

  @ApiProperty({
    description: 'Address of the reward token.',
    example: '0x...',
  })
  @IsString()
  address: string;
}

export class YieldOpportunityDto {
  @ApiProperty({
    description: 'Protocol providing the yield opportunity',
    enum: YieldProtocol,
  })
  @IsEnum(YieldProtocol)
  protocol: YieldProtocol;

  @ApiProperty({
    description: 'Chain the opportunity is on',
    enum: SUPPORTED_CHAINS,
  })
  @IsEnum(SUPPORTED_CHAINS)
  chain: SupportedChain;

  @ApiProperty({ description: 'Asset symbol for the yield opportunity' })
  @IsString()
  assetSymbol: string;

  @ApiProperty({ description: 'Address of the underlying asset token' })
  @IsString()
  assetAddress: string; // Use string for address

  @ApiProperty({
    description:
      'Current Annual Percentage Yield (APY) as a percentage string (e.g., "5.25")',
  })
  @IsString()
  apy: string;

  @ApiPropertyOptional({
    description: 'Optional: Base component of the APY (excluding rewards)',
    required: false,
  })
  @IsOptional()
  @IsString()
  baseApy?: string;

  @ApiProperty({
    description:
      'Total Value Locked (TVL) in USD for this specific opportunity',
    required: false,
  })
  @IsOptional()
  @IsString()
  tvlUsd?: string; // TVL specific to the pool/vault

  @ApiProperty({
    description: 'Available liquidity in USD for Morpho vaults',
    required: false,
  })
  @IsOptional()
  @IsString()
  availableLiquidityUsd?: string; // Liquidity specific to Morpho

  @ApiPropertyOptional({
    description:
      "Optional: Total deposits in the underlying asset's native units (e.g., total USDC deposited, not USD value).",
    example: '15000000.123456',
  })
  @IsOptional()
  @IsString()
  totalDepositsUnits?: string;

  @ApiProperty({
    description:
      'A descriptive name for the yield opportunity (e.g., Vault Name, Pool Symbol)',
  })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Type of yield (e.g., Supply, Vault Deposit)' })
  @IsString()
  yieldType: string; // e.g., "Supply", "Vault Deposit"

  @ApiPropertyOptional({
    type: [RewardDetailDto],
    description:
      'Optional: Array of reward details (APY, symbol, address) if applicable.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RewardDetailDto)
  rewards?: RewardDetailDto[];

  @ApiProperty({
    description: 'The specific address of the vault (e.g., for Morpho)',
    required: false,
  })
  @IsOptional()
  @IsString()
  vaultAddress?: string; // Re-added specific vault address

  @ApiProperty({
    description: "Link to the protocol's app page for this asset",
    required: false,
  })
  @IsOptional()
  @IsString()
  protocolUrl?: string; // Optional deep link
}

export class YieldResponseDto {
  @ApiProperty({ type: [YieldOpportunityDto] })
  @IsArray()
  opportunities: YieldOpportunityDto[];
}
