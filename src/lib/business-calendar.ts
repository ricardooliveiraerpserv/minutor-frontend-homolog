/**
 * Aritmética de datas em dias úteis (skip sábado/domingo/feriados) — port client-side
 * do `App\Services\BusinessCalendarService` do backend (ADR 0009 appendix).
 *
 * Usado pelo cronograma para sugerir `due_date` a partir de `(start + hours)`
 * sem ida ao backend a cada teclada. Lista de feriados vem do payload `/schedule`.
 */

function toDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getTime())
  // Trata "YYYY-MM-DD" como data local pra evitar UTC offset surpresa.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(value)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface BusinessCalendarOpts {
  /** Se true, sábado/domingo são considerados dias úteis. */
  allowWeekend?: boolean
  /** Se true, feriados são considerados dias úteis. */
  allowHoliday?: boolean
}

export class BusinessCalendar {
  private readonly holidays: Set<string>
  private readonly opts: BusinessCalendarOpts

  constructor(holidays: string[], opts: BusinessCalendarOpts = {}) {
    this.holidays = new Set(holidays.map(h => h.length > 10 ? h.slice(0, 10) : h))
    this.opts = opts
  }

  isBusinessDay(date: Date): boolean {
    const dow = date.getDay()
    const isWeekend = (dow === 0 || dow === 6)
    if (isWeekend && !this.opts.allowWeekend) return false
    const isHoliday = this.holidays.has(toISODate(date))
    if (isHoliday && !this.opts.allowHoliday) return false
    return true
  }

  nextBusinessDay(date: Date): Date {
    const d = new Date(date.getTime())
    while (!this.isBusinessDay(d)) {
      d.setDate(d.getDate() + 1)
    }
    return d
  }

  addBusinessDays(start: Date, days: number): Date {
    const d = this.nextBusinessDay(start)
    for (let i = 0; i < days; i++) {
      d.setDate(d.getDate() + 1)
      while (!this.isBusinessDay(d)) d.setDate(d.getDate() + 1)
    }
    return d
  }

  /**
   * Distribui $hours horas a partir de $start a $dailyHours por dia útil.
   * Retorna a data do término (sem precisão de hora-do-dia).
   */
  addBusinessHours(start: Date | string, hours: number, dailyHours = 8): Date {
    let cursor = this.nextBusinessDay(toDate(start))
    if (hours <= 0 || dailyHours <= 0) return cursor

    let remaining = hours
    while (remaining > dailyHours) {
      remaining -= dailyHours
      cursor.setDate(cursor.getDate() + 1)
      while (!this.isBusinessDay(cursor)) cursor.setDate(cursor.getDate() + 1)
    }
    return cursor
  }

  /** Conveniência: retorna `YYYY-MM-DD` em vez de Date. */
  suggestedEndISO(start: string | Date | null, hours: number, dailyHours = 8): string | null {
    if (!start || !hours || hours <= 0) return null
    return toISODate(this.addBusinessHours(start, hours, dailyHours))
  }

  /** Conta dias CORRIDOS entre start e end (inclusivo). 0 se end < start. */
  calendarDaysBetween(start: string | Date | null, end: string | Date | null): number {
    if (!start || !end) return 0
    const a = toDate(start); const b = toDate(end)
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0)
    if (b < a) return 0
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  }

  /** Dias NÃO úteis (fim de semana/feriado) dentro do intervalo [start, end]. */
  nonBusinessDaysBetween(start: string | Date | null, end: string | Date | null): number {
    return Math.max(0, this.calendarDaysBetween(start, end) - this.businessDaysBetween(start, end))
  }

  /** Soma dias CORRIDOS a uma data (pra editar duração em dias corridos). */
  addCalendarDays(start: Date, days: number): Date {
    const d = new Date(start.getTime())
    d.setDate(d.getDate() + days)
    return d
  }

  /** Conta dias úteis entre start e end (inclusivo). 0 se end < start. */
  businessDaysBetween(start: string | Date | null, end: string | Date | null): number {
    if (!start || !end) return 0
    const a = toDate(start)
    const b = toDate(end)
    a.setHours(0, 0, 0, 0)
    b.setHours(0, 0, 0, 0)
    if (b < a) return 0
    let count = 0
    const cursor = new Date(a.getTime())
    while (cursor <= b) {
      if (this.isBusinessDay(cursor)) count++
      cursor.setDate(cursor.getDate() + 1)
    }
    return count
  }
}
