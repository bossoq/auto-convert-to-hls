import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import type { Transcoder } from '../ffmpeg/ffmpeg'

export class API {
  private app: express.Application
  private port: number
  private corsOrigins: string | string[]
  private transcoder: Transcoder
  io: Server
  constructor(transcoder: Transcoder, corsHost: string, port?: number) {
    this.app = express()
    this.port = port || 3000
    this.corsOrigins = corsHost.includes(',') ? corsHost.split(',').map((s) => s.trim()) : corsHost
    this.transcoder = transcoder
    this.init()
  }

  private init() {
    const server = http.createServer(this.app)
    console.log(`Set CORS: ${this.corsOrigins}`)
    this.io = new Server(server, {
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

    server.listen(this.port, () => {
      console.log(`Server started on port ${this.port}`)
    })
  }
}
