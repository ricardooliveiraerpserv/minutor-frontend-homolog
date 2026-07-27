'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW DE LAYOUT do Cofre de Ambientes — SEM senha, dados fictícios.
// Sandbox pra iterar o layout rápido; NÃO é o módulo real (que continua com unlock
// zero-knowledge). O que a gente aprovar aqui, eu replico nos componentes reais.
// 100% aditivo: não toca /cofre, /ambientes real, nem nada de segurança.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Copy, Database, Download, ExternalLink, Eye, EyeOff, Folder, FolderOpen,
  FolderPlus, KeyRound, LayoutGrid, Link2, List, Monitor, Pencil, Plus, Server, Settings2, ShieldAlert, ShieldCheck, Star,
  Trash2, User, UserPlus, Users, Wifi, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, TextInput } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { KpiCard } from '@/components/ui/kpi-card'
import { api } from '@/lib/api'
// Modais REAIS de inclusão — reusados p/ ver o layout de cadastro (salvar é no-op no preview).
import { EnvCredentialModal } from '@/components/environments/env-credential-modal'
import { EnvDatabaseModal } from '@/components/environments/env-database-modal'
import { EnvAppserverModal } from '@/components/environments/env-appserver-modal'
import { EnvVpnModal } from '@/components/environments/env-vpn-modal'
import { EnvCertificateModal } from '@/components/environments/env-certificate-modal'
import { EnvLinkModal } from '@/components/environments/env-link-modal'
import { EnvEncryptedFile } from '@/components/environments/env-encrypted-file'
import { EnvDocs } from '@/components/environments/env-docs'
import { generateKey32, importAesKey } from '@/lib/vault-crypto'

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }

const CLIENTS = [
  { id: 1, name: 'Agro Amazônia', envs: 3, empty: false },
  { id: 2, name: 'Veda Motors', envs: 2, empty: false },
  { id: 3, name: 'Metalúrgica Sul', envs: 1, empty: false },
  { id: 4, name: 'Têxtil Norte', envs: 0, empty: true },
  { id: 5, name: 'Logística Prime', envs: 0, empty: true },
  { id: 6, name: 'Farma Vida', envs: 0, empty: true },
]
const ENVS = [
  { id: 11, name: 'Produção ERP', type: 'prod', status: 'online', creds: 6, fav: true },
  { id: 12, name: 'Homologação', type: 'homolog', status: 'maintenance', creds: 3, fav: false },
  { id: 13, name: 'Desenvolvimento', type: 'dev', status: 'unknown', creds: 0, fav: false },
]
const FAKE_SECRET = 'S3nh@Fict!cia2026'

const STATUS_VARIANT: Record<string, string> = { online: 'success', offline: 'danger', maintenance: 'warning', unknown: 'default' }
const STATUS_LABEL: Record<string, string> = { online: 'Online', offline: 'Offline', maintenance: 'Manutenção', unknown: '—' }

