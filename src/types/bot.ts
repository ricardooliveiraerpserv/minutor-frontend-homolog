export interface BotProvider {
  id: number
  slug: string
  name: string
  api_key_env: string
  has_key: boolean
  base_url: string | null
  default_model: string
  enabled: boolean
}

export interface BotAgent {
  id: number
  slug: string
  name: string
  role_description: string | null
  system_prompt: string
  model_override: string | null
  temperature_override: number | null
  active: boolean
  priority: number
  min_severity: string
  cooldown_minutes: number
  max_per_day: number
  trigger_conditions: Record<string, unknown> | null
  allowed_scopes?: string[] | null
}

export interface BotSkill {
  id: number
  slug: string
  name: string
  description: string | null
  rule_type: 'threshold' | 'sql' | 'event'
  config: Record<string, unknown>
  severity: string
  active: boolean
}

export type RuleTargetType = 'user' | 'role' | 'group' | 'all_admins' | 'customer_team' | 'all_users'
export type RuleChannel    = 'inbox' | 'bot_dm' | 'group' | 'email' | 'teams'
export type RuleSeverity   = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface BotRule {
  id: number
  name: string
  description?: string | null
  trigger_event: string
  event_type?: string | null
  skill_slug?: string | null
  severity_min: RuleSeverity
  target_type: RuleTargetType
  target_value: string | null
  target_label?: string | null
  channel: RuleChannel
  active: boolean
  priority: number
  created_at?: string | null
  updated_at?: string | null
}

export interface RuleOptions {
  severities: RuleSeverity[]
  target_types: RuleTargetType[]
  channels: RuleChannel[]
  roles: string[]
  groups: Array<{ id: number; name: string }>
  skills: Array<{ slug: string; name: string }>
  event_types: Array<{ value: string; label: string }>
  trigger_events: string[]
}

export interface RuleTestPreview {
  rule: BotRule
  severity_match: boolean
  recipients: Array<{ id: number; name: string }>
  channel: RuleChannel
  group: { id: number; title: string | null } | null
}

export interface BotGeneralConfig {
  id: number
  active_provider: { id: number; slug: string; name: string } | null
  default_model: string | null
  temperature: number
  frequency_cron: string
  active_hours_start: string | null
  active_hours_end: string | null
  default_severity_threshold: string
  cooldown_minutes: number
  dedupe_window_minutes: number
}
