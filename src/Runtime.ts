import {
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

export class Runtime {
  private stack: Array<(value: unknown) => RIO<unknown, unknown>>

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
          current = this.runContinuation(eff.value)
          break
        }
        case Tag.Failure: {
          const eff = current as Failure
          throw eff.error
        }
        case Tag.FlatMap: {
          const eff = current as FlatMap<unknown, unknown, unknown, unknown>
          this.stack.push(eff.continuation)
          current = eff.effect
          break
        }
        case Tag.FromFunction: {
          const eff = current as FromFunction<unknown, unknown>
          current = this.runContinuation(eff.fn(env))
          break
        }
        case Tag.FromPromise: {
          const eff = current as FromPromise<unknown, unknown>
          current = this.runContinuation(await eff.fn(env))
          break
        }
      }
    }
  }

  private runContinuation(value: unknown): IO<unknown> {
    const continuation = this.stack.pop()
    if (!continuation) return new Done(value)
    return continuation(value)
  }
}
