import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import solc from 'solc'
import type { Abi } from 'viem'

type SolcError = {
  severity: 'error' | 'warning' | 'info'
  formattedMessage: string
}

type SolcContract = {
  abi: Abi
  evm: {
    bytecode: {
      object: string
    }
  }
}

type SolcOutput = {
  errors?: SolcError[]
  contracts: {
    'SignalRegistry.sol': {
      SignalRegistry: SolcContract
    }
  }
}

export function compileSignalRegistry() {
  const contractPath = resolve(process.cwd(), 'contracts', 'SignalRegistry.sol')
  const source = readFileSync(contractPath, 'utf8')
  const input = {
    language: 'Solidity',
    sources: {
      'SignalRegistry.sol': {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput
  const errors = output.errors?.filter((error) => error.severity === 'error') || []

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join('\n'))
  }

  return output.contracts['SignalRegistry.sol'].SignalRegistry
}
