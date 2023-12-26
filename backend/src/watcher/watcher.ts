import fs from 'fs'
// import watch from 'node-watch'
import { watch as chokidarWatch } from 'chokidar'
import type { Queue } from '../types'

const SourcePath = process.env.SOURCE || '/source/'
const DestPath = process.env.DEST || '/dest/'

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

export const watcher = chokidarWatch(SourcePath, {
  ignored: /^\./,
  persistent: true,
  usePolling: true,
})
// export const watcher = watch(SourcePath, {
//   filter: (f) => /\.mp4$/.test(f) && !/^\._/.test(f),
// })
