/**
 * Minutor Design System
 * Tokens: --brand-bg / --brand-surface / --brand-border / --brand-primary (#00F5FF)
 *         --brand-text / --brand-muted / --brand-subtle
 *         --brand-success / --brand-warning / --brand-danger / --brand-purple
 */
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  icon?: LucideIcon
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'rgba(0,245,255,0.08)' }}
          >
            <Icon size={16} color="var(--brand-primary)" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

// ─── CARD ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ children, className, padding = 'md' }: CardProps) {
  const p = padding === 'none' ? '' : padding === 'sm' ? 'p-4' : padding === 'lg' ? 'p-8' : 'p-6'
  return (
    <div
      className={cn('rounded-2xl', p, className)}
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      {children}
    </div>
  )
}

// ─── TABLE ───────────────────────────────────────────────────────────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl overflow-hidden', className)} style={{ border: '1px solid var(--brand-border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
          {children}
        </table>
      </div>
    </div>
  )
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
      {children}
    </thead>
  )
}

export function Th({
  children, right, sortable, active, dir, onClick, className,
}: {
  children?: React.ReactNode
  right?: boolean
  sortable?: boolean
  active?: boolean
  dir?: 'asc' | 'desc'
  onClick?: () => void
  className?: string
}) {
  const SortIcon = active
    ? dir === 'asc' ? ChevronUp : ChevronDown
    : ChevronsUpDown

  return (
    <th
      className={cn(
        'px-5 py-3.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap',
        right && 'text-right',
        sortable && 'cursor-pointer select-none',
        className
      )}
      style={{ color: 'var(--brand-subtle)' }}
      onClick={onClick}
    >
      {sortable ? (
        <span className="inline-flex items-center gap-1.5">
          {children}
          <SortIcon size={11} style={{ color: active ? 'var(--brand-primary)' : undefined, opacity: active ? 1 : 0.4 }} />
        </span>
      ) : children}
    </th>
  )
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

interface TrProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}

export function Tr({ children, onClick, className }: TrProps) {
  return (
    <tr
      className={cn('transition-colors duration-100', onClick && 'cursor-pointer', className)}
      style={{ borderBottom: '1px solid var(--brand-border)' }}
      onMouseEnter={e => { if (onClick || true) e.currentTarget.style.background = 'rgba(0,245,255,0.03)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function Td({
  children, right, muted, mono, className,
}: {
  children?: React.ReactNode
  right?: boolean
  muted?: boolean
  mono?: boolean
  className?: string
}) {
  return (
    <td
      className={cn('px-5 py-3.5', right && 'text-right', mono && 'font-mono text-xs', className)}
      style={{ color: muted ? 'var(--brand-muted)' : 'var(--brand-text)' }}
    >
      {children}
    </td>
  )
}

// ─── BADGE ───────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  // generic
  default:   { bg: 'rgba(161,161,170,0.12)',  color: '#A1A1AA' },
  primary:   { bg: 'rgba(0,245,255,0.10)',    color: '#00F5FF' },
  success:   { bg: 'rgba(16,185,129,0.12)',   color: '#10B981' },
  warning:   { bg: 'rgba(245,158,11,0.12)',   color: '#F59E0B' },
  danger:    { bg: 'rgba(239,68,68,0.12)',    color: '#EF4444' },
  purple:    { bg: 'rgba(139,92,246,0.12)',   color: '#8B5CF6' },
  // timesheet statuses
  pending:    { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  approved:   { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  rejected:   { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444' },
  conflicted: { bg: 'rgba(239,68,68,0.14)',  color: '#F87171' },
  // project statuses
  active:    { bg: 'rgba(16,185,129,0.12)',  color: '#10B981' },
  started:   { bg: 'rgba(0,245,255,0.10)',   color: '#00F5FF' },
  paused:    { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#EF4444' },
  finished:  { bg: 'rgba(161,161,170,0.12)', color: '#71717A' },
  inactive:  { bg: 'rgba(161,161,170,0.12)', color: '#71717A' },
  closed:    { bg: 'rgba(161,161,170,0.12)', color: '#71717A' },
}

export function Badge({
  variant = 'default',
  children,
  className,
}: {
  variant?: string
  children: React.ReactNode
  className?: string
}) {
  const style = BADGE_STYLES[variant] ?? BADGE_STYLES.default
  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', className)}
      style={{ background: style.bg, color: style.color }}
    >
      {children}
    </span>
  )
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────

const BTN_VARIANTS = {
  primary: {
    background: 'var(--brand-primary)',
    color: '#0A0A0B',
    border: 'none',
    fontWeight: 700,
  },
  secondary: {
    background: 'transparent',
    color: 'var(--brand-text)',
    border: '1px solid var(--brand-border)',
    fontWeight: 500,
  },
  ghost: {
    background: 'transparent',
    color: 'var(--brand-muted)',
    border: 'none',
    fontWeight: 500,
  },
  danger: {
    background: 'rgba(239,68,68,0.12)',
    color: '#EF4444',
    border: '1px solid rgba(239,68,68,0.2)',
    fontWeight: 600,
  },
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BTN_VARIANTS
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const sz =
    size === 'sm' ? 'px-3 py-1.5 text-xs gap-1.5 rounded-lg' :
    size === 'lg' ? 'px-6 py-3 text-base gap-2.5 rounded-xl' :
    'px-4 py-2 text-sm gap-2 rounded-xl'

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        sz,
        !disabled && 'hover:opacity-90 active:scale-[0.98]',
        className
      )}
      style={BTN_VARIANTS[variant]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : 15} className="shrink-0" />
      ) : null}
      {children}
    </button>
  )
}

