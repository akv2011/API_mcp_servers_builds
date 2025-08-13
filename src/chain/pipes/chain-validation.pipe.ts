import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { SupportedChain, SUPPORTED_CHAINS } from '../types/chain.type';

@Injectable()
export class ChainValidationPipe implements PipeTransform {
  transform(value: any) {
    if (!value) {
      throw new BadRequestException('Chain parameter is required');
    }

    if (!SUPPORTED_CHAINS.includes(value as SupportedChain)) {
      throw new BadRequestException(`Invalid chain: ${value}`);
    }

    return value as SupportedChain;
  }
}
