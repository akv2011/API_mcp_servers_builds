# DeFi MCP server

A NestJS service that exposes DeFi data and transaction builders as MCP tools: Aave V3, Morpho, Hyperliquid, token data, lending markets, positions and yields across Ethereum mainnet, Base, Arbitrum, Optimism, Sonic and Mode. The same service also serves a REST API with Swagger docs.

Every tool is read-only. The `generate_*` tools return unsigned transaction data for the user's wallet to sign; the server never holds a private key and never sends a transaction.

## Tools

| Tool | What it returns |
|---|---|
| `get_lending_positions` | A wallet's lending positions across supported protocols and chains |
| `get_lending_markets` | Lending markets, filterable by chain, protocol and asset, with sorting |
| `get_yield_opportunities` | Yield opportunities filtered by asset, chain and protocol |
| `get_hyperliquid_positions`, `get_hyperliquid_open_orders` | A Hyperliquid account's positions and open orders |
| `get_token_info`, `get_token_balances`, `get_wallet_balance` | Token metadata and prices, and wallet balances |
| `generate_aave_supply_tx`, `_withdraw_tx`, `_borrow_tx`, `_repay_tx` | Unsigned Aave V3 transactions |
| `generate_morpho_borrow_tx`, `_vault_deposit_tx`, `_vault_withdraw_tx` | Unsigned Morpho transactions |
| `generate_token_approval_tx` | An unsigned ERC-20 approval with gas limit and EIP-1559 fees |

`mcp-client-documentation.md` has every tool's parameters, generated from the server's own `tools/list`.

## Security

| Concern | How it is handled |
|---|---|
| Who can call | Every route, including `/mcp` and `/sse`, needs an API key: `Authorization: Bearer <key>` (preferred), `x-api-key`, or `?api_key=` for clients that cannot set headers |
| Key checks | Hosted keys are looked up in the `api_keys` table; a single local `MCP_API_KEY` is compared in constant time |
| Secrets in logs and errors | Supabase keys, provider RPC URLs and query-string API keys are never written to logs; a query-string key is moved into a header before any handler or library sees the URL. viem copies the full RPC URL, provider key included, into its errors, so every RPC client uses a transport that cuts URLs in errors down to their origin before a tool or the logger sees them |
| Funds | No tool signs or sends; all 16 tools carry `readOnlyHint: true` |
| Failures | Failed tool calls set `isError: true` on the result, so a model can tell an error from data |

## Run locally

```sh
pnpm install
cp .env.example .env    # set MCP_API_KEY and the RPC URLs for the chains you use
pnpm build && node dist/main
```

| Variable | Meaning |
|---|---|
| `MCP_API_KEY` | Single API key for local use, when the hosted key store is not configured |
| `<CHAIN>_RPC_URL` | RPC endpoint per chain, for example `MAINNET_RPC_URL`, `BASE_RPC_URL`, `MAINNET_ETHERFI_RPC_URL`. Without one, the chain's public default is used, which can be slow or rate-limited |
| `SUPABASE_URL`, `SUPABASE_KEY` | Asset master data, needed by the Aave tools |
| `UPLINK_SUPABASE_URL`, `UPLINK_SUPABASE_SERVICE_ROLE_KEY` | Hosted API key store |
| `PORT` | Defaults to 3000 |

On startup the service fills a token cache from a public token list. Until it finishes, usually under a minute, token lookups can wait on it.

## Connect an MCP client

The server speaks MCP over Streamable HTTP at `/mcp` (legacy SSE at `/sse`). Replace the URL and key with yours.

Claude Code:

```sh
claude mcp add --transport http defi-mcp http://localhost:3000/mcp -H "Authorization: Bearer $MCP_API_KEY"
```

Codex CLI (reads the key from an environment variable):

```sh
codex mcp add defi-mcp --url http://localhost:3000/mcp --bearer-token-env-var MCP_API_KEY
```

Gemini CLI:

```sh
gemini mcp add -s user -t http -H "Authorization: Bearer $MCP_API_KEY" defi-mcp http://localhost:3000/mcp
```

Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "defi-mcp": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer your_key" }
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "inputs": [{ "type": "promptString", "id": "defi-key", "description": "DeFi MCP API key", "password": true }],
  "servers": {
    "defi-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${input:defi-key}" }
    }
  }
}
```

MCP Inspector:

```sh
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --transport http --header "Authorization: Bearer $MCP_API_KEY" --method tools/list
```

From code, see the TypeScript SDK example at the top of `mcp-client-documentation.md`.

Checked on 2026-10-08: Claude Code 2.1.294 connects; MCP Inspector lists all 16 tools and runs live calls (Hyperliquid positions, a mainnet USDC approval priced at 0.71 gwei with a 56,361 gas limit); the TypeScript SDK client example connects and calls a tool; Codex CLI 0.156.1 and Gemini CLI 0.63.0 accept the config. Requests without a key, or with a wrong one, get 401.

## Known limits

- It runs on `@rekog/mcp-nest` 1.6, which negotiates MCP 2025-06-18. mcp-nest 2.x targets the current spec but replaces `McpModule` with a microservice transport strategy, so moving to it means porting each tool class to `@McpController`.
- Hosted API keys are stored and compared in plaintext. Storing a SHA-256 of each key instead needs a migration of the `api_keys` table.

## License

MIT, see `LICENSE`.
