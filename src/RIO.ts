import { TimeoutError } from "./errors"
import { delay, identity } from "./util"

/**
 * An effect that can be run with any environment.
 *
 * @see {@link RIO}
 */
export type IO<A> = RIO<unknown, A>

type Result<T> = T extends RIO<unknown, infer A> ? A : never

type IntersectEnvironment<T extends readonly unknown[]> =
  // Is it a tuple?
  T extends readonly [RIO<infer R, unknown>, ...infer Rest]
    ? R & IntersectEnvironment<Rest>
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
    ? [A, ...CollectResults<Rest>]
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
    ? A | UnionResults<Rest>
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
export class RIO<R, A> {
  readonly #unsafeRun: (env: R) => PromiseLike<A>

  private constructor(unsafeRun: (env: R) => PromiseLike<A>) {
    this.#unsafeRun = unsafeRun
  }

  /**
   * Run the effect with the specified environment, returning a {@link Promise}.
   *
   * If the effect doesn't use the environment, it's customary to pass `null` as an argument.
   *
   * @example
   *
   * > const one = RIO.success(1)
   * undefined
   * > await one.run(null)
   * 1
   */
  async run(env: R): Promise<A> {
    return this.#unsafeRun(env)
  }

  /**
   * Return a new effect by applying a function to the value produced by this
   * effect.
   *
   * @see {@link RIO.flatMap}
   * @example
   *
   * > const onePlusOne = RIO.success(1).map((n) => n + 1)
   * undefined
   * > await onePlusOne.run(null)
   * 2
   */
  map<B>(fn: (value: A) => B): RIO<R, B> {
    return new RIO(async (env) => fn(await this.#unsafeRun(env)))
  }

  /**
   * Sequentially compose two effects, passing the result of this effect to the next.
   *
   * @see {@link RIO.map}
   * @see {@link RIO.tap}
   * @example
   *
   * > const onePlusOne = RIO.success(1).flatMap((n) => RIO.success(n + 1))
   * undefined
   * > await onePlusOne.run(null)
   * 2
   */
  flatMap<R1, B>(fn: (value: A) => RIO<R1, B>): RIO<R & R1, B> {
    return new RIO(async (env) =>
      fn(await this.#unsafeRun(env)).#unsafeRun(env)
    )
  }

  /**
   * Returns an effect that executes this effect and returns its result if it succeeds, otherwise executing the
   * effect returned by `catcher`.
   *
   * @see {@link RIO.finally}
   * @see {@link RIO.orElse}
   * @example
   *
   * > await RIO.failure(new Error("Boom!")).catch((err) => RIO.success(2)).run(null)
   * 2
   * > await RIO.success(1).catch((err) => RIO.success(2)).run(null)
   * 1
   */
  catch<R1>(catcher: (error: unknown) => RIO<R1, A>): RIO<R & R1, A> {
    return new RIO(async (env) => {
      try {
        return await this.#unsafeRun(env)
      } catch (err) {
        return catcher(err).#unsafeRun(env)
      }
    })
  }

  /**
   * Execute this effect and return its result if it succeeds, otherwise execute the other effect.
   *
   * ```a.orElse(b)` is syntactic sugar for `a.catch(() => b)`.
   *
   * @see {@link RIO.catch}
   * @example
   *
   * > await RIO.failure(new Error("Boom!")).orElse(RIO.success(2))
   * 2
   * > await RIO.success(1).orElse(RIO.success(2))
   * 1
   */
  orElse<R1>(that: RIO<R1, A>): RIO<R & R1, A> {
    return this.catch(() => that)
  }

  /**
   * Return a new effect that executes the specified effect after this one, even if this effect fails.
   *
   * @see {@link RIO.bracket}
   * @example
   *
   * const effectThatMayFail = ???
   * const result = effectThatMayFail.finally(cleanup)
   *
   */
  finally<R1>(that: RIO<R1, void>): RIO<R & R1, A> {
    return new RIO(async (env) => {
      try {
        return await this.#unsafeRun(env)
      } finally {
        await that.#unsafeRun(env)
      }
    })
  }

  /**
   * Return a version of the effect that fails with a {@link TimeoutError} if the execution takes too long.
   *
   * @example
   *
   * > await RIO.success(1).delay(1000).timeout(500).run(null)
   * Uncaught TimeoutError: Timeout exceeded: 500ms
   */
  timeout(milliseconds: number): RIO<R, A> {
    return RIO.race([
      this as RIO<R, A>,
      new RIO(async () => {
        await delay(milliseconds)
        return Promise.reject(new TimeoutError(milliseconds))
      }),
    ])
  }

  /**
   *  Delays the execution of the effect by a number of milliseconds.
   *
   * @example
   *
   * > await RIO.success(1).delay(1000).run(null)
   * 1
   */
  delay(milliseconds: number): RIO<R, A> {
    return new RIO(async (env) => {
      await delay(milliseconds)
      return this.#unsafeRun(env)
    })
  }

  /**
   * Provide the environment for an effect. The resulting effect can be run with
   * any environment.
   *
   * @example
   *
   * > const plusOne = RIO.fromFunction((env) => env + 1)
   * undefined
   * > await plusOne.run(1)
   * 2
   * > await plusOne.provide(1).run(999)
   * 2
   */
  provide(env: R): IO<A> {
    return new RIO(() => this.#unsafeRun(env))
  }

  /**
   * Sequentially compose two effects, returning the result of this effect.
   *
   * @see {@link RIO.flatMap}
   * @example
   *
   * > const sayHello = (msg) => RIO.fromFunction(() => console.log(`Hello, ${msg}!`))
   * undefined
   * > await RIO.success("world").tap(sayHello).run(null)
   * Hello, world!
   * 'world'
   */
  tap<R1, B>(fn: (value: A) => RIO<R1, B>): RIO<R & R1, A> {
    return new RIO(async (env) => {
      const result = await this.#unsafeRun(env)
      await fn(result).#unsafeRun(env)
      return result
    })
  }

  /**
   * Returns an effect that logs the result of this effect with `console.log` and returns the result. Useful for
   * debugging.
   *
   * @param formatString - An optional printf-style format string.
   * @example
   *
   * > await RIO.success(1).log().run(null)
   * 1
   * 1
   * > await RIO.success("world").log("Hello, %s!").run(null)
   * Hello, world!
   * 'world'
   */
  log(formatString?: string): RIO<R, A> {
    return new RIO(async (env) => {
      const result = await this.#unsafeRun(env)

      if (formatString) {
        console.log(formatString, result)
      } else {
        console.log(result)
      }

      return result
    })
  }

  /**
   * Lift a value into a successful effect.
   *
   * @example
   *
   * > const one = await RIO.success(1)
   * undefined
   * > await one.run(null)
   * 1
   */
  static success<A>(value: A): IO<A> {
    return new RIO(() => Promise.resolve(value))
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
    return new RIO(() => Promise.reject(error))
  }

  /**
   * Create an effect that may use values from the environment. This is the main
   * building block for creating more complex effects.
   *
   * @example
   *
   * const getUser = (userId: number) =>
   *   RIO.effect(({ userRepository, logger }: HasUserRepository & HasLogger) => {
   *     logger.info("Getting user…")
   *     return userRepository.getUser(userId)
   *   })
   */
  static effect<R, A>(createEffect: (env: R) => RIO<R, A>): RIO<R, A> {
    return new RIO((env) => createEffect(env).#unsafeRun(env))
  }

  /**
   * Create an effect from a synchronous function.
   *
   * @see {@link fromPromise}
   * @example
   *
   * > const now = RIO.fromFunction(Date.now)
   * undefined
   * > await now.run(null)
   * 1647274623053
   */
  static fromFunction<R, A>(fn: (env: R) => A): RIO<R, A> {
    return new RIO((env) => Promise.resolve(fn(env)))
  }

  /**
   * Create an effect from a function returning a promise.
   *
   * @see {@link fromFunction}
   * @example
   *
   * const response = RIO.fromPromise(() => fetch("https://example.com"))
   */
  static fromPromise<R, A>(
    createPromise: (env: R) => PromiseLike<A>
  ): RIO<R, A> {
    return new RIO((env) => createPromise(env))
  }

  /**
   * Create an effect from a simple callback.
   *
   * @see {@link fromNodeCallback}
   * @example
   *
   * > const delay = (millis) => RIO.fromCallback((done) => setTimeout(done, millis))
   * undefined
   * > await delay(1000).map(() => 1).run(null)
   * 1
   */
  static fromCallback<R, A>(
    fn: (callback: (value: A) => void, env: R) => void
  ): RIO<R, A> {
    return new RIO((env) => new Promise((resolve) => fn(resolve, env)))
  }

  /**
   * Create an effect from a node-style callback.
   *
   * @see {@link fromCallback}
   * @example
   *
   * const readFile = RIO.fromNodeCallback((cb) => fs.readFile("file.txt", "utf-8", cb))
   */
  static fromNodeCallback<R, A>(
    fn: (callback: (err: unknown, value?: A) => void, env: R) => void
  ): RIO<R, A> {
    return new RIO((env) => {
      return new Promise((resolve, reject) =>
        fn(
          (err, value) => (err != null ? reject(err) : resolve(value as A)),
          env
        )
      )
    })
  }

  /**
   * Map each element of an array to an effect, and collect the results into an
   * array. Works serially.
   *
   * @see {@link map}
   * @see {@link allSeries}
   * @example
   *
   * > await RIO.mapSeries([1, 2, 3], (n) => RIO.success(n + 1)).run(null)
   * [ 2, 3, 4 ]
   */
  static mapSeries<R, A, B>(
    values: readonly A[],
    fn: (value: A) => RIO<R, B>
  ): RIO<R, B[]> {
    return new RIO(async (env) => {
      const result: B[] = []
      for (const value of values) {
        result.push(await fn(value).#unsafeRun(env))
      }
      return result
    })
  }

  /**
   * Map each element of an array to an effect and collect the results into an
   * array.
   *
   * @see {@link mapSeries}
   * @see {@link all}
   * @example
   *
   * > await RIO.map([1, 2, 3], (n) => RIO.success(n + 1)).run(null)
   * [ 2, 3, 4 ]
   *
   */
  static map<R, A, B>(
    values: readonly A[],
    fn: (value: A) => RIO<R, B>
  ): RIO<R, B[]> {
    return new RIO((env) => {
      const promises: Promise<B>[] = []
      for (const value of values) {
        promises.push(fn(value).run(env))
      }
      return Promise.all(promises)
    })
  }

  /**
   * Run an array of effects serially and collect the results into an array.
   *
   * @see {@link all}
   * @see {@link mapSeries}
   * @example
   *
   * > await RIO.allSeries([RIO.success(1), RIO.success(2)]).run(null)
   * [ 1, 2 ]
   */
  static allSeries<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
    effects: T
  ): RIO<IntersectEnvironment<T>, CollectResults<T>> {
    return RIO.mapSeries(effects, identity) as RIO<
      IntersectEnvironment<T>,
      CollectResults<T>
    >
  }

  /**
   * Run an array of effects in parallel and collect the results into an array.
   *
   * @see {@link allSeries}
   * @see {@link map}
   * @example
   *
   * > await RIO.all([RIO.success(1), RIO.success(2)]).run(null)
   * [ 1, 2 ]
   */
  static all<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
    effects: T
  ): RIO<IntersectEnvironment<T>, CollectResults<T>> {
    return RIO.map(effects, identity) as RIO<
      IntersectEnvironment<T>,
      CollectResults<T>
    >
  }

  static reduce<R, A, B>(
    values: readonly A[],
    initialValue: B,
    fn: (acc: B, value: A) => RIO<R, B>
  ): RIO<R, B> {
    return new RIO(async (env) => {
      let result = initialValue
      for (const value of values) {
        result = await fn(result, value).#unsafeRun(env)
      }
      return result
    })
  }

  /**
   *
   *
   * @example
   *
   * const users = bracket(
   *   getConnection,
   *   closeConnection,
   *   connection => queryAll(connection, "SELECT * FROM users")
   * )
   */
  static bracket<R, A, B, C>(
    /** An effect that acquires a resource */
    acquire: RIO<R, A>,
    /** An effect that releases the acquired resource */
    release: (value: A) => RIO<R, B>,
    /** An effect that uses the resource */
    use: (value: A) => RIO<R, C>
  ): RIO<R, C> {
    return new RIO(async (env) => {
      const resource = await acquire.#unsafeRun(env)
      try {
        return await use(resource).#unsafeRun(env)
      } finally {
        await release(resource).#unsafeRun(env)
      }
    })
  }

  static race<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
    effects: T
  ): RIO<IntersectEnvironment<T>, UnionResults<T>> {
    return new RIO((env) => {
      const promises: Promise<unknown>[] = []
      for (const effect of effects) {
        promises.push(effect.run(env))
      }
      return Promise.race(promises) as Promise<UnionResults<T>>
    })
  }

  static any<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
    effects: T
  ): RIO<IntersectEnvironment<T>, UnionResults<T>> {
    return new RIO((env) => {
      const promises: Promise<unknown>[] = []
      for (const effect of effects) {
        promises.push(effect.run(env))
      }
      return Promise.any(promises) as Promise<UnionResults<T>>
    })
  }

  static props<T extends Record<string, RIO<any, unknown>>>( // eslint-disable-line @typescript-eslint/no-explicit-any
    object: T
  ): RIO<IntersectEnvironment<T[keyof T][]>, { [K in keyof T]: Result<T[K]> }> {
    return new RIO(async (env) => {
      const entries = Object.entries(object)
      const newEntries = await Promise.all(
        entries.map(async ([key, effect]) => [
          key,
          await effect.#unsafeRun(env),
        ])
      )
      return Object.fromEntries(newEntries)
    })
  }
}
