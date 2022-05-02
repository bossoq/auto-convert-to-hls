import express from 'express'
import type { Transcoder } from '../ffmpeg/ffmpeg'

export class API {
  private app: express.Application
  private port: number
  private transcoder: Transcoder
  constructor(transcoder: Transcoder, port?: number) {
    this.app = express()
    this.port = port || 3000
    this.transcoder = transcoder
    this.init()
  }

  private init() {
    this.app.use(express.json())

    this.app.get('/status', (_req, res) => {
      res.json(this.transcoder.getStatus())
    })

    this.app.get('/queue', (_req, res) => {
      res.json(this.transcoder.getQueue())
    })

    this.app.listen(this.port, () => {
      console.log(`Server started on port ${this.port}`)
    })
  }
}
