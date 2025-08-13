// External dependencies
import { Module } from '@nestjs/common';

// Modules
import { MorphoModule } from '../morpho/morpho.module';
import { AaveModule } from '../aave/aave.module';
// Controllers and Services
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PositionsTool } from './tools/positions.tool';

@Module({
  imports: [MorphoModule, AaveModule],
  controllers: [PositionsController],
  providers: [PositionsService, PositionsTool],
})
export class PositionsModule {}
