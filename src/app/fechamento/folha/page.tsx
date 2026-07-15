'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { api, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { formatBRL } from '@/lib/format'
import { RefreshCw, FileSpreadsheet, Save, FileText, Users, Plus, UserPlus, Rows3, Trash2, EyeOff, RotateCcw, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  PageHeader, Th, Tbody, Tr, Td,
  Button, SkeletonTable, EmptyState,
} from '@/components/ds'
import { MultiSelect } from '@/components/ui/multi-select'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { UserFormModal } from '@/components/users/user-form-modal'
import { BizifyFolha } from './BizifyFolha'

// ─── Types ────────────────────────────────────────────────────────────────────

// Linha vinda do backend (GET). Campos "auto" são read-only; os editáveis são
// semeados a partir destes valores e mantidos em estado local até o Salvar.
// Linhas de sócio (is_socio) são destacadas e têm TODAS as colunas editáveis.
interface FolhaRow {
  // Chave única da linha. É a chave de React E a chave do estado de edição,
  // substituindo user_id (que é null nas linhas de sócio).
  row_key: string
  is_socio: boolean
  // Linha de cooperado real (User contract_type=cooperado, sem parceiro). Só estas
  // entram no filtro de consultor — Raho/parceiros/sócios NÃO são cooperados.
  is_cooperado?: boolean
  // Cooperado marcado como Bizify no cadastro do usuário (distinção da lista).
  is_bizify?: boolean
  // Linha de parceiro Raho (azul, identificada, editável como sócio).
  is_raho?: boolean
  // Linha consolidada do parceiro (exceto Raho): apuração total no parceiro admin.
  is_parceiro_total?: boolean
  // Linha de diretor: identidade vem do cadastro do usuário e valores do Fechamento
  // Diretoria. SOMENTE-LEITURA na folha — nenhum campo é editável aqui.
  from_diretoria?: boolean
  partner_label?: string | null
  // Valores ORIGINAIS calculados do mês (Raho) — p/ legenda "original" quando alterado.
  producao_calc?: number
  valor_hora_calc?: number
  horas_calc?: number
  // Componentes do fechamento do consultor (puxados): produção = serv − desc − adiant + adic + desp.
  fech_serv?: number
  fech_desconto?: number
  fech_adiantamento?: number
  fech_adicional?: number
  fech_desp?: number  // despesa já incorporada à produção (cooperado)
  // Cooperado desativado no cadastro (ainda aparece em "Ativos", em cor âmbar).
  inativo: boolean
  // Linha ocultada da folha do mês. cancelado=true some de "Ativos" e vai p/ "Canceladas".
  cancelado: boolean
  socio_key: string | null
  user_id: number | null
  cpf: string
  matricula: string
  status: string
  nome: string
  dias: number
  horas: number
  horas_apontamentos: number
  valor_hora: number
  producao: number
  variavel: number
  reemb: number        // ajuste manual (editável)
  reemb_auto?: number  // despesas pagas no fechamento do mês (read-only, calculado no BE)
  descontos: number
  adiantamento: number
  horista_mensalista: string
  total_rend: number
  total_debitos: number
  liquido: number
}

