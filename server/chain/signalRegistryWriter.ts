import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { clamp } from '../lib/math.js'
import type { AgentReport } from '../types.js'
import { arcRpcUrl, arcTestnet } from './arc.js'
import {
  configuredRegistryAddress,
  configuredWriterPrivateKey,
  isBytes32,
  signalCode,
  signalRegistryAbi,
} from '../contracts/signalRegistry.js'

export type ArcProofWrite = {
  proofId?: Hex
  txHash: Hex
  contractAddress: Hex
  blockNumber: string
}

export function arcWriterConfigured() {
  return Boolean(configuredRegistryAddress() && configuredWriterPrivateKey())
}

function bps(value: number) {
  return Math.round(clamp(value, 0, 1) * 10_000)
}

function int16(value: number) {
  return Math.max(-32_768, Math.min(32_767, value))
}

function artifactUri(report: AgentReport) {
  return `trench://reports/${encodeURIComponent(report.marketId)}/${report.reportHash}`
}

function extractProofId(receipt: TransactionReceipt) {
  const topic = receipt.logs[0]?.topics[1]
  return topic && isBytes32(topic) ? topic : undefined
}

export async function publishSignalToArc(report: AgentReport): Promise<ArcProofWrite> {
  const registryAddress = configuredRegistryAddress()
  const privateKey = configuredWriterPrivateKey()

  if (!registryAddress || !privateKey) {
    throw new Error('Arc writer is not configured.')
  }

  if (!isBytes32(report.reportHash)) {
    throw new Error('Report hash must be bytes32 before publishing to Arc.')
  }

  const account = privateKeyToAccount(privateKey)
  const transport = http(arcRpcUrl())
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport,
  })
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  })

  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: signalRegistryAbi,
    functionName: 'publishSignal',
    args: [
      report.reportHash,
      report.marketId,
      signalCode(report.signal),
      bps(report.marketPrice),
      bps(report.fairPrice),
      bps(report.confidence),
      int16(report.edgeBps),
      artifactUri(report),
    ],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  return {
    proofId: extractProofId(receipt),
    txHash,
    contractAddress: registryAddress,
    blockNumber: receipt.blockNumber.toString(),
  }
}
