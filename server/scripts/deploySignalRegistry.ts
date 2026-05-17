import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcRpcUrl, arcTestnet } from '../chain/arc.js'
import { compileSignalRegistry } from '../contracts/compileSignalRegistry.js'
import { loadLocalEnv } from '../lib/env.js'

async function main() {
  loadLocalEnv()
  const contract = compileSignalRegistry()

  const privateKey = (process.env.ARC_DEPLOYER_PRIVATE_KEY ||
    process.env.ARC_WRITER_PRIVATE_KEY) as Hex | undefined

  if (!privateKey) {
    throw new Error('Set ARC_DEPLOYER_PRIVATE_KEY or ARC_WRITER_PRIVATE_KEY before deploying.')
  }

  const account = privateKeyToAccount(privateKey)
  const transport = http(arcRpcUrl(), {
    retryCount: 3,
    retryDelay: 1_500,
    timeout: 60_000,
  })
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport,
  })
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  })
  const hash = await walletClient.deployContract({
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  if (!receipt.contractAddress) {
    throw new Error('Deployment receipt did not include a contract address.')
  }

  console.log(
    JSON.stringify(
      {
        contract: 'SignalRegistry',
        address: receipt.contractAddress,
        transactionHash: receipt.transactionHash,
        chainId: arcTestnet.id,
        rpcUrl: arcRpcUrl().includes('token=') ? 'configured-token-rpc' : arcRpcUrl(),
        nextEnv: {
          SIGNAL_REGISTRY_ADDRESS: receipt.contractAddress,
          ARC_WRITER_PRIVATE_KEY: 'reuse deployer key or set a separate writer key',
        },
      },
      null,
      2,
    ),
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Deploy failed.'
  console.error(message)
  process.exit(1)
})
