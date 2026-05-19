import { proofIdFor } from '../lib/math.js'
import type { AgentReport } from '../types.js'
import { arcWriterConfigured, publishSignalToArc } from '../chain/signalRegistryWriter.js'

export async function publishArcProof(report: AgentReport) {
  if (report.proof?.status === 'published' && report.proof.txHash) {
    return {
      ...report,
      locked: false,
    }
  }

  if (!arcWriterConfigured()) {
    const proofId = proofIdFor(report.marketId, report.reportHash)

    return {
      ...report,
      locked: false,
      proof: {
        status: 'queued' as const,
        proofId,
      },
      runs: [
        ...report.runs,
        {
          agent: 'Arc Proof Agent' as const,
          status: 'queued' as const,
          summary:
            'Queued report hash and signal metadata. Set SIGNAL_REGISTRY_ADDRESS and ARC_WRITER_PRIVATE_KEY to publish on Arc.',
          artifact: proofId,
        },
      ],
    }
  }

  const proof = await publishSignalToArc(report)

  return {
    ...report,
    locked: false,
    proof: {
      status: 'published' as const,
      proofId: proof.proofId,
      txHash: proof.txHash,
      contractAddress: proof.contractAddress,
      blockNumber: proof.blockNumber,
    },
    runs: [
      ...report.runs,
      {
        agent: 'Arc Proof Agent' as const,
        status: 'live' as const,
        summary: proof.alreadyPublished
          ? `Report hash was already committed to Arc SignalRegistry at ${proof.contractAddress}.`
          : `Published report hash to Arc SignalRegistry at ${proof.contractAddress}.`,
        artifact: proof.txHash || proof.proofId,
      },
    ],
  }
}
