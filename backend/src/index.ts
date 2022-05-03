import { Transcoder } from './ffmpeg/ffmpeg'
import { API } from './api/express'
import { checkFile, getAllFiles, watcher } from './watcher/watcher'
import type { Queue } from './types'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'
const Port = process.env.PORT || '4000'

const lastAdded: Queue[] = []

const transcoder = new Transcoder({ showLogs: false })

const watcherChange = watcher.on('change', (evt, name) => {
  if (evt == 'update') {
    if (typeof name === 'string') {
      const re = new RegExp(`${SourcePath.replace(/\W/g, '')}\/(.+)\.mp4`)
      const splitName = name.match(re)
      if (splitName) {
        const files: Queue = {
          name: splitName[1],
          inputPath: `${SourcePath}${splitName[1]}.mp4`,
          outputPath: `${DestPath}${splitName[1]}`,
        }
        if (lastAdded.find((file) => file.name === files.name)) return
        lastAdded.push(files)
        console.log(`Founded ${files.name}, checking for complete...`)
        checkFile(files, 0, transcoder)
      }
    }
  }
})

watcher.on('ready', () => {
  console.log('Auto HLS is ready')
  const previousFiles = getAllFiles(SourcePath)
  console.log(`Found ${previousFiles.length} files`)
  transcoder.bulkAdd(previousFiles)
  console.log('Starting watcher')
  watcherChange
  console.log(`Starting Express Server on port ${Port}`)
  new API(transcoder, parseInt(Port))
  setInterval(() => {
    if (lastAdded.length > 100) lastAdded.slice(-100)
  }, 7 * 24 * 60 * 60 * 1000)
})
