import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseRequestDto } from '../../common/dto/base-request.dto';
import { Address } from 'viem';
import { SupportedChain, SUPPORTED_CHAINS } from '../../chain';

export class SimpleMorphoTokenOperationDto {
  @ApiProperty({
    description: 'Token symbol',
    example: 'WETH',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'Token amount',
    example: '0.0003880',
  })
  @IsString()
  amount: string;
}

export class SimpleMorphoBorrowCallDataDto {
  @ApiProperty({
    description: 'Chain to execute the operation on',
    enum: SUPPORTED_CHAINS,
    example: 'base',
  })
  @IsEnum(SUPPORTED_CHAINS)
  chain: SupportedChain;

  @ApiProperty({
    description: 'Collateral token details',
    type: SimpleMorphoTokenOperationDto,
  })
  @Type(() => SimpleMorphoTokenOperationDto)
  collateral: SimpleMorphoTokenOperationDto;

  @ApiProperty({
    description: 'Borrow token details',
    type: SimpleMorphoTokenOperationDto,
  })
  @Type(() => SimpleMorphoTokenOperationDto)
  borrow: SimpleMorphoTokenOperationDto;
}

export class MorphoBorrowDto extends BaseRequestDto {
  @ApiProperty({
    description: 'Operation data',
    type: SimpleMorphoBorrowCallDataDto,
  })
  @Type(() => SimpleMorphoBorrowCallDataDto)
  call_data: SimpleMorphoBorrowCallDataDto;
}

export interface MorphoBorrowParams {
  chain: SupportedChain;
  marketId: string;
  collateralToken: {
    symbol: string;
    address: Address;
    amount: string;
    decimals: number;
  };
  borrowToken: {
    symbol: string;
    address: Address;
    amount: string;
    decimals: number;
  };
  userAddress: Address;
  receiver?: Address;
}

export class MorphoBorrowResponseDto {
  @ApiProperty({
    description: 'Transaction data',
    example: {
      to: '0x1234567890123456789012345678901234567890',
      data: '0xac9650d8000',
      value: '0',
    },
  })
  transactionData: {
    to: string;
    data: string;
    value: string;
  };

  @ApiProperty({
    description:
      'Approval transactions that must be executed before the main transaction',
    example: [
      {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xac9650d8000',
        value: '0',
        description: 'Approve WETH',
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

  @ApiProperty({
    description: 'Simulation details',
    example: {
      market:
        '0x422e67893a633fa455e7d82d93ca917e5dbb6afeea913966182d3a6e768d6581',
      collateral: {
        token: 'WETH',
        address: '0x4200000000000000000000000000000000000006',
        amount: '0.0003880',
        decimals: 18,
      },
      borrow: {
        token: 'USDT',
        address: '0xdA',
        amount: '0.063912',
        decimals: 6,
      },
      operations: [
        {
          type: 'Supply Collateral',
          token: 'WETH',
        },
        {
          type: 'Borrow',
          token: 'USDT',
        },
      ],
      message:
        'This bundled transaction will first supply collateral, then borrow in one atomic transaction',
    },
  })
  simulation: {
    market: string;
    collateral: {
      token: string;
      address: string;
      amount: string;
      decimals: number;
    };
    borrow: {
      token: string;
      address: string;
      amount: string;
      decimals: number;
    };
    operations: Array<{
      type: string;
      token: string;
    }>;
    message: string;
  };

  @ApiProperty({
    description: 'Numeric chain ID of the target blockchain',
    example: 8453, // Base chain
  })
  chainId: number;
}
