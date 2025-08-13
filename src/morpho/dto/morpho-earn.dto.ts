import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumberString,
  IsEthereumAddress,
  IsOptional,
} from 'class-validator';
import { Address } from 'viem';
import { Type } from 'class-transformer';

export class MorphoEarnOperationBaseDto {
  @ApiPropertyOptional({
    description:
      'Optional: The vault address (0x...) or a query string to match against vault names/descriptions.',
    example: '0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 OR Steakhouse USDC',
  })
  @IsOptional()
  @IsString()
  vaultIdentifier?: string;

  @ApiProperty({
    description:
      "The symbol of the underlying asset for the vault (e.g., 'WETH', 'USDC').",
    example: 'WETH',
  })
  @IsNotEmpty()
  @IsString()
  assetSymbol: string;

  @ApiProperty({
    description:
      'The amount of the asset (for deposit) or shares (for withdraw) as a string.',
    example: '10.5',
  })
  @IsNotEmpty()
  @IsNumberString()
  amount: string;

  @ApiProperty({
    description: 'The blockchain address of the user performing the operation.',
    example: '0x123...abc',
  })
  @IsNotEmpty()
  @IsEthereumAddress()
  userAddress: Address;
}

export class MorphoEarnDepositDto extends MorphoEarnOperationBaseDto {}

export class MorphoEarnWithdrawDto extends MorphoEarnOperationBaseDto {}

class MorphoEarnAssetDetailsDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEthereumAddress()
  address: string;

  @IsNotEmpty()
  amount: string; // Keep amount as string for precision

  @IsNotEmpty()
  decimals: number;
}

class MorphoEarnSimulationDto {
  @IsEthereumAddress()
  vault: string;

  @Type(() => MorphoEarnAssetDetailsDto)
  asset: MorphoEarnAssetDetailsDto;

  @IsString()
  @IsNotEmpty()
  operationType: 'Deposit' | 'Withdraw';

  @IsString()
  @IsNotEmpty()
  message: string;

  // --> Add new optional fields
  @IsOptional()
  @IsString()
  walletBalance?: string; // User's balance of the asset in their wallet

  @IsOptional()
  @IsString()
  vaultPosition?: string; // User's current deposit amount in the vault (in underlying asset)

  // --> Add the new APY/Earnings fields here
  @ApiPropertyOptional({
    description: 'Current estimated APY of the vault in percent',
    type: 'number',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number) // Ensure proper transformation for validation if needed
  apyPercent?: number | null;

  @ApiPropertyOptional({
    description:
      'Projected earnings for the next month based on current APY and deposit/position amount',
    type: 'string',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  projectedMonthlyEarnings?: string | null;

  @ApiPropertyOptional({
    description:
      'Projected earnings for the next year based on current APY and deposit/position amount',
    type: 'string',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  projectedYearlyEarnings?: string | null;

  // --> Add Vault Name/Symbol/Curator <--
  @ApiPropertyOptional({
    description: 'The name of the Morpho Earn vault',
    type: 'string',
    nullable: true,
    example: 'Steakhouse Financial USDC Vault',
  })
  @IsOptional()
  @IsString()
  vaultName?: string | null;

  @ApiPropertyOptional({
    description: 'The symbol of the Morpho Earn vault',
    type: 'string',
    nullable: true,
    example: 'sUSDCv3',
  })
  @IsOptional()
  @IsString()
  vaultSymbol?: string | null;

  @ApiPropertyOptional({
    description: 'The name of the curator managing the vault strategy',
    type: 'string',
    nullable: true,
    example: 'Steakhouse Financial',
  })
  @IsOptional()
  @IsString()
  curatorName?: string | null;
}

export class MorphoEarnOperationResponseDto {
  @ApiProperty({
    description: 'Transaction data required to execute the operation.',
  })
  transactionData: {
    to: string;
    data: string;
    value: string;
  };

  @ApiProperty({ description: 'Details about the simulated operation.' })
  @Type(() => MorphoEarnSimulationDto)
  simulation: MorphoEarnSimulationDto;

  @ApiProperty({
    description: 'Numeric chain ID of the target blockchain',
    example: 8453, // Base chain
  })
  chainId: number;

  @ApiProperty({
    description:
      'Approval transactions that must be executed before the main transaction',
    example: [
      {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xac9650d8000',
        value: '0',
        description: 'token_approval',
      },
    ],
    required: false,
  })
  approvalTransactions?: Array<{
    to: string;
    data: string;
    value: string;
    description: string;
  }>;
}
