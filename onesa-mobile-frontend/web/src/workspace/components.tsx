import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Item, WorkspaceContext } from './types';
import { errorMessage } from './api';
import { humanize, stateTone } from './helpers.mjs';

export function Brand({ staff = false }: { staff?: boolean }) {
  return <a className="mw-brand" href="/" aria-label="Onesa Mobile website"><span className="mw-mark" aria-hidden="true"><i/><i/><i/></span><span>onesa<small>mobile</small></span><strong>{staff ? 'Operations' : 'My account'}</strong></a>;
}
export function Pill({ value, children }: { value?: unknown; children?: ReactNode }) {
  return <span className={`mw-pill mw-pill-${stateTone(value)}`}>{children ?? humanize(value)}</span>;
}
export function Panel({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return <section className={`mw-panel ${className}`}><div className="mw-panel-heading"><h2>{title}</h2>{hint && <span>{hint}</span>}</div>{children}</section>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="mw-empty">{children}</p>; }
export function Details({ label, children, open = false }: { label: string; children: ReactNode; open?: boolean }) {
  return <details className="mw-details" open={open || undefined}><summary>{label}</summary><div>{children}</div></details>;
}
export function Info({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pending' | 'error' }) { return <div className={`mw-info mw-info-${tone}`}>{children}</div>; }
export function DateText({ value }: { value: unknown }) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? <time dateTime={date.toISOString()} title={date.toISOString()}>{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> : <>Not recorded</>;
}
export function Money({ minor }: { minor: unknown }) { return <span className="mw-money">USD {(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>; }
export function RecordMeta({ item }: { item: Item }) { return <p className="mw-record-meta"><span className="mw-reference">{item.id}</span><span>Updated <DateText value={item.updatedAt}/></span></p>; }
export function Search({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  const id = useId();
  return <label className="mw-search" htmlFor={id}><span>{label}</span><input id={id} type="search" value={value} onChange={event => setValue(event.target.value)} autoComplete="off"/></label>;
}
export function matches(item: Item, search: string, fields: string[]): boolean {
  const value = search.trim().toLocaleLowerCase();
  return !value || [item.id, ...fields.map(field => item[field])].some(field => String(field ?? '').toLocaleLowerCase().includes(value));
}
export type FormValues = Record<string, string>;
export interface Field {
  name: string; label: string; type?: 'text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'checkbox' | 'select';
  options?: { value: string; label: string }[]; value?: string; required?: boolean;
  maxLength?: number; min?: number | string; max?: number | string; step?: string; pattern?: string; hint?: string; wide?: boolean;
  autoComplete?: string; inputMode?: 'text' | 'numeric' | 'decimal';
}
export function options(values: string[]): { value: string; label: string }[] { return values.map(value => ({ value, label: humanize(value) })); }
export function RecordForm({ title, fields, submitLabel, onSubmit, busy = false, children, reset = true }: {
  title: string; fields: Field[]; submitLabel: string; onSubmit: (values: FormValues) => Promise<unknown>;
  busy?: boolean; children?: ReactNode; reset?: boolean;
}) {
  const prefix = useId(), [error, setError] = useState<string | null>(null), [sending, setSending] = useState(false);
  const errorTarget=useRef<HTMLParagraphElement|null>(null);
  useEffect(()=>{if(error)errorTarget.current?.focus();},[error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending || busy) return;
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form).entries()) as FormValues;
    setError(null); setSending(true);
    try { await onSubmit(values); if (reset) form.reset(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setSending(false); }
  }
  return <form className="mw-form" aria-label={title} onSubmit={event => void submit(event)}>
    <fieldset disabled={sending || busy}><legend className="mw-visually-hidden">{title}</legend><div className="mw-form-grid">
      {fields.map(field => {
        const id = `${prefix}-${field.name}`, hintId = field.hint ? id + '-hint' : undefined;
        const base = { id, name: field.name, required: field.required !== false, defaultValue: field.value, 'aria-describedby': hintId };
        if (field.type === 'checkbox') return <label key={field.name} htmlFor={id} className="mw-check mw-wide"><input id={id} name={field.name} type="checkbox" value="true" required={field.required !== false}/><span>{field.label}</span></label>;
        return <label key={field.name} htmlFor={id} className={field.wide || field.type === 'textarea' ? 'mw-wide' : ''}><span>{field.label}{field.required === false && <span className="mw-optional"> (optional)</span>}</span>
          {field.type === 'select' ? <select {...base}><option value="">Choose…</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : field.type === 'textarea' ? <textarea {...base} rows={3} maxLength={field.maxLength ?? 1200}/>
              : <input {...base} type={field.type ?? 'text'} min={field.min} max={field.max} step={field.step} pattern={field.pattern} maxLength={field.maxLength ?? 160} autoComplete={field.autoComplete ?? 'off'} inputMode={field.inputMode}/>}
          {field.hint && <small id={hintId}>{field.hint}</small>}
        </label>;
      })}
    </div>{children}<div className="mw-form-actions"><button className="mw-button" type="submit" aria-busy={sending}>{sending ? 'Saving…' : submitLabel}</button></div></fieldset>
    {error && <p className="mw-form-error" role="alert" ref={errorTarget} tabIndex={-1}>{error}</p>}
  </form>;
}
export function MutationButton({ children, action, context, danger = false }: { children: ReactNode; action: () => Promise<unknown>; context: WorkspaceContext; danger?: boolean }) {
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false);
  return <span className="mw-action-wrap"><button className={`mw-button mw-button-secondary ${danger ? 'mw-button-danger' : ''}`} type="button" disabled={pending || context.pending} aria-busy={pending} onClick={() => {
    if (pending) return; setPending(true); setError(null);
    void action().catch(error => setError(errorMessage(error))).finally(() => setPending(false));
  }}>{pending ? 'Working…' : children}</button>{error && <span className="mw-form-error" role="alert">{error}</span>}</span>;
}
export function Notes({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return <ol className="mw-notes">{items.map((entry, index) => {
    const note = entry as Record<string, unknown>;
    return <li key={index}><p>{String(note.text ?? note.message ?? note.note ?? '')}</p><small>{humanize(note.authorRole ?? note.role ?? 'Team')} · <DateText value={note.at}/></small></li>;
  })}</ol>;
}
