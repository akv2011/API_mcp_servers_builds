# Model Context Protocol (MCP) Documentation

## Overview

The Model Context Protocol (MCP) provides a unified API for interacting with various DeFi protocols across multiple blockchains. This documentation will help you integrate with our MCP server to access DeFi functionality through a standardized interface.

## Getting Started

### API Access

To access the MCP API, you will need:
- An API key (contact the Matrix team to obtain one)
- The MCP server endpoint URL

### Client Installation

```bash
# Using npm
npm install @rekog/mcp-client

# Using yarn
yarn add @rekog/mcp-client

# Using pnpm
pnpm add @rekog/mcp-client
```

### Basic Usage

```typescript
import { McpClient } from '@rekog/mcp-client';

// Initialize the client
const mcpClient = new McpClient({
  url: 'https://api.matrix.example/mcp',
  apiKey: 'your-api-key',
});

// Call a tool
const result = await mcpClient.call('get_token_info', {
  query: 'ETH',
});

// Parse the response
const data = JSON.parse(result.content[0].text);
console.log(data);
```

## Available Tools

### Positions

#### get_lending_positions

Get user lending positions across all supported protocols and chains.

```typescript
// Example
const positions = await mcpClient.call('get_lending_positions', {
  address: '0x1234...', // Required: User's Ethereum address
  protocol: 'aave',     // Optional: Filter by protocol
  chain: 'mainnet'      // Optional: Filter by chain
});

const data = JSON.parse(positions.content[0].text);
```

Response contains:
- Supply and borrow positions
- Health factors
- APY rates
- Asset values

#### get_hyperliquid_positions

Get perpetual trading positions on Hyperliquid.

```typescript
const positions = await mcpClient.call('get_hyperliquid_positions', {
  address: '0x1234...' // Required: User's Ethereum address
});

const data = JSON.parse(positions.content[0].text);
```

### Markets

#### get_lending_markets

Get lending market information with optional filtering.

```typescript
const markets = await mcpClient.call('get_lending_markets', {
  chain: 'mainnet',               // Optional: Filter by chain
  protocol: 'aave',               // Optional: Filter by protocol
  collateralTokenSymbol: 'ETH',   // Optional: Filter by collateral token
  borrowTokenSymbol: 'USDC'       // Optional: Filter by borrow token
});

const data = JSON.parse(markets.content[0].text);
```

### AAVE Operations

#### aave_supply

Supply assets to Aave protocol.

```typescript
const result = await mcpClient.call('aave_supply', {
  chain: 'mainnet',         // Required: Chain to interact with
  asset: 'ETH',             // Required: Asset symbol to supply
  amount: 1.0,              // Required: Amount to supply
  on_behalf_of: '0x1234...' // Required: Address to supply on behalf of
});

const data = JSON.parse(result.content[0].text);
```

#### aave_withdraw

Withdraw assets from Aave protocol.

```typescript
const result = await mcpClient.call('aave_withdraw', {
  chain: 'mainnet',         // Required: Chain to interact with
  asset: 'ETH',             // Required: Asset symbol to withdraw
  amount: 1.0,              // Required: Amount to withdraw
  on_behalf_of: '0x1234...' // Required: Address to withdraw on behalf of
});

const data = JSON.parse(result.content[0].text);
```

#### aave_borrow

Borrow assets from Aave protocol.

```typescript
const result = await mcpClient.call('aave_borrow', {
  chain: 'mainnet',         // Required: Chain to interact with
  asset: 'USDC',            // Required: Asset symbol to borrow
  amount: 1000,             // Required: Amount to borrow
  on_behalf_of: '0x1234...' // Required: Address to borrow on behalf of
});

const data = JSON.parse(result.content[0].text);
```

#### aave_repay

Repay borrowed assets to Aave protocol.

```typescript
const result = await mcpClient.call('aave_repay', {
  chain: 'mainnet',         // Required: Chain to interact with
  asset: 'USDC',            // Required: Asset symbol to repay
  amount: 1000,             // Required: Amount to repay
  on_behalf_of: '0x1234...' // Required: Address to repay on behalf of
});

const data = JSON.parse(result.content[0].text);
```

