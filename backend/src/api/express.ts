import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import type { Transcoder } from '../ffmpeg/ffmpeg'
import { logInfo, logError } from '../logger'

export function parseCorsOrigins(corsHost: string): string | string[] {
  const origins = corsHost
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return origins.length === 1 ? origins[0] : origins
}

export class API {
  private app: express.Application
  private port: number
  private corsOrigins: string | string[]
  private socketPath: string
  private transcoder: Transcoder
  io: Server
  constructor(
    transcoder: Transcoder,
    corsHost: string,
    port?: number,
    socketPath?: string
  ) {
    this.app = express()
    this.port = port || 3000
    this.corsOrigins = parseCorsOrigins(corsHost)
    this.socketPath = socketPath || '/socket.io'
    this.transcoder = transcoder
    this.init()
  }

  private init() {
    const server = http.createServer(this.app)
    logInfo(`Set CORS: ${this.corsOrigins}`)
    this.io = new Server(server, {
      path: this.socketPath,
      cors: {
        origin: this.corsOrigins,
      },
    })
    this.app.use(cors({ origin: this.corsOrigins }))
    this.app.use(express.json())

    this.app.get('/status', (_req, res) => {
      res.json(this.transcoder.getStatus())
    })

    this.app.get('/queue', (_req, res) => {
      res.json(this.transcoder.getQueue())
    })

    this.io.on('connection', (socket) => {
      socket.emit('status', this.transcoder.getStatus())
      socket.emit('queue', this.transcoder.getQueue())
    })

    server.on('error', (err) => {
      logError(`Express server error: ${err}`)
    })

    server.listen(this.port, () => {
      logInfo(`Server started on port ${this.port}`)
    })
  }
}
