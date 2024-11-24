import { JWT } from 'google-auth-library'
import { PubSub, type Subscription } from '@google-cloud/pubsub'
import { ConferenceRecordsServiceClient } from '@google-apps/meet'
import { google } from 'googleapis'
import { writeFile } from 'node:fs'
import type { videoProcess } from '@prisma/client'

const SourcePath = process.env.SOURCE || '/source/'
const ProjectId = process.env.PROJECT_ID || ''
const TopicName = process.env.TOPIC_NAME || ''
const SubscriptionName = process.env.SUBSCRIPTION_NAME || ''
const ClientEmail = process.env.CLIENT_EMAIL || ''
const PrivateKey = process.env.PRIVATE_KEY || ''
const Subject = process.env.SUBJECT || ''

export const pubsub = async (): Promise<Subscription> => {
  const pubsub = new PubSub({
    projectId: ProjectId,
    credentials: {
      client_email: ClientEmail,
      private_key: PrivateKey,
    },
  })

  const [topic] = await pubsub.topic(TopicName).get({ autoCreate: true })
  console.log(`Topic ${topic.name} is ready`)

  const [subscription] = await topic
    .subscription(SubscriptionName)
    .get({ autoCreate: true })
  console.log(`Subscription ${subscription.name} is ready`)

  return subscription
}

const saClient = new JWT({
  email: ClientEmail,
  key: PrivateKey,
  scopes: [
    'https://www.googleapis.com/auth/meetings.space.created',
    'https://www.googleapis.com/auth/meetings.space.readonly',
    'https://www.googleapis.com/auth/drive',
  ],
  subject: Subject,
})

export const getRecording = async (conferenceId: string): Promise<string[]> => {
  const client = new ConferenceRecordsServiceClient({
    authClient: saClient,
  })
  const [recordings] = await client.listRecordings({
    parent: conferenceId,
  })
  const fileIds = recordings
    .map(
      (recording) =>
        recording.driveDestination && recording.driveDestination.file
    )
    .filter((fileId): fileId is string => fileId !== undefined)
  return fileIds
}

export const getDriveFile = async (
  fileId: string,
  videoData: videoProcess,
  idx: number,
  multipleFiles: boolean
): Promise<string> => {
  const { createdAt } = videoData
  let fileName = `IKVideo_${createdAt
    .toISOString()
    .replaceAll('-', '')
    .replaceAll('T', '')
    .replaceAll(':', '')
    .slice(0, 14)}`
  if (multipleFiles) {
    fileName = `${fileName}_${idx}.mp4`
  } else {
    fileName = `${fileName}.mp4`
  }
  const client = google.drive({
    version: 'v3',
    auth: saClient,
  })
  try {
    const file = await client.files.get({
      fileId,
      alt: 'media',
    })
    const fullPath = `${SourcePath}google/${fileName}`
    if (file.status === 200) {
      const data = file.data as unknown as Blob
      writeFile(fullPath, Buffer.from(await data.arrayBuffer()), (err) => {
        if (err) {
          throw new Error('Failed to write file')
        }
      })
      return fileName
    } else {
      throw new Error('Failed to get file')
    }
  } catch (error) {
    throw new Error('Failed to get file')
  }
}

export const getConferences = async (spaceName: string): Promise<string[]> => {
  const client = new ConferenceRecordsServiceClient({
    authClient: saClient,
  })
  const [conferences] = await client.listConferenceRecords({
    filter: `space.name="${spaceName}"`,
  })
  const conferenceIds = conferences
    .map((conference) => conference.name)
    .filter(
      (conferenceId): conferenceId is string => conferenceId !== undefined
    )
  return conferenceIds
}
