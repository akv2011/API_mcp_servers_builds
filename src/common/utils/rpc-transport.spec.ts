import { createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { redactUrls, rpcTransport } from './rpc-transport';

describe('rpcTransport', () => {
  it('keeps the provider key in the RPC URL out of error messages', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: rpcTransport('http://127.0.0.1:1/v2/FAKEKEY123'),
    });
    const error: any = await client.getBlockNumber().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify({ message: error.message, details: error.details, meta: error.metaMessages })).not.toContain('FAKEKEY123');
    expect(error.message).toContain('http://127.0.0.1:1');
  });

  it('reduces any URL in text to its origin', () => {
    expect(redactUrls('failed at https://eth-mainnet.g.alchemy.com/v2/KEY?x=1 now')).toBe('failed at https://eth-mainnet.g.alchemy.com now');
  });
});
