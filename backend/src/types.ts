export interface Queue {
  name: string
  inputPath: string
  outputPath: string
  autoPublish?: boolean
  meta?: {
    id: number
    participants: number[]
    className: string
  }
}

export interface Options {
  showLogs?: boolean
}
