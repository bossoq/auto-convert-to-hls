import fs from 'fs'
import { Transcoder } from './ffmpeg'

const getAllFiles = (dir: string) => {
  const files = fs.readdirSync(dir)
  const filterFiles = files.filter(file => file.endsWith('.mp4'))
  return filterFiles.map(file => {
    return {
      name: file.split('.mp4')[0],
      path: `/source/${file}`,
    }
  })
}

const converter = async () => {
  const dir = '/mnt/disks/CacheDrive/recordings'
  const files = getAllFiles(dir)
  for (const file of files) {
    const outDir = `/dest/${file.name}`
    console.log(`Transcoding ${file.name} ${outDir}`)
    const t = new Transcoder(file.path, outDir, { showLogs: true })
    try {
      const hlsPath = await t.transcode()
      console.log(`Transcoded ${file.name} to ${hlsPath}`)
    } catch (e) {
      console.log(`Failed to transcode ${file.name} ${e}`)
    }
  }
  // files.forEach(async file => {
  //   const outDir = `/dest/${file.name}`
  //   console.log(`Transcoding ${file.name} ${outDir}`)
  //   const t = new Transcoder(file.path, outDir, { showLogs: true })
  //   try {
  //     const hlsPath = await t.transcode()
  //     console.log(`Transcoded ${file.name} to ${hlsPath}`)
  //   } catch (e) {
  //     console.log(`Failed to transcode ${file.name} ${e}`)
  //   }
  // })
}

converter()
