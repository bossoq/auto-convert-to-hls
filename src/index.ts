import fs from 'fs'
import { Transcoder } from './ffmpeg'

const getAllFiles = (dir: string) => {
  const files = fs.readdirSync(dir)
  let filterFiles = files.filter(file => file.endsWith('.mp4'))
  filterFiles = filterFiles.filter(file => !file.startsWith('._'))
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
    const realPath = `/mnt/disks/SlowPhatty/VOD/${file.name}`
    fs.mkdirSync(realPath, { recursive: true })
    const t = new Transcoder(file.path, outDir, realPath, { showLogs: true })
    try {
      const hlsPath = await t.transcode()
      console.log(`Transcoded ${file.name} to ${hlsPath}`)
    } catch (e) {
      console.log(`Failed to transcode ${file.name} ${e}`)
    }
    fs.renameSync(
      `${dir}/${file.name}.mp4`,
      `${dir}/converted/${file.name}.mp4`
    )
    console.log(`Successfully moved file ${file.name}.mp4`)
  }
}

converter()
