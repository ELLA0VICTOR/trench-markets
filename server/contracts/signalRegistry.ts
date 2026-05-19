import type { Hex } from 'viem'
import type { Signal } from '../types.js'

export const signalRegistryAbi = [
  {
    type: 'function',
    name: 'publishSignal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reportHash', type: 'bytes32' },
      { name: 'marketId', type: 'string' },
      { name: 'signal', type: 'uint8' },
      { name: 'marketBps', type: 'uint16' },
      { name: 'fairBps', type: 'uint16' },
      { name: 'confidenceBps', type: 'uint16' },
      { name: 'edgeBps', type: 'int16' },
      { name: 'artifactUri', type: 'string' },
    ],
    outputs: [{ name: 'proofId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'proofCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'records',
    stateMutability: 'view',
    inputs: [{ name: 'proofId', type: 'bytes32' }],
    outputs: [
      { name: 'publisher', type: 'address' },
      { name: 'reportHash', type: 'bytes32' },
      { name: 'marketId', type: 'string' },
      { name: 'signal', type: 'uint8' },
      { name: 'marketBps', type: 'uint16' },
      { name: 'fairBps', type: 'uint16' },
      { name: 'confidenceBps', type: 'uint16' },
      { name: 'edgeBps', type: 'int16' },
      { name: 'artifactUri', type: 'string' },
      { name: 'publishedAt', type: 'uint64' },
    ],
  },
  { type: 'error', name: 'InvalidReportHash', inputs: [] },
  { type: 'error', name: 'InvalidMarketId', inputs: [] },
  { type: 'error', name: 'InvalidBps', inputs: [] },
  { type: 'error', name: 'ProofAlreadyExists', inputs: [] },
  {
    type: 'event',
    name: 'SignalPublished',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'proofId', type: 'bytes32' },
      { indexed: true, name: 'reportHash', type: 'bytes32' },
      { indexed: true, name: 'publisher', type: 'address' },
      { indexed: false, name: 'marketId', type: 'string' },
      { indexed: false, name: 'signal', type: 'uint8' },
      { indexed: false, name: 'marketBps', type: 'uint16' },
      { indexed: false, name: 'fairBps', type: 'uint16' },
      { indexed: false, name: 'confidenceBps', type: 'uint16' },
      { indexed: false, name: 'edgeBps', type: 'int16' },
      { indexed: false, name: 'artifactUri', type: 'string' },
    ],
  },
] as const

export function signalCode(signal: Signal) {
  if (signal === 'BUY YES') return 0
  if (signal === 'BUY NO') return 1
  return 2
}

export function configuredRegistryAddress() {
  return process.env.SIGNAL_REGISTRY_ADDRESS as Hex | undefined
}

export function configuredWriterPrivateKey() {
  return process.env.ARC_WRITER_PRIVATE_KEY as Hex | undefined
}

export function isBytes32(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}