### Morpho Operations

#### morpho_borrow

Borrow assets from Morpho protocol with leverage.

```typescript
const result = await mcpClient.call('morpho_borrow', {
  chain: 'mainnet',          // Required: Chain to interact with
  supply_asset: 'ETH',       // Required: Asset to supply as collateral
  supply_amount: 1.0,        // Required: Amount of collateral to supply
  borrow_asset: 'USDC',      // Required: Asset to borrow
  borrow_amount: 1000,       // Required: Amount to borrow
  user_address: '0x1234...'  // Required: Address to borrow on behalf of
});

const data = JSON.parse(result.content[0].text);
```

#### morpho_vault_deposit

Deposit assets into a Morpho Earn vault to earn yield.

```typescript
const result = await mcpClient.call('morpho_vault_deposit', {
  chain: 'mainnet',             // Required: Chain to interact with ('mainnet' or 'base')
  asset_symbol: 'USDC',         // Required: Asset symbol to deposit
  amount: 1000,                 // Required: Amount to deposit
  user_address: '0x1234...',    // Required: Address to deposit on behalf of
  vault_identifier: 'Aave'      // Optional: Vault name or address (if omitted, a default vault for the asset will be used)
});

const data = JSON.parse(result.content[0].text);
```

Response includes:
- Transaction data for the deposit
- Any required approval transactions
- Simulation details showing expected outcome
- Vault information including APY and curator details

#### morpho_vault_withdraw

Withdraw assets from a Morpho Earn vault.

```typescript
const result = await mcpClient.call('morpho_vault_withdraw', {
  chain: 'mainnet',             // Required: Chain to interact with ('mainnet' or 'base')
  asset_symbol: 'USDC',         // Required: Asset symbol to withdraw
  amount: 500,                  // Required: Amount of shares to withdraw (use -1 for max)
  user_address: '0x1234...',    // Required: Address to withdraw on behalf of
  vault_identifier: 'Aave'      // Optional: Vault name or address (if omitted, will try to find a vault where user has deposits)
});

const data = JSON.parse(result.content[0].text);
```

Response includes:
- Transaction data for the withdrawal
- Simulation details showing expected outcome
- Information about the withdrawn amount and associated vault

### Yield Opportunities

#### get_yield_opportunities

Get aggregated yield opportunities across multiple protocols, sorted by APY.

```typescript
const result = await mcpClient.call('get_yield_opportunities', {
  chain: 'mainnet',          // Optional: Filter by chain (e.g., 'mainnet', 'base')
  asset: 'USDC',             // Optional: Filter by asset symbol
  protocol: 'morpho',        // Optional: Filter by protocol ('aave' or 'morpho')
  min_apy: 3.5,              // Optional: Minimum APY percentage
  limit: 10                  // Optional: Limit number of results (omit to get all)
});

const data = JSON.parse(result.content[0].text);
```

Response format:
```json
{
  "opportunities": [
    {
      "protocol": "morpho",
      "chain": "mainnet",
      "assetSymbol": "USDC",
      "assetAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "apy": "4.82",
      "baseApy": "4.12",
      "tvlUsd": "15230450.25",
      "availableLiquidityUsd": "1250000.00",
      "totalDepositsUnits": "15236428.12",
      "name": "USDC Vault (Morpho Labs)",
      "yieldType": "Vault Deposit",
      "rewards": [
        {
          "apy": "0.70", 
          "symbol": "MORPHO", 
          "address": "0x9994e35db50125e0df82e4c2dde62496ce330999"
        }
      ],
      "vaultAddress": "0x37f4a4c22784a83c6c9822cc4d53a5c762e1aff5"
    },
    {
      "protocol": "aave",
      "chain": "mainnet",
      "assetSymbol": "USDC",
      "assetAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "apy": "3.95",
      "tvlUsd": "182650300.75",
      "name": "USDC",
      "yieldType": "Supply"
    }
    // Additional opportunities...
  ]
}
```

