export function identity<A>(value: A) {
  return value
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function pair<A, B>(first: A, second: B): [A, B] {
  return [first, second]
}

export function noop() {
  // Shut up, eslint.
}
