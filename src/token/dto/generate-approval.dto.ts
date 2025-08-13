import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumberString,
  Matches,
} from 'class-validator';
import { SupportedChain, SUPPORTED_CHAINS } from '../../chain/types/chain.type';
import { Address } from 'viem';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export class GenerateApprovalDto {
  @ApiProperty({
    description: 'The chain where the token exists',
    enum: SUPPORTED_CHAINS,
    example: 'optimism',
  })
  @IsEnum(SUPPORTED_CHAINS)
  @IsNotEmpty()
  chain: SupportedChain;

  @ApiProperty({
    description: 'The address of the token owner initiating the approval',
    example: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(ADDRESS_REGEX, {
    message: 'owner must be a valid Ethereum address',
  })
  owner: Address;

  @ApiProperty({
    description: 'The symbol or contract address of the token to approve',
    example: 'USDC',
  })
  @IsString()
  @IsNotEmpty()
  tokenIdentifier: string;

  @ApiProperty({
    description:
      'The address of the contract/wallet to grant approval to (the spender)',
    example: '0x1111111111111111111111111111111111111111',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(ADDRESS_REGEX, {
    message: 'spender must be a valid Ethereum address',
  })
  spender: Address;

  @ApiProperty({
    description:
      "The human-readable amount of the token to approve (e.g., '100.5')",
    example: '100.5',
  })
  @IsNumberString(
    {},
    { message: 'amount must be a string representing a number' },
  )
  @IsNotEmpty()
  amount: string;
}
