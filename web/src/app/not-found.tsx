import { ButtonLink } from '@/components/ui'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-saffron-700 text-6xl font-semibold">404</p>
      <h1 className="font-display mt-2 text-2xl font-semibold">That page is not on the menu</h1>
      <ButtonLink href="/menu" className="mt-6">
        See what is
      </ButtonLink>
    </main>
  )
}