// ─── TEXT INPUT ──────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: LucideIcon
}

export function TextInput({ label, icon: Icon, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--brand-subtle)' }}
          />
        )}
        <input
          className={cn(
            'w-full rounded-xl text-sm transition-colors outline-none',
            Icon ? 'pl-9 pr-4 py-2.5' : 'px-4 py-2.5',
            className
          )}
          style={{
            background: 'var(--brand-surface)',
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-text)',
          }}
          {...props}
        />
      </div>
    </div>
  )
}

// ─── SELECT ──────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
          {label}
        </label>
      )}
      <select
        className={cn('rounded-xl px-4 py-2.5 text-sm cursor-pointer appearance-none outline-none transition-colors', className)}
        style={{
          background: 'var(--brand-surface)',
          border: '1px solid var(--brand-border)',
          color: 'var(--brand-text)',
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// ─── PAGINATION ──────────────────────────────────────────────────────────────

export function Pagination({
  page,
  hasNext,
  onPrev,
  onNext,
  total,
}: {
  page: number
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  total?: number
}) {
  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
        {total !== undefined ? `${total} registros` : `Página ${page}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: 'var(--brand-surface)',
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-muted)',
          }}
        >
          <ChevronLeft size={13} /> Anterior
        </button>
        <span
          className="px-3 py-1.5 rounded-lg text-xs font-bold min-w-[36px] text-center"
          style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
        >
          {page}
        </span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: 'var(--brand-surface)',
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-muted)',
          }}
        >
          Próxima <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-20 text-center rounded-2xl"
      style={{ border: '1px dashed var(--brand-border)', background: 'transparent' }}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.06)' }}>
          <Icon size={20} color="var(--brand-primary)" />
        </div>
      )}
      <div>
        <p className="font-semibold text-sm" style={{ color: 'var(--brand-text)' }}>{title}</p>
        {description && (
          <p className="text-sm mt-1" style={{ color: 'var(--brand-muted)' }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

// ─── SKELETON ────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg', className)}
      style={{ background: 'var(--brand-border)' }}
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Table>
      <Thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <Th key={i}><Skeleton className="h-3 w-20" /></Th>
          ))}
        </tr>
      </Thead>
      <Tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <Tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <Td key={c}><Skeleton className="h-4 w-full" /></Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children, width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className={cn('relative w-full rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto', width)}
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
      >
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--brand-border)' }}>
            <h2 className="font-bold text-base" style={{ color: 'var(--brand-text)' }}>{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--brand-muted)' }}
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
