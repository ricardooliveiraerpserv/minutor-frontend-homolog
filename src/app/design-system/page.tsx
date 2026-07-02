"use client"

import * as React from "react"
import { Star } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Radio, RadioGroup } from "@/components/ui/radio"
import { Switch } from "@/components/ui/switch"
import { Chip } from "@/components/ui/chip"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-[var(--text-light)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

export default function DesignSystemPlayground() {
  const [checked, setChecked] = React.useState(true)
  const [indeterminate, setIndeterminate] = React.useState(true)
  const [radioValue, setRadioValue] = React.useState("react")
  const [switchOn, setSwitchOn] = React.useState(true)
  const [chips, setChips] = React.useState([
    "Design",
    "Front-end",
    "Back-end",
  ])

  return (
    <div className="min-h-screen bg-[var(--panel)] p-6 md:p-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="border-b border-[var(--border)] pb-4">
          <h1 className="text-xl font-semibold text-[var(--text)]">
            Design System — Playground
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Checkbox · Radio · Switch · Chip — todos os estados (claro e dark via
            tokens).
          </p>
        </header>

        {/* CHECKBOX */}
        <Section
          title="Checkbox"
          description="base-ui/react/checkbox — default, checked, indeterminate, disabled, error."
        >
          <Row label="Estados">
            <Checkbox label="Default" />
            <Checkbox
              label="Controlado"
              checked={checked}
              onCheckedChange={(v) => setChecked(v)}
            />
            <Checkbox label="Marcado (default)" defaultChecked />
            <Checkbox
              label="Indeterminate"
              indeterminate={indeterminate}
              onCheckedChange={() => setIndeterminate(false)}
            />
          </Row>
          <Row label="Desabilitado">
            <Checkbox label="Desabilitado" disabled />
            <Checkbox label="Desabilitado marcado" disabled defaultChecked />
          </Row>
          <Row label="Auxiliar / erro">
            <Checkbox
              label="Receber notificações"
              helper="Enviamos no máximo um e-mail por dia."
            />
            <Checkbox
              label="Aceito os termos"
              error="Você precisa aceitar para continuar."
            />
          </Row>
          <Row label="Sem rótulo">
            <Checkbox aria-label="Selecionar linha" />
            <Checkbox aria-label="Selecionar linha" defaultChecked />
          </Row>
        </Section>

        {/* RADIO */}
        <Section
          title="Radio / RadioGroup"
          description="base-ui/react/radio-group + radio — vertical e horizontal."
        >
          <Row label="Vertical (controlado)">
            <RadioGroup
              label="Framework preferido"
              helper="Escolha apenas um."
              value={radioValue}
              onValueChange={(v) => setRadioValue(String(v))}
            >
              <Radio value="react" label="React" />
              <Radio value="vue" label="Vue" />
              <Radio value="svelte" label="Svelte" />
              <Radio value="angular" label="Angular (desabilitado)" disabled />
            </RadioGroup>
          </Row>
          <Row label="Horizontal">
            <RadioGroup
              label="Tamanho"
              orientation="horizontal"
              defaultValue="m"
            >
              <Radio value="p" label="P" />
              <Radio value="m" label="M" />
              <Radio value="g" label="G" />
            </RadioGroup>
          </Row>
          <Row label="Com erro">
            <RadioGroup
              label="Plano"
              error="Selecione um plano para continuar."
              orientation="horizontal"
            >
              <Radio value="free" label="Free" />
              <Radio value="pro" label="Pro" />
            </RadioGroup>
          </Row>
        </Section>

        {/* SWITCH */}
        <Section
          title="Switch"
          description="base-ui/react/switch — on, off, loading, disabled."
        >
          <Row label="Estados">
            <Switch label="Off (default)" />
            <Switch label="On (default)" defaultChecked />
            <Switch
              label="Controlado"
              checked={switchOn}
              onCheckedChange={(v) => setSwitchOn(v)}
            />
          </Row>
          <Row label="Loading / desabilitado">
            <Switch label="Carregando" loading defaultChecked />
            <Switch label="Carregando (off)" loading />
            <Switch label="Desabilitado" disabled />
            <Switch label="Desabilitado on" disabled defaultChecked />
          </Row>
          <Row label="Com auxiliar">
            <Switch
              label="Modo escuro automático"
              helper="Segue a preferência do sistema."
              defaultChecked
            />
          </Row>
          <Row label="Sem rótulo">
            <Switch aria-label="Alternar" />
            <Switch aria-label="Alternar" defaultChecked />
          </Row>
        </Section>

        {/* CHIP */}
        <Section
          title="Chip"
          description="Presentacional — variantes, outline, removível, clicável, com ícone."
        >
          <Row label="Variantes (soft)">
            <Chip variant="neutral">Neutral</Chip>
            <Chip variant="info">Info</Chip>
            <Chip variant="success">Success</Chip>
            <Chip variant="warning">Warning</Chip>
            <Chip variant="danger">Danger</Chip>
          </Row>
          <Row label="Outline">
            <Chip variant="neutral" outline>
              Neutral
            </Chip>
            <Chip variant="info" outline>
              Info
            </Chip>
            <Chip variant="success" outline>
              Success
            </Chip>
            <Chip variant="warning" outline>
              Warning
            </Chip>
            <Chip variant="danger" outline>
              Danger
            </Chip>
          </Row>
          <Row label="Com ícone">
            <Chip variant="info" icon={<Star />}>
              Destaque
            </Chip>
            <Chip variant="success" outline icon={<Star />}>
              Aprovado
            </Chip>
          </Row>
          <Row label="Clicável">
            <Chip variant="info" onClick={() => alert("clique no chip")}>
              Clique aqui
            </Chip>
            <Chip
              variant="neutral"
              outline
              onClick={() => alert("clique no chip")}
            >
              Filtrar
            </Chip>
          </Row>
          <Row label="Removível">
            {chips.length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">
                Todos removidos.
              </span>
            ) : (
              chips.map((c) => (
                <Chip
                  key={c}
                  variant="success"
                  onRemove={() =>
                    setChips((prev) => prev.filter((x) => x !== c))
                  }
                >
                  {c}
                </Chip>
              ))
            )}
          </Row>
          <Row label="Removível + clicável + ícone">
            <Chip
              variant="warning"
              icon={<Star />}
              onClick={() => alert("clique")}
              onRemove={() => alert("remover")}
            >
              Combinado
            </Chip>
          </Row>
        </Section>
      </div>
    </div>
  )
}
