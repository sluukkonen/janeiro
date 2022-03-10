import { TimeoutError } from "./errors"
import { identity, delay } from "./util"

/** An effect that can be run with any environment. */
export type IO<A> = RIO<unknown, A>

type CollectEnvironment<T extends readonly unknown[]> =
  // Is it a tuple?
  T extends readonly [RIO<infer R, unknown>, ...infer Rest]
    ? R & CollectEnvironment<Rest>
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

export class RIO<R, A> {
  constructor(
    /**
     * An unsafe version of {@link RIO.run}.
     *
     * Compared to {@link RIO.run}, this function is not guaranteed to not throw,
     * so unless you know what you're doing, you should use {@link RIO.run}
     * instead.
     *
     * @see {@link RIO.run}
     */
    public unsafeRun: (env: R) => PromiseLike<A>
  ) {}

  /**
   * Run the effect with the specified environment, returning a {@link Promise}.
   *
   * If the effect doesn't use the environment, it's customary to pass `null` as an argument.
   *
   * @example
   *
   * await F.success(1).map((n) => n + 1).run(null)
   * // => 2
   */
  async run(env: R): Promise<A> {
    return this.unsafeRun(env)
  }

  /**
   * Return a new effect by applying a function to the value produced by this
   * effect.
   *
   * @example
   *
   * await F.success(1).map((n) => n + 1).run(null)
   * // => 2
   */
  map<B>(fn: (value: A) => B): RIO<R, B> {
    return new RIO(async (env) => fn(await this.unsafeRun(env)))
  }

  /**
   * Sequentially compose two effects, passing the value produced by this effect to the next.
   *
   * @example
   *
   * await F.success(1).flatMap((n) => F.success(n + 1)).run(null)
   * // => 2
   */
  flatMap<R1, B>(fn: (value: A) => RIO<R1, B>): RIO<R & R1, B> {
    return new RIO(async (env) => fn(await this.unsafeRun(env)).unsafeRun(env))
  }

  /**
   * Execute this effect and return its value if it succeeds, otherwise execute
   * the effect returned by the function.
   *
   * @see {@link RIO.finally}
   * @see {@link RIO.orElse}
   * @example
   *
   * await F.failure(new Error("Boom!")).catch((err) => F.success(1)).run(null)
   * // => 1
   *
   * await F.success(1).catch((err) => F.success(2)).run(null)
   * // => 1
   */
  catch<R1>(fn: (error: unknown) => RIO<R1, A>): RIO<R & R1, A> {
    return new RIO(async (env) => {
      try {
        return await this.unsafeRun(env)
      } catch (err) {
        return fn(err).unsafeRun(env)
      }
    })
  }

  /**
   * Execute this effect and return its value if it succeeds, otherwise execute the other effect.
   *
   * ```a.orElse(b)` is syntactic sugar for `a.catch(() => b)`.
   *
   * @see {@link RIO.catch}
   * @example
   *
   * await F.failure(new Error("Boom!")).orElse(F.success(1))
   * // => 1
   *
   * await F.success(1).orElse(F.success(2))
   * // => 1
   */
  orElse<R1>(that: RIO<R1, A>): RIO<R & R1, A> {
    return this.catch(() => that)
  }

  /**
   * Return a new effect that executes the specified effect after this one, even if it fails.
   *
   * @see {@link bracket}
   * @example
   *
   * const effectThatMayFail = ???
   * const result = effectThatMayFail.finally(cleanup)
   *
   */

  finally<R1>(that: RIO<R1, void>): RIO<R & R1, A> {
    return new RIO(async (env) => {
      try {
        return await this.unsafeRun(env)
      } finally {
        await that.unsafeRun(env)
      }
    })
  }