// Valores editáveis mantidos em estado local, por row_key.
// Para linhas normais: Horas/CPF/Matrícula/Status/Nome/Valor Hora/Produção são
// somente-leitura (Horas = horas dos apontamentos). Para sócios, TODOS os campos
// abaixo são editáveis — por isso o estado carrega o conjunto completo sempre, e a
// UI decide quais são editáveis com base em is_socio.
interface EditState {
  // Editáveis em qualquer linha
  dias: number
  variavel: number
  reemb: number
  descontos: number
  adiantamento: number
  horista_mensalista: string
  // Editáveis APENAS em linhas de sócio (semeados em todas para tipagem simples)
  cpf: string
  matricula: string
  status: string
  nome: string
  horas: number
  valor_hora: number
  producao: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtYearMonth(ym: string): string {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[parseInt(month) - 1]} de ${year}`
}

// Número pt-BR sem símbolo de moeda (para Valor Hora com 4 casas).
function fmtNum(value: number, decimals = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Converte entrada de input numérico (string) para número, tratando vazio como 0.
function toNum(v: string): number {
  if (v === '' || v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ─── Estilo dos inputs editáveis da grade ──────────────────────────────────────
// Mesma linguagem dos outros fechamentos: superfície/borda/texto via tokens.
const cellInputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
}
const cellInputClass =
  'w-24 rounded-md px-2 py-1 text-xs text-right tabular-nums ds-input focus:outline-none'
// Variante de texto (esquerda) para os campos editáveis textuais dos sócios.
const cellInputClassText =
  'w-32 rounded-md px-2 py-1 text-xs ds-input focus:outline-none'

// Input numérico com máscara pt-BR 0.000,00 (abordagem "centavos": digita só dígitos,
// formata da direita). type="text" → SEM spinner/seta (setas não alteram o valor).
// Guarda/emite número; `decimals` controla as casas (0 = inteiro, p.ex. dias).
function MaskedNum({ value, onChange, decimals = 2, className, style }: {
  value: number
  onChange: (v: number) => void
  decimals?: number
  className?: string
  style?: React.CSSProperties
}) {
  const display = value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits ? parseInt(digits, 10) / Math.pow(10, decimals) : 0)
      }}
      onFocus={e => e.target.select()}
      className={className}
      style={style}
    />
  )
}
// Cabeçalho fixo (sticky) no topo do container de rolagem. Background sólido via
// token DS para as linhas não vazarem por trás (o Thead tem fundo translúcido).
const stickyTh = 'sticky top-0 z-20 bg-[var(--surface)]'
// Estilo dos inputs/selects do modal "Novo usuário" — superfície/borda/texto via
// tokens DS (mesma linguagem dos inputs da grade, porém em tamanho de formulário).
const modalInputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FechamentoFolhaPage() {
  const { user } = useAuth()
  const now = new Date()
  const defaultYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento_folha',
    user?.id,
    { yearMonth: defaultYearMonth },
  )
  const { yearMonth } = flt
  const setYearMonth = (v: string) => setFilter('yearMonth', v)

  const [rows, setRows] = useState<FolhaRow[]>([])
  // Estado de edição keyed por row_key (sócios têm user_id null).
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [loading, setLoading] = useState(false)
  // Estado "salvo": snapshot dos edits no último load/save (detecta alterações pendentes)
  // + info do último Salvar (legenda "✓ Salvo — R$ X · HH:MM").
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [savedInfo, setSavedInfo] = useState<{ at: string; total: number } | null>(null)
  const hasUnsaved = useMemo(
    () => savedSnapshot !== '' && JSON.stringify(edits) !== savedSnapshot,
    [edits, savedSnapshot],
  )
  const [exporting, setExporting] = useState(false)
  // Filtro de consultores (somente visual / client-side): user_ids selecionados.
  // Vazio = mostra todos (comportamento atual).
  const [filterUserIds, setFilterUserIds] = useState<string[]>([])
  // Menu "+ Incluir": escolha entre novo usuário e nova linha editável.
  const [incluirOpen, setIncluirOpen] = useState(false)
  const incluirRef = useRef<HTMLDivElement>(null)
  // Remoção em andamento de uma linha manual (por socio_key) — desabilita o botão.
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  // Aba ativa: "ativos" (cancelado=false) ou "canceladas" (cancelado=true).
  const [tab, setTab] = useState<'ativos' | 'canceladas'>('ativos')
  // Filtro por categoria de linha.
  const [categoria, setCategoria] = useState<'todos' | 'cooperados' | 'raho' | 'manuais'>('todos')
  // Filtro "só produção com valor": esconde linhas com produção 0.
  const [soComProducao, setSoComProducao] = useState(false)
  // Cancelar/Reativar em andamento (por row_key) — desabilita a ação da linha.
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  // Empresa (aba de topo): ERPSERV (cooperativa, esta tela) | Bizify (lançamentos manuais).
  const [empresa, setEmpresa] = useState<'erpserv' | 'bizify'>('erpserv')
  // Multi-empresa: quando ligado, a folha é única da empresa ATIVA (sem abas). Nome vem do backend.
  const [singleCompany, setSingleCompany] = useState<string | null>(null)

  // ─── Modal "Novo usuário" (cadastro inline de cooperado) ────────────────────
  // Cria um consultor cooperado direto no cadastro (POST /users), sem sair da
  // página. Em caso de sucesso, recarrega a grade (load) — o novo cooperado
  // aparece na folha do mês corrente.
  const [novoUserOpen, setNovoUserOpen] = useState(false)
  const newUserDefaults = {
    name: '',
    full_name: '',
    email: '',
    cpf: '',
    matricula: '',
    payroll_status: 'Contratado' as 'Contratado' | 'Em Afastamento',
    consultant_type: 'horista' as 'horista' | 'banco_de_horas' | 'fixo',
    hourly_rate: '',
    rate_type: 'hourly' as 'hourly' | 'monthly',
  }
  const [newUser, setNewUser] = useState(newUserDefaults)
  function setNewUserField<K extends keyof typeof newUserDefaults>(
    key: K,
    value: (typeof newUserDefaults)[K],
  ) {
    setNewUser(prev => ({ ...prev, [key]: value }))
  }

  // ─── Modal "Editar usuário" (cadastro completo, compartilhado) ──────────────
  // A pencil de cada linha abre o MESMO modal de cadastro da tela de Usuários
  // (UserFormModal), inline na folha — sem sair da página. Em sucesso (onSaved),
  // recarrega a grade (load); o usuário pode entrar/sair da folha conforme o tipo.
  // Só linhas com user_id numérico (não sócio/manual). null = modal fechado.
  const [editUserId, setEditUserId] = useState<number | null>(null)

  // Fecha o menu "+ Incluir" ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!incluirOpen) return
    function onDown(ev: MouseEvent) {
      if (incluirRef.current && !incluirRef.current.contains(ev.target as Node)) {
        setIncluirOpen(false)
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setIncluirOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [incluirOpen])

  const load = useCallback(async () => {
    if (!yearMonth) return
    setLoading(true)
    setRows([])
    setEdits({})
    try {
      const res = await api.get<{ data: FolhaRow[]; company?: string | null; empresa?: 'erpserv' | 'bizify' | null }>(`/fechamento-folha/${yearMonth}`)
      const data = res.data ?? []
      setRows(data)
      // Multi-empresa: a folha é ÚNICA da empresa ativa — esconde as abas e alinha o modo.
      if (res.company) {
        setSingleCompany(res.company)
        if (res.empresa && res.empresa !== empresa) setEmpresa(res.empresa)
      }
      // Semeia o estado editável a partir dos valores vindos do backend, por row_key.
      // Carrega o conjunto completo de campos (sócios usam todos; linhas normais
      // ignoram os campos extras, que permanecem read-only na UI).
      const seed: Record<string, EditState> = {}
      for (const r of data) {
        seed[r.row_key] = {
          dias: r.dias,
          variavel: r.variavel,
          reemb: r.reemb,
          descontos: r.descontos,
          adiantamento: r.adiantamento,
          horista_mensalista: r.horista_mensalista,
          cpf: r.cpf,
          matricula: r.matricula,
          status: r.status,
          nome: r.nome,
          horas: r.horas,
          valor_hora: r.valor_hora,
          producao: r.producao,
        }
      }
      setEdits(seed)
      setSavedSnapshot(JSON.stringify(seed))
      setSavedInfo(null)
    } catch (err: unknown) {
      toast.error(`Erro ao carregar a folha: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  // Opções do filtro de consultor — SÓ cooperados reais (exclui Raho, parceiros e
  // sócios, que não são cooperados). Nome vem do cadastro do usuário (r.nome) e os
  // cooperados Bizify são distinguidos com o sufixo "(Bizify)".
  const consultorOptions = useMemo(
    () => rows
      .filter(r => r.is_cooperado && r.user_id != null)
      .map(r => ({ id: String(r.user_id), name: r.is_bizify ? `${r.nome} (Bizify)` : r.nome })),
    [rows],
  )

  // Contagem por aba (independe do filtro de consultor) p/ os badges das abas.
  const ativosCount = useMemo(() => rows.filter(r => !r.cancelado).length, [rows])
  const canceladasCount = useMemo(() => rows.filter(r => r.cancelado).length, [rows])

  // Linhas exibidas na grade: filtra pela ABA (cancelado) + filtro de consultor
  // (client-side) e fixa o grupo VERDE (is_socio) no topo. Sem seleção de
  // consultor → todas as linhas da aba. Linhas de sócio são SEMPRE exibidas (são
  // especiais e não fazem parte do filtro de consultor). Salvar/exportar
  // continuam usando o mês cheio.
  const visibleRows = useMemo(() => {
    const set = filterUserIds.length > 0 ? new Set(filterUserIds) : null
    const filtered = rows.filter(r => {
      if (r.cancelado !== (tab === 'canceladas')) return false
      // Filtro por categoria de linha.
      if (categoria === 'raho'       && !r.is_raho) return false
      if (categoria === 'manuais'    && !r.is_socio) return false
      if (categoria === 'cooperados' && (r.is_socio || r.is_raho)) return false
      // Filtro "só produção com valor": esconde linhas sem produção (ex.: contas
      // duplicadas/afastadas com 0 produção).
      if (soComProducao && !(Number(r.producao) > 0)) return false
      if (!set) return true
      // Com filtro ativo, traz SOMENTE os consultores selecionados (sócios não são forçados).
      return r.user_id != null && set.has(String(r.user_id))
    })
    // Partição estável: diretoria (roxo, read-only) no topo, depois sócios (verde),
    // depois os demais — cada grupo mantém a ordem atual.
    const diretoria = filtered.filter(r => r.from_diretoria)
    const socios = filtered.filter(r => !r.from_diretoria && r.is_socio)
    const outros = filtered.filter(r => !r.from_diretoria && !r.is_socio)
    return [...diretoria, ...socios, ...outros]
  }, [rows, filterUserIds, tab, categoria, soComProducao])

