import * as F from "../src"

const error = new Error("Boom!")
const throwError = () => {
  throw error
}

describe("F.success", () => {
  it("creates a successful effect", async () => {
    const effect = F.success(1)
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("F.failure", () => {
  it("creates a failed effect", async () => {
    const effect = F.failure(error)
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("F.fromPromise", () => {
  it("creates an successful effect from a resolved promise", async () => {
    const effect = F.fromPromise(() => Promise.resolve(1))
    await expect(effect.run(null)).resolves.toBe(1)
  })

  it("creates a failed effect from a rejected promise", async () => {
    const effect = F.fromPromise(() => Promise.reject(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("provides the environment to the effect", async () => {
    const effect = F.fromPromise((env: number) => Promise.resolve(env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })
})

describe("F.fromCallback", () => {
  it("creates an effect from a simple callback function", async () => {
    const effect = F.fromCallback((cb) => cb(1))
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("F.fromNodeCallback", () => {
  it("creates an effect from a node-style callback function", async () => {
    const effect = F.fromNodeCallback((cb) => cb(null, 1))
    await expect(effect.run(null)).resolves.toBe(1)
  })

  it("creates a failed effect if the first argument is not null", async () => {
    const effect = F.fromNodeCallback((cb) => cb(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("F.effect", () => {
  it("creates an effect from a function returning an effect", async () => {
    const effect = F.effect((env: number) => F.success(env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })
})

describe("F.function", () => {
  it("creates a successful effect from a synchronous function", async () => {
    const effect = F.fromFunction((env: number) => env + 1)
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("creates a failed effect if the function throws", async () => {
    const effect = F.fromFunction(throwError)
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO#map", () => {
  it("applies a function to the value", async () => {
    const effect = F.success(1).map((n) => n + 1)
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("will not call the function if the effect fails", async () => {
    const fn = jest.fn()
    const effect = F.failure(error).map(fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#flatMap", () => {
  it("creates a new effect from the previous value", async () => {
    const effect = F.success(1).flatMap((n) => F.success(n + 1))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("will not call the function if the effect fails", async () => {
    const fn = jest.fn()
    const effect = F.failure(error).flatMap(fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#catch", () => {
  it("executes the function if the preceding effect fails", async () => {
    const effect = F.success(1)
      .flatMap((n) => (n === 0 ? F.success(n) : F.failure(error)))
      .catch(() => F.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("does not execute the function if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = F.success(1).catch(fn)
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#orElse", () => {
  it("executes the effect if the preceding effect fails", async () => {
    const effect = F.success(1)
      .flatMap((n) => (n === 0 ? F.success(n) : F.failure(error)))
      .orElse(F.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("does not execute the effect if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = F.success(1).orElse(F.fromFunction(fn))
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#finally", () => {
  it("executes the effect if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = F.success(1).finally(F.fromFunction(fn))
    await expect(effect.run(null)).resolves.toBe(1)
  })

  it("executes the effect if the preceding effect fails", async () => {
    const fn = jest.fn()
    const effect = F.failure(error).finally(F.fromFunction(fn))
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO#timeout", () => {
  it("fails if the execution of the effect takes too long", async () => {
    const effect = F.success(1).delay(10).timeout(0)
    await expect(effect.run(null)).rejects.toThrow(F.TimeoutError)
  })

  it("returns the preceding effect if the execution is fast enough", async () => {
    const effect = F.success(1).timeout(200)
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("RIO#delay", () => {
  it("delays the execution of an effect", async () => {
    const effect = F.success(1).delay(100)
    const start = Date.now()
    await expect(effect.run(null)).resolves.toBe(1)
    expect(Date.now() - start).toBeGreaterThanOrEqual(100)
  })
})

describe("RIO#provide", () => {
  it("provides an environment to an effect", async () => {
    const effect = F.effect((env: number) => F.success(env + 1)).provide(1)
    await expect(effect.run(null)).resolves.toBe(2)
  })
})

describe("RIO#tap", () => {
  it("executes a function on an effect and returns its value", async () => {
    const fn = jest.fn()
    const sideEffect = () => F.fromFunction(fn)
    const effect = F.success(1).tap(sideEffect)
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("fails if the side-effects fails", async () => {
    const fn = jest.fn(throwError)
    const sideEffect = () => F.fromFunction(fn)
    const effect = F.success(1).tap(sideEffect)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("RIO#log", () => {
  it("logs the result of an effect with console.log", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const spy = jest.spyOn(console, "log").mockImplementation(() => {})

    const effect = F.success(1).log()
    await expect(effect.run(null)).resolves.toBe(1)

    expect(spy).toHaveBeenCalledWith(1)
  })

  it("supports format strings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const spy = jest.spyOn(console, "log").mockImplementation(() => {})

    const effect = F.success(1).log("%s is a number")
    await expect(effect.run(null)).resolves.toBe(1)

    expect(spy).toHaveBeenCalledWith("%s is a number", 1)
  })
})

describe("F.allSeries", () => {
  it("combines an array of effects", async () => {
    const effect = F.allSeries([F.success(1), F.success(2), F.success(3)])
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.allSeries([F.success(1), F.success(2), F.failure(error)])
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works sequentially", async () => {
    const fn = jest.fn()
    const effect = F.allSeries([
      F.fromFunction(fn),
      F.failure(error),
      F.fromFunction(fn),
    ])
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("F.all", () => {
  it("executes an array of effects in parallel", async () => {
    const effect = F.all([F.success(1), F.success(2), F.success(3)])
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.all([F.success(1), F.success(2), F.failure(error)])
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn()
    const effect = F.all([
      F.failure(error),
      F.fromFunction(fn),
      F.fromFunction(fn),
    ])
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe("F.mapSeries", () => {
  it("maps each element of an array to an action", async () => {
    const effect = F.mapSeries([1, 2, 3], F.success)
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.mapSeries([1, 2, 3], (n) =>
      n === 1 ? F.failure(error) : F.success(n)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works sequentially", async () => {
    const fn = jest.fn(() => F.failure(error))
    const effect = F.mapSeries([1, 2, 3], fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("F.map", () => {
  it("maps each element of an array to an action", async () => {
    const effect = F.map([1, 2, 3], F.success)
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.map([1, 2, 3], (n) =>
      n === 1 ? F.failure(error) : F.success(n)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn(() => F.failure(error))
    const effect = F.map([1, 2, 3], fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe("F.reduce", () => {
  it("reduces an array of values effectfully", async () => {
    const effect = F.reduce([1, 2, 3], 0, (a, b) => F.success(a + b))
    await expect(effect.run(null)).resolves.toBe(6)
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.reduce([1, 2, 3], 0, (a, b) =>
      b === 1 ? F.failure(error) : F.success(a + b)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("F.race", () => {
  it("returns the first effect that succeeds or fails", async () => {
    const effect1 = F.race([F.success(1), F.failure(error).delay(10)])
    await expect(effect1.run(null)).resolves.toBe(1)

    const effect2 = F.race([F.success(1).delay(10), F.failure(error)])
    await expect(effect2.run(null)).rejects.toThrow(error)
  })
})

describe("F.any", () => {
  it("returns the first effect that succeeds", async () => {
    const effect1 = F.any([F.success(1), F.failure(error).delay(10)])
    await expect(effect1.run(null)).resolves.toBe(1)

    const effect2 = F.any([F.success(1).delay(10), F.failure(error)])
    await expect(effect2.run(null)).resolves.toBe(1)
  })
})

describe("F.bracket", () => {
  const acquire = F.success("file")
  const release = jest.fn(() => F.success("closed"))
  const use = jest.fn((file: string) => F.success(file === "file"))

  it("calls acquire and release", async () => {
    const effect = F.bracket(acquire, release, use)
    await expect(effect.run(null)).resolves.toBe(true)

    expect(release).toHaveBeenCalledTimes(1)
    expect(use).toHaveBeenCalledTimes(1)
  })

  it("does not call release or use if acquire fails", async () => {
    const effect = F.bracket(F.fromFunction(throwError), release, use)
    await expect(effect.run(null)).rejects.toThrow(error)

    expect(release).toHaveBeenCalledTimes(0)
    expect(use).toHaveBeenCalledTimes(0)
  })

  it("calls release if use fails", async () => {
    const use = jest.fn(throwError)
    const effect = F.bracket(acquire, release, throwError)
    await expect(effect.run(null)).rejects.toThrow(error)

    expect(release).toHaveBeenCalledTimes(1)
    expect(use).toHaveBeenCalledTimes(0)
  })
})

describe("F.props", () => {
  it("combines an object of effects", async () => {
    const effect = F.props({
      a: F.success(1),
      b: F.success(2),
      c: F.success(3),
    })

    await expect(effect.run(null)).resolves.toEqual({ a: 1, b: 2, c: 3 })
  })

  it("fails if any of the effects fail", async () => {
    const effect = F.props({
      a: F.success(1),
      b: F.success(2),
      c: F.failure(error),
    })

    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn(throwError)
    const effect = F.props({
      a: F.fromFunction(fn),
      b: F.fromFunction(fn),
      c: F.fromFunction(fn),
    })

    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
