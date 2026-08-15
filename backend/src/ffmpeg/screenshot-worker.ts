import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import { ScreenshotCommand } from './default-renditions'
import { logError } from '../logger'

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
  child.stderr.on('data', (data) => {
    logError(`ffmpeg stderr: ${data}`)
    parentPort?.postMessage({ error: data.toString() })
  })
  child.on('error', (err) => {
    logError(`ffmpeg spawn error: ${err}`)
    parentPort?.postMessage({ error: err.message })
  })
  child.on('close', () => {
    parentPort?.postMessage('done')
  })
}

getScreenshot()
