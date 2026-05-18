import { existsSync, watch } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const tscBin = 'node_modules/typescript/bin/tsc'
let apiProcess
let restartTimer
let restarting = false
let tscWatch

function run(command, args) {
  return spawn(command, args, { stdio: 'inherit', shell: false })
}

function buildOnce() {
  const result = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.server.json'], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function startApi() {
  restarting = false
  apiProcess = run(process.execPath, ['dist-server/index.js'])
}

function restartApi() {
  if (restartTimer) {
    clearTimeout(restartTimer)
  }

  restartTimer = setTimeout(() => {
    if (restarting) {
      return
    }

    restarting = true

    if (apiProcess && !apiProcess.killed) {
      apiProcess.once('exit', startApi)
      apiProcess.kill()
      return
    }

    startApi()
  }, 250)
}

function shutdown() {
  if (restartTimer) {
    clearTimeout(restartTimer)
  }

  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill()
  }

  if (tscWatch && !tscWatch.killed) {
    tscWatch.kill()
  }

  process.exit(0)
}

buildOnce()

tscWatch = run(process.execPath, [tscBin, '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput'])
startApi()

if (existsSync('dist-server')) {
  watch('dist-server', { recursive: true }, (_event, filename) => {
    if (filename && filename.endsWith('.js')) {
      restartApi()
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
