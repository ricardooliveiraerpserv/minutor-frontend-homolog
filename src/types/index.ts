export interface User {
  id: number
  name: string
  email: string
  profile_photo_url?: string | null
  type?: string | null
  coordinator_type?: 'projetos' | 'sustentacao' | null
  customer_id?: number | null
  partner_id?: number | null
  is_executive?: boolean | null
  extra_permissions?: string[] | null
  consultant_type?: string | null
  daily_hours?: number | null
  bank_hours_start_date?: string | null
  guaranteed_hours?: number | null
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
  totalConsultantExtraMinutes?: number
}

export interface Customer {
  id: number
  name: string
  code_prefix?: string | null
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
  accumulated_sold_hours?: number
  consumed_hours?: number
  total_logged_minutes?: number
  total_contributions_hours?: number
  hour_contribution?: number
  child_projects?: Project[]
  node_state?: 'ACTIVE' | 'DISABLED' | null
  proj_sequence?: number | null
  proj_year?: string | null
  child_sequence?: number | null
  is_manual_code?: boolean
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
  ticket_solicitante?: { name?: string; email?: string; organization?: string } | null
  status: 'pending' | 'approved' | 'rejected' | 'conflicted'
  status_display: string
  rejection_reason?: string
  reviewed_by?: number
  reviewedBy?: User
  reviewed_at?: string
  origin?: string
  is_billable_only?: boolean
  client_extra_pct?: number | null
  consultant_extra_pct?: number | null
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
  code_prefix?: string | null
  active: boolean
  executive_id?: number | null
  executive?: Executive
  created_at: string
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

export interface ProjectChangeLog {
  id: number
  project_id: number
  changed_by: number
  field_name: string
  field_label: string
  old_value: unknown
  new_value: unknown
  old_value_formatted?: string | null
  new_value_formatted?: string | null
  reason: string | null
  effective_from: string | null
  created_at: string
  changed_by_user: { id: number; name: string; email: string }
}

export interface HourContribution {
  id: number
  project_id: number
  contributed_hours: number
  hourly_rate: number
  description?: string | null
  contributed_by?: number | null
  contributed_at: string
  contributed_by_user?: { id: number; name: string; email: string }
  total_value?: number
}

export interface UserHourlyRateLog {
  id: number
  user_id: number
  changed_by: number
  old_hourly_rate: number | null
  new_hourly_rate: number | null
  old_rate_type: 'hourly' | 'monthly' | null
  new_rate_type: 'hourly' | 'monthly' | null
  reason: string | null
  created_at: string
  changed_by_user: { id: number; name: string; email: string }
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
  is_paid: boolean
  paid_by?: number
  paid_at?: string
  receipt_path?: string
  receipt_url?: string
  reviewed_by?: number
  reviewedBy?: User
  created_at: string
  status_display?: string
  formatted_amount?: string
}

export interface ProjectMessage {
  id: number
  project_id: number
  user_id: number
  message: string
  priority: 'normal' | 'high'
  created_at: string
  author: { id: number; name: string; profile_photo: string | null }
  reads: { user_id: number }[]
  is_mentioned: boolean
}
