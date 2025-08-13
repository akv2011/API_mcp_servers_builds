import { Module } from '@nestjs/common';
import { YieldService } from './yield.service';
import { YieldController } from './yield.controller';
import { AaveModule } from '../aave/aave.module';
import { MorphoModule } from '../morpho/morpho.module';
import { YieldTool } from './tools/yield.tool';

@Module({
  imports: [AaveModule, MorphoModule],
  controllers: [YieldController],
  providers: [YieldService, YieldTool],
})
export class YieldModule {}
