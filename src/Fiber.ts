import {
  Catch,
  Done,
  Failure,
  FlatMap,
  FromFunction,
  FromPromise,
  IO,
  RIO,
  Success,
  Tag,
} from "./RIO"

type Continuation =
  | FlatMap<unknown, unknown, unknown, unknown>
  | Catch<unknown, unknown, unknown, unknown>

export class Fiber {
  private stack: Continuation[]

  constructor() {
    this.stack = []
  }

  async run<R, A>(effect: RIO<R, A>, env: R): Promise<A> {
    let current: RIO<unknown, unknown> = effect

    // eslint-disable-next-line no-constant-condition
    while (true) {
      switch (current.tag) {
        case Tag.Done: {
          const done = current as Done<A>
          return done.value
        }
        case Tag.Success: {
          const success = current as Success<unknown>
          try {
            current = this.runContinuation(success.value)
          } catch (error) {
            current = new Failure(error)
          }
          break
        }
        case Tag.Failure: {
          const failure = current as Failure
          current = this.handleError(failure.error)
          break
        }
        case Tag.FlatMap: {
          const flatMap = current as FlatMap<unknown, unknown, unknown, unknown>
          const inner = flatMap.effect

          switch (inner.tag) {
            case Tag.Success: {
              const success = inner as Success<unknown>
              try {
                current = flatMap.fn(success.value)
              } catch (error) {
                current = new Failure(error)
              }
              break
            }
            case Tag.FromFunction: {
              const fromFunction = inner as FromFunction<unknown, unknown>
              try {
                current = flatMap.fn(fromFunction.fn(env))
              } catch (error) {
                current = new Failure(error)
              }
              break
            }
            case Tag.FromPromise: {
              const fromPromise = inner as FromFunction<unknown, unknown>
              try {
                current = flatMap.fn(await fromPromise.fn(env))
              } catch (error) {
                current = new Failure(error)
              }
              break
            }
            default: {
              current = this.pushContinuation(flatMap)
            }
          }

          break
        }
        case Tag.Catch: {
          const eff = current as Catch<unknown, unknown, unknown, unknown>
          current = this.pushContinuation(eff)
          break
        }
        case Tag.FromFunction: {
          const fromFunction = current as FromFunction<unknown, unknown>
          try {
            current = this.runContinuation(fromFunction.fn(env))
          } catch (error) {
            current = new Failure(error)
          }
          break
        }
        case Tag.FromPromise: {
          const fromPromise = current as FromPromise<unknown, unknown>
          try {
            current = this.runContinuation(await fromPromise.fn(env))
          } catch (error) {
            current = new Failure(error)
          }
          break
        }
      }
    }
  }

  private runContinuation(value: unknown): IO<unknown> {
    const continuation = this.popContinuation()
    if (continuation === undefined) return new Done(value)
    return continuation.fn(value)
  }

  private pushContinuation(continuation: Continuation): IO<unknown> {
    this.stack.push(continuation)
    return continuation.effect
  }

  private unwindStack(): Continuation | undefined {
    let continuation = this.stack.pop()
    while (continuation !== undefined && continuation.tag !== Tag.Catch) {
      continuation = this.stack.pop()
    }
    return continuation
  }

  private popContinuation(): Continuation | undefined {
    let continuation = this.stack.pop()
    while (continuation !== undefined && continuation.tag === Tag.Catch) {
      continuation = this.stack.pop()
    }
    return continuation
  }

  private handleError(error: unknown): IO<unknown> {
    const errorHandler = this.unwindStack()
    if (errorHandler !== undefined) return errorHandler.fn(error)
    else throw error
  }
}
