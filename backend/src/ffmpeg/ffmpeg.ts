import { spawn } from 'child_process'
import {
  FrameCountCommand,
  ScreenshotCommand,
  TranscodeCommand,
  DefaultRenditions,
  FPSCommand,
} from './default-renditions'
import fs from 'fs'
import { server } from '../index'
import { PrismaClient } from '@prisma/client'
import type { Options, Queue } from '../types'

export class Transcoder {
  private busy: boolean
  private queue: Queue[]
  private options: Options
  private name: string
  private totalFramesCount: number
  private currentFrames: number
  private currentFPS: number
  private currentSpeed: number
  private prisma: PrismaClient
  constructor(options?: Options) {
    this.busy = false
    this.queue = []
    this.options = options || {}
    this.name = ''
    this.totalFramesCount = 0
    this.currentFrames = 0
    this.currentFPS = 0
    this.currentSpeed = 0
    this.prisma = new PrismaClient()
  }

  add(queue: Queue) {
    if (this.queue.find((q) => q.name === queue.name)) return
    if (this.name === queue.name) return
    this.queue.push(queue)
    this.socketSend()
    this.start()
  }

  bulkAdd(queues: Queue[]) {
    this.queue.push(...queues)
    this.socketSend()
    this.start()
  }

  getStatus() {
    return {
      busy: this.busy,
      job: this.name,
      currentFrames: this.currentFrames,
      totalFramesCount: this.totalFramesCount,
      fps: this.currentFPS,
      speed: this.currentSpeed,
      progress: ((this.currentFrames / this.totalFramesCount) * 100).toFixed(2),
    }
  }

  getQueue() {
    return {
      length: this.queue.length,
      queue: this.queue,
    }
  }

  private start() {
    if (this.busy) return
    if (this.queue.length === 0) return
    const queue = this.queue.shift()
    if (!queue) return
    this.name = queue.name
    this.busy = true
    this.socketSend()
    this.createHLS(queue)
  }

  private async createHLS(queue: Queue) {
    this.socketSend()
    if (this.options.showLogs) console.log(`Starting Job: ${this.name}`)
    const outputPath = await this.makeOutputDir(queue)
    if (this.options.showLogs) console.log(`Create Output Path: ${outputPath}`)
    const masterPlaylist = await this.writePlaylist(queue)
    if (this.options.showLogs)
      console.log(`Create Master Playlist: ${masterPlaylist}`)
    const totalFramesCommands: string[] = await this.buildFrameCountCommands(
      queue
    )
    const fpsCommands: string[] = await this.buildFPSCommands(queue)
    const screenshotCommands: string[] = await this.buildScreenshotCommands(
      queue
    )
    const transcodeCommands: string[] = await this.buildTranscodeCommands(queue)
    const fps = await this.getFPS(fpsCommands)
    if (this.options.showLogs) console.log(`FPS: ${fps}`)
    this.totalFramesCount = await this.getFramesCount(totalFramesCommands)
    this.totalFramesCount = parseInt(
      ((this.totalFramesCount * 30) / fps).toFixed(0)
    )
    if (this.options.showLogs)
      console.log(`Total Frames: ${this.totalFramesCount}`)
    this.socketSend()
    const screenshot = await this.screenshot(screenshotCommands)
    if (this.options.showLogs) console.log(screenshot)
    const transcode = await this.transcode(transcodeCommands)
    if (this.options.showLogs) console.log(transcode)
    const movePath = this.moveFinished(queue)
    if (this.options.showLogs) console.log(`Move File: ${movePath}`)
    if (queue.autoPublish) {
      if (queue.meta) {
        if (this.options.showLogs) console.log(`Auto Publish ${queue.name}`)
        await this.prisma.videoProcess.update({
          where: {
            id: queue.meta.id,
          },
          data: {
            processed: true,
          },
        })
        await this.prisma.videoTable.create({
          data: {
            name: queue.meta.className,
            baseUrl: `https://vod.supapanya.com/${queue.name}`,
            type: 'vod',
            allowAll: false,
            allowList: queue.meta.participants,
            fileType: 'HLS',
          },
        })
        if (this.options.showLogs) console.log(`Auto Publish Done!`)
      }
    }
    this.socketSend()
    this.done()
  }

