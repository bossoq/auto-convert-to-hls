import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import type { Transcoder } from '../ffmpeg/ffmpeg'

export class API {
  private app: express.Application
  private port: number
  private corsHost: string
  private transcoder: Transcoder
  io: Server
  constructor(transcoder: Transcoder, corsHost: string, port?: number) {
    this.app = express()
    this.port = port || 3000
    this.corsHost = corsHost
    this.transcoder = transcoder
    this.init()
  }

  private init() {
    const server = http.createServer(this.app)
    console.log(`Set CORS: ${this.corsHost}`)
    this.io = new Server(server, {
      cors: {
        origin: this.corsHost,
      },
    })
    this.app.use(cors())
    this.app.use(express.json())

    this.app.get('/status', (_req, res) => {
      res.json(this.transcoder.getStatus())
    })

    this.app.get('/queue', (_req, res) => {
      res.json(this.transcoder.getQueue())
    })

    server.listen(this.port, () => {
      console.log(`Server started on port ${this.port}`)
    })
  }
}
