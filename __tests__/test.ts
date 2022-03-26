import { RIO } from "../src"

const error = new Error("Boom!")

describe("RIO.success", () => {
  it("creates a successful effect", async () => {
    const one = RIO.success(1)
    await expect(one.run(null)).resolves.toBe(1)
  })
})

describe("RIO.failure", () => {
  it("creates a failed effect", async () => {
    const effect = RIO.failure(error)
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("returns itself with flatMap", () => {
    const effect = RIO.failure(error)
    expect(effect.flatMap(() => RIO.success(1))).toBe(effect)
  })

  it("returns itself with map", () => {
    const effect = RIO.failure(error)
    expect(effect.map(() => 1)).toBe(effect)
  })
})

describe("RIO#flatMap", () => {
  it("creates a new effect from the previous value", async () => {
    const effect = RIO.success(1).flatMap((n) => RIO.success(n + 1))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("throws an error if the effect fails", async () => {
    const effect = RIO.success(1).flatMap(() => RIO.failure(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("errors thrown can be caught", async () => {
    const effect = RIO.success(1)
      .map(() => {
        throw error
      })
      .catch(() => RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })
})

describe("RIO#map", () => {
  it("transforms the result of an effect", async () => {
    const effect = RIO.success(1).map((n) => n + 1)
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("throws an error if the effect fails", async () => {
    const effect = RIO.success(1).map(() => {
      throw error
    })
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("errors thrown can be caught", async () => {
    const effect = RIO.success(1)
      .map(() => {
        throw error
      })
      .catch(() => RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })
})

describe("RIO#catch", () => {
  it("recovers from a failure, unwinding the stack", async () => {
    const effect = RIO.success(1)
      .flatMap(() => RIO.failure(error))
      .map(() => 999) // An extra continuation between the failure and catch
      .catch(() => RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(2)
  })

  it("does nothing for successful effects", async () => {
    const effect = RIO.success(1).catch(() => RIO.success(2))
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("RIO#fromFunction", () => {
  it("creates a new effect from a synchronous function", async () => {
    const effect = RIO.fromFunction(() => 1)
    await expect(effect.run(null)).resolves.toBe(1)
  })

  it("receives the environment as an argument", async () => {
    const effect = RIO.fromFunction((n: number) => n + 1)
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("resolves to a rejected promise if the function throws", async () => {
    const effect = RIO.fromFunction(() => {
      throw error
    })
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("errors thrown can be caught", async () => {
    const effect = RIO.fromFunction(() => {
      throw error
    }).catch(() => RIO.success(1))
    await expect(effect.run(null)).resolves.toBe(1)
  })
})

describe("RIO#fromPromise", () => {
  it("creates a new effect from an asynchronous function", async () => {
    const effect = RIO.fromPromise(async () => 1)
    await expect(effect.run(null)).resolves.toBe(1)
  })

  it("receives the environment as an argument", async () => {
    const effect = RIO.fromPromise(async (env: number) => env + 1)
    await expect(effect.run(1)).resolves.toBe(2)
  })

  it("resolves to a rejected promise if the promise rejects", async () => {
    const effect = RIO.fromPromise(() => Promise.reject(error))
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("resolves to a rejected promise if the function throws", async () => {
    const effect = RIO.fromPromise(() => {
      throw error
    })
    await expect(effect.run(null)).rejects.toThrow(error)
  })

  it("errors thrown can be caught", async () => {
    const one = RIO.fromPromise(() => {
      throw error
    }).catch(() => RIO.success(1))
    await expect(one.run(null)).resolves.toBe(1)
  })
})
