import fs from 'fs'
import watch from 'node-watch'
import { Transcoder } from './ffmpeg/ffmpeg'
import { API } from './api/express'
import type { Queue } from './types'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'
const Port = process.env.PORT || '3000'

const transcoder = new Transcoder({ showLogs: true })

const getAllFiles = (dir: string): Queue[] => {
  const files = fs.readdirSync(dir)
  const filterFiles = files.filter(
    file => file.endsWith('.mp4') && !file.startsWith('._')
  )
  return filterFiles.map(file => {
    return {
      name: file.split('.mp4')[0],
      inputPath: `${dir}${file}`,
      outputPath: `${DestPath}${file.split('.mp4')[0]}`,
    }
  })
}

const watcher = watch(SourcePath, {
  filter: f => /\.mp4$/.test(f) && !/^\._/.test(f),
})

watcher.on('change', (evt, name) => {
  if (evt == 'update') {
    if (typeof name === 'string') {
      const re = new RegExp(`${SourcePath.replace(/\W/g, '')}/(\\w+)\.mp4`)
      const splitName = name.match(re)
      if (splitName) {
        const files: Queue = {
          name: splitName[1],
          inputPath: `${SourcePath}${splitName[1]}.mp4`,
          outputPath: `${DestPath}${splitName[1]}`,
        }
        console.log(`Added ${files.name} to queue`)
        transcoder.add(files)
      }
    }
  }
})

watcher.on('ready', () => {
  console.log('Auto HLS is ready')
  const previousFiles = getAllFiles(SourcePath)
  console.log(`Found ${previousFiles.length} files`)
  transcoder.bulkAdd(previousFiles)
  console.log(`Starting Express Server on port ${Port}`)
  new API(transcoder, parseInt(Port))
})
