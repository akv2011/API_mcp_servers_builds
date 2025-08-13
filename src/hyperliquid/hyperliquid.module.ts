import { Module } from '@nestjs/common';
import { HyperliquidController } from './hyperliquid.controller';
import { HyperliquidService } from './hyperliquid.service';
import { HyperliquidTool } from './tools/hyperliquid.tool';

@Module({
  controllers: [HyperliquidController],
  providers: [HyperliquidService, HyperliquidTool],
  // exports: [HyperliquidService] // Export if needed by other modules
})
export class HyperliquidModule {}
