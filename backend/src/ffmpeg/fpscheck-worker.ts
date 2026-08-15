import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import { FPSCommand } from './default-renditions'
import { logError } from '../logger'

const getFPS = async () => {
  const { inputPath } = workerData as Queue
  const commands: string[] = FPSCommand.concat([inputPath])
  let fps = 0
  const child = spawn('ffprobe', commands)
  child.stdout.on('data', (data) => {
    const [decimal, divider] = data.toString().trim().split('/')
    if (divider) {
      fps = parseFloat(decimal) / parseFloat(divider)
    } else {
      fps = parseFloat(decimal)
    }
  })
  child.stderr.on('data', (data) => {
    logError(`ffprobe stderr: ${data}`)
    parentPort?.postMessage({ error: data.toString() })
  })
  child.on('error', (err) => {
    logError(`ffprobe spawn error: ${err}`)
    parentPort?.postMessage({ error: err.message })
  })
  child.on('close', () => {
    if (parentPort) {
      parentPort.postMessage(fps)
    }
  })
}

getFPS()
