import { RIO } from "../src"

const error = new Error("Boom!")
const fail = (n: number): RIO<unknown, number> => {
  if (n >= 0) return RIO.failure(error)
  else return RIO.success(0)
}
const incM = (n: number) => RIO.success(n + 1)

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
    expect(effect.flatMap(fail)).toBe(effect)
    expect(effect.flatMap(fail).flatMap(fail)).toBe(effect)
  })
})

describe("RIO#flatMap", () => {
  it("creates a new effect from the previous value", async () => {
    const two = RIO.success(1).flatMap(incM)
    const three = two.flatMap(incM)
    const four = three.flatMap(incM)

    await expect(two.run(null)).resolves.toBe(2)
    await expect(three.run(null)).resolves.toBe(3)
    await expect(four.run(null)).resolves.toBe(4)
  })

  it("throws an error if the effect fails", async () => {
    const one = RIO.success(1).flatMap(fail)
    const two = RIO.success(1).flatMap(incM).flatMap(fail)
    const three = RIO.success(1).flatMap(incM).flatMap(incM).flatMap(fail)
    const four = RIO.success(1).flatMap(incM).flatMap(fail).flatMap(incM)

    await expect(one.run(null)).rejects.toThrow(error)
    await expect(two.run(null)).rejects.toThrow(error)
    await expect(three.run(null)).rejects.toThrow(error)
    await expect(four.run(null)).rejects.toThrow(error)
  })
})
