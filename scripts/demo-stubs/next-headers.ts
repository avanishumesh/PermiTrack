// Test-only stub: no request cookies outside Next, so no demo session.
export async function cookies() {
  return {
    get: (_name: string) => undefined,
  };
}