  /**
   * Return a version of the effect that fails with a {@link TimeoutError} if the execution takes too long.
   *
   * @example
   *
   * await F.success(1).delay(1000).timeout(500).run(null)
   * // => TimeoutError: Timeout exceeded: 500ms
   */
  timeout(milliseconds: number): RIO<R, A> {
    return race([
      this,
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
   * await F.success(1).delay(1000).run(null)
   * // Wait one second…
   * // => 1
   */
  delay(milliseconds: number): RIO<R, A> {
    return new RIO(async (env) => {
      await delay(milliseconds)
      return this.unsafeRun(env)
    })
  }

  /**
   * Provide the environment for an effect. The resulting effect can be run with
   * any environment.
   *
   * @example
   *
   * const plusOne = F.fromFunction((env) => env + 1)
   *
   * await plusOne.run(1)
   * // => 2
   *
   * await plusOne.provide(1).run(null)
   * // => 2
   *
   */
  provide(env: R): IO<A> {
    return new RIO(() => this.unsafeRun(env))
  }

  tap(fn: (value: A) => void): RIO<R, A> {
    return this.map((value) => {
      fn(value)
      return value
    })
  }
}

/**
 * Lift a value into a successful effect.
 *
 * @example
 *
 * const one = F.success(1)
 */
export function success<A>(value: A): RIO<unknown, A> {
  return new RIO(() => Promise.resolve(value))
}

/**
 * Lift an error into a failed effect.
 *
 * @example
 *
 * const error = F.failure(new Error("Boom!"))
 */
export function failure(error: unknown): RIO<unknown, never> {
  return new RIO(() => Promise.reject(error))
}

/**
 * Create an effect that may use values from the environment. This is the main
 * building block for creating more complex effects.
 *
 * @example
 *
 * export const getUser = (userId: number) =>
 *   F.effect<HasUserRepository & HasLogger, User>(
 *     ({ userRepository, logger }) => {
 *       logger.info("Getting user…")
 *       return userRepository.getUser(userId)
 *     })
 */
export function effect<R, A>(createEffect: (env: R) => RIO<R, A>): RIO<R, A> {
  return new RIO((env) => createEffect(env).unsafeRun(env))
}

/**
 * Create an effect from a synchronous function.
 *
 * @see {@link fromPromise}
 * @example
 *
 * const now = F.fromFunction(Date.now)
 */
export function fromFunction<R, A>(fn: (env: R) => A): RIO<R, A> {
  return new RIO((env) => Promise.resolve(fn(env)))
}

/**
 * Create an effect from a function returning a promise.
 *
 * @see {@link fromFunction}
 * @example
 *
 * const response = F.fromPromise(() => fetch("https://example.com"))
 */
export function fromPromise<R, A>(
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
 * const delay = (millis) => F.fromCallback((done) => setTimeout(done, millis))
 */
export function fromCallback<R, A>(
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
 * const readFile = F.fromNodeCallback((cb) => fs.readFile("file.txt", "utf-8", cb))
 */
export function fromNodeCallback<R, A>(
  fn: (callback: (err: unknown, value?: A) => void, env: R) => void
): RIO<R, A> {
  return new RIO((env) => {
    return new Promise((resolve, reject) =>
      fn((err, value) => (err != null ? reject(err) : resolve(value as A)), env)
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
 * await F.mapSeries([1, 2, 3], (n) => F.success(n + 1)).run(null)
 * // => [2, 3, 4]
 */
export function mapSeries<R, A, B>(
  values: readonly A[],
  fn: (value: A) => RIO<R, B>
): RIO<R, B[]> {
  return new RIO(async (env) => {
    const result: B[] = []
    for (const value of values) {
      result.push(await fn(value).unsafeRun(env))
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
 * await F.map([1, 2, 3], (n) => F.success(n + 1)).run(null)
 * // => [2, 3, 4]
 *
 */
export function map<R, A, B>(
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
 * await F.allSeries([F.success(1), F.success(2)]).run(null)
 * // => [1, 2]
 */
export function allSeries<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
  effects: T
): RIO<CollectEnvironment<T>, CollectResults<T>> {
  return mapSeries(effects, identity) as RIO<
    CollectEnvironment<T>,
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
 * await F.all([F.success(1), F.success(2)]).run(null)
 * // => [1, 2]
 */
export function all<T extends readonly RIO<any, unknown>[] | []>( // eslint-disable-line @typescript-eslint/no-explicit-any
  effects: T
): RIO<CollectEnvironment<T>, CollectResults<T>> {
  return map(effects, identity) as RIO<CollectEnvironment<T>, CollectResults<T>>
}

export function reduce<R, A, B>(
  values: readonly A[],
  initialValue: B,
  fn: (acc: B, value: A) => RIO<R, B>
): RIO<R, B> {
  return new RIO(async (env) => {
    let result = initialValue
    for (const value of values) {
      result = await fn(result, value).unsafeRun(env)
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
export function bracket<R, A, B, C>(
  /** An effect that acquires a resource */
  acquire: RIO<R, A>,
  /** An effect that releases the acquired resource */
  release: (value: A) => RIO<R, B>,
  /** An effect that uses the resource */
  use: (value: A) => RIO<R, C>
): RIO<R, C> {
  return new RIO(async (env) => {
    const resource = await acquire.unsafeRun(env)
    try {
      return await use(resource).unsafeRun(env)
    } finally {
      await release(resource).unsafeRun(env)
    }
  })
}

export function race<R, A>(effects: readonly RIO<R, A>[]): RIO<R, A> {
  return new RIO((env) => {
    const promises: Promise<A>[] = []
    for (const effect of effects) {
      promises.push(effect.run(env))
    }
    return Promise.race(promises)
  })
}

export function any<R, A>(effects: readonly RIO<R, A>[]): RIO<R, A> {
  return new RIO((env) => {
    const promises: Promise<A>[] = []
    for (const effect of effects) {
      promises.push(effect.run(env))
    }
    return Promise.any(promises)
  })
}
