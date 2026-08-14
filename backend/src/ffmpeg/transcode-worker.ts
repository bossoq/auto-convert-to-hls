import { spawn } from 'child_process'
import { parentPort, workerData } from 'worker_threads'
import type { Queue } from '../types'
import { DefaultRenditions, DefaultFPS, TranscodeCommand } from './default-renditions'

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
      'p4',
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

  const parseProgress = (logs: string) => {
    const frameMatches = [...logs.matchAll(/frame=\s*(\d+)/g)]
    const fpsMatches = [...logs.matchAll(/fps=\s*(\d+\.?\d*)/g)]
    const speedMatches = [...logs.matchAll(/speed=\s*(\d+\.?\d*)x/g)]
    if (frameMatches.length > 0)
      currentFrames = parseInt(frameMatches[frameMatches.length - 1][1])
    if (fpsMatches.length > 0)
      currentFPS = parseFloat(fpsMatches[fpsMatches.length - 1][1])
    if (speedMatches.length > 0)
      currentSpeed = parseFloat(speedMatches[speedMatches.length - 1][1])
    parentPort?.postMessage({
      progress: { frames: currentFrames, fps: currentFPS, speed: currentSpeed },
    })
  }

  child.stdout.on('data', (data) => {
    const str = data.toString()
    console.log(`TRANSCODE STDOUT: ${str.trim()}`)
    parseProgress(str)
  })
  child.stderr.on('data', (data) => {
    const str = data.toString()
    console.error(`TRANSCODE STDERR: ${str.trim()}`)
    parseProgress(str)
  })

  child.on('close', (code) => {
    if (code !== 0) console.error(`TRANSCODE EXIT CODE: ${code}`)
    parentPort?.postMessage({ done: true })
  })
}

transcode()