The response provides a comprehensive view of yield opportunities with:
- Base APY (yield from lending/supplying)
- Additional rewards and incentives (if any)
- TVL and available liquidity information
- Protocol-specific details like vault addresses for Morpho

### Token Information

#### get_token_info

Get detailed information about a token by name or symbol.

```typescript
const tokenInfo = await mcpClient.call('get_token_info', {
  query: 'ETH' // Required: Token symbol or name to search for
});

const data = JSON.parse(tokenInfo.content[0].text);
```

## Error Handling

All MCP tools follow a standardized error format:

```typescript
try {
  const result = await mcpClient.call('get_token_info', { query: 'INVALID' });
  
  // Check if the response contains an error
  const content = result.content[0];
  if (content.isError) {
    console.error('Error:', content.text);
    return;
  }
  
  // Process successful response
  const data = JSON.parse(content.text);
  console.log('Success:', data);
} catch (error) {
  console.error('Network error:', error);
}
```

## Best Practices

### Authentication

Store your API key securely:
- For server-side applications, use environment variables
- For client-side applications, use a backend proxy

```typescript
// Using environment variables
const mcpClient = new McpClient({
  url: process.env.MCP_URL,
  apiKey: process.env.MCP_API_KEY,
});
```

### Rate Limiting

The MCP server implements rate limiting. Handle rate limit errors gracefully:

```typescript
try {
  const result = await mcpClient.call('get_token_info', { query: 'ETH' });
  // Process result
} catch (error) {
  if (error.response?.status === 429) {
    // Rate limit exceeded
    const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
    console.log(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
  } else {
    console.error('Request failed:', error);
  }
}
```

### Caching

For better performance, implement caching for read-only operations:

```typescript
// Simple in-memory cache example
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute in milliseconds

async function getTokenInfo(symbol) {
  const cacheKey = `token_${symbol}`;
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
    return cached.data;
  }
  
  // Call MCP
  const result = await mcpClient.call('get_token_info', { query: symbol });
  
  // Parse and cache result
  const data = JSON.parse(result.content[0].text);
  cache.set(cacheKey, { data, timestamp: Date.now() });
  
  return data;
}
```

### Connection Reuse

Create a single client instance and reuse it for multiple calls:

```typescript
// Good practice
const mcpClient = new McpClient({
  url: 'https://api.matrix.example/mcp',
  apiKey: 'your-api-key',
});

async function getTokenInfo(symbol) {
  return mcpClient.call('get_token_info', { query: symbol });
}

async function getUserPositions(address) {
  return mcpClient.call('get_lending_positions', { address });
}
```

## Real-World Integration Examples

### React Application Example

```tsx
import React, { useEffect, useState } from 'react';
import { McpClient } from '@rekog/mcp-client';

// Create client (ideally in a separate service/context)
const client = new McpClient({
  url: process.env.REACT_APP_MCP_URL,
  apiKey: process.env.REACT_APP_MCP_API_KEY,
});

function PositionsComponent({ address }) {
  const [positions, setPositions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPositions() {
      try {
        setLoading(true);
        const result = await client.call('get_lending_positions', { address });
        
        const content = result.content[0];
        if (content.isError) {
          setError(content.text);
          return;
        }
        
        setPositions(JSON.parse(content.text));
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      fetchPositions();
    }
  }, [address]);

  if (loading) return <div>Loading positions...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!positions) return <div>No positions found</div>;

  return (
    <div>
      <h2>Your Positions</h2>
      {/* Display positions data */}
    </div>
  );
}
```

### Express Backend Example

