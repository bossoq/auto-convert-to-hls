import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import {
  DefaultRenditions,
  DefaultFPS,
  TranscodeCommand,
} from './default-renditions'

const transcode = async () => {
  const { inputPath, outputPath } = workerData as Queue
  let commands: string[] = TranscodeCommand.concat(['-i', inputPath])
  for (let i = 0, len = DefaultRenditions.length; i < len; i++) {
    const r = DefaultRenditions[i]
    commands = commands.concat([
      '-vf',
      `scale_npp=-1:${r.height},fps=${DefaultFPS}`,
      '-c:v',
      'h264_nvenc',
      '-preset',
      'medium',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-sc_threshold',
      '0',
      '-g',
      '90',
      '-hls_time',
      r.hlsTime,
      '-hls_playlist_type',
      'vod',
      '-b:v',
      r.bv,
      '-maxrate',
      r.maxrate,
      '-bufsize',
      r.bufsize,
      '-b:a',
      r.ba,
      '-hls_segment_filename',
      `${outputPath}/${r.ts_title}_%03d.ts`,
      `${outputPath}/${r.height}.m3u8`,
    ])
  }
  const child = spawn('ffmpeg', commands)
  let currentFrames = 0
  let currentFPS = 0
  let currentSpeed = 0
  child.stdout.on('data', (data) => {
    const logs = data.toString()
    const frameMatch = logs.match(/frame=\s*(\d+)/)
    const fpsMatch = logs.match(/fps=\s*(\d+\.*\d*)/)
    const speedMatch = logs.match(/speed=\s*(\d+\.\d+)x/)
    if (frameMatch) currentFrames = parseInt(frameMatch[1])
    if (fpsMatch) currentFPS = parseFloat(fpsMatch[1])
    if (speedMatch) currentSpeed = parseFloat(speedMatch[1])
    parentPort?.postMessage({
      progress: {
        frames: currentFrames,
        fps: currentFPS,
        speed: currentSpeed,
      },
    })
  })
  child.stderr.on('data', (data) => {
    const logs = data.toString()
    const frameMatch = logs.match(/frame=\s*(\d+)/)
    const fpsMatch = logs.match(/fps=\s*(\d+\.*\d*)/)
    const speedMatch = logs.match(/speed=\s*(\d+\.\d+)x/)
    if (frameMatch) currentFrames = parseInt(frameMatch[1])
    if (fpsMatch) currentFPS = parseFloat(fpsMatch[1])
    if (speedMatch) currentSpeed = parseFloat(speedMatch[1])
    parentPort?.postMessage({
      progress: {
        frames: currentFrames,
        fps: currentFPS,
        speed: currentSpeed,
      },
    })
  })
  child.on('close', () => {
    if (parentPort) {
      parentPort.postMessage({ done: true })
    }
  })
}

transcode()
