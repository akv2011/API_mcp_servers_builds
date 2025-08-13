// External dependencies
import { Controller, Post, Body, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

// Services
import { MorphoService } from './morpho.service';
import {
  MorphoBorrowDto,
  MorphoBorrowResponseDto,
} from './dto/morpho-operation.dto';
import {
  MorphoEarnDepositDto,
  MorphoEarnWithdrawDto,
  MorphoEarnOperationResponseDto,
} from './dto/morpho-earn.dto';
import { SupportedChain, SUPPORTED_CHAINS } from '../common/types/chain.type';

@ApiTags('morpho')
@Controller('beta/v0/morpho')
export class MorphoController {
  constructor(private readonly morphoService: MorphoService) {}

  @Post('borrow')
  @ApiOperation({
    summary:
      'Perform a bundled supply collateral and borrow operation on Morpho Blue',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction data for the Morpho Blue bundled operation',
    type: MorphoBorrowResponseDto,
  })
  async borrow(
    @Body() borrowData: MorphoBorrowDto,
  ): Promise<MorphoBorrowResponseDto> {
    const chain = borrowData.call_data.chain;
    return this.morphoService.borrow(chain as SupportedChain, borrowData);
  }

  @Post('earn/deposit/:chain')
  @ApiOperation({ summary: 'Deposit assets into a Morpho Earn Vault' })
  @ApiParam({
    name: 'chain',
    enum: SUPPORTED_CHAINS,
    description: 'The blockchain network',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction data for the deposit operation',
    type: MorphoEarnOperationResponseDto,
  })
  async depositToEarnVault(
    @Param('chain', new ParseEnumPipe(SUPPORTED_CHAINS)) chain: SupportedChain,
    @Body() depositDto: MorphoEarnDepositDto,
  ): Promise<MorphoEarnOperationResponseDto> {
    return this.morphoService.depositToEarnVault(chain, depositDto);
  }

  @Post('earn/withdraw/:chain')
  @ApiOperation({ summary: 'Withdraw assets from a Morpho Earn Vault' })
  @ApiParam({
    name: 'chain',
    enum: SUPPORTED_CHAINS,
    description: 'The blockchain network',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction data for the withdrawal operation',
    type: MorphoEarnOperationResponseDto,
  })
  async withdrawFromEarnVault(
    @Param('chain', new ParseEnumPipe(SUPPORTED_CHAINS)) chain: SupportedChain,
    @Body() withdrawDto: MorphoEarnWithdrawDto,
  ): Promise<MorphoEarnOperationResponseDto> {
    return this.morphoService.withdrawFromEarnVault(chain, withdrawDto);
  }
}
