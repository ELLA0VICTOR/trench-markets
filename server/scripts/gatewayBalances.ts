import { GatewayClient } from '@circle-fin/x402-batching/client'
import type { Hex } from 'viem'
import { arcRpcUrl } from '../chain/arc.js'
import { loadLocalEnv } from '../lib/env.js'

loadLocalEnv()

const privateKey = process.env.CIRCLE_BUYER_PRIVATE_KEY as Hex | undefined

if (!privateKey) {
  throw new Error('Set CIRCLE_BUYER_PRIVATE_KEY before checking Gateway balances.')
}

const client = new GatewayClient({
  chain: 'arcTestnet',
  privateKey,
  rpcUrl: arcRpcUrl(),
})
const balances = await client.getBalances()

console.log(
  JSON.stringify(
    {
      address: client.address,
      chain: client.chainName,
      walletUsdc: balances.wallet.formatted,
      gatewayTotal: balances.gateway.formattedTotal,
      gatewayAvailable: balances.gateway.formattedAvailable,
      gatewayWithdrawing: balances.gateway.formattedWithdrawing,
    },
    null,
    2,
  ),
)
