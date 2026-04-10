export interface User {
  id: number
  name: string
  email: string
  roles?: string[]
  permissions?: string[]
  profile_photo_url?: string | null
}

export interface AuthResponse {
  token: string
  access_token?: string
  token_type: string
  user: User
}

export interface PaginatedResponse<T> {
  items: T[]
  hasNext: boolean
  totalEffortMinutes?: number
  totalEffortHours?: string
}

export interface Customer {
  id: number
  name: string
}

export interface Project {
  id: number
  name: string
  code: string
  customer_id: number
  customer?: Customer
  status: string
  status_display?: string
  contract_type_display?: string
  balance_percentage?: number
  general_hours_balance?: number
  total_logged_minutes?: number
}

export interface Timesheet {
  id: number
  user_id: number
  user?: User
  customer_id: number
  customer?: Customer
  project_id: number
  project?: Project
  date: string
  start_time: string
  end_time: string
  effort_minutes: number
  effort_hours: string
  observation?: string
  ticket?: string
  ticket_subject?: string
  status: 'pending' | 'approved' | 'rejected' | 'conflicted'
  status_display: string
  rejection_reason?: string
  reviewed_by?: number
  reviewedBy?: User
  reviewed_at?: string
  origin?: string
  created_at: string
}

export interface Expense {
  id: number
  user_id: number
  user?: User
  project_id: number
  project?: Project
  expense_category_id: number
  category?: { id: number; name: string }
  expense_date: string
  description: string
  amount: number
  expense_type: string
  payment_method: string
  status: string
  charge_client: boolean
  receipt_path?: string
  reviewed_by?: number
  reviewedBy?: User
  created_at: string
}
