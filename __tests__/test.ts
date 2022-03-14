import { RIO, TimeoutError } from "../src"

const error = new Error("Boom!")
const throwError = () => {
  throw error
}

describe("RIO.success", () => {
  it("creates a successful effect", async () => {
    const effect = RIO.success(1)
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("RIO.failure", () => {
  it("creates a failed effect", async () => {
    const effect = RIO.failure(error)
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO.fromPromise", () => {
  it("creates an successful effect from a resolved promise", async () => {
    const effect = RIO.fromPromise((env: number) => Promise.resolve(env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("creates a failed effect from a rejected promise", async () => {
    const effect = RIO.fromPromise(() => Promise.reject(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO.fromCallback", () => {
  it("creates an effect from a simple callback function", async () => {
    const effect = RIO.fromCallback((cb, env: number) => cb(env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })
})

describe("RIO.fromNodeCallback", () => {
  it("creates an effect from a node-style callback function", async () => {
    const effect = RIO.fromNodeCallback((cb, env: number) => cb(null, env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("creates a failed effect if the first argument is not null", async () => {
    const effect = RIO.fromNodeCallback((cb) => cb(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO.effect", () => {
  it("creates an effect from a function returning an effect", async () => {
    const effect = RIO.effect((env: number) => RIO.success(env + 1))
    await expect(effect.run(1)).resolves.toBe(2)
  })
})

describe("RIO.function", () => {
  it("creates a successful effect from a synchronous function", async () => {
    const effect = RIO.fromFunction((env: number) => env + 1)
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("creates a failed effect if the function throws", async () => {
    const effect = RIO.fromFunction(throwError)
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO#map", () => {
  it("applies a function to the value", async () => {
    const effect = RIO.success(1).map((n) => n + 1)
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("will not call the function if the effect fails", async () => {
    const fn = jest.fn()
    const effect = RIO.failure(error).map(fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#flatMap", () => {
  it("creates a new effect from the previous value", async () => {
    const effect = RIO.success(1).flatMap((n) => RIO.success(n + 1))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("will not call the function if the effect fails", async () => {
    const fn = jest.fn()
    const effect = RIO.failure(error).flatMap(fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#catch", () => {
  it("executes the function if the preceding effect fails", async () => {
    const effect = RIO.success(1)
      .flatMap((n) => (n === 0 ? RIO.success(n) : RIO.failure(error)))
      .catch(() => RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("does not execute the function if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = RIO.success(1).catch(fn)
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#orElse", () => {
  it("executes the effect if the preceding effect fails", async () => {
    const effect = RIO.success(1)
      .flatMap((n) => (n === 0 ? RIO.success(n) : RIO.failure(error)))
      .orElse(RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("does not execute the effect if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = RIO.success(1).orElse(RIO.fromFunction(fn))
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe("RIO#finally", () => {
  it("executes the effect if the preceding effect succeeds", async () => {
    const fn = jest.fn()
    const effect = RIO.success(1).finally(RIO.fromFunction(fn))
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("executes the effect if the preceding effect fails", async () => {
    const fn = jest.fn()
    const effect = RIO.failure(error).finally(RIO.fromFunction(fn))
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("RIO#timeout", () => {
  it("fails if the execution of the effect takes too long", async () => {
    const effect = RIO.success(1).delay(10).timeout(0)
    await expect(effect.run(null)).rejects.toThrow(TimeoutError)
  })

  it("returns the preceding effect if the execution is fast enough", async () => {
    const effect = RIO.success(1).timeout(200)
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("RIO#delay", () => {
  it("delays the execution of an effect", async () => {
    const effect = RIO.success(1).delay(100)
    const start = Date.now()
    await expect(effect.run(null)).resolves.toBe(1)
    expect(Date.now() - start).toBeGreaterThanOrEqual(90)
  })
})

describe("RIO#provide", () => {
  it("provides an environment to an effect", async () => {
    const effect = RIO.effect((env: number) => RIO.success(env + 1)).provide(1)
    await expect(effect.run(null)).resolves.toBe(2)
  })
})

describe("RIO#tap", () => {
  it("executes a function on an effect and returns its value", async () => {
    const fn = jest.fn()
    const sideEffect = () => RIO.fromFunction(fn)
    const effect = RIO.success(1).tap(sideEffect)
    await expect(effect.run(null)).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("fails if the side-effects fails", async () => {
    const fn = jest.fn(throwError)
    const sideEffect = () => RIO.fromFunction(fn)
    const effect = RIO.success(1).tap(sideEffect)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("RIO#log", () => {
  it("logs the result of an effect with console.log", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const spy = jest.spyOn(console, "log").mockImplementation(() => {})

    const effect = RIO.success(1).log()
    await expect(effect.run(null)).resolves.toBe(1)

    expect(spy).toHaveBeenCalledWith(1)
  })

  it("supports format strings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const spy = jest.spyOn(console, "log").mockImplementation(() => {})

    const effect = RIO.success(1).log("%s is a number")
    await expect(effect.run(null)).resolves.toBe(1)

    expect(spy).toHaveBeenCalledWith("%s is a number", 1)
  })
})

describe("RIO.allSeries", () => {
  it("combines an array of effects", async () => {
    const effect = RIO.allSeries([
      RIO.success(1),
      RIO.success(2),
      RIO.success(3),
    ])
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.allSeries([
      RIO.success(1),
      RIO.success(2),
      RIO.failure(error),
    ])
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works sequentially", async () => {
    const fn = jest.fn()
    const effect = RIO.allSeries([
      RIO.fromFunction(fn),
      RIO.failure(error),
      RIO.fromFunction(fn),
    ])
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("RIO.all", () => {
  it("executes an array of effects in parallel", async () => {
    const effect = RIO.all([RIO.success(1), RIO.success(2), RIO.success(3)])
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.all([RIO.success(1), RIO.success(2), RIO.failure(error)])
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn()
    const effect = RIO.all([
      RIO.failure(error),
      RIO.fromFunction(fn),
      RIO.fromFunction(fn),
    ])
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe("RIO.mapSeries", () => {
  it("maps each element of an array to an action", async () => {
    const effect = RIO.mapSeries([1, 2, 3], RIO.success)
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.mapSeries([1, 2, 3], (n) =>
      n === 1 ? RIO.failure(error) : RIO.success(n)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works sequentially", async () => {
    const fn = jest.fn(() => RIO.failure(error))
    const effect = RIO.mapSeries([1, 2, 3], fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("RIO.map", () => {
  it("maps each element of an array to an action", async () => {
    const effect = RIO.map([1, 2, 3], RIO.success)
    await expect(effect.run(null)).resolves.toEqual([1, 2, 3])
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.map([1, 2, 3], (n) =>
      n === 1 ? RIO.failure(error) : RIO.success(n)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn(() => RIO.failure(error))
    const effect = RIO.map([1, 2, 3], fn)
    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe("RIO.reduce", () => {
  it("reduces an array of values effectfully", async () => {
    const effect = RIO.reduce([1, 2, 3], 0, (a, b) => RIO.success(a + b))
    await expect(effect.run(null)).resolves.toBe(6)
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.reduce([1, 2, 3], 0, (a, b) =>
      b === 1 ? RIO.failure(error) : RIO.success(a + b)
    )
    await expect(effect.run(null)).rejects.toThrow(error)
  })
})

describe("RIO.race", () => {
  it("returns the first effect that succeeds or fails", async () => {
    const effect1 = RIO.race([RIO.success(1), RIO.failure(error).delay(10)])
    await expect(effect1.run(null)).resolves.toBe(1)

    const effect2 = RIO.race([RIO.success(1).delay(10), RIO.failure(error)])
    await expect(effect2.run(null)).rejects.toThrow(error)
  })
})

describe("RIO.any", () => {
  it("returns the first effect that succeeds", async () => {
    const effect1 = RIO.any([RIO.success(1), RIO.failure(error).delay(10)])
    await expect(effect1.run(null)).resolves.toBe(1)

    const effect2 = RIO.any([RIO.success(1).delay(10), RIO.failure(error)])
    await expect(effect2.run(null)).resolves.toBe(1)
  })
})

describe("RIO.bracket", () => {
  const acquire = RIO.success("file")
  const release = jest.fn(() => RIO.success("closed"))
  const use = jest.fn((file: string) => RIO.success(file === "file"))

  it("calls acquire and release", async () => {
    const effect = RIO.bracket(acquire, release, use)
    await expect(effect.run(null)).resolves.toBe(true)

    expect(release).toHaveBeenCalledTimes(1)
    expect(use).toHaveBeenCalledTimes(1)
  })

  it("does not call release or use if acquire fails", async () => {
    const effect = RIO.bracket(RIO.fromFunction(throwError), release, use)
    await expect(effect.run(null)).rejects.toThrow(error)

    expect(release).toHaveBeenCalledTimes(0)
    expect(use).toHaveBeenCalledTimes(0)
  })

  it("calls release if use fails", async () => {
    const use = jest.fn(throwError)
    const effect = RIO.bracket(acquire, release, throwError)
    await expect(effect.run(null)).rejects.toThrow(error)

    expect(release).toHaveBeenCalledTimes(1)
    expect(use).toHaveBeenCalledTimes(0)
  })
})

describe("RIO.props", () => {
  it("combines an object of effects", async () => {
    const effect = RIO.props({
      a: RIO.success(1),
      b: RIO.success(2),
      c: RIO.success(3),
    })

    await expect(effect.run(null)).resolves.toEqual({ a: 1, b: 2, c: 3 })
  })

  it("fails if any of the effects fail", async () => {
    const effect = RIO.props({
      a: RIO.success(1),
      b: RIO.success(2),
      c: RIO.failure(error),
    })

    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("works in parallel", async () => {
    const fn = jest.fn(throwError)
    const effect = RIO.props({
      a: RIO.fromFunction(fn),
      b: RIO.fromFunction(fn),
      c: RIO.fromFunction(fn),
    })

    await expect(effect.run(null)).rejects.toThrow(error)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
