import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import { ScreenshotCommand } from './default-renditions'

const getScreenshot = async () => {
  const { inputPath, outputPath } = workerData as Queue
  const commands: string[] = ScreenshotCommand.concat([
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    `${outputPath}/cover.jpg`,
  ])
  const child = spawn('ffmpeg', commands)
  let logs = ''
  child.stdout.on('data', (data) => {
    logs += data.toString()
  })
  child.stderr.on('data', (data) => {
    console.error(`ffmpeg stderr: ${data}`)
    parentPort?.postMessage({ error: data.toString() })
  })
  child.on('close', () => {
    if (parentPort) {
      parentPort.postMessage(logs)
    }
  })
}

getScreenshot()
