import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
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
  txHash?: Hex
  contractAddress: Hex
  blockNumber?: string
  alreadyPublished?: boolean
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

function proofIdForOnchain(registryAddress: Hex, publisher: Hex, report: AgentReport) {
  return keccak256(
    encodePacked(
      ['uint256', 'address', 'address', 'bytes32', 'string'],
      [BigInt(arcTestnet.id), registryAddress, publisher, report.reportHash as Hex, report.marketId],
    ),
  )
}

async function existingProof(
  publicClient: ReturnType<typeof createPublicClient>,
  registryAddress: Hex,
  proofId: Hex,
) {
  const record = await publicClient.readContract({
    address: registryAddress,
    abi: signalRegistryAbi,
    functionName: 'records',
    args: [proofId],
  })
  const publishedAt = record[9]

  if (typeof publishedAt !== 'bigint' || publishedAt === 0n) {
    return undefined
  }

  const logs = await publicClient
    .getContractEvents({
      address: registryAddress,
      abi: signalRegistryAbi,
      eventName: 'SignalPublished',
      args: { proofId },
      fromBlock: 0n,
      toBlock: 'latest',
    })
    .catch(() => [])
  const latestLog = logs.at(-1)

  return {
    proofId,
    txHash: latestLog?.transactionHash,
    blockNumber: latestLog?.blockNumber?.toString(),
  }
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
  const proofId = proofIdForOnchain(registryAddress, account.address, report)
  const alreadyPublished = await existingProof(publicClient, registryAddress, proofId)

  if (alreadyPublished) {
    return {
      proofId,
      txHash: alreadyPublished.txHash,
      contractAddress: registryAddress,
      blockNumber: alreadyPublished.blockNumber,
      alreadyPublished: true,
    }
  }

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
