export const DefaultRenditions = [
  {
    width: 640,
    height: 360,
    hlsTime: '4',
    bv: '800k',
    maxrate: '856k',
    bufsize: '1200k',
    ba: '96k',
    ts_title: '360p',
    master_title: '360p',
  },
  {
    width: 842,
    height: 480,
    hlsTime: '4',
    bv: '1400k',
    maxrate: '1498',
    bufsize: '2100k',
    ba: '128k',
    ts_title: '480p',
    master_title: '480p',
  },
  {
    width: 1280,
    height: 720,
    hlsTime: '4',
    bv: '2800k',
    maxrate: '2996k',
    bufsize: '4200k',
    ba: '128k',
    ts_title: '720p',
    master_title: '720p',
  },
  {
    width: 1920,
    height: 1080,
    hlsTime: '4',
    bv: '5000k',
    maxrate: '5350k',
    bufsize: '7500k',
    ba: '192k',
    ts_title: '1080p',
    master_title: '1080p',
  },
]

export const TranscodeCommand = [
  '-y',
  '-hwaccel',
  'cuvid',
  '-c:v',
  'h264_cuvid',
  '-fflags',
  '+discardcorrupt',
  '-analyzeduration',
  '10M',
  '-probesize',
  '32M',
]

export const ScreenshotCommand = ['-y', '-ss', '00:00:10']

export const FrameCountCommand = [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-count_frames',
  '-show_entries',
  'stream=nb_read_frames',
  '-print_format',
  'default=nokey=1:noprint_wrappers=1',
]