```typescript
import express from 'express';
import { McpClient } from '@rekog/mcp-client';

const app = express();
const client = new McpClient({
  url: process.env.MCP_URL,
  apiKey: process.env.MCP_API_KEY,
});

// API endpoint to get markets
app.get('/api/markets', async (req, res) => {
  try {
    const { chain, protocol, asset } = req.query;
    
    const result = await client.call('get_lending_markets', {
      chain: chain as string,
      protocol: protocol as string,
      collateralTokenSymbol: asset as string,
    });
    
    const content = result.content[0];
    if (content.isError) {
      return res.status(400).json({ error: content.text });
    }
    
    return res.json(JSON.parse(content.text));
  } catch (error) {
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Support

If you encounter any issues or have questions about integrating with the MCP server, please contact our support team at support@.

## Supported Chains

The MCP supports the following chains:
- Ethereum Mainnet (`mainnet`)
- Arbitrum (`arbitrum`)
- Optimism (`optimism`)
- Base (`base`)
- Sonic (`sonic`)

## Supported Protocols

The MCP supports the following protocols:
- Aave
- Morpho
- Hyperliquid (for perpetual trading) 

## Implementation Details & Security

### Protocol Integration Architecture

Our Model Context Protocol (MCP) serves as a middleware layer between your application and blockchain protocols, without taking custody of user funds at any point. Here's how we've implemented integrations with Aave and Morpho:

#### Aave Integration

We've integrated with Aave v3 using their official SDK, providing:

- **Working Features**:
  - Supply/withdraw assets on all supported chains
  - Borrow/repay functionality with variable rates
  - Real-time market information including APYs, TVL, and available liquidity
  - Full position tracking including health factors and liquidation thresholds

- **Implementation Method**:
  - Direct integration with Aave's smart contracts
  - Transaction construction using the Aave SDK 
  - Health factor calculations and risk assessment

#### Morpho Integration

Morpho integration is more complex due to its unique optimized lending markets:

- **Working Features**:
  - Morpho Blue borrowing with collateral
  - Morpho Earn vault deposits and withdrawals
  - Market discovery across supported chains
  - Yield opportunities aggregation

- **Implementation Method**: 
  - Integration with Morpho's GraphQL API for market data
  - Direct interaction with Morpho Blue smart contracts for transactions
  - Vault whitelist management and metadata enrichment

### Non-Custodial Architecture

Our MCP implementation is fully non-custodial, meaning:

1. **Transaction Signing**: MCP never requests or handles private keys. All transactions are returned unsigned to your application for signing by the end user.

2. **Transaction Flow**:
   - MCP constructs the transaction data (including to, data, value fields)
   - Your application receives this data and presents it to the user
   - The user signs the transaction with their own wallet
   - The signed transaction is broadcast to the blockchain

3. **Approval Handling**: For token approvals (required before most DeFi actions), MCP returns separate approval transactions when needed, clearly marked for user consent.

4. **No Backend Wallets**: Unlike centralized services, our implementation never uses backend wallets that could potentially access user funds.

### Security Measures

We've implemented several security measures to ensure safe interactions:

1. **Transaction Simulation**: Before returning transaction data, operations are simulated to detect potential failures or unexpected behavior.

2. **Parameter Validation**: All input parameters are strictly validated to prevent injection attacks or malformed transactions.

3. **Asset Verification**: Token addresses are verified against trusted sources to prevent interactions with potentially malicious contracts.

4. **Health Factor Warnings**: For lending operations, clear warnings are provided if actions would result in dangerous health factors.

5. **Rate Limiting**: API endpoints implement rate limiting to prevent abuse.

6. **No Hidden Operations**: All transaction data is transparent and can be decoded/verified before signing.

### Current Limitations

While our implementation is comprehensive, users should be aware of these limitations:

1. **Partial Protocol Coverage**: Not all features of each protocol are exposed (e.g., fixed-rate borrowing on Aave is not yet supported).

2. **Chain Limitations**: Some operations are chain-specific due to protocol deployment differences.

3. **Gas Estimation**: Gas estimations are provided but may need adjustment depending on network conditions.

4. **Advanced Features**: Complex operations like flash loans or automated leverage strategies are not currently exposed through the API.

### Implementation Best Practices

For secure integration with our MCP:

1. **Always Decode Transactions**: Decode and display transaction details to users before requesting signatures.

2. **Implement Timeouts**: Set reasonable timeouts for API calls to handle potential delays.

3. **Verify Results**: After transactions are submitted, verify the results on-chain rather than assuming success.

4. **Handle Edge Cases**: Implement proper error handling for scenarios like insufficient funds, slippage, or failed transactions.

5. **Simulate First**: Use simulation endpoints when available to preview transaction outcomes before signing. 