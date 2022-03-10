export function identity<A>(value: A) {
  return value
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function noop() {
  // Shut up, eslint.
}
