import { Worker } from 'worker_threads'
import { DefaultRenditions, DefaultFPS } from './default-renditions'
import fs from 'fs'
import { PrismaClient } from '@prisma/client'
import type { Options, Queue } from '../types'

const VodBaseUrl = process.env.VOD_BASE_URL || 'https://vod.supapanya.com'

interface SocketEmitter {
  emit(event: string, data: unknown): boolean | void
}

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
  private io: SocketEmitter | null

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
    this.io = null
  }

  setIO(io: SocketEmitter) {
    this.io = io
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
    if (this.options.showLogs) console.log(`Create Master Playlist: ${masterPlaylist}`)
    this.getFramesCount(queue)
    this.screenshot(queue)
    this.transcode(queue)
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
    if (this.options.showLogs) console.log(`Move File: ${movePath}`)
    this.socketSend()
    return movePath
  }

  private getFramesCount(queue: Queue) {
    const fpsWorker = new Worker('./src/ffmpeg/fpscheck-worker.ts', {
      workerData: queue,
    })
    fpsWorker.on('message', (fps: number) => {
      if (this.options.showLogs) console.log(`Input FPS: ${fps}`)
      const framecountWorker = new Worker('./src/ffmpeg/framecount-worker.ts', {
        workerData: queue,
      })
      framecountWorker.on('message', (framesCount: number) => {
        this.totalFramesCount = parseInt(
          ((framesCount * DefaultFPS) / fps).toFixed(0)
        )
        if (this.options.showLogs)
          console.log(`Total Frames: ${this.totalFramesCount}`)
        this.socketSend()
      })
      framecountWorker.on('error', (err) => {
        console.error(`Cannot get frames count: ${err}`)
      })
      framecountWorker.on('exit', (code) => {
        if (code !== 0)
          console.error(new Error(`framecount-worker stopped with exit code ${code}`))
      })
    })
    fpsWorker.on('error', (err) => {
      console.error(`Cannot get FPS: ${err}`)
    })
    fpsWorker.on('exit', (code) => {
      if (code !== 0)
        console.error(new Error(`fpscheck-worker stopped with exit code ${code}`))
    })
  }

  private screenshot(queue: Queue) {
    const screenshotWorker = new Worker('./src/ffmpeg/screenshot-worker.ts', {
      workerData: queue,
    })
    screenshotWorker.on('message', (logs: string) => {
      if (this.options.showLogs) console.log(logs)
      console.log('Screenshot worker done')
    })
    screenshotWorker.on('error', (err) => {
      console.error(`Cannot get screenshot: ${err}`)
    })
    screenshotWorker.on('exit', (code) => {
      if (code !== 0)
        console.error(new Error(`screenshot-worker stopped with exit code ${code}`))
    })
  }

  private transcode(queue: Queue) {
    const transcodeWorker = new Worker('./src/ffmpeg/transcode-worker.ts', {
      workerData: queue,
    })
    let doneReceived = false
    transcodeWorker.on('message', (msg: any) => {
      if (msg.progress) {
        this.currentFrames = msg.progress.frames
        this.currentFPS = msg.progress.fps
        this.currentSpeed = msg.progress.speed
        if (this.currentFrames > this.totalFramesCount)
          this.totalFramesCount = this.currentFrames
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
      }
      if (msg.done) {
        doneReceived = true
        if (this.options.showLogs) console.log('Transcode worker done')
        this.moveFinished(queue)
        this.autoPublish(queue).then(() => {
          this.done()
        })
      }
    })
    transcodeWorker.on('error', (err) => {
      console.error(`Cannot transcode: ${err}`)
    })
    transcodeWorker.on('exit', (code) => {
      if (code !== 0) {
        console.error(new Error(`transcode-worker stopped with exit code ${code}`))
        if (!doneReceived) this.done()
      }
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

  private async autoPublish(queue: Queue) {
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
            baseUrl: `${VodBaseUrl}/${queue.name}`,
            type: 'vod',
            allowAll: false,
            fileType: 'HLS',
            videoAccess: {
              create: queue.meta.participants.map((userId) => ({
                userId: BigInt(userId),
              })),
            },
          },
        })
        if (this.options.showLogs) console.log(`Auto Publish Done!`)
      }
    }
    this.socketSend()
  }

  private socketSend() {
    this.io?.emit('status', this.getStatus())
    this.io?.emit('queue', this.getQueue())
  }
}
