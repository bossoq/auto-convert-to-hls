import fs from 'fs'
import watch from 'node-watch'
import type { Queue } from '../types'
import type { Transcoder } from '../ffmpeg/ffmpeg'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'

export const checkFile = function (
  queue: Queue,
  previousSize: number,
  transcoder: Transcoder
) {
  fs.stat(queue.inputPath, (err, fileInfo) => {
    if (err === null) {
      if (fileInfo.size === previousSize && fileInfo.size > 0) {
        console.log(`Added ${queue.name} to queue`)
        transcoder.add(queue)
      } else {
        checkFile(queue, fileInfo.size, transcoder)
      }
    } else {
      console.log(`File not found ${err}`)
    }
  })
}

export const getAllFiles = (dir: string): Queue[] => {
  const files = fs.readdirSync(dir)
  const filterFiles = files.filter(
    (file) => file.endsWith('.mp4') && !file.startsWith('._')
  )
  return filterFiles.map((file) => {
    return {
      name: file.split('.mp4')[0],
      inputPath: `${dir}${file}`,
      outputPath: `${DestPath}${file.split('.mp4')[0]}`,
    }
  })
}

export const watcher = watch(SourcePath, {
  filter: (f) => /\.mp4$/.test(f) && !/^\._/.test(f),
})
