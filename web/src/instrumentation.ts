/** Next.js calls this once per server process, before handling requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./server/boot')
    await boot()
  }
}
