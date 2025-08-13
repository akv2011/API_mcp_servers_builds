import { Module } from '@nestjs/common';
import { AaveService } from './aave.service';
import { AaveController } from './aave.controller';
import { TokenService } from './services/token.service';
import { AaveTool } from './aave.tool';
import { PriceModule } from '../price';
import { ChainModule } from '../chain';
import { TokenModule } from '../token';
import { DatabaseModule } from '../database';

@Module({
  imports: [DatabaseModule, PriceModule, ChainModule, TokenModule],
  controllers: [AaveController],
  providers: [AaveService, TokenService, AaveTool],
  exports: [AaveService],
})
export class AaveModule {}
