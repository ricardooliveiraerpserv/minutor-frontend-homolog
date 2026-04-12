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
  parent_project_id?: number
  status: string
  status_display?: string
  contract_type_display?: string
  balance_percentage?: number
  general_hours_balance?: number
  sold_hours?: number
  consumed_hours?: number
  total_logged_minutes?: number
  total_contributions_hours?: number
  hour_contribution?: number
  child_projects?: Project[]
  node_state?: 'ACTIVE' | 'DISABLED' | null
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
  movidesk_appointment_id?: number | null
  created_at: string
}

export interface ContractType {
  id: number
  name: string
  code: string
  description?: string
  active: boolean
  created_at: string
}

export interface ServiceType {
  id: number
  name: string
  code: string
  description?: string
  active: boolean
  created_at: string
}

export interface Executive {
  id: number
  name: string
  email?: string
}

export interface CustomerFull {
  id: number
  name: string
  company_name?: string
  cgc?: string
  active: boolean
  executive_id?: number | null
  executive?: Executive
  created_at: string
}

export interface Role {
  id: number
  name: string
  permissions?: Permission[]
  created_at: string
}

export interface Permission {
  id: string
  name: string
  description?: string
  group?: string
}

export interface ConsultantGroup {
  id: number
  name: string
  description?: string
  active: boolean
  consultants?: { id: number; name: string; email: string }[]
  consultants_count?: number
  created_at: string
}

export interface SystemSettings {
  timesheet_retroactive_limit_days?: number
  movidesk_default_customer_id?: number
  movidesk_default_project_id?: number
  [key: string]: string | number | null | undefined
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
  receipt_url?: string
  reviewed_by?: number
  reviewedBy?: User
  created_at: string
}
