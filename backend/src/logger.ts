const timestamp = () => new Date().toISOString()

export const logInfo = (...args: unknown[]) => {
  console.log(`[${timestamp()}]`, ...args)
}

export const logError = (...args: unknown[]) => {
  console.error(`[${timestamp()}]`, ...args)
}
