'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { bookTableAction, seatingTimesAction } from '@/app/actions/customer'
import { Stepper } from '@/components/stepper'
import { Alert, Button, ButtonLink, Card, Label, Spinner, Textarea } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { dayLabel, formatDateTime, formatTime } from '@/domain/time'

type Time = { startsAt: string; available: boolean }

export function BookingForm({
  dates,
  signedIn,
  nowIso,
}: {
  dates: string[]
  signedIn: boolean
  nowIso: string
}) {
  const now = new Date(nowIso)
  const [date, setDateState] = useState(dates[0]!)
  const [party, setPartyState] = useState(2)
  const [times, setTimes] = useState<Time[] | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<{ code: string; startsAt: string } | null>(null)
  const [busy, start] = useTransition()

  // Changing the day or party size clears the old times; the effect then fetches new ones.
  const setDate = (d: string) => {
    setDateState(d)
    setTimes(null)
    setTime(null)
  }
  const setParty = (n: number) => {
    setPartyState(n)
    setTimes(null)
    setTime(null)
  }

  useEffect(() => {
    seatingTimesAction(date, party).then(setTimes)
  }, [date, party])

  if (booked) {
    return (
      <Card className="mt-6 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="font-display mt-2 text-2xl font-semibold">You are booked</h2>
        <p className="mt-1 text-stone-700">
          Table for {party}, {formatDateTime(new Date(booked.startsAt))}
        </p>
        <p className="text-sm text-stone-500">Booking {booked.code}. You can cancel it from My orders.</p>
        <div className="mt-4 flex justify-center gap-2">
          <ButtonLink href="/account" variant="secondary">
            My bookings
          </ButtonLink>
          <ButtonLink href="/menu">See the menu</ButtonLink>
        </div>
      </Card>
    )
  }

  const free = times?.filter((t) => t.available) ?? []

  return (
    <div className="mt-6 space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-stone-700">Guests</span>
          <Stepper value={party} onChange={setParty} label="guests" />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Day</p>
          <div className="-mx-1 flex scrollbar-none gap-2 overflow-x-auto px-1">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={date === d}
                onClick={() => setDate(d)}
                className={clsx(
                  'min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 ring-inset',
                  date === d ? 'bg-leaf-700 ring-leaf-700 text-white' : 'bg-white ring-stone-300',
                )}
              >
                {dayLabel(d, now)}
              </button>
            ))}
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-stone-700">Time</legend>
          {times === null ? (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner /> Checking tables…
            </p>
          ) : free.length === 0 ? (
            <p className="text-sm text-stone-600">
              No tables for {party} on this day. Try another day or a smaller party.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {times.map((t) => (
                <label
                  key={t.startsAt}
                  className={clsx(
                    'has-focus-visible:outline-leaf-600 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-inset has-focus-visible:outline-2',
                    time === t.startsAt
                      ? 'bg-leaf-700 ring-leaf-700 text-white'
                      : t.available
                        ? 'cursor-pointer bg-white ring-stone-300'
                        : 'bg-stone-100 text-stone-400 line-through ring-stone-200',
                  )}
                >
                  <input
                    type="radio"
                    name="time"
                    className="sr-only"
                    value={t.startsAt}
                    disabled={!t.available}
                    checked={time === t.startsAt}
                    onChange={() => setTime(t.startsAt)}
                  />
                  {formatTime(new Date(t.startsAt)).replace(' ', ' ')}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div>
          <Label htmlFor="booking-notes">Anything we should know? (optional)</Label>
          <Textarea
            id="booking-notes"
            maxLength={300}
            placeholder="Birthday, high chair, wheelchair access…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      {signedIn ? (
        <Button
          className="w-full"
          disabled={!time}
          busy={busy}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await bookTableAction({
                startsAt: time!,
                partySize: party,
                notes: notes || null,
              })
              if (result.ok) setBooked({ code: result.data.code, startsAt: time! })
              else {
                setError(result.message)
                seatingTimesAction(date, party).then(setTimes)
              }
            })
          }
        >
          {time ? `Book for ${party} at ${formatTime(new Date(time))}` : 'Choose a time'}
        </Button>
      ) : (
        <p className="text-center text-sm text-stone-600">
          <Link href="/sign-in?next=/book" className="text-leaf-700 font-semibold">
            Sign in with your phone
          </Link>{' '}
          to book. It takes 20 seconds.
        </p>
      )}
      <p className="text-center text-xs text-stone-500">
        Last seating {RESTAURANT.reservations.lastSeatingBeforeCloseMinutes} minutes before closing.
      </p>
    </div>
  )
}
