import { TimeoutError } from "./errors"
import { identity, delay, pair, noop } from "./util"

/** An effect that can be run with any environment. */
export type IO<A> = RIO<unknown, A>

export class RIO<R, A> {
  constructor(
    /**
     * An unsafe version of {@link RIO.run}.
     *
     * Compared to {@link RIO.run}, this function is not guaranteed not to throw,
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
   * Sequentially combine two effects into a pair.
   *
   * @see {@link RIO.zipWith}
   * @example
   *
   * await F.success(1).zip(F.success(2)).run(null)
   * // => [1, 2]
   *
   */
  zip<R1, B>(that: RIO<R1, B>): RIO<R & R1, [A, B]> {
    return this.zipWith(that, pair)
  }

  /**
   * Sequentially combine two effects using the specified function.
   *
   * @see {@link RIO.zip}
   * @example
   *
   * await F.success(1).zipWith(F.success(2), Math.max).run(null)
   * // => 2
   *
   */
  zipWith<R1, B, C>(
    that: RIO<R1, B>,
    fn: (first: A, second: B) => C
  ): RIO<R & R1, C> {
    return new RIO(async (env) => {
      return fn(await this.unsafeRun(env), await that.unsafeRun(env))
    })
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
 * building block for creating complex effects.
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
 */
export function fromFunction<R, A>(fn: (env: R) => A): RIO<R, A> {
  return new RIO((env) => Promise.resolve(fn(env)))
}

/**
 * Create an effect from a function returning a promise.
 *
 * @example
 *
 * const one = F.fromPromise((env) => Promise.resolve(1))
 */
export function fromPromise<R, A>(
  createPromise: (env: R) => PromiseLike<A>
): RIO<R, A> {
  return new RIO((env) => createPromise(env))
}

/**
 * Create an effect from a simple callback.
 *
 * @example
 *
 * const delay = (millis: number) => F.fromCallback((done) => setTimeout(done, millis))
 */
export function fromCallback<R, A>(
  fn: (callback: (value: A) => void, env: R) => void
): RIO<R, A> {
  return new RIO((env) => new Promise((resolve) => fn(resolve, env)))
}

/**
 * Create an effect from a node-style callback.
 *
 * @example
 *
 * const file = F.fromNodeCallback((cb, env) => fs.readFile("file.txt", "utf-8", cb))
 */
export function fromNodeCallback<A>(
  fn: (callback: (err: unknown, value?: A) => void) => void
): RIO<unknown, A> {
  return new RIO(() => {
    return new Promise((resolve, reject) =>
      fn((err, value) => (err != null ? reject(err) : resolve(value as A)))
    )
  })
}

export function traverse<R, A, B>(
  values: Iterable<A>,
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

export function traversePar<R, A, B>(
  values: Iterable<A>,
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

export function sequence<R, A>(effects: Iterable<RIO<R, A>>): RIO<R, A[]> {
  return traverse(effects, identity)
}

export function sequencePar<R, A>(effects: Iterable<RIO<R, A>>): RIO<R, A[]> {
  return traversePar(effects, identity)
}

export function forEach<R, A, B>(
  values: Iterable<A>,
  fn: (value: A) => RIO<R, B>
): RIO<R, void> {
  return traverse(values, fn).map(noop)
}

export function forEachPar<R, A, B>(
  values: readonly A[],
  fn: (value: A) => RIO<R, B>
): RIO<R, void> {
  return traversePar(values, fn).map(noop)
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

export function combine<R, A, O>(fn: (a: A) => O, a: RIO<R, A>): RIO<R, O>
export function combine<R1, A1, R2, A2, O>(
  fn: (value1: A1, value2: A2) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>
): RIO<R1 & R2, O>
export function combine<R1, A1, R2, A2, R3, A3, O>(
  fn: (value1: A1, value2: A2, value3: A3) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>
): RIO<R1 & R2 & R3, O>
export function combine<R1, A1, R2, A2, R3, A3, R4, A4, O>(
  fn: (value1: A1, value2: A2, value3: A3, value4: A4) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>
): RIO<R1 & R2 & R3 & R4, O>
export function combine<R1, A1, R2, A2, R3, A3, R4, A4, R5, A5, O>(
  fn: (value1: A1, value2: A2, value3: A3, value4: A4, value5: A5) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>
): RIO<R1 & R2 & R3 & R4 & R5, O>
export function combine<R1, A1, R2, A2, R3, A3, R4, A4, R5, A5, R6, A6, O>(
  fn: (
    value1: A1,
    value2: A2,
    value3: A3,
    value4: A4,
    value5: A5,
    value6: A6
  ) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>,
  effect6: RIO<R6, A6>
): RIO<R1 & R2 & R3 & R4 & R5 & R6, O>
export function combine<
  R1,
  A1,
  R2,
  A2,
  R3,
  A3,
  R4,
  A4,
  R5,
  A5,
  R6,
  A6,
  R7,
  A7,
  O
>(
  fn: (
    value1: A1,
    value2: A2,
    value3: A3,
    value4: A4,
    value5: A5,
    value6: A6,
    value7: A7
  ) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>,
  effect6: RIO<R6, A6>,
  effect7: RIO<R7, A7>
): RIO<R1 & R2 & R3 & R4 & R5 & R6 & R7, O>
export function combine<
  R1,
  A1,
  R2,
  A2,
  R3,
  A3,
  R4,
  A4,
  R5,
  A5,
  R6,
  A6,
  R7,
  A7,
  R8,
  A8,
  O
>(
  fn: (
    value1: A1,
    value2: A2,
    value3: A3,
    value4: A4,
    value5: A5,
    value6: A6,
    value7: A7,
    value8: A8
  ) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>,
  effect6: RIO<R6, A6>,
  effect7: RIO<R7, A7>,
  effect8: RIO<R8, A8>
): RIO<R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8, O>
export function combine<
  R1,
  A1,
  R2,
  A2,
  R3,
  A3,
  R4,
  A4,
  R5,
  A5,
  R6,
  A6,
  R7,
  A7,
  R8,
  A8,
  R9,
  A9,
  O
>(
  fn: (
    value1: A1,
    value2: A2,
    value3: A3,
    value4: A4,
    value5: A5,
    value6: A6,
    value7: A7,
    value8: A8,
    value9: A9
  ) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>,
  effect6: RIO<R6, A6>,
  effect7: RIO<R7, A7>,
  effect8: RIO<R8, A8>,
  effect9: RIO<R9, A9>
): RIO<R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8 & R9, O>
export function combine<
  R1,
  A1,
  R2,
  A2,
  R3,
  A3,
  R4,
  A4,
  R5,
  A5,
  R6,
  A6,
  R7,
  A7,
  R8,
  A8,
  R9,
  A9,
  R10,
  A10,
  O
>(
  fn: (
    value1: A1,
    value2: A2,
    value3: A3,
    value4: A4,
    value5: A5,
    value6: A6,
    value7: A7,
    value8: A8,
    value9: A9,
    value10: A10
  ) => O,
  effect1: RIO<R1, A1>,
  effect2: RIO<R2, A2>,
  effect3: RIO<R3, A3>,
  effect4: RIO<R4, A4>,
  effect5: RIO<R5, A5>,
  effect6: RIO<R6, A6>,
  effect7: RIO<R7, A7>,
  effect8: RIO<R8, A8>,
  effect9: RIO<R9, A9>,
  effect10: RIO<R10, A10>
): RIO<R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8 & R9 & R10, O>
export function combine<R, A, B>(
  fn: (...values: readonly A[]) => B,
  ...effects: readonly RIO<R, A>[]
): RIO<R, B> {
  return sequence(effects).map((values) => fn(...values))
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
