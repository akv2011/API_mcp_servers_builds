import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MorphoController } from './morpho.controller';
import { MorphoService } from './morpho.service';
import { MorphoGraphQLService } from './services/graphql.service';
import { MorphoTool } from './morpho.tool';
@Module({
  imports: [ConfigModule],
  controllers: [MorphoController],
  providers: [MorphoService, MorphoGraphQLService, MorphoTool],
  exports: [MorphoService],
})
export class MorphoModule {}