  private done() {
    this.busy = false
    this.name = ''
    this.totalFramesCount = 0
    this.currentFrames = 0
    this.currentFPS = 0
    this.currentSpeed = 0
    this.socketSend()
    this.start()
  }

  private moveFinished(queue: Queue): string {
    const movePath = `${queue.inputPath.replace(
      `${queue.name}.mp4`,
      ''
    )}converted/${queue.name}.mp4`
    fs.renameSync(queue.inputPath, movePath)
    return movePath
  }

  private getFramesCount(commands: string[]): Promise<number> {
    return new Promise((resolve, _reject) => {
      let framesCount = 0
      const child = spawn('ffprobe', commands)
      child.stdout.on('data', (data) => {
        framesCount = parseInt(data.toString())
      })
      child.stderr.on('data', (data) => {
        if (this.options.showLogs) console.error(data.toString())
      })
      child.on('exit', (code) => {
        if (code === 0) {
          return resolve(framesCount)
        }
      })
    })
  }

  private getFPS(commands: string[]): Promise<number> {
    return new Promise((resolve, _reject) => {
      let fps = 0
      const child = spawn('ffprobe', commands)
      child.stdout.on('data', (data) => {
        const [decimal, divider] = data.toString().split('/')
        fps = parseFloat(decimal) / parseFloat(divider)
      })
      child.stderr.on('data', (data) => {
        if (this.options.showLogs) console.error(data.toString())
      })
      child.on('exit', (code) => {
        if (code === 0) {
          return resolve(fps)
        }
      })
    })
  }