// Detalhe de cada KPI (mock) — o que aparece ao clicar no cartão.
type KpiItem = { label: string; sub: string; badge?: string; tone?: string }
const KPI_INFO: Record<string, { title: string; desc: string; items: KpiItem[] }> = {
  clientes: { title: 'Clientes', desc: 'Clientes com cofre de ambientes.', items: [
    { label: 'Agro Amazônia', sub: '3 ambiente(s)' }, { label: 'Veda Motors', sub: '2 ambiente(s)' }, { label: 'Metalúrgica Sul', sub: '1 ambiente(s)' },
  ] },
  ambientes: { title: 'Ambientes', desc: 'Todos os ambientes cadastrados.', items: [
    { label: 'Produção ERP', sub: 'Agro Amazônia', badge: 'Produção', tone: 'success' }, { label: 'Homologação', sub: 'Agro Amazônia', badge: 'Homolog', tone: 'warning' }, { label: 'Desenvolvimento', sub: 'Agro Amazônia', badge: 'Dev' },
  ] },
  credenciais: { title: 'Credenciais', desc: 'Credenciais em todos os ambientes.', items: [
    { label: 'SA do SQL Server (sa)', sub: 'Agro Amazônia · Produção', badge: 'Admin SQL', tone: 'danger' }, { label: 'Administrador do servidor', sub: 'Agro Amazônia · Produção', badge: 'Admin Windows' }, { label: 'Portal TOTVS (agro.admin)', sub: 'Agro Amazônia · Produção', badge: 'Portal' },
  ] },
  certificados: { title: 'Certificados', desc: 'Certificados A1/A3 cadastrados.', items: [
    { label: 'A1 Receita — vence 07/08/2026 (12d)', sub: 'Agro Amazônia · Produção', badge: 'Vencendo', tone: 'warning' }, { label: 'A1 NF-e — vence 20/09/2026', sub: 'Veda Motors · Produção', badge: 'OK', tone: 'success' },
  ] },
  vpns: { title: 'VPNs', desc: 'Acessos VPN cadastrados.', items: [
    { label: 'Fortinet — vpn.agro.com', sub: 'Agro Amazônia · Produção', badge: 'Crítico', tone: 'danger' }, { label: 'OpenVPN — vpn.veda.com', sub: 'Veda Motors · Produção' },
  ] },
  criticos: { title: 'Itens críticos', desc: 'Marcados como "Crítico" — revelar exige 2º fator + justificativa (Nível 4).', items: [
    { label: 'SA do SQL Server', sub: 'Agro Amazônia · Produção', badge: 'Credencial', tone: 'danger' },
    { label: 'Banco PROTHEUS (SRV-PROD)', sub: 'Agro Amazônia · Produção', badge: 'Banco', tone: 'danger' },
    { label: 'Certificado A1 Receita', sub: 'Agro Amazônia · Produção', badge: 'Certificado', tone: 'danger' },
    { label: 'VPN Fortinet', sub: 'Agro Amazônia · Produção', badge: 'VPN', tone: 'danger' },
    { label: 'Root AWS', sub: 'Veda Motors · Produção', badge: 'Credencial', tone: 'danger' },
  ] },
  compartilhados: { title: 'Compartilhados', desc: 'Clientes com mais de um membro no cofre.', items: [
    { label: 'Agro Amazônia', sub: '3 membros · Ricardo, Maria, João' }, { label: 'Veda Motors', sub: '2 membros · Ricardo, Equipe Protheus' },
  ] },
  alertas: { title: 'Alertas — vencimentos', desc: 'Certificados vencendo (30 dias) e senhas com rotação vencida.', items: [
    { label: 'Certificado A1 Receita — 12d (07/08/2026)', sub: 'Agro Amazônia · Produção', badge: 'Cert', tone: 'warning' },
    { label: 'Trocar senha: Admin SQL — VENCIDA', sub: 'Agro Amazônia · Produção', badge: 'Senha', tone: 'danger' },
  ] },
}

/** Campo de senha mascarado (mock: revela um valor fictício). */
function PwField() {
  const [shown, setShown] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm" style={{ color: 'var(--text)' }}>{shown ? FAKE_SECRET : '••••••••'}</span>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} onClick={() => setShown(s => !s)} title={shown ? 'Esconder' : 'Revelar'}>
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} onClick={() => toast.success('Copiado — clipboard limpo em 30s')} title="Copiar">
        <Copy className="w-4 h-4" />
      </button>
    </span>
  )
}

function Chip({ icon: Icon, label, tone = 'default', onClick }: { icon: typeof Copy; label: string; tone?: 'default' | 'primary' | 'warn'; onClick: () => void }) {
  const color = tone === 'primary' ? 'var(--primary)' : tone === 'warn' ? 'var(--warning)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-80"
      style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color }}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  )
}

function SectionCard({ icon: Icon, title, count, onAdd, children }: { icon: typeof KeyRound; title: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card padding="none" className="overflow-x-auto">
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--primary)' }} /> {title}
          <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({count})</span>
        </h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={onAdd}>Adicionar</Button>
      </div>
      {children}
    </Card>
  )
}

