import { Runtime } from "./Runtime"

/**
 * An effect that can be run with any environment.
 *
 * @see {@link RIO}
 */
export type IO<A> = RIO<unknown, A>

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Result<T> = T extends RIO<unknown, infer A> ? A : never

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
   * Transforms the result of a successful effect by applying the function `fn` to it.
   *
   * @param fn A function that transforms the result.
   * @see {@link RIO.flatMap}
   * @example
   *
   * > const onePlusOne = RIO.success(1).map((n) => n + 1)
   * undefined
   * > await onePlusOne.run(null)
   * 2
   */
  map<B>(fn: (value: A) => B): RIO<R, B> {
    return new FlatMap(this, (value) => new Success(fn(value)))
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

  /**
   * Create an effect from an asynchronous function returning a promise. The
   * function receives the environment as the only argument.
   *
   * @example
   *
   * > const status = RIO.fromPromise(() => fetch("www.example.com").then((r) => r.status))
   * undefined
   * > await status.run(null)
   * 200
   *
   */
  static fromPromise<R, A>(fn: (env: R) => PromiseLike<A>): RIO<R, A> {
    return new FromPromise(fn)
  }
}

export const enum Tag {
  Done = 0,
  Success = 1,
  Failure = 2,
  FlatMap = 3,
  FromFunction = 4,
  FromPromise = 5,
}

export class Done<A> extends RIO<unknown, A> {
  constructor(readonly value: A) {
    super(Tag.Done)
  }
}

export class Success<A> extends RIO<unknown, A> {
  constructor(readonly value: A) {
    super(Tag.Success)
  }
}

export class Failure extends RIO<unknown, never> {
  constructor(readonly error: unknown) {
    super(Tag.Failure)
  }

  override flatMap<R1, B>(): RIO<R1, B> {
    return this
  }
}

export class FlatMap<R, R1, A, B> extends RIO<R & R1, B> {
  constructor(
    readonly effect: RIO<R, A>,
    readonly fn: (value: A) => RIO<R1, B>
  ) {
    super(Tag.FlatMap)
  }
}

export class FromFunction<R, A> extends RIO<R, A> {
  constructor(readonly fn: (env: R) => A) {
    super(Tag.FromFunction)
  }
}

export class FromPromise<R, A> extends RIO<R, A> {
  constructor(readonly fn: (env: R) => PromiseLike<A>) {
    super(Tag.FromPromise)
  }
}
