import { api } from './api'
import type {
  BotAgent, BotGeneralConfig, BotProvider, BotRule, BotSkill,
  RuleOptions, RuleTestPreview,
} from '@/types/bot'
import type { ChatUser } from '@/types/inbox'

// General
export const getBotConfig    = (): Promise<{ data: BotGeneralConfig }> => api.get('/bot/config')
export const updateBotConfig = (payload: Partial<BotGeneralConfig> & { active_provider_id?: number }) => api.put<{ data: BotGeneralConfig }>('/bot/config', payload)

// Providers
export const listProviders   = (): Promise<{ data: BotProvider[] }>   => api.get('/bot/providers')
export const createProvider  = (payload: Partial<BotProvider>): Promise<{ data: BotProvider[] }> => api.post('/bot/providers', payload)
export const updateProvider  = (id: number, payload: Partial<BotProvider>) => api.put<{ data: BotProvider[] }>(`/bot/providers/${id}`, payload)
export const deleteProvider  = (id: number): Promise<{ data: BotProvider[] }> => api.delete(`/bot/providers/${id}`)

// Agents
export const listAgents      = (): Promise<{ data: BotAgent[] }>      => api.get('/bot/agents')
export const createAgent     = (payload: Partial<BotAgent>): Promise<{ data: BotAgent[] }> => api.post('/bot/agents', payload)
export const updateAgent     = (id: number, payload: Partial<BotAgent>) => api.put<{ data: BotAgent[] }>(`/bot/agents/${id}`, payload)
export const deleteAgent     = (id: number): Promise<{ data: BotAgent[] }> => api.delete(`/bot/agents/${id}`)

// Skills
export const listSkills      = (): Promise<{ data: BotSkill[] }>      => api.get('/bot/skills')
export const createSkill     = (payload: Partial<BotSkill>): Promise<{ data: BotSkill[] }> => api.post('/bot/skills', payload)
export const updateSkill     = (id: number, payload: Partial<BotSkill>) => api.put<{ data: BotSkill[] }>(`/bot/skills/${id}`, payload)
export const deleteSkill     = (id: number): Promise<{ data: BotSkill[] }> => api.delete(`/bot/skills/${id}`)

// Rules — CRUD completo
export const listRules       = (): Promise<{ data: BotRule[] }>       => api.get('/bot/rules')
export const getRuleOptions  = (): Promise<{ data: RuleOptions }>     => api.get('/bot/rules/options')
export const createRule      = (payload: Partial<BotRule>): Promise<{ data: BotRule }> => api.post('/bot/rules', payload)
export const updateRule      = (id: number, payload: Partial<BotRule>): Promise<{ data: BotRule }> => api.put(`/bot/rules/${id}`, payload)
export const deleteRule      = (id: number): Promise<{ deleted: boolean }> => api.delete(`/bot/rules/${id}`)
export const testRule        = (id: number, feedId?: number): Promise<{ data: RuleTestPreview }> => api.post(`/bot/rules/${id}/test`, feedId ? { feed_id: feedId } : {})
export const dispatchTestRule = (id: number): Promise<{ data: { rule: BotRule; delivered: number; channel: string; group: { id: number; title: string|null } | null; recipients_count: number } }> => api.post(`/bot/rules/${id}/dispatch-test`, {})
export const listChatUsersForRule = (): Promise<{ data: ChatUser[] }> => api.get('/conversations/users')

// Grupos admin
export interface AdminGroup {
  id: number
  title: string | null
  members_count: number
  created_by: number | null
  created_at: string | null
  last_message_at: string | null
}

export interface GroupMember {
  user_id: number
  role: 'member' | 'admin'
  name: string | null
  email: string | null
  profile_photo: string | null
  is_creator: boolean
}

export interface GroupUserOption {
  id: number
  name: string
  email: string
  profile_photo: string | null
  type: string | null
}

export const listGroups        = (): Promise<{ data: AdminGroup[] }> => api.get('/bot/groups')
export const getGroupMembers   = (id: number): Promise<{ data: { id: number; title: string|null; members: GroupMember[] } }> => api.get(`/bot/groups/${id}/members`)
export const createGroupAdmin  = (name: string, participantIds: number[] = []): Promise<{ data: { id: number; title: string } }> => api.post('/bot/groups', { name, participant_ids: participantIds })
export const renameGroup       = (id: number, name: string): Promise<{ data: { id: number; title: string } }> => api.patch(`/bot/groups/${id}`, { name })
export const deleteGroup       = (id: number): Promise<{ deleted: boolean }> => api.delete(`/bot/groups/${id}`)
export const addGroupMember    = (id: number, userId: number) => api.post(`/bot/groups/${id}/members`, { user_id: userId })
export const removeGroupMember = (id: number, userId: number) => api.delete(`/bot/groups/${id}/members/${userId}`)
export const seedDefaultGroups = (): Promise<{ data: { created: { id:number;title:string }[]; already_existed: string[] } }> => api.post('/bot/groups/seed-defaults', {})
export const listGroupUserOptions = (q?: string): Promise<{ data: GroupUserOption[] }> => api.get(`/bot/groups/available-users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