export default function AmbientesPreviewPage() {
  const [view, setView] = useState<'home' | 'cliente' | 'env'>('home')
  const [favs, setFavs] = useState<Record<number, boolean>>({ 11: true })
  const ENV_ID = 11  // o detalhe do preview é sempre "Produção ERP" — favorito é o mesmo do card
  const [permsOpen, setPermsOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [addModal, setAddModal] = useState<null | 'cred' | 'db' | 'app' | 'vpn' | 'cert' | 'link'>(null)
  const [newEnvOpen, setNewEnvOpen] = useState(false)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [shareClient, setShareClient] = useState<string | null>(null)  // nome do cliente no modal de acesso
  const [kpiDetail, setKpiDetail] = useState<string | null>(null)      // KPI clicado → mostra a lista
  const [customizeQA, setCustomizeQA] = useState(false)                // personalizar Acesso Rápido
  // Itens do Acesso Rápido: `def` = padrão do ambiente (admin); `mine` = ajuste do usuário
  // (herdar segue o padrão; mostrar/ocultar sobrepõem). Efetivo = mostrar OU (herdar E def).
  type QAMine = 'herdar' | 'mostrar' | 'ocultar'
  const [qaItems, setQaItems] = useState<{ key: string; label: string; icon: typeof Copy; tone: 'default' | 'primary' | 'warn'; def: boolean; mine: QAMine; onClick: () => void }[]>([
    { key: 'rdp', label: 'Abrir RDP', icon: Monitor, tone: 'primary', def: true, mine: 'herdar', onClick: () => toast('Gerou Producao.rdp') },
    { key: 'rdp_host', label: 'Copiar host RDP', icon: Copy, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Host copiado: 10.0.0.5:3389') },
    { key: 'user', label: 'Copiar usuário (administrador)', icon: User, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Usuário copiado') },
    { key: 'sql1', label: 'Conexão SQL · SRV-SQL01', icon: Database, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Conexão copiada') },
    { key: 'sql2', label: 'Conexão SQL · SRV-PROD', icon: Database, tone: 'warn', def: true, mine: 'herdar', onClick: () => toast('Banco crítico: revele na seção Banco') },
    { key: 'vpn', label: 'Abrir VPN · Fortinet', icon: Wifi, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Baixou Fortinet.ovpn') },
    { key: 'ini', label: 'appserver.ini · AppServer-01', icon: Download, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Baixou appserver.ini') },
    { key: 'tss', label: 'Portal TSS', icon: ExternalLink, tone: 'default', def: true, mine: 'herdar', onClick: () => toast('Abriria o Portal TSS') },
    { key: 'fluig', label: 'Fluig', icon: ExternalLink, tone: 'default', def: false, mine: 'herdar', onClick: () => toast('Abriria o Fluig') },
  ])
  const setQa = (key: string, patch: Partial<{ def: boolean; mine: QAMine }>) => setQaItems(items => items.map(i => i.key === key ? { ...i, ...patch } : i))
  const qaVisible = (i: { def: boolean; mine: QAMine }) => i.mine === 'mostrar' || (i.mine === 'herdar' && i.def)
  const closeAdd = () => setAddModal(null)
  // Chave fictícia só p/ habilitar o componente de anexo no preview (nada real é cifrado/salvo).
  const [mockKey, setMockKey] = useState<CryptoKey | undefined>(undefined)
  useEffect(() => { void importAesKey(generateKey32()).then(setMockKey) }, [])
  // Equipes REAIS do cadastro (Cadastros → Grupos de Consultor) — pra bater com o Minutor.
  const [realTeams, setRealTeams] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    if (!permsOpen) return
    void api.get<{ items?: { id: number; name: string }[]; data?: { id: number; name: string }[] }>('/consultant-groups?pageSize=200')
      .then(r => setRealTeams((r.items ?? r.data ?? []).map(g => ({ id: g.id, name: g.name }))))
      .catch(() => setRealTeams([]))
  }, [permsOpen])

  const toggleFav = (id: number) => { setFavs(f => ({ ...f, [id]: !f[id] })); toast(favs[id] ? 'Removido dos favoritos' : 'Adicionado aos favoritos') }

  return (
    <AppLayout>
      <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
        <Eye className="w-4 h-4" /> <span><b>Preview de layout</b> — sem senha, dados fictícios. Sandbox pra iterar o design; o Cofre de Ambientes real continua com unlock.</span>
      </div>

      {/* ══════════ HOME ══════════ */}
      {view === 'home' && (
        <>
          <PageHeader icon={Server} title="Cofre de Ambientes" subtitle="Gestão de infraestrutura por cliente — zero-knowledge nos segredos" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Clientes" value={6} icon={Users} accent="primary" onClick={() => setKpiDetail('clientes')} />
            <KpiCard label="Ambientes" value={9} icon={Server} accent="info" onClick={() => setKpiDetail('ambientes')} />
            <KpiCard label="Credenciais" value={23} icon={KeyRound} onClick={() => setKpiDetail('credenciais')} />
            <KpiCard label="Certificados" value={4} icon={ShieldAlert} accent="warning" hint="2 vencendo" onClick={() => setKpiDetail('certificados')} />
            <KpiCard label="VPNs" value={3} icon={Wifi} onClick={() => setKpiDetail('vpns')} />
            <KpiCard label="Itens críticos" value={5} icon={AlertTriangle} accent="danger" onClick={() => setKpiDetail('criticos')} />
            <KpiCard label="Compartilhados" value={2} icon={Users} onClick={() => setKpiDetail('compartilhados')} />
            <KpiCard label="Alertas" value={2} icon={AlertTriangle} accent="warning" hint="ver vencimentos" onClick={() => setKpiDetail('alertas')} />
          </div>

          <Card className="mb-4" padding="sm">
            <h3 className="flex items-center gap-2 font-semibold mb-2 text-sm" style={{ color: 'var(--warning)' }}><Star className="w-4 h-4" fill="currentColor" /> Favoritos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ENVS.filter(e => favs[e.id]).map(e => (
                <button key={e.id} onClick={() => setView('env')} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 text-left" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                  <Server className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
                  <span className="min-w-0"><span className="block text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{e.name}</span><span className="block text-xs truncate" style={{ color: 'var(--text-light)' }}>Agro Amazônia · {TYPE_LABEL[e.type]}</span></span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="mb-4" padding="sm">
            <h3 className="flex items-center gap-2 font-semibold mb-2 text-sm" style={{ color: 'var(--warning)' }}><AlertTriangle className="w-4 h-4" /> Vencimentos próximos</h3>
            <button onClick={() => setView('env')} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:opacity-80">
              <span style={{ color: 'var(--text)' }}><ShieldAlert className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--warning)' }} />Certificado A1 Receita <span style={{ color: 'var(--text-light)' }}>· Agro Amazônia / Produção</span></span>
              <span className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>12d · 07/08/2026</span>
            </button>
            <button onClick={() => setView('env')} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:opacity-80">
              <span style={{ color: 'var(--text)' }}><KeyRound className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--danger)' }} />Trocar senha: Admin SQL <span style={{ color: 'var(--text-light)' }}>· Produção</span></span>
              <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>VENCIDA</span>
            </button>
          </Card>

          <div className="mb-4"><TextInput placeholder="Buscar ambiente, credencial, usuário…" /></div>

          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            {/* Alternar grade / lista */}
            <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setViewMode('grid')} className="p-2" title="Grade" style={{ background: viewMode === 'grid' ? 'var(--primary-soft)' : 'var(--surface)', color: viewMode === 'grid' ? 'var(--primary)' : 'var(--text-muted)' }}><LayoutGrid className="w-4 h-4" /></button>
              <button type="button" onClick={() => setViewMode('list')} className="p-2" title="Lista" style={{ background: viewMode === 'list' ? 'var(--primary-soft)' : 'var(--surface)', color: viewMode === 'list' ? 'var(--primary)' : 'var(--text-muted)' }}><List className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button icon={FolderPlus} onClick={() => setBackfillOpen(true)}>Criar pastas dos clientes existentes</Button>
              <Button variant="primary" icon={Plus} onClick={() => setNewClientOpen(true)}>Novo cliente</Button>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CLIENTS.map(c => (
                <Card key={c.id} onClick={() => setView('cliente')} className="hover:opacity-90 transition-opacity cursor-pointer h-full" style={c.empty ? { borderStyle: 'dashed', background: 'var(--surface-hover)' } : undefined} >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.empty ? 'var(--surface)' : 'var(--primary-soft)' }}>
                      {c.empty ? <Folder className="w-5 h-5" style={{ color: 'var(--text-light)' }} /> : <FolderOpen className="w-5 h-5" style={{ color: 'var(--primary)' }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ color: c.empty ? 'var(--text-muted)' : 'var(--text)' }}>{c.name}</div>
                      {c.empty
                        ? <div className="text-sm italic" style={{ color: 'var(--text-light)' }}>Pasta vazia — sem ambientes</div>
                        : <div className="text-sm flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Users className="w-3.5 h-3.5" /> {c.envs} ambiente(s)</div>}
                    </div>
                    <button type="button" title="Dar acesso ao cliente" className="p-1.5 rounded-lg hover:opacity-80 shrink-0" style={{ color: 'var(--primary)' }} onClick={ev => { ev.stopPropagation(); setShareClient(c.name) }}><UserPlus className="w-4 h-4" /></button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead><tr><th>Cliente</th><th>Ambientes</th><th className="text-right">Acesso</th></tr></thead>
                <tbody>
                  {CLIENTS.map(c => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => setView('cliente')}>
                      <td>
                        <span className="flex items-center gap-2">
                          {c.empty ? <Folder className="w-4 h-4" style={{ color: 'var(--text-light)' }} /> : <FolderOpen className="w-4 h-4" style={{ color: 'var(--primary)' }} />}
                          <span className="text-sm font-medium" style={{ color: c.empty ? 'var(--text-muted)' : 'var(--text)' }}>{c.name}</span>
                        </span>
                      </td>
                      <td className="text-sm" style={{ color: c.empty ? 'var(--text-light)' : 'var(--text-muted)' }}>{c.empty ? 'Pasta vazia' : `${c.envs} ambiente(s)`}</td>
                      <td className="text-right"><button type="button" title="Dar acesso ao cliente" className="p-1.5 rounded-lg hover:opacity-80" style={{ color: 'var(--primary)' }} onClick={ev => { ev.stopPropagation(); setShareClient(c.name) }}><UserPlus className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ══════════ CLIENTE ══════════ */}
      {view === 'cliente' && (
        <>
          <div className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            <button className="hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setView('home')}>Cofre de Ambientes</button> › <span>Agro Amazônia</span>
          </div>
          <PageHeader icon={FolderOpen} title="Ambientes do cliente" subtitle="Agro Amazônia"
            actions={<div className="flex gap-2">
              <Button icon={ArrowLeft} onClick={() => setView('home')}>Voltar</Button>
              <Button icon={Users} onClick={() => setShareClient('Agro Amazônia')}>Compartilhar</Button>
              <Button variant="primary" icon={Plus} onClick={() => setNewEnvOpen(true)}>Novo ambiente</Button>
            </div>} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ENVS.map(e => (
              <Card key={e.id} onClick={() => setView('env')} className="hover:opacity-90 transition-opacity cursor-pointer h-full" style={e.creds === 0 ? { borderStyle: 'dashed', background: 'var(--surface-hover)' } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{e.name}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{TYPE_LABEL[e.type]}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={ev => { ev.stopPropagation(); toggleFav(e.id) }} className="p-1 rounded hover:opacity-80" style={{ color: favs[e.id] ? 'var(--warning)' : 'var(--text-light)' }}>
                      <Star className="w-4 h-4" fill={favs[e.id] ? 'currentColor' : 'none'} />
                    </button>
                    <Badge variant={STATUS_VARIANT[e.status] ?? 'default'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                  </div>
                </div>
                <div className="text-xs mt-3" style={{ color: 'var(--text-light)' }}>{e.creds} credencial(is)</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ══════════ AMBIENTE ══════════ */}
      {view === 'env' && (
        <>
          <div className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            <button className="hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setView('home')}>Cofre de Ambientes</button> ›{' '}
            <button className="hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setView('cliente')}>Agro Amazônia</button> › <span>Produção ERP</span>
          </div>
          <PageHeader icon={Server} title="Produção ERP" subtitle="Produção"
            actions={<div className="flex gap-2">
              <Button icon={Pencil} onClick={() => setEditOpen(true)}>Editar</Button>
              <Button icon={ShieldCheck} onClick={() => setPermsOpen(true)}>Permissões</Button>
              <Button icon={ArrowLeft} onClick={() => setView('cliente')}>Voltar</Button>
            </div>} />

          {/* Acesso Rápido */}
          <Card padding="sm" className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--primary)' }}><Zap className="w-4 h-4" /> Acesso Rápido</h3>
              <div className="flex items-center gap-1">
                <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm hover:opacity-80" style={{ color: 'var(--text-muted)' }} onClick={() => setCustomizeQA(true)} title="Personalizar">
                  <Settings2 className="w-4 h-4" /> Personalizar
                </button>
                <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm hover:opacity-80" style={{ color: favs[ENV_ID] ? 'var(--warning)' : 'var(--text-muted)' }} onClick={() => toggleFav(ENV_ID)}>
                  <Star className="w-4 h-4" fill={favs[ENV_ID] ? 'currentColor' : 'none'} /> {favs[ENV_ID] ? 'Favorito' : 'Favoritar'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {qaItems.filter(qaVisible).map(i => <Chip key={i.key} icon={i.icon} label={i.label} tone={i.tone} onClick={i.onClick} />)}
              {!qaItems.some(qaVisible) && <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nada no seu Acesso Rápido — clique em Personalizar.</p>}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <SectionCard icon={KeyRound} title="Credenciais" count={3} onAdd={() => setAddModal('cred')}>
              <table className="ds-table w-full">
                <thead><tr><th>Categoria</th><th>Rótulo</th><th>Usuário</th><th>Senha</th><th className="text-right">Ações</th></tr></thead>
                <tbody>
                  <tr><td><Badge variant="danger">Admin SQL</Badge></td><td>SA do SQL Server</td><td className="font-mono text-sm">sa</td><td><PwField /></td><td><RowActions onEdit={() => setAddModal('cred')} /></td></tr>
                  <tr><td><Badge>Admin Windows</Badge></td><td>Administrador</td><td className="font-mono text-sm">administrador</td><td><PwField /></td><td><RowActions onEdit={() => setAddModal('cred')} /></td></tr>
                  <tr><td><Badge>Portal</Badge></td><td>Portal TOTVS</td><td className="font-mono text-sm">agro.admin</td><td><PwField /></td><td><RowActions onEdit={() => setAddModal('cred')} /></td></tr>
                </tbody>
              </table>
            </SectionCard>

            <SectionCard icon={Database} title="Banco de Dados" count={2} onAdd={() => setAddModal('db')}>
              <table className="ds-table w-full">
                <thead><tr><th>Servidor</th><th>Instância / DB</th><th>Usuário</th><th>Senha</th><th>AlwaysOn</th><th className="text-right">Ações</th></tr></thead>
                <tbody>
                  <tr><td className="text-sm">SRV-PROD:1433</td><td className="text-sm">PROTHEUS / P12PROD</td><td className="font-mono text-sm">protheus</td><td><PwField /></td><td><Badge variant="success">Sim</Badge></td><td><RowActions onEdit={() => setAddModal('db')} /></td></tr>
                  <tr><td className="text-sm">SRV-SQL01</td><td className="text-sm">SUCURSAL</td><td className="font-mono text-sm">rpt_user</td><td><PwField /></td><td><span style={{ color: 'var(--text-light)' }}>—</span></td><td><RowActions onEdit={() => setAddModal('db')} /></td></tr>
                </tbody>
              </table>
            </SectionCard>

            <SectionCard icon={Server} title="AppServer" count={1} onAdd={() => setAddModal('app')}>
              <table className="ds-table w-full">
                <thead><tr><th>Nome</th><th>Versão</th><th>Build</th><th>RootPath</th><th>appserver.ini</th><th className="text-right">Ações</th></tr></thead>
                <tbody>
                  <tr><td className="text-sm">AppServer-01</td><td className="text-sm">12.1.2210</td><td className="text-sm">7.00.191205P</td><td className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>D:\totvs\protheus</td><td><EnvEncryptedFile entityType="ENV_APPSERVER_INI" entityId={0} category="ini" vaultKey={mockKey} attachmentId={null} originalName="appserver.ini" demo /></td><td><RowActions onEdit={() => setAddModal('app')} /></td></tr>
                </tbody>
              </table>
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={Wifi} title="VPN" count={1} onAdd={() => setAddModal('vpn')}>
                <table className="ds-table w-full"><tbody>
                  <tr><td><Badge variant="danger">Fortinet</Badge></td><td className="font-mono text-sm">vpn.agro.com</td><td><PwField /></td><td><EnvEncryptedFile entityType="ENV_VPN_OVPN" entityId={0} category="ovpn" vaultKey={mockKey} attachmentId={null} originalName="Fortinet.ovpn" demo /></td><td><RowActions onEdit={() => setAddModal('vpn')} /></td></tr>
                </tbody></table>
              </SectionCard>
              <SectionCard icon={ShieldAlert} title="Certificados" count={1} onAdd={() => setAddModal('cert')}>
                <table className="ds-table w-full"><tbody>
                  <tr><td className="text-sm">A1 Receita <Badge variant="danger">A1</Badge></td><td className="text-sm" style={{ color: 'var(--warning)' }}>07/08/2026 (12d)</td><td><EnvEncryptedFile entityType="ENV_CERT_PFX" entityId={0} category="pfx" vaultKey={mockKey} attachmentId={null} originalName="A1_Receita.pfx" demo /></td><td><RowActions onEdit={() => setAddModal('cert')} /></td></tr>
                </tbody></table>
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={Link2} title="Links" count={2} onAdd={() => setAddModal('link')}>
                <table className="ds-table w-full"><tbody>
                  <tr><td className="text-sm">Portal TSS</td><td><Badge variant="primary">tss</Badge></td><td><a className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => toast('Abriria')}>tss.agro.com</a></td><td><RowActions onEdit={() => setAddModal('link')} /></td></tr>
                  <tr><td className="text-sm">Fluig</td><td><Badge variant="primary">fluig</Badge></td><td><a className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => toast('Abriria')}>fluig.agro.com</a></td><td><RowActions onEdit={() => setAddModal('link')} /></td></tr>
                </tbody></table>
              </SectionCard>
              <Card padding="none" className="overflow-x-auto">
                <EnvDocs envId={0} demo />
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Modais mock */}
      <Modal open={shareClient !== null} onClose={() => setShareClient(null)} title={`Dar acesso — ${shareClient ?? ''}`} width="max-w-xl">
        <div className="flex flex-col gap-4">
          <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
            <b>Acesso no nível do cliente:</b> quem entrar aqui passa a ver <b>todos os ambientes e cards</b> deste cliente (conforme o papel). A chave é embrulhada no navegador para cada membro.
          </p>
          <table className="ds-table w-full">
            <thead><tr><th>Membro</th><th>Papel</th><th /></tr></thead>
            <tbody>
              <tr><td><div className="text-sm">Ricardo Oliveira (você)</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>ri@erpserv</div></td><td><Badge>Admin</Badge></td><td /></tr>
              <tr><td><div className="text-sm">Maria Souza</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>maria@erpserv</div></td><td><Badge>Edita</Badge></td><td className="text-right"><DelBtn /></td></tr>
              <tr><td><div className="text-sm">João Lima</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>joao@erpserv</div></td><td><Badge>Lê</Badge></td><td className="text-right"><DelBtn /></td></tr>
            </tbody>
          </table>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px]"><TextInput label="Adicionar pessoa" placeholder="Buscar usuário…" /></div>
            <Button variant="primary" icon={Users} onClick={() => toast('Adicionado (preview)')}>Adicionar</Button>
          </div>
          <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]"><TextInput label="Adicionar equipe (Grupo de Consultores)" placeholder="Buscar equipe…" /></div>
              <Button icon={Users} onClick={() => toast('Equipe adicionada (preview)')}>Adicionar equipe</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={permsOpen} onClose={() => setPermsOpen(false)} title="Permissões do ambiente" width="max-w-2xl">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Defina por <b>membro</b> ou por <b>equipe</b>. Precedência: marcação do membro &gt; herança da equipe &gt; padrão do papel.</p>
          <table className="ds-table w-full">
            <thead><tr><th>Membro</th><th className="text-center">Ver</th><th className="text-center">Revelar</th><th className="text-center">Copiar</th><th className="text-center">Gerenciar</th><th className="text-center">Admin</th></tr></thead>
            <tbody>
              {[['Ricardo Oliveira', 'Personalizado', 'primary', [1, 1, 1, 1, 1]], ['Maria Souza', 'Edita', 'default', [1, 1, 1, 1, 0]], ['João Lima', 'Equipe', 'success', [1, 1, 1, 0, 0]]].map((r, i) => (
                <tr key={i}>
                  <td><div className="text-sm">{r[0] as string}</div><div className="text-xs"><Badge variant={r[2] as string}>{r[1] as string}</Badge></div></td>
                  {(r[3] as number[]).map((v, j) => <td key={j} className="text-center"><input type="checkbox" defaultChecked={!!v} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>

          {/* ACL POR GRUPO (herança automática) — mock */}
          <div className="flex flex-col gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Permissão por equipe (Grupo de Consultores)</p>
            <p className="text-xs" style={{ color: 'var(--text-light)' }}>A permissão é do grupo — <b>todo membro herda automaticamente</b>, inclusive quem entrar depois. Marcação individual acima sobrepõe.</p>
            {realTeams[0] && (
              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-hover)' }}>
                <span style={{ color: 'var(--text)' }}><Badge variant="success">{realTeams[0].name}</Badge> <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ver · Revelar · Copiar</span></span>
                <div className="flex items-center gap-1">
                  <button type="button" className="text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={() => toast('Editar permissão da equipe — preview')}>editar</button>
                  <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Remover herança" onClick={() => toast('Herança removida — preview')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <SearchSelect label="Equipe (do cadastro do Minutor)" placeholder="Buscar equipe…" value="" onChange={() => {}} options={realTeams} fullWidth />
              </div>
              {['Ver', 'Revelar', 'Copiar', 'Gerenciar', 'Admin'].map((o, i) => (
                <label key={o} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" defaultChecked={i === 0} /> {o}
                </label>
              ))}
              <Button onClick={() => toast.success('Permissão da equipe salva — os membros herdam (preview)')}>Salvar permissão da equipe</Button>
            </div>
            {realTeams.length === 0 && <p className="text-xs" style={{ color: 'var(--text-light)' }}>As equipes vêm de Cadastros → Grupos de Consultor.</p>}
          </div>

          <div className="flex justify-end"><Button onClick={() => setPermsOpen(false)}>Fechar</Button></div>
        </div>
      </Modal>

      <Modal open={backfillOpen} onClose={() => setBackfillOpen(false)} title="Criar pastas dos clientes existentes">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Serão criadas <b>3</b> pasta(s) — uma por cliente sem cofre. Cada cliente vira um cofre dedicado (nasce <b>vazio</b> até você adicionar ambientes).</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setBackfillOpen(false)}>Fechar</Button>
            <Button variant="primary" icon={FolderPlus} onClick={() => { toast.success('3 pasta(s) criada(s) — preview'); setBackfillOpen(false) }}>Criar 3 pasta(s)</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modais de inclusão REAIS (layout de cadastro; salvar é no-op no preview) ── */}
      <EnvCredentialModal open={addModal === 'cred'} onClose={closeAdd} onSaved={closeAdd} envId={0} vaultKey={undefined} />
      <EnvDatabaseModal open={addModal === 'db'} onClose={closeAdd} onSaved={closeAdd} envId={0} vaultKey={undefined} />
      <EnvAppserverModal open={addModal === 'app'} onClose={closeAdd} onSaved={closeAdd} envId={0} />
      <EnvVpnModal open={addModal === 'vpn'} onClose={closeAdd} onSaved={closeAdd} envId={0} vaultKey={undefined} />
      <EnvCertificateModal open={addModal === 'cert'} onClose={closeAdd} onSaved={closeAdd} envId={0} vaultKey={undefined} />
      <EnvLinkModal open={addModal === 'link'} onClose={closeAdd} onSaved={closeAdd} envId={0} />

      {/* Personalizar Acesso Rápido — padrão do ambiente (admin) + ajuste do usuário */}
      <Modal open={customizeQA} onClose={() => setCustomizeQA(false)} title="Personalizar Acesso Rápido" width="max-w-xl">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            O <b>admin</b> define o <b>padrão do ambiente</b> (vale pra todos). Cada usuário ajusta o <b>seu</b> — sua escolha sobrepõe o padrão. Sem ajuste, você segue o padrão.
          </p>
          <table className="ds-table w-full">
            <thead><tr><th>Item</th><th className="text-center">Padrão (admin)</th><th className="text-center">Meu</th><th className="text-center">Aparece?</th></tr></thead>
            <tbody>
              {qaItems.map(i => (
                <tr key={i.key}>
                  <td><span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><i.icon className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> {i.label}</span></td>
                  <td className="text-center"><input type="checkbox" checked={i.def} onChange={e => setQa(i.key, { def: e.target.checked })} /></td>
                  <td className="text-center">
                    <select className="ds-input text-sm py-1" value={i.mine} onChange={e => setQa(i.key, { mine: e.target.value as QAMine })}>
                      <option value="herdar">Herdar padrão</option>
                      <option value="mostrar">Mostrar</option>
                      <option value="ocultar">Ocultar</option>
                    </select>
                  </td>
                  <td className="text-center">{qaVisible(i) ? <Badge variant="success">Sim</Badge> : <Badge>Não</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs" style={{ color: 'var(--text-light)' }}><b>Herdar</b> = segue o padrão do admin. <b>Mostrar/Ocultar</b> = você sobrepõe o padrão só pra você.</p>
          <div className="flex justify-between items-center">
            <button type="button" className="text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setQaItems(items => items.map(i => ({ ...i, mine: 'herdar' as QAMine })))}>Voltar ao padrão do ambiente</button>
            <Button variant="primary" onClick={() => { toast.success('Acesso Rápido atualizado — preview'); setCustomizeQA(false) }}>Concluir</Button>
          </div>
        </div>
      </Modal>

      {/* Detalhe do KPI clicado — lista do que o indicador representa */}
      <Modal open={kpiDetail !== null} onClose={() => setKpiDetail(null)} title={kpiDetail ? KPI_INFO[kpiDetail].title : ''} width="max-w-lg">
        {kpiDetail && (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{KPI_INFO[kpiDetail].desc}</p>
            <div className="flex flex-col gap-1.5">
              {KPI_INFO[kpiDetail].items.map((it, i) => (
                <button key={i} type="button" onClick={() => { setKpiDetail(null); setView('env') }}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:opacity-80"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{it.label}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--text-light)' }}>{it.sub}</span>
                  </span>
                  {it.badge && <Badge variant={it.tone ?? 'default'}>{it.badge}</Badge>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Editar ambiente (mock — nome/tipo/status/RDP) */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ambiente">
        <div className="flex flex-col gap-4">
          <TextInput label="Nome" defaultValue="Produção ERP" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" defaultValue="prod">
              <option value="prod">Produção</option><option value="homolog">Homologação</option>
              <option value="dev">Desenvolvimento</option><option value="dr">DR</option>
            </Select>
            <Select label="Status" defaultValue="online">
              <option value="unknown">—</option><option value="online">Online</option>
              <option value="offline">Offline</option><option value="maintenance">Manutenção</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><TextInput label="Host RDP" placeholder="10.0.0.5 ou srv.cliente.com" defaultValue="10.0.0.5" /></div>
            <TextInput label="Porta RDP" placeholder="3389" defaultValue="3389" />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-light)' }}>O host RDP habilita o "Abrir RDP" no Acesso Rápido (gera um .rdp). É metadado — nunca a senha.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { toast.success('Ambiente atualizado — preview'); setEditOpen(false) }}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* Novo ambiente (mock — nome + tipo) */}
      <Modal open={newEnvOpen} onClose={() => setNewEnvOpen(false)} title="Novo ambiente">
        <div className="flex flex-col gap-4">
          <TextInput label="Nome" placeholder="Ex.: Produção ERP" />
          <Select label="Tipo" defaultValue="prod">
            <option value="prod">Produção</option><option value="homolog">Homologação</option>
            <option value="dev">Desenvolvimento</option><option value="dr">DR</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setNewEnvOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { toast.success('Ambiente criado — preview'); setNewEnvOpen(false) }}>Criar ambiente</Button>
          </div>
        </div>
      </Modal>

      {/* Novo cliente (mock — seleção de cliente) */}
      <Modal open={newClientOpen} onClose={() => setNewClientOpen(false)} title="Novo cliente no Cofre de Ambientes">
        <div className="flex flex-col gap-4">
          <TextInput label="Cliente" placeholder="Buscar cliente…" />
          <p className="text-xs" style={{ color: 'var(--text-light)' }}>O cliente vira um cofre dedicado. Você entra como admin; os segredos serão cifrados com a chave deste cofre.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setNewClientOpen(false)}>Cancelar</Button>
            <Button variant="primary" icon={ShieldCheck} onClick={() => { toast.success('Cofre do cliente criado — preview'); setNewClientOpen(false) }}>Criar cofre</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}

function DelBtn() {
  return <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => toast('Excluir (preview)')}><Trash2 className="w-4 h-4" /></button>
}

/** Ações por linha: Editar + Excluir. */
function RowActions({ onEdit }: { onEdit: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 justify-end w-full">
      <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Editar" onClick={onEdit}><Pencil className="w-4 h-4" /></button>
      <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => toast('Excluir (preview)')}><Trash2 className="w-4 h-4" /></button>
    </span>
  )
}
