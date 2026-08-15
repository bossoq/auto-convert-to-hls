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
import { logInfo, logError } from './logger'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'
const Port = process.env.PORT || '4000'
const CorsHost = process.env.CORSHOST || 'https://vodstatus.picturo.us'

const timeoutArr = new Map<string, NodeJS.Timeout>()

const transcoder = new Transcoder({ showLogs: true })

const getAllUnfinished = async () => {
  const prisma = new PrismaClient()
  try {
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
    logInfo(`Found ${undownloaded.length} undownloaded files`)
    for (const data of undownloaded) {
      const conferenceIds = await getConferences(data.spaceName)
      for (const conferenceId of conferenceIds) {
        const fileIds = await getRecording(conferenceId)
        if (fileIds.length === 0) continue
        const multipleFiles = fileIds.length > 1
        for (const [idx, fileId] of fileIds.entries()) {
          const driveFile = await getDriveFile(fileId, data, idx, multipleFiles)
          await prisma.videoProcess.update({
            where: { id: data.id },
            data: { downloaded: true },
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
          logInfo(`Downloaded ${file.name}`)
          logInfo(`Added ${file.name} to queue`)
          transcoder.add(file)
        }
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

watcher.on('add', (path) => {
  const re = new RegExp(`${SourcePath.replace(/\W/g, '')}\\/(.+)\\.mp4$`)
  const splitName = path.match(re)
  if (splitName) {
    if (splitName[1].startsWith('.')) return
    const files: Queue = {
      name: splitName[1],
      inputPath: `${SourcePath}${splitName[1]}.mp4`,
      outputPath: `${DestPath}${splitName[1]}`,
    }
    logInfo(`Founded ${files.name}, checking for complete...`)
    debouncer(files)
  }
})

watcher.on('ready', () => {
  logInfo('Auto HLS is ready')
  const previousFiles = getAllFiles(SourcePath)
  logInfo(`Found ${previousFiles.length} files`)
  transcoder.bulkAdd(previousFiles)
  logInfo('Starting watcher')
})

pubsub()
  .then(async (sub) => {
    await getAllUnfinished()
    logInfo('Starting pubsub')
    const prisma = new PrismaClient()
    sub.on('message', async (message) => {
      if (
        message.attributes['ce-type'] !==
        'google.workspace.meet.recording.v2.fileGenerated'
      ) {
        return
      }
      try {
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
          where: { spaceName: spaceName[1], processed: false },
          orderBy: { createdAt: 'desc' },
        })
        if (!videoData) {
          message.ack()
          return
        }
        const multipleFiles = fileIds.length > 1
        for (const [idx, fileId] of fileIds.entries()) {
          const driveFile = await getDriveFile(
            fileId,
            videoData,
            idx,
            multipleFiles
          )
          await prisma.videoProcess.update({
            where: { id: videoData.id },
            data: { downloaded: true },
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
          logInfo(`Added ${files.name} to queue`)
          transcoder.add(files)
        }
        message.ack()
      } catch (err) {
        logError(`Failed to process pubsub message ${message.id}: ${err}`)
        message.nack()
      }
    })
    sub.on('error', (error) => {
      logError(error)
    })
  })
  .catch((err) => {
    logError('Pub/Sub ingestion failed to start:', err)
  })

const debouncer = (queue: Queue) => {
  if (timeoutArr.has(queue.name)) {
    logInfo(`${queue.name} is already in queue`)
    clearTimeout(timeoutArr.get(queue.name)!)
    timeoutArr.delete(queue.name)
  }
  const timer = setTimeout(() => {
    logInfo(`${queue.name} is completely transferred`)
    clearTimeout(timeoutArr.get(queue.name)!)
    logInfo(`Added ${queue.name} to queue`)
    transcoder.add(queue)
    timeoutArr.delete(queue.name)
  }, 10 * 1000)
  timeoutArr.set(queue.name, timer)
}

logInfo(`Starting Express Server on port ${Port}`)
export const server = new API(transcoder, CorsHost, parseInt(Port))
transcoder.setIO(server.io)