  private screenshot(commands: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', commands)
      child.stdout.on('data', (data) => {
        const logs: string = data.toString()
        if (this.options.showLogs) console.log(logs)
      })
      child.stderr.on('data', (data) => {
        const logs: string = data.toString()
        if (this.options.showLogs) console.error(logs)
      })
      child.on('exit', (code) => {
        if (code === 0) {
          return resolve('Screenshot Done!')
        }
        return reject('Screenshot Failed!')
      })
    })
  }

  private transcode(commands: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', commands)
      child.stdout.on('data', (data) => {
        const logs: string = data.toString()
        const frameMatch = logs.match(/frame=\s*(\d+)/)
        const fpsMatch = logs.match(/fps=\s*(\d+\.*\d*)/)
        const speedMatch = logs.match(/speed=\s*(\d+\.\d+)x/)
        if (frameMatch) this.currentFrames = parseInt(frameMatch[1])
        if (fpsMatch) this.currentFPS = parseFloat(fpsMatch[1])
        if (speedMatch) this.currentSpeed = parseFloat(speedMatch[1])
        if (this.options.showLogs)
          console.log(
            `Job: ${this.name} | Progress: ${(
              (this.currentFrames / this.totalFramesCount) *
              100
            ).toFixed(2)}% | FPS: ${this.currentFPS.toFixed(
              2
            )} | Speed: ${this.currentSpeed.toFixed(2)}`
          )
        this.socketSend()
      })
      child.stderr.on('data', (data) => {
        const logs: string = data.toString()
        const frameMatch = logs.match(/frame=\s*(\d+)/)
        const fpsMatch = logs.match(/fps=\s*(\d+\.*\d*)/)
        const speedMatch = logs.match(/speed=\s*(\d+\.\d+)x/)
        if (frameMatch) this.currentFrames = parseInt(frameMatch[1])
        if (fpsMatch) this.currentFPS = parseFloat(fpsMatch[1])
        if (speedMatch) this.currentSpeed = parseFloat(speedMatch[1])
        if (this.options.showLogs)
          console.log(
            `Job: ${this.name} | Progress: ${(
              (this.currentFrames / this.totalFramesCount) *
              100
            ).toFixed(2)}% | FPS: ${this.currentFPS.toFixed(
              2
            )} | Speed: ${this.currentSpeed.toFixed(2)}`
          )
        this.socketSend()
      })
      child.on('exit', (code) => {
        if (code === 0) {
          return resolve('Transcoding Done!')
        }
        return reject('Transcoding Failed!')
      })
    })
  }

  private buildFrameCountCommands(queue: Queue): Promise<string[]> {
    return new Promise((resolve, _reject) => {
      let commands = FrameCountCommand
      commands = commands.concat([queue.inputPath])
      resolve(commands)
    })
  }

  private buildFPSCommands(queue: Queue): Promise<string[]> {
    return new Promise((resolve, _reject) => {
      let commands = FPSCommand
      commands = commands.concat([queue.inputPath])
      resolve(commands)
    })
  }

  private buildScreenshotCommands(queue: Queue): Promise<string[]> {
    return new Promise((resolve, _reject) => {
      let commands = ScreenshotCommand
      commands = commands.concat(['-i', queue.inputPath])
      commands = commands.concat([
        '-frames:v',
        '1',
        '-q:v',
        '2',
        `${queue.outputPath}/cover.jpg`,
      ])
      resolve(commands)
    })
  }

  private buildTranscodeCommands(queue: Queue): Promise<string[]> {
    return new Promise((resolve, _reject) => {
      let commands = TranscodeCommand
      commands = commands.concat(['-i', queue.inputPath])
      const renditions = DefaultRenditions
      for (let i = 0, len = renditions.length; i < len; i++) {
        const r = renditions[i]
        // commands = commands.concat([
        //   '-vf',
        //   `scale_npp=-1:${r.height}`,
        //   '-c:v',
        //   'h264_nvenc',
        //   '-preset',
        //   'medium',
        //   '-c:a',
        //   'aac',
        //   '-ar',
        //   '48000',
        //   '-sc_threshold',
        //   '0',
        //   '-g',
        //   '90',
        //   '-hls_time',
        //   r.hlsTime,
        //   '-hls_playlist_type',
        //   'vod',
        //   '-b:v',
        //   r.bv,
        //   '-maxrate',
        //   r.maxrate,
        //   '-bufsize',
        //   r.bufsize,
        //   '-b:a',
        //   r.ba,
        //   '-hls_segment_filename',
        //   `${queue.outputPath}/${r.ts_title}_%03d.ts`,
        //   `${queue.outputPath}/${r.height}.m3u8`,
        // ])
        commands = commands.concat([
          '-vf',
          `scale_qsv=-1:${r.height},format=qsv,hwupload=extra_hw_frames=64,vpp_qsv=framerate=30:deinterlace=2`,
          '-c:v',
          'h264_qsv',
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
          `${queue.outputPath}/${r.ts_title}_%03d.ts`,
          `${queue.outputPath}/${r.height}.m3u8`,
        ])
      }
      resolve(commands)
    })
  }

  private makeOutputDir(queue: Queue): Promise<string> {
    return new Promise(async (resolve, _reject) => {
      const outputPath = `${queue.outputPath}`
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true })
      }
      resolve(outputPath)
    })
  }

  private writePlaylist(queue: Queue): Promise<string> {
    return new Promise(async (resolve, _reject) => {
      let m3u8Playlist = `#EXTM3U
#EXT-X-VERSION:3`
      const renditions = DefaultRenditions
      for (let i = 0, len = renditions.length; i < len; i++) {
        const r = renditions[i]
        m3u8Playlist += `
#EXT-X-STREAM-INF:BANDWIDTH=${r.bv.replace('k', '000')},RESOLUTION=${r.width}x${
          r.height
        }
${r.height}.m3u8`
      }
      const m3u8Path = `${queue.outputPath}/index.m3u8`
      fs.writeFileSync(m3u8Path, m3u8Playlist)
      resolve(m3u8Path)
    })
  }

  private socketSend() {
    server.io.emit('status', this.getStatus())
    server.io.emit('queue', this.getQueue())
  }
}
