import { http, type Transport } from 'viem';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

export function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, (url) => {
    try {
      return new URL(url).origin;
    } catch {
      return '[url]';
    }
  });
}

function scrub(error: unknown): void {
  for (let e = error as any; e && typeof e === 'object'; e = e.cause) {
    if (typeof e.message === 'string') e.message = redactUrls(e.message);
    if (typeof e.details === 'string') e.details = redactUrls(e.details);
    if (typeof e.url === 'string') e.url = redactUrls(e.url);
    if (Array.isArray(e.metaMessages)) e.metaMessages = e.metaMessages.map((m: unknown) => (typeof m === 'string' ? redactUrls(m) : m));
  }
}

// RPC URLs usually carry the provider key in the path, and viem copies the full URL into its errors,
// which tools hand to MCP clients and the logger prints. Errors leave this transport with only the origin.
export function rpcTransport(url: string | undefined): Transport {
  const transport = http(url);
  return (params) => {
    const built = transport(params);
    const request = built.request;
    const guarded = (async (args: Parameters<typeof request>[0], options?: Parameters<typeof request>[1]) => {
      try {
        return await request(args, options);
      } catch (error) {
        scrub(error);
        throw error;
      }
    }) as typeof request;
    return { ...built, request: guarded };
  };
}