  // Totais da folha (ao vivo, conforme o estado editável) — alimentam os cards do topo.
  const totals = useMemo(() => {
    let rend = 0, deb = 0, liq = 0
    for (const r of visibleRows) {
      const e = edits[r.row_key]
      if (!e) continue
      const { totalRend, totalDebitos, liquido } = calc(r, e)
      rend += totalRend; deb += totalDebitos; liq += liquido
    }
    return { rend, deb, liq, count: visibleRows.length }
  }, [visibleRows, edits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza um campo editável de uma linha no estado local (keyed por row_key).
  function setEdit<K extends keyof EditState>(rowKey: string, key: K, value: EditState[K]) {
    setEdits(prev => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [key]: value },
    }))
  }

  // ─── Incluir → Novo usuário ─────────────────────────────────────────────────
  // Abre o modal inline de cadastro de cooperado (sem sair da página). O envio
  // (POST /users) está em createNewUser; o sucesso fecha o modal e recarrega a
  // grade para o novo cooperado aparecer.
  function openNewUser() {
    setIncluirOpen(false)
    setNewUser(newUserDefaults)
    setNovoUserOpen(true)
  }

  // POST /users criando um consultor COOPERADO. Tipo/contrato são fixos (não
  // editáveis no form): type=consultor, contract_type=cooperado, enabled=true.
  // O backend gera senha + envia o e-mail de boas-vindas (não enviamos senha).
  // Sucesso → toast, fecha o modal, reseta o form e recarrega a folha (load).
  // Sub-5 Folha · criar usuário (cooperado) — Cat B. useAsyncAction; payload/sequência/load intactos.
  const createNewUserAction = useAsyncAction(async () => {
    const name = newUser.name.trim()
    const email = newUser.email.trim()
    if (!name || !email) {
      toast.error('Preencha Nome e E-mail.')
      return
    }
    try {
      const payload: Record<string, unknown> = {
        // Valores fixos: este cadastro é da folha cooperativa.
        type: 'consultor',
        contract_type: 'cooperado',
        enabled: true,
        // Campos do formulário.
        name,
        email,
        full_name: newUser.full_name.trim() || null,
        cpf: newUser.cpf.trim() || null,
        matricula: newUser.matricula.trim() || null,
        payroll_status: newUser.payroll_status,
        consultant_type: newUser.consultant_type,
        rate_type: newUser.rate_type,
      }
      const hourly = newUser.hourly_rate.trim()
      if (hourly) payload.hourly_rate = parseFloat(hourly)
      await api.post('/users', payload)
      toast.success('Usuário cadastrado')
      setNovoUserOpen(false)
      setNewUser(newUserDefaults)
      await load()
    } catch (err: unknown) {
      toast.error(apiMessage(err, 'Erro ao cadastrar usuário'))
    }
  })
  const createNewUser = () => createNewUserAction.run()
  const creatingUser = createNewUserAction.pending

  // ─── Incluir → Nova linha editável ──────────────────────────────────────────
  // Cria uma linha manual que se comporta como sócio (is_socio, todas as colunas
  // editáveis, destacada). socio_key começa com 'manual_' para podermos identificar
  // e oferecer a remoção. user_id null → sempre visível (ignora o filtro de consultor).
  // O estado de edição é semeado já com todos os campos para os inputs funcionarem.
  function addManualRow() {
    setIncluirOpen(false)
    const socioKey = 'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    const rowKey = 's:' + socioKey
    const newRow: FolhaRow = {
      row_key: rowKey,
      is_socio: true,
      inativo: false,
      cancelado: false,
      socio_key: socioKey,
      user_id: null,
      cpf: '',
      matricula: '',
      status: 'Contratado',
      nome: '',
      dias: 0,
      horas: 160,
      horas_apontamentos: 0,
      valor_hora: 0,
      producao: 0,
      variavel: 0,
      reemb: 0,
      descontos: 0,
      adiantamento: 0,
      horista_mensalista: 'Mensalista',
      total_rend: 0,
      total_debitos: 0,
      liquido: 0,
    }
    setEdits(prev => ({
      ...prev,
      [rowKey]: {
        dias: 0,
        variavel: 0,
        reemb: 0,
        descontos: 0,
        adiantamento: 0,
        horista_mensalista: 'Mensalista',
        cpf: '',
        matricula: '',
        status: 'Contratado',
        nome: '',
        horas: 160,
        valor_hora: 0,
        producao: 0,
      },
    }))
    // Nova linha manual entra no TOPO (à frente do grupo verde de sócios).
    setRows(prev => [newRow, ...prev])
    // Garante que a linha recém-criada (cancelado=false) seja visível.
    setTab('ativos')
  }

  // ─── Remover linha manual ───────────────────────────────────────────────────
  // Só linhas manuais (socio_key começa com 'manual_') podem ser removidas. O
  // DELETE é idempotente no backend (seguro mesmo que a linha nunca tenha sido
  // salva). Após o DELETE, limpamos a linha e o seu estado de edição localmente.
  async function removeManualRow(r: FolhaRow) {
    if (!r.socio_key) return // qualquer linha por socio_key é removível (sócios migrados + manuais)
    if (!window.confirm('Remover esta linha manual? Esta ação não pode ser desfeita.')) return
    setRemovingKey(r.socio_key)
    try {
      await api.delete(`/fechamento-folha/${yearMonth}/manual/${r.socio_key}`)
      setRows(prev => prev.filter(x => x.row_key !== r.row_key))
      setEdits(prev => {
        const next = { ...prev }
        delete next[r.row_key]
        return next
      })
      toast.success('Linha removida')
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao remover'))
    } finally {
      setRemovingKey(null)
    }
  }

  // ─── Cancelar / Reativar linha ──────────────────────────────────────────────
  // POST /fechamento-folha/{ym}/cancel com { user_id|socio_key, cancelado }.
  // Linhas de sócio identificam-se por socio_key; linhas normais por user_id.
  // Sucesso → atualiza cancelado localmente (some de "Ativos" ↔ vai p/ "Canceladas").
  async function setCancelado(r: FolhaRow, cancelado: boolean) {
    setTogglingKey(r.row_key)
    try {
      const body = r.user_id != null
        ? { user_id: r.user_id, cancelado }
        : { socio_key: r.socio_key, cancelado }
      await api.post(`/fechamento-folha/${yearMonth}/cancel`, body)
      setRows(prev => prev.map(x => x.row_key === r.row_key ? { ...x, cancelado } : x))
      toast.success(cancelado ? 'Linha cancelada' : 'Linha reativada')
    } catch (e) {
      toast.error(apiMessage(e, `Erro ao ${cancelado ? 'cancelar' : 'reativar'}`))
    } finally {
      setTogglingKey(null)
    }
  }

  // Colunas calculadas — recomputadas ao vivo a partir do estado editável + auto.
  // Espelha as fórmulas que o .xls vai produzir (lá são vermelhas / não importadas).
  // Produção: nas linhas normais é auto (r.producao); nas de sócio é editável (e.producao).
  // Reemb total = manual (e.reemb) + auto (r.reemb_auto, calculado no BE a partir das
  // despesas pagas no fechamento do mês). reemb_auto é read-only no FE.
  function calc(r: FolhaRow, e: EditState) {
    const producao = e.producao // editável p/ todos os cooperados (override salvo na folha)
    const reembAuto = r.reemb_auto ?? 0
    const totalRend = producao + e.variavel + e.reemb + reembAuto
    const totalDebitos = e.descontos + e.adiantamento
    const liquido = totalRend - totalDebitos
    return { totalRend, totalDebitos, liquido, reembAuto }
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────
  // POST de todas as linhas, mapeando os nomes da grade para o contrato da API.
  // Sub-5 Folha · fechamento manual (salvar) — Cat B. useAsyncAction; entries + otimista pós-sucesso intactos.
  const saveAction = useAsyncAction(async () => {
    if (rows.length === 0) return
    try {
      // O contrato da API muda conforme o tipo da linha: o backend faz switch em
      // socio_key vs user_id. Linhas normais mandam o subset atual; sócios mandam
      // TODOS os campos manuais (inclusive horas, que neles é editável).
      // Linhas canceladas (ocultadas) e linhas de diretor (somente-leitura, vindas do
      // Fechamento Diretoria + cadastro) NÃO entram no save.
      const entries = rows.filter(r => !r.cancelado && !r.from_diretoria).map(r => {
        const e = edits[r.row_key]
        if (r.is_socio) {
          return {
            socio_key: r.socio_key,
            cpf: e.cpf,
            matricula: e.matricula,
            nome: e.nome,
            status: e.status,
            valor_hora: e.valor_hora,
            producao: e.producao,
            dias_trabalhados: e.dias,
            horas_trabalhadas: e.horas,
            variavel: e.variavel,
            reemb: e.reemb,
            descontos_diversos: e.descontos,
            adiantamento: e.adiantamento,
            horista_mensalista: e.horista_mensalista,
          }
        }
        if (r.is_raho) {
          // Raho: VALORES editáveis (valor_hora/produção/horas) por user_id; cpf/nome/status seguem do cadastro.
          return {
            user_id: r.user_id,
            valor_hora: e.valor_hora,
            producao: e.producao,
            dias_trabalhados: e.dias,
            horas_trabalhadas: e.horas,
            variavel: e.variavel,
            reemb: e.reemb,
            descontos_diversos: e.descontos,
            adiantamento: e.adiantamento,
            horista_mensalista: e.horista_mensalista,
          }
        }
        return {
          user_id: r.user_id,
          dias_trabalhados: e.dias,
          // Horas é somente-leitura na grade: enviamos null para que o backend
          // use as horas dos apontamentos do período (o contrato aceita null).
          horas_trabalhadas: null,
          producao: e.producao, // produção agora é editável p/ todos os cooperados
          variavel: e.variavel,
          reemb: e.reemb,
          descontos_diversos: e.descontos,
          adiantamento: e.adiantamento,
          horista_mensalista: e.horista_mensalista,
        }
      })
      const res = await api.post<{ saved: number }>(`/fechamento-folha/${yearMonth}`, { entries })
      // Atualização otimista: reflete os valores salvos nas linhas sem refetch.
      // Para sócios também refletimos os campos manuais (cpf/nome/valor_hora/etc).
      setRows(prev => prev.map(r => {
        const e = edits[r.row_key]
        if (!e) return r
        const { totalRend, totalDebitos, liquido } = calc(r, e)
        const base = {
          ...r,
          dias: e.dias,
          producao: e.producao,
          variavel: e.variavel,
          reemb: e.reemb,
          descontos: e.descontos,
          adiantamento: e.adiantamento,
          horista_mensalista: e.horista_mensalista,
          total_rend: totalRend,
          total_debitos: totalDebitos,
          liquido,
        }
        if (r.is_raho) {
          // Raho: reflete só os valores editáveis (identidade vem do cadastro).
          return { ...base, horas: e.horas, valor_hora: e.valor_hora, producao: e.producao }
        }
        if (!r.is_socio) return base
        return {
          ...base,
          cpf: e.cpf,
          matricula: e.matricula,
          status: e.status,
          nome: e.nome,
          horas: e.horas,
          valor_hora: e.valor_hora,
          producao: e.producao,
        }
      }))
      toast.success(`${res?.saved ?? entries.length} salvos`)
      setSavedSnapshot(JSON.stringify(edits))
      setSavedInfo({
        at: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        total: totals.liq,
      })
    } catch (err: unknown) {
      toast.error(apiMessage(err, 'Erro ao salvar'))
    }
  })
  const save = () => saveAction.run()
  const saving = saveAction.pending

  // ─── Gerar planilha (.xls) ──────────────────────────────────────────────────
  // Mesmo mecanismo de download dos excel do fechamento/consultor: fetch direto no
  // proxy /api/v1 (o middleware injeta o Authorization via cookie) → blob →
  // <a download>. Nome do arquivo vem do Content-Disposition do backend.
  async function exportXls() {
    if (!yearMonth) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/v1/fechamento-folha/${yearMonth}/export`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.ms-excel' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const fallback = `Folha_${yearMonth}.xls`
      const filename = match ? decodeURIComponent(match[1]) : fallback
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      toast.error(`Erro ao gerar a planilha: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setExporting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento — Folha Cooperativa">
      <div className="space-y-6">

        {/* Abas por empresa: ERPSERV (cooperativa) | Bizify (lançamentos manuais) */}
        {/* Só quando multi-empresa DESLIGADO. Ligado → folha única da empresa ativa. */}
        {!singleCompany && (
        <div className="flex gap-1 border-b" role="tablist" style={{ borderColor: 'var(--border)' }}>
          {([
            { key: 'erpserv' as const, label: 'ERPSERV' },
            { key: 'bizify' as const, label: 'Bizify' },
          ]).map(c => {
            const active = empresa === c.key
            return (
              <button
                key={c.key}
                role="tab"
                onClick={() => setEmpresa(c.key)}
                className="px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2"
                style={{ borderColor: active ? 'var(--primary)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-muted)' }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
        )}

        {empresa === 'bizify' ? (
          <BizifyFolha yearMonth={yearMonth} setYearMonth={setYearMonth} />
        ) : (<>

        <PageHeader
          icon={FileSpreadsheet}
          title="Folha Cooperativa"
          subtitle={`Valores por consultor — ${fmtYearMonth(yearMonth)}`}
        />
        {/* Toolbar em linha própria (evita espremer/sobrepor o título do header) */}
        <div className="flex items-center gap-3 flex-wrap mb-6">
              <input
                type="month"
                value={yearMonth}
                onChange={e => setYearMonth(e.target.value)}
                className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <MultiSelect
                value={filterUserIds}
                onChange={setFilterUserIds}
                options={consultorOptions}
                placeholder="Todos os consultores"
                disabled={rows.length === 0}
                wide
              />
              {/* ── Filtro por categoria de linha ── */}
              <div className="flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
                {([
                  ['todos',      'Todos'],
                  ['cooperados', 'Cooperados'],
                  ['raho',       'Raho'],
                  ['manuais',    'Manuais'],
                ] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setCategoria(val)}
                    className="px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap"
                    style={{
                      background: categoria === val ? 'var(--primary-soft)' : 'transparent',
                      color: categoria === val ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {/* ── Filtro: só linhas com produção > 0 ── */}
              <button
                onClick={() => setSoComProducao(v => !v)}
                title="Mostrar somente linhas com produção (valor > 0)"
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: soComProducao ? 'var(--primary-soft)' : 'transparent',
                  color: soComProducao ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                Só produção
              </button>
              {/* ── Incluir: novo usuário ou nova linha editável ── */}
              <div className="relative" ref={incluirRef}>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  onClick={() => setIncluirOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={incluirOpen}
                >
                  Incluir
                </Button>
                {incluirOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl py-1 text-sm"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow-lg)',
                      color: 'var(--text)',
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={openNewUser}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ds-row-hover"
                    >
                      <UserPlus size={15} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                      Novo usuário
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={addManualRow}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ds-row-hover"
                    >
                      <Rows3 size={15} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                      Nova linha editável
                    </button>
                  </div>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={load} disabled={loading} icon={RefreshCw} loading={loading}>
                Atualizar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={FileSpreadsheet}
                loading={exporting}
                disabled={exporting || rows.length === 0}
                onClick={exportXls}
              >
                {exporting ? 'Gerando…' : 'Gerar planilha (.xls)'}
              </Button>
              <div className="flex flex-col items-end gap-0.5">
                <span title="Grava na folha do mês os valores ajustados na grade (produção, dias, descontos, adiantamentos, etc.). Vira o valor OFICIAL do mês — alimenta os cards de totais e a planilha (.xls). Sem salvar, as edições se perdem ao recarregar ou clicar em Atualizar.">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Save}
                    loading={saving}
                    disabled={saving || rows.length === 0}
                    onClick={save}
                  >
                    {saving ? 'Salvando…' : 'Salvar'}
                  </Button>
                </span>
                {hasUnsaved ? (
                  <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--warning)' }}>● alterações não salvas</span>
                ) : savedInfo ? (
                  <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--success)' }}>✓ Salvo — {formatBRL(savedInfo.total)} · {savedInfo.at}</span>
                ) : null}
              </div>
        </div>

        {/* Cards de totais da folha */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--ring)' }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total da Folha (Líquido)</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--primary)' }}>{formatBRL(totals.liq)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{totals.count} cooperado{totals.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Rendimentos</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--text)' }}>{formatBRL(totals.rend)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Débitos</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--danger)' }}>{formatBRL(totals.deb)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>descontos + adiantamentos</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cooperados</p>
              <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--text)' }}>{totals.count}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{tab === 'canceladas' ? 'canceladas' : 'ativos'}</p>
            </div>
          </div>
        )}

        {/* Legenda dos grupos de coluna */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              {visibleRows.length} consultor{visibleRows.length !== 1 ? 'es' : ''}
              {filterUserIds.length > 0 ? ` de ${rows.length}` : ''}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--surface-hover)' }} />
              Automático (somente leitura)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--primary-soft)' }} />
              Editável
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--warning-bg)' }} />
              Calculado (prévia — vermelho no .xls)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
              />
              Sócio (linha destacada — todas as colunas editáveis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}
              />
              Em afastamento (usuário desativado — ocultar manualmente)
            </span>
          </div>
        )}

        {/* Abas: Ativos / Canceladas */}
        {!loading && rows.length > 0 && (
          <div
            className="flex items-center gap-1 border-b"
            style={{ borderColor: 'var(--border)' }}
            role="tablist"
            aria-label="Filtro de linhas"
          >
            {([
              { key: 'ativos' as const, label: 'Ativos', count: ativosCount },
              { key: 'canceladas' as const, label: 'Canceladas', count: canceladasCount },
            ]).map(t => {
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className="-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderColor: active ? 'var(--primary)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  {t.label}
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
                    style={{
                      background: active ? 'var(--primary-soft)' : 'var(--surface-hover)',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Grade */}
        <div className="min-h-[200px]">
          {loading ? (
            <SkeletonTable rows={6} cols={17} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum consultor no período"
              description="Selecione um mês com consultores ativos para editar a folha."
            />
          ) : visibleRows.length === 0 ? (
            tab === 'canceladas' ? (
              <EmptyState
                icon={Users}
                title="Nenhuma linha cancelada"
                description="Linhas canceladas/ocultadas neste mês aparecem aqui."
              />
            ) : (
              <EmptyState
                icon={Users}
                title="Nenhum consultor no filtro"
                description="Nenhum dos consultores selecionados está no período. Ajuste o filtro."
              />
            )
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-2xl" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <Th className={stickyTh}>CPF</Th>
                    <Th className={stickyTh}>Matrícula</Th>
                    <Th className={stickyTh}>Status</Th>
                    <Th className={stickyTh}>Nome</Th>
                    <Th right className={stickyTh}>Dias</Th>
                    <Th right className={stickyTh}>Horas</Th>
                    <Th right className={stickyTh}>Valor Hora</Th>
                    <Th right className={stickyTh}>Produção</Th>
                    <Th right className={stickyTh}>Variável</Th>
                    <Th right className={stickyTh}>Reemb</Th>
                    <Th right className={stickyTh}>Total Rend</Th>
                    <Th right className={stickyTh}>Descontos</Th>
                    <Th right className={stickyTh}>Adiantamento</Th>
                    <Th right className={stickyTh}>Total Débitos</Th>
                    <Th right className={stickyTh}>Líquido</Th>
                    <Th className={stickyTh}>Horista/Mensalista</Th>
                    <Th className={stickyTh}>Ações</Th>
                  </tr>
                </thead>
                <Tbody>
                  {visibleRows.map(r => {
                    const e = edits[r.row_key]
                    if (!e) return null
                    const { totalRend, totalDebitos, liquido, reembAuto } = calc(r, e)
                    const socio = r.is_socio
                    // Diretor: linha 100% somente-leitura (identidade do cadastro, valores do
                    // Fechamento Diretoria). Nenhum input/ação de edição é renderizado.
                    const readOnly = !!r.from_diretoria
                    // Raho: identidade (cpf/nome/status) read-only do usuário, mas VALORES editáveis.
                    const valEditable = (socio || !!r.is_raho) && !readOnly
                    // Linha por socio_key (sócios migrados + manuais) pode ser excluída.
                    const manual = !!r.socio_key
                    // Usuário desativado => "em afastamento": borda vermelha + badge; ocultação manual.
                    const afastado = r.inativo
                    // Cor da linha via token DS (restaurada no leave pelo Tr.baseBackground):
                    //  • Canceladas (aba) → danger/muted
                    //  • Raho (azul) → mantém azul mesmo em afastamento; a borda vermelha sinaliza
                    //  • Sócio (verde) → success-bg
                    //  • Em afastamento (desativado) → danger-bg + borda vermelha à esquerda
                    //  • demais → padrão (transparente)
                    const rowBg = r.cancelado
                      ? 'var(--danger-bg)'
                      : readOnly
                        ? 'rgba(168,85,247,0.13)' // roxo — diretoria (read-only, no topo)
                      : r.is_raho
                        ? 'rgba(59,130,246,0.13)' // azul — parceiro Raho
                        : r.is_parceiro_total
                          ? 'rgba(20,184,166,0.12)' // teal — parceiro consolidado (apuração total)
                        : socio
                          ? 'var(--success-bg)'
                          : afastado
                            ? 'var(--danger-bg)'
                            : undefined
                    const busy = togglingKey === r.row_key
                    return (
                      <Tr key={r.row_key} baseBackground={rowBg}
                        className={readOnly ? '[border-left:3px_solid_#a855f7]' : afastado ? '[border-left:3px_solid_var(--danger)]' : undefined}>
                        {/* ── CPF: editável p/ sócio, read-only normal ── */}
                        <Td mono className={socio ? undefined : 'text-[var(--text)]'}>
                          {socio ? (
                            <input
                              type="text"
                              value={e.cpf}
                              onChange={ev => setEdit(r.row_key, 'cpf', ev.target.value)}
                              className={cellInputClassText}
                              style={cellInputStyle}
                            />
                          ) : (r.cpf || '—')}
                        </Td>

                        {/* ── Matrícula: editável p/ sócio, read-only normal ── */}
                        <Td mono className={socio ? undefined : 'text-[var(--text)]'}>
                          {socio ? (
                            <input
                              type="text"
                              value={e.matricula}
                              onChange={ev => setEdit(r.row_key, 'matricula', ev.target.value)}
                              className={`${cellInputClassText} w-24`}
                              style={cellInputStyle}
                            />
                          ) : (r.matricula || '—')}
                        </Td>

                        {/* ── Status: editável p/ sócio, read-only normal ── */}
                        <Td className={socio ? undefined : 'text-[var(--text-muted)]'}>
                          {socio ? (
                            <input
                              type="text"
                              value={e.status}
                              onChange={ev => setEdit(r.row_key, 'status', ev.target.value)}
                              className={`${cellInputClassText} w-24`}
                              style={cellInputStyle}
                            />
                          ) : (r.status || '—')}
                        </Td>

                        {/* ── Nome: editável p/ sócio, read-only normal ── */}
                        <Td className={socio ? undefined : 'font-medium text-[var(--text)] whitespace-nowrap'}>
                          {socio ? (
                            <input
                              type="text"
                              value={e.nome}
                              onChange={ev => setEdit(r.row_key, 'nome', ev.target.value)}
                              className={`${cellInputClassText} w-44`}
                              style={cellInputStyle}
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {r.is_raho && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: 'rgba(59,130,246,0.2)', color: '#3b82f6' }}>
                                  {r.partner_label ?? 'Raho'}
                                </span>
                              )}
                              {r.is_parceiro_total && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: 'rgba(20,184,166,0.2)', color: '#14b8a6' }}
                                  title="Apuração total do parceiro">
                                  {r.partner_label ?? 'Parceiro'}
                                </span>
                              )}
                              {readOnly && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7' }}
                                  title="Diretor — dados do Fechamento Diretoria + cadastro (somente leitura)">
                                  Diretoria
                                </span>
                              )}
                              {afastado && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                  Em afastamento
                                </span>
                              )}
                              {r.nome}
                            </span>
                          )}
                        </Td>

                        {/* ── Dias: editável (sempre), exceto diretor (read-only) ── */}
                        <Td right mono className={readOnly ? 'text-[var(--text)] tabular-nums' : undefined}>
                          {readOnly ? fmtNum(r.dias, 0) : (
                            <MaskedNum
                              value={e.dias}
                              decimals={0}
                              onChange={v => setEdit(r.row_key, 'dias', v)}
                              className={`${cellInputClass} w-16`}
                              style={cellInputStyle}
                            />
                          )}
                        </Td>

                        {/* ── Horas: editável p/ sócio e Raho; normal = 160 fixo ── */}
                        <Td right mono className={valEditable ? undefined : 'text-[var(--text)] tabular-nums'}>
                          {valEditable ? (
                            <MaskedNum
                              value={e.horas}
                              decimals={2}
                              onChange={v => setEdit(r.row_key, 'horas', v)}
                              className={cellInputClass}
                              style={cellInputStyle}
                            />
                          ) : fmtNum(r.horas)}
                        </Td>

                        {/* ── Valor Hora: editável p/ sócio e Raho (4 casas); read-only normal ── */}
                        <Td right mono className={valEditable ? undefined : 'text-[var(--text-muted)]'}>
                          {valEditable ? (
                            <MaskedNum
                              value={e.valor_hora}
                              decimals={2}
                              onChange={v => setEdit(r.row_key, 'valor_hora', v)}
                              className={cellInputClass}
                              style={cellInputStyle}
                            />
                          ) : r.is_parceiro_total ? '—' : fmtNum(r.valor_hora, 2)}
                        </Td>

                        {/* ── Produção: editável p/ todos (exceto diretor); legendas = produção calculada + despesa do mês ── */}
                        <Td right>
                          <div className="flex flex-col items-end gap-0.5">
                            {readOnly ? (
                              <span className="tabular-nums font-medium" style={{ color: 'var(--text)' }}>{formatBRL(e.producao || 0)}</span>
                            ) : (
                              <MaskedNum
                                value={e.producao}
                                decimals={2}
                                onChange={v => setEdit(r.row_key, 'producao', v)}
                                className={cellInputClass}
                                style={cellInputStyle}
                              />
                            )}
                            {(() => {
                              const prod = e.producao || 0
                              const serv = r.fech_serv ?? 0
                              const fdesc = r.fech_desconto ?? 0
                              const fadi = r.fech_adiantamento ?? 0
                              const fadic = r.fech_adicional ?? 0
                              const fdesp = r.fech_desp ?? 0
                              const temFech = serv !== 0 || fdesc !== 0 || fadi !== 0 || fadic !== 0
                              // Cooperado: legenda com os MESMOS ajustes do fechamento do consultor.
                              // A despesa JÁ está dentro da produção: serv − desc − adiant + adic + desp = produção.
                              const parts: { k: string; txt: string }[] = []
                              let totalVal: number
                              if (temFech) {
                                parts.push({ k: 'serv', txt: `serv: ${formatBRL(serv)}` })
                                if (fdesc > 0) parts.push({ k: 'desc', txt: `− desc: ${formatBRL(fdesc)}` })
                                if (fadi > 0)  parts.push({ k: 'adiant', txt: `− adiant: ${formatBRL(fadi)}` })
                                if (fadic > 0) parts.push({ k: 'adic', txt: `+ adic: ${formatBRL(fadic)}` })
                                if (fdesp > 0) parts.push({ k: 'desp', txt: `+ desp: ${formatBRL(fdesp)}` })
                                totalVal = prod // produção já inclui a despesa
                              } else {
                                // Sócio / linha manual sem vínculo de fechamento: usa os campos da folha.
                                parts.push({ k: 'prod', txt: `prod: ${formatBRL(prod)}` })
                                if ((e.variavel || 0) !== 0) parts.push({ k: 'var', txt: `+ var: ${formatBRL(e.variavel || 0)}` })
                                if ((e.reemb || 0) !== 0)    parts.push({ k: 'reemb', txt: `+ reemb: ${formatBRL(e.reemb || 0)}` })
                                if ((e.descontos || 0) !== 0)    parts.push({ k: 'desc', txt: `− desc: ${formatBRL(e.descontos || 0)}` })
                                if ((e.adiantamento || 0) !== 0) parts.push({ k: 'adiant', txt: `− adiant: ${formatBRL(e.adiantamento || 0)}` })
                                if (reembAuto > 0) parts.push({ k: 'desp', txt: `+ desp: ${formatBRL(reembAuto)}` })
                                totalVal = prod + reembAuto
                              }
                              // Produção editada manualmente difere do calculado do fechamento.
                              const overridden = temFech && r.producao_calc != null && Math.abs(r.producao_calc - prod) > 0.01
                              return (
                                <>
                                  {parts.map(p => (
                                    <span key={p.k} className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>{p.txt}</span>
                                  ))}
                                  <span className="text-[10px] whitespace-nowrap font-semibold" style={{ color: 'var(--text-muted)' }}
                                    title="Total da produção (já inclui a despesa)">
                                    total: {formatBRL(totalVal)}
                                  </span>
                                  {overridden && (
                                    <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--warning)' }}
                                      title="Produção editada manualmente (difere do cálculo do fechamento)">
                                      prod. editada (calc: {formatBRL(r.producao_calc!)})
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </Td>

                        {/* ── Variável: editável (sempre), exceto diretor (read-only) ── */}
                        <Td right mono className={readOnly ? 'text-[var(--text)] tabular-nums' : undefined}>
                          {readOnly ? fmtNum(r.variavel) : (
                            <MaskedNum
                              value={e.variavel}
                              decimals={2}
                              onChange={v => setEdit(r.row_key, 'variavel', v)}
                              className={cellInputClass}
                              style={cellInputStyle}
                            />
                          )}
                        </Td>

                        {/* ── Editável (sempre): Reemb (manual + auto) ──
                            reemb_auto vem do BE: soma das despesas pagas no fechamento do mês
                            (Expense.is_paid=true + expense_date no mês). É read-only.
                            Input continua editando só a parte manual (admin pode ajustar a diferença). */}
                        <Td right>
                          <div className="flex flex-col items-end gap-0.5" title="Reemb = manual (input) + auto (despesas 'pagar no fechamento' do mês)">
                            {readOnly ? (
                              <span className="tabular-nums text-[var(--text)]">{fmtNum(r.reemb)}</span>
                            ) : (
                              <MaskedNum
                                value={e.reemb}
                                decimals={2}
                                onChange={v => setEdit(r.row_key, 'reemb', v)}
                                className={cellInputClass}
                                style={cellInputStyle}
                              />
                            )}
                          </div>
                        </Td>

                        {/* ── Calculado: Total Rend ── */}
                        <Td right className="font-semibold" style={{ color: 'var(--text)' }}>
                          {formatBRL(totalRend)}
                        </Td>

                        {/* ── Descontos Diversos: editável (sempre), exceto diretor (read-only) ── */}
                        <Td right mono className={readOnly ? 'text-[var(--text)] tabular-nums' : undefined}>
                          {readOnly ? fmtNum(r.descontos) : (
                            <MaskedNum
                              value={e.descontos}
                              decimals={2}
                              onChange={v => setEdit(r.row_key, 'descontos', v)}
                              className={cellInputClass}
                              style={cellInputStyle}
                            />
                          )}
                        </Td>

                        {/* ── Adiantamento: editável (sempre), exceto diretor (read-only) ── */}
                        <Td right mono className={readOnly ? 'text-[var(--text)] tabular-nums' : undefined}>
                          {readOnly ? fmtNum(r.adiantamento) : (
                            <MaskedNum
                              value={e.adiantamento}
                              decimals={2}
                              onChange={v => setEdit(r.row_key, 'adiantamento', v)}
                              className={cellInputClass}
                              style={cellInputStyle}
                            />
                          )}
                        </Td>

                        {/* ── Calculado: Total Débitos ── */}
                        <Td right className="font-semibold" style={{ color: 'var(--text)' }}>
                          {formatBRL(totalDebitos)}
                        </Td>

                        {/* ── Calculado: Líquido ── */}
                        <Td right className="font-bold" style={{ color: 'var(--primary)' }}>
                          {formatBRL(liquido)}
                        </Td>

                        {/* ── Horista/Mensalista: editável (sempre), exceto diretor (read-only) ── */}
                        <Td className={readOnly ? 'text-[var(--text)]' : undefined}>
                          {readOnly ? (r.horista_mensalista || '—') : (
                            <select
                              value={e.horista_mensalista}
                              onChange={ev => setEdit(r.row_key, 'horista_mensalista', ev.target.value)}
                              className="rounded-md px-2 py-1 text-xs cursor-pointer appearance-none ds-input focus:outline-none"
                              style={cellInputStyle}
                            >
                              <option value="Horista">Horista</option>
                              <option value="Mensalista">Mensalista</option>
                            </select>
                          )}
                        </Td>

                        {/* ── Ações da linha ── */}
                        <Td>
                          <div className="inline-flex items-center gap-1">
                          {/* Editar usuário: só linhas com user_id numérico (regular/inativo);
                              sócio/manual (user_id null) não têm. */}
                          {!socio && r.user_id != null && (
                            <button
                              type="button"
                              onClick={() => setEditUserId(r.user_id as number)}
                              title="Editar usuário"
                              aria-label="Editar usuário"
                              className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors ds-row-hover"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {r.cancelado ? (
                            // Aba Canceladas → Reativar (volta p/ Ativos).
                            <button
                              type="button"
                              onClick={() => setCancelado(r, false)}
                              disabled={busy}
                              title="Reativar linha"
                              aria-label="Reativar linha"
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ds-row-hover"
                              style={{ color: 'var(--success)' }}
                            >
                              <RotateCcw size={14} />
                              Reativar
                            </button>
                          ) : socio ? (
                            // Linha verde (sócio/manual) → Desativar (oculta na aba Canceladas) + Excluir (sócio fixo não exclui).
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setCancelado(r, true)}
                                disabled={busy}
                                title="Desativar / ocultar linha"
                                aria-label="Desativar linha"
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ds-row-hover"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <EyeOff size={14} />
                                Desativar
                              </button>
                              <button
                                type="button"
                                onClick={() => { if (manual) removeManualRow(r) }}
                                disabled={!manual || removingKey === r.socio_key}
                                title={manual ? 'Excluir linha manual' : 'Sócio fixo — não pode excluir'}
                                aria-label={manual ? 'Excluir linha manual' : 'Sócio fixo — não pode excluir'}
                                className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ds-row-hover"
                                style={{ color: 'var(--danger)' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : readOnly ? (
                            // Linha de diretor → somente-leitura (dados do Fechamento Diretoria + cadastro).
                            <span className="text-[11px] italic" style={{ color: 'var(--text-light)' }}>somente leitura</span>
                          ) : (
                            // Linha normal/inativa → Cancelar (oculta da folha do mês).
                            <button
                              type="button"
                              onClick={() => setCancelado(r, true)}
                              disabled={busy || r.user_id == null}
                              title={afastado ? 'Ocultar (em afastamento)' : 'Cancelar / ocultar linha'}
                              aria-label={afastado ? 'Ocultar (em afastamento)' : 'Cancelar / ocultar linha'}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ds-row-hover"
                              style={{ color: afastado ? 'var(--danger)' : 'var(--text-muted)' }}
                            >
                              <EyeOff size={14} />
                              Cancelar
                            </button>
                          )}
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </table>
            </div>
          )}
        </div>

        </>)}

        {/* ── Modal: Novo usuário (cooperado) ── */}
        <Modal
          open={novoUserOpen}
          onClose={() => { if (!creatingUser) setNovoUserOpen(false) }}
          size="md"
          closeOnOverlay={!creatingUser}
          closeOnEscape={!creatingUser}
        >
          <ModalHeader
            icon={UserPlus}
            title="Novo usuário"
            subtitle="Será cadastrado como Cooperado (consultor)."
            onClose={() => { if (!creatingUser) setNovoUserOpen(false) }}
          />
          <ModalBody>
            <form
              id="novo-usuario-form"
              onSubmit={ev => { ev.preventDefault(); createNewUser() }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              {/* Nome* */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Nome <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={ev => setNewUserField('name', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* Nome Completo */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={ev => setNewUserField('full_name', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* E-mail* */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  E-mail <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={ev => setNewUserField('email', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* CPF */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  CPF
                </label>
                <input
                  type="text"
                  value={newUser.cpf}
                  onChange={ev => setNewUserField('cpf', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* Matrícula */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Matrícula
                </label>
                <input
                  type="text"
                  value={newUser.matricula}
                  onChange={ev => setNewUserField('matricula', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* Status (payroll_status) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Status
                </label>
                <select
                  value={newUser.payroll_status}
                  onChange={ev => setNewUserField('payroll_status', ev.target.value as typeof newUser.payroll_status)}
                  className="rounded-md px-3 py-2 text-sm cursor-pointer ds-input focus:outline-none"
                  style={modalInputStyle}
                >
                  <option value="Contratado">Contratado</option>
                  <option value="Em Afastamento">Em Afastamento</option>
                </select>
              </div>

              {/* Tipo de vínculo (consultant_type) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Tipo de vínculo
                </label>
                <select
                  value={newUser.consultant_type}
                  onChange={ev => setNewUserField('consultant_type', ev.target.value as typeof newUser.consultant_type)}
                  className="rounded-md px-3 py-2 text-sm cursor-pointer ds-input focus:outline-none"
                  style={modalInputStyle}
                >
                  <option value="horista">Horista</option>
                  <option value="banco_de_horas">Banco de Horas</option>
                  <option value="fixo">Fixo</option>
                </select>
              </div>

              {/* Valor hora / salário (hourly_rate) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Valor hora / salário
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newUser.hourly_rate}
                  onChange={ev => setNewUserField('hourly_rate', ev.target.value)}
                  className="rounded-md px-3 py-2 text-sm ds-input focus:outline-none"
                  style={modalInputStyle}
                />
              </div>

              {/* Tipo de valor (rate_type) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Tipo de valor
                </label>
                <select
                  value={newUser.rate_type}
                  onChange={ev => setNewUserField('rate_type', ev.target.value as typeof newUser.rate_type)}
                  className="rounded-md px-3 py-2 text-sm cursor-pointer ds-input focus:outline-none"
                  style={modalInputStyle}
                >
                  <option value="hourly">Por hora</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>

              {/* Vínculo fixo (read-only / informativo) */}
              <div
                className="sm:col-span-2 rounded-md px-3 py-2 text-xs"
                style={{
                  background: 'var(--success-bg)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--text-muted)',
                }}
              >
                Cadastrado como <strong style={{ color: 'var(--text)' }}>Cooperado (consultor)</strong>.
                Uma senha será gerada e o e-mail de boas-vindas enviado automaticamente.
              </div>
            </form>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              className="ds-btn-secondary"
              onClick={() => { if (!creatingUser) setNovoUserOpen(false) }}
              disabled={creatingUser}
            >
              Cancelar
            </button>
            <Button
              type="submit"
              form="novo-usuario-form"
              variant="primary"
              icon={UserPlus}
              loading={creatingUser}
              disabled={creatingUser}
            >
              {creatingUser ? 'Cadastrando…' : 'Cadastrar'}
            </Button>
          </ModalFooter>
        </Modal>

        {/* ── Modal: Editar usuário (cadastro completo, compartilhado) ── */}
        {/* Mesmo modal da tela de Usuários — abre inline, sem sair da folha. */}
        <UserFormModal
          open={editUserId != null}
          userId={editUserId}
          onClose={() => setEditUserId(null)}
          onSaved={() => load()}
        />

      </div>
    </AppLayout>
  )
}
