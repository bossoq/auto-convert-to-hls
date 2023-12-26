import { Transcoder } from './ffmpeg/ffmpeg'
import { API } from './api/express'
import { getAllFiles, watcher } from './watcher/watcher'
import type { Queue } from './types'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'
const Port = process.env.PORT || '4000'
const CorsHost = process.env.CORSHOST || 'https://vodstatus.picturo.us'

const timeoutArr = new Map<string, NodeJS.Timeout>()

const transcoder = new Transcoder({ showLogs: false })

// const watcherChange = watcher.on('add', (evt, name) => {
//   if (evt == 'update') {
//     if (typeof name === 'string') {
//       const re = new RegExp(`${SourcePath.replace(/\W/g, '')}\/(.+)\.mp4`)
//       const splitName = name.match(re)
//       if (splitName) {
//         const files: Queue = {
//           name: splitName[1],
//           inputPath: `${SourcePath}${splitName[1]}.mp4`,
//           outputPath: `${DestPath}${splitName[1]}`,
//         }
//         console.log(`Founded ${files.name}, checking for complete...`)
//         debouncer(files)
//       }
//     }
//   }
// })
const watcherChange = watcher.on('add', (path) => {
  const re = new RegExp(`${SourcePath.replace(/\W/g, '')}\/(.+)\.mp4`)
  const splitName = path.match(re)
  if (splitName) {
    const files: Queue = {
      name: splitName[1],
      inputPath: `${SourcePath}${splitName[1]}.mp4`,
      outputPath: `${DestPath}${splitName[1]}`,
    }
    console.log(`Founded ${files.name}, checking for complete...`)
    debouncer(files)
  }
})

watcher.on('ready', () => {
  console.log('Auto HLS is ready')
  const previousFiles = getAllFiles(SourcePath)
  console.log(`Found ${previousFiles.length} files`)
  transcoder.bulkAdd(previousFiles)
  console.log('Starting watcher')
  watcherChange
})

const debouncer = (queue: Queue) => {
  if (timeoutArr.has(queue.name)) {
    console.log(`${queue.name} is already in queue`)
    clearTimeout(timeoutArr.get(queue.name)!)
    timeoutArr.delete(queue.name)
  }
  const timer = setTimeout(() => {
    console.log(`${queue.name} is completely transferred`)
    clearTimeout(timeoutArr.get(queue.name)!)
    console.log(`Added ${queue.name} to queue`)
    transcoder.add(queue)
    timeoutArr.delete(queue.name)
  }, 10 * 1000)
  timeoutArr.set(queue.name, timer)
}

console.log(`Starting Express Server on port ${Port}`)
export const server = new API(transcoder, CorsHost, parseInt(Port))
