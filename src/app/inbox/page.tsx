'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import {
  createDirectConversation, listConversations, listPresence,
  presenceHeartbeat, unreadSummary,
} from '@/lib/inbox'
import { ConversationsSidebar } from '@/components/inbox/ConversationsSidebar'
import { InboxHeader } from '@/components/inbox/InboxHeader'
import { MessageList } from '@/components/inbox/MessageList'
import { SeveritySummary } from '@/components/inbox/SeveritySummary'
import { NewConversationModal } from '@/components/inbox/NewConversationModal'
import type { PresenceStatusValue } from '@/types/inbox'

export default function InboxPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const startDirectWithUser = async (userId: number) => {
    try {
      const res = await createDirectConversation(userId)
      await qc.refetchQueries({ queryKey: ['inbox-conversations'] })
      setSelectedId(res.data.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const { data: convData, isLoading } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: listConversations,
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['inbox-summary'],
    queryFn: unreadSummary,
    refetchInterval: 30_000,
  })

  const conversations = useMemo(() => convData?.data ?? [], [convData])

  const directOtherIds = useMemo(
    () => conversations.filter(c => c.type === 'direct' && c.other_user).map(c => c.other_user!.id),
    [conversations],
  )

  const { data: presenceData } = useQuery({
    queryKey: ['presence-snapshot', directOtherIds.join(',')],
    queryFn: () => listPresence(directOtherIds),
    enabled: directOtherIds.length > 0,
    refetchInterval: 30_000,
  })

  const presenceByUser = useMemo(() => {
    const map = new Map<number, PresenceStatusValue>()
    presenceData?.data?.forEach(p => map.set(p.user_id, p.status))
    return map
  }, [presenceData])

  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  useEffect(() => {
    presenceHeartbeat('online').catch(() => {})
    const t = setInterval(() => presenceHeartbeat('online').catch(() => {}), 120_000)
    return () => clearInterval(t)
  }, [])

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const isBot = selectedConv?.type === 'bot'

  const summaryBreakdown = summary
    ? { ...summary.by_severity, total: summary.total_unread }
    : undefined

  return (
    <AppLayout fullBleed>
      <div className="h-full flex bg-[var(--bg)] overflow-hidden">
        <ConversationsSidebar
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setNewOpen(true)}
          onStartDirect={startDirectWithUser}
          presenceByUser={presenceByUser}
          loading={isLoading}
        />
        <div className="flex-1 flex flex-col">
          <InboxHeader conversation={selectedConv} presenceByUser={presenceByUser} />
          {isBot && <SeveritySummary bySeverity={summaryBreakdown} />}
          <MessageList conversation={selectedConv} currentUserId={user?.id ?? null} />
        </div>
      </div>

      {newOpen && (
        <NewConversationModal
          onClose={() => setNewOpen(false)}
          onCreated={id => setSelectedId(id)}
        />
      )}
    </AppLayout>
  )
}
