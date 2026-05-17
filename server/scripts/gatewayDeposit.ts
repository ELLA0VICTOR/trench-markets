import { GatewayClient } from '@circle-fin/x402-batching/client'
import type { Hex } from 'viem'
import { arcRpcUrl } from '../chain/arc.js'
import { loadLocalEnv } from '../lib/env.js'

loadLocalEnv()

const privateKey = process.env.CIRCLE_BUYER_PRIVATE_KEY as Hex | undefined
const amount = process.argv[2] || '1.00'

if (!privateKey) {
  throw new Error('Set CIRCLE_BUYER_PRIVATE_KEY before depositing into Gateway.')
}

const client = new GatewayClient({
  chain: 'arcTestnet',
  privateKey,
  rpcUrl: arcRpcUrl(),
})
const deposit = await client.deposit(amount)

console.log(
  JSON.stringify(
    {
      address: client.address,
      chain: client.chainName,
      amount: deposit.formattedAmount,
      approvalTxHash: deposit.approvalTxHash,
      depositTxHash: deposit.depositTxHash,
    },
    null,
    2,
  ),
)
