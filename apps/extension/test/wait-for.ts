// Polls until the condition holds, instead of guessing how many event-loop
// turns it takes. The timeout is only an upper bound for a condition that never
// holds; it is generous because a busy CI runner can delay timers by seconds.
export async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 10_000
): Promise<void> {
  const startedAt = Date.now()

  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${description}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
