export class TimeoutError extends Error {
  constructor(public timeout: number) {
    super(`Timeout exceeded: ${timeout}ms`)
  }
}
TimeoutError.prototype.name = "TimeoutError"
