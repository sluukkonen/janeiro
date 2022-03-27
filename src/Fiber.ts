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
          const eff = current as Done<A>
          return eff.value
        }
        case Tag.Success: {
          const eff = current as Success<unknown>
          try {
            current = this.runContinuation(eff.value)
          } catch (error) {
            current = new Failure(error)
          }
          break
        }
        case Tag.Failure: {
          const eff = current as Failure
          current = this.handleError(eff.error)
          break
        }
        case Tag.FlatMap: {
          const eff = current as FlatMap<unknown, unknown, unknown, unknown>
          current = this.pushContinuation(eff)
          break
        }
        case Tag.Catch: {
          const eff = current as Catch<unknown, unknown, unknown, unknown>
          current = this.pushContinuation(eff)
          break
        }
        case Tag.FromFunction: {
          const eff = current as FromFunction<unknown, unknown>
          try {
            current = this.runContinuation(eff.fn(env))
          } catch (error) {
            current = new Failure(error)
          }
          break
        }
        case Tag.FromPromise: {
          const eff = current as FromPromise<unknown, unknown>
          try {
            current = this.runContinuation(await eff.fn(env))
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
