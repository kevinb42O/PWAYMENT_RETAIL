export class BootTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} duurde langer dan ${timeoutMs} ms.`);
    this.name = "BootTimeoutError";
  }
}

export const withBootTimeout = async <T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new BootTimeoutError(operation, timeoutMs)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};
