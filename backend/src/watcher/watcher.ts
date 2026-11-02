import fs from 'fs'
import path from 'path'
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

// Only visible *.mp4 files directly inside SOURCE are ingested. The SOURCE
// root itself must NOT be ignored — chokidar runs this predicate on the root
// too, and ignoring it silently disables the whole watcher. Subdirectories
// (google/ is fed by pubsub, converted/ holds finished sources) are skipped.
export const isIgnored = (file: string, stats?: fs.Stats): boolean => {
  const root = path.resolve(SourcePath)
  const target = path.resolve(file)
  if (target === root) return false
  if (path.dirname(target) !== root) return true
  if (stats?.isDirectory()) return true
  const base = path.basename(target)
  return base.startsWith('.') || !base.endsWith('.mp4')
}

export const watcher = chokidarWatch(SourcePath, {
  ignored: isIgnored,
  persistent: true,
  usePolling: true,
  depth: 0,
  // Emit 'add' only once the file size has been stable, so a large copy is
  // not picked up half-written.
  awaitWriteFinish: {
    stabilityThreshold: 10 * 1000,
    pollInterval: 1000,
  },
})
