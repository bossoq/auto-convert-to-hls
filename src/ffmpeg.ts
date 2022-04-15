import { spawn } from 'child_process'
import { DefaultCommands, DefaultRenditions } from './default-renditions'
import fs from 'fs'

class Transcode {
  inputPath: string
  outputPath: string
  realPath: string
  options: any | undefined
  constructor(
    inputPath: string,
    outputPath: string,
    realPath: string,
    options: any
  ) {
    this.inputPath = inputPath
    this.outputPath = outputPath
    this.realPath = realPath
    this.options = options || {}
  }

  transcode() {
    return new Promise(async (resolve, reject) => {
      spawn('mkdir', ['-p', this.realPath])
      const commands: any = await this.buildCommands()
      const masterPlaylist = await this.writePlaylist()
      const ls = spawn('docker', commands)
      let showLogs = true
      if (this.options.showLogs == false) {
        showLogs = false
      }
      ls.stdout.on('data', (data: any) => {
        if (showLogs) {
          console.log(data.toString())
        }
      })

      ls.stderr.on('data', (data: any) => {
        if (showLogs) {
          console.log(data.toString())
        }
      })

      ls.on('exit', (code: any) => {
        if (showLogs) {
          console.log(`Child exited with code ${code}`)
        }
        if (code == 0) return resolve(masterPlaylist)

        return reject('Video Failed to Transcode')
      })
    })
  }

  buildCommands() {
    return new Promise((resolve, _reject) => {
      let commands = DefaultCommands
      commands = commands.concat(['-i', this.inputPath])
      const renditions = this.options.renditions || DefaultRenditions
      for (let i = 0, len = renditions.length; i < len; i++) {
        const r = renditions[i]
        commands = commands.concat([
          '-vf',
          `hwupload=extra_hw_frames=64,vpp_qsv=deinterlace=2,scale_qsv=${r.width}:-1`,
          '-c:v',
          'h264_qsv',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          `-profile:v`,
          r.profile,
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
          `${this.outputPath}/${r.ts_title}_%03d.ts`,
          `${this.outputPath}/${r.height}.m3u8`,
        ])
      }
      resolve(commands)
    })
  }

  writePlaylist() {
    return new Promise(async (resolve, _reject) => {
      let m3u8Playlist = `#EXTM3U
#EXT-X-VERSION:3`
      const renditions = this.options.renditions || DefaultRenditions

      for (let i = 0, len = renditions.length; i < len; i++) {
        const r = renditions[i]
        m3u8Playlist += `
#EXT-X-STREAM-INF:BANDWIDTH=${r.bv.replace('k', '000')},RESOLUTION=${r.width}x${
          r.height
        }
${r.height}.m3u8`
      }
      const m3u8Path = `${this.realPath}/index.m3u8`
      fs.writeFileSync(m3u8Path, m3u8Playlist)

      resolve(m3u8Path)
    })
  }
}

export const Transcoder = Transcode
