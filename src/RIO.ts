import { Runtime } from "inspector"

/**
 * An effect that can be run with any environment.
 *
 * @see {@link RIO}
 */
export type IO<A> = RIO<unknown, A>

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Result<T> = T extends RIO<unknown, infer A> ? A : never

type Continuation<R, A, B> = (value: A) => RIO<R, B>
type Stack = Continuation<unknown, unknown, unknown>[]

type IntersectEnvironment<T extends readonly unknown[]> =
  // Is it a tuple?
  T extends readonly [RIO<infer R, unknown>, ...infer Rest]
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
      R & IntersectEnvironment<Rest>
    : // Terminate tuple recursion
    T extends []
    ? unknown
    : // Is it an array?
    T extends readonly RIO<infer R, unknown>[]
    ? R
    : never // Should never happen

type CollectResults<T extends readonly unknown[]> =
  // Is it a tuple?
  T extends readonly [RIO<never, infer A>, ...infer Rest]
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
      [A, ...CollectResults<Rest>]
    : // Terminate tuple recursion.
    T extends []
    ? []
    : // Is it an array?
    T extends readonly RIO<never, infer A>[]
    ? A[]
    : never // Should never happen

type UnionResults<T extends readonly unknown[]> =
  // Is it a tuple?
  T extends readonly [RIO<never, infer A>, ...infer Rest]
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
      A | UnionResults<Rest>
    : // Terminate tuple recursion.
    T extends []
    ? never
    : // Is it an array?
    T extends readonly RIO<never, infer A>[]
    ? A
    : never // Should never happen

/**
 * The RIO class abstracts an effectual function of the form `(env: R) => Promise<A>`. Conceptually, it can be thought
 * as a lazy promise that has access to some dependencies via the environment `R`.
 */
export abstract class RIO<R, A> {
  protected constructor(readonly tag: Tag) {}

  /**
   * Run an effect with the provided environment. Returns a promise.
   *
   * If the effect doesn't use the environment, it's customary to pass `null` as the environment.
   *
   * @example
   *
   * > const one = RIO.success(1)
   * undefined
   * > await one.run(null)
   * 1
   */
  run(env: R): Promise<A> {
    return new Runtime().run(this, env)
  }

  /**
   * Sequentially compose two effects, passing the result of this effect to the next.
   *
   * @see {@link RIO.map}
   * @example
   *
   * > const onePlusOne = RIO.success(1).flatMap((n) => RIO.success(n + 1))
   * undefined
   * > await onePlusOne.run(null)
   * 2
   *
   * > const fail = RIO.success(1).flatMap((n) => RIO.failure(new Error("Boom!"))
   * undefined
   * > await fail.run(null)
   * Uncaught Error: Boom!
   */
  flatMap<R1, B>(fn: (value: A) => RIO<R1, B>): RIO<R & R1, B> {
    return new FlatMap(this, fn)
  }

  /**
   * Lift a value into a successful effect.
   *
   * @example
   *
   * > const one = RIO.success(1)
   * undefined
   * > await one.run(null)
   * 1
   */
  static success<A>(value: A): IO<A> {
    return new Success(value)
  }

  /**
   * Lift an error into a failed effect.
   *
   * @example
   *
   * > const boom = RIO.failure(new Error("Boom!"))
   * undefined
   * > await boom.run(null)
   * Uncaught Error: Boom!
   *     at REPL11:1:40
   */
  static failure(error: unknown): IO<never> {
    return new Failure(error)
  }

  /**
   * Create an effect from a synchronous function. The function receives the
   * environment as the only argument.
   *
   * @example
   *
   * > const random = RIO.fromFunction(Math.random)
   * undefined
   * > await random.run(null)
   * 0.9219058839851237
   *
   */
  static fromFunction<R, A>(fn: (env: R) => A): RIO<R, A> {
    return new FromFunction(fn)
  }
}

const enum Tag {
  Done = 0,
  Success = 1,
  Failure = 2,
  FlatMap = 3,
  FromFunction = 4,
}

class Done<A> extends RIO<unknown, A> {
  constructor(readonly value: A) {
    super(Tag.Done)
  }
}

class Success<A> extends RIO<unknown, A> {
  constructor(readonly value: A) {
    super(Tag.Success)
  }
}

class Failure extends RIO<unknown, never> {
  constructor(readonly error: unknown) {
    super(Tag.Failure)
  }

  override flatMap<R1, B>(): RIO<R1, B> {
    return this
  }
}

class FlatMap<R, R1, A, B> extends RIO<R & R1, B> {
  constructor(
    readonly effect: RIO<R, A>,
    readonly continuation: Continuation<R1, A, B>
  ) {
    super(Tag.FlatMap)
  }
}

class FromFunction<R, A> extends RIO<R, A> {
  constructor(readonly fn: (env: R) => A) {
    super(Tag.FromFunction)
  }
}

class Runtime {
  private stack: Stack

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
      }
    }
  }

  private runContinuation(value: unknown): IO<unknown> {
    const continuation = this.stack.pop()
    if (!continuation) return new Done(value)
    return continuation(value)
  }
}
