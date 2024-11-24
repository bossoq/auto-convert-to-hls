import { Transcoder } from './ffmpeg/ffmpeg'
import { API } from './api/express'
import { getAllFiles, watcher } from './watcher/watcher'
import {
  pubsub,
  getRecording,
  getDriveFile,
  getConferences,
} from './watcher/pubsub'
import { PrismaClient } from '@prisma/client'
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

const getAllUnfinished = async () => {
  const prisma = new PrismaClient()
  const files: Queue[] = []
  const undownloaded = await prisma.videoProcess.findMany({
    where: {
      OR: [
        {
          downloaded: false,
          processed: false,
        },
        {
          downloaded: true,
          processed: false,
        },
      ],
    },
  })
  console.log(`Found ${undownloaded.length} undownloaded files`)
  for (const data of undownloaded) {
    const conferenceIds = await getConferences(data.spaceName)
    for (const conferenceId of conferenceIds) {
      const fileIds = await getRecording(conferenceId)
      if (fileIds.length === 0) {
        continue
      }
      let multipleFiles = false
      if (fileIds.length > 1) {
        multipleFiles = true
      }
      fileIds.forEach(async (fileId, idx) => {
        const driveFile = await getDriveFile(fileId, data, idx, multipleFiles)
        await prisma.videoProcess.update({
          where: {
            id: data.id,
          },
          data: {
            downloaded: true,
          },
        })
        const file: Queue = {
          name: driveFile.replace('.mp4', ''),
          inputPath: `${SourcePath}google/${driveFile}`,
          outputPath: `${DestPath}${driveFile.replace('.mp4', '')}`,
          autoPublish: true,
          meta: {
            id: Number(data.id),
            participants: data.participants as number[],
            className: data.className,
          },
        }
        console.log(`Downloaded ${file.name}`)
        files.push(file)
      })
    }
  }
  return files
}

const watcherChange = watcher.on('add', (path) => {
  const re = new RegExp(`${SourcePath.replace(/\W/g, '')}\/(.+)\.mp4`)
  const splitName = path.match(re)
  if (splitName) {
    if (splitName[1].startsWith('.')) return
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
pubsub().then(async (sub) => {
  const previousFiles = await getAllUnfinished()
  console.log(`Found ${previousFiles.length} files`)
  transcoder.bulkAdd(previousFiles)
  console.log('Starting pubsub')
  const prisma = new PrismaClient()
  sub.on('message', async (message) => {
    if (
      message.attributes['ce-type'] ===
      'google.workspace.meet.recording.v2.fileGenerated'
    ) {
      const subject = message.attributes['ce-subject']
      const spaceName = subject.match(
        /^\/\/meet\.googleapis\.com\/(spaces\/.+)$/
      )
      if (!spaceName) {
        message.ack()
        return
      }
      const recordingPayload = JSON.parse(message.data.toString()).recording
        .name as string
      const conferenceRecord = recordingPayload.match(
        /^(conferenceRecords\/.+)\/recordings\/.+$/
      )
      if (!conferenceRecord) {
        message.ack()
        return
      }
      const conferenceId = conferenceRecord[1]
      const fileIds = await getRecording(conferenceId)
      if (fileIds.length === 0) {
        message.ack()
        return
      }
      const videoData = await prisma.videoProcess.findFirst({
        where: {
          spaceName: spaceName[1],
        },
      })
      if (!videoData) {
        message.ack()
        return
      }
      let multipleFiles = false
      if (fileIds.length > 1) {
        multipleFiles = true
      }
      fileIds.forEach(async (fileId, idx) => {
        const driveFile = await getDriveFile(
          fileId,
          videoData,
          idx,
          multipleFiles
        )
        await prisma.videoProcess.update({
          where: {
            id: videoData.id,
          },
          data: {
            downloaded: true,
          },
        })
        const files: Queue = {
          name: driveFile.replace('.mp4', ''),
          inputPath: `${SourcePath}google/${driveFile}`,
          outputPath: `${DestPath}${driveFile.replace('.mp4', '')}`,
          autoPublish: true,
          meta: {
            id: Number(videoData.id),
            participants: videoData.participants as number[],
            className: videoData.className,
          },
        }
        console.log(`Added ${files.name} to queue`)
        transcoder.add(files)
      })
      // message.ack()
    }
    // message.ack()
  })
  sub.on('error', (error) => {
    console.error(error)
  })
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
