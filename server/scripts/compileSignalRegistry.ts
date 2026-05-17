import { compileSignalRegistry } from '../contracts/compileSignalRegistry.js'

const contract = compileSignalRegistry()

console.log(
  JSON.stringify(
    {
      contract: 'SignalRegistry',
      abiItems: contract.abi.length,
      bytecodeBytes: contract.evm.bytecode.object.length / 2,
    },
    null,
    2,
  ),
)
