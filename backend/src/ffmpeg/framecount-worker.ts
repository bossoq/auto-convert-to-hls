import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import { FrameCountCommand } from './default-renditions'

const getFramesCount = async () => {
  const { inputPath } = workerData as Queue
  const commands: string[] = FrameCountCommand.concat([inputPath])
  let framesCount = 0
  const child = spawn('ffprobe', commands)
  child.stdout.on('data', (data) => {
    framesCount = parseInt(data.toString())
  })
  child.stderr.on('data', (data) => {
    console.error(`ffprobe stderr: ${data}`)
    parentPort?.postMessage({ error: data.toString() })
  })
  child.on('close', () => {
    if (parentPort) {
      parentPort.postMessage(framesCount)
    }
  })
}

getFramesCount()
