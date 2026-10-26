import { useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle, ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Scissors, Trash2, Wand2, X,
} from 'lucide-react'
import type { Fragment, ResumeItem, ResumeSection } from '../../lib/types'
import { TYPES, estimateLines, headline, newId } from '../../lib/entries'
import { FragmentPreview } from '../FragmentCard'
import { Md } from '../Md'

export function itemContent(item: ResumeItem, f: Fragment) {
  return item.override ?? f.content
}

export function itemLines(item: ResumeItem, f: Fragment) {
  const c = itemContent(item, f)
  const n = item.highlightIds ? c.highlights.filter((h) => item.highlightIds!.includes(h.id)).length : c.highlights.length
  return estimateLines(f.type, c, n)
}

export function LayoutPanel({ sections, onChange, fragments, onEditFragment, onTailor }: {
  sections: ResumeSection[]
  onChange: (s: ResumeSection[]) => void
  fragments: Map<number, Fragment>
  onEditFragment: (f: Fragment) => void
  onTailor: (sectionId: string, item: ResumeItem, f: Fragment) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [adding, setAdding] = useState<string | null>(null)

  const onSectionDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = sections.findIndex((s) => s.id === e.active.id)
    const to = sections.findIndex((s) => s.id === e.over!.id)
    onChange(arrayMove(sections, from, to))
  }

  const updateSection = (id: string, fn: (s: ResumeSection) => ResumeSection) =>
    onChange(sections.map((s) => (s.id === id ? fn(s) : s)))

  const moveItem = (fromSection: string, itemId: string, toSection: string) => {
    const item = sections.find((s) => s.id === fromSection)?.items.find((i) => i.id === itemId)
    if (!item) return
    onChange(sections.map((s) => {
      if (s.id === fromSection) return { ...s, items: s.items.filter((i) => i.id !== itemId) }
      if (s.id === toSection) return { ...s, items: [...s.items, item] }
      return s
    }))
  }

  return (
    <div className="layout-panel">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDrag}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              allSections={sections}
              fragments={fragments}
              onChange={(fn) => updateSection(s.id, fn)}
              onDelete={() => onChange(sections.filter((x) => x.id !== s.id))}
              onMoveItem={(itemId, to) => moveItem(s.id, itemId, to)}
              onEditFragment={onEditFragment}
              onTailor={(item, f) => onTailor(s.id, item, f)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {adding !== null ? (
        <form className="add-section" onSubmit={(e) => {
          e.preventDefault()
          if (!adding.trim()) return
          onChange([...sections, { id: newId(), title: adding.trim(), items: [] }])
          setAdding(null)
        }}>
          <input autoFocus value={adding} placeholder="Section title, e.g. Certifications" onChange={(e) => setAdding(e.target.value)} />
          <button className="btn btn-sm btn-primary" type="submit">Add</button>
          <button className="btn btn-sm" type="button" onClick={() => setAdding(null)}>Cancel</button>
        </form>
      ) : (
        <button className="btn btn-dashed" onClick={() => setAdding('')}><Plus size={15} /> Add section</button>
      )}
    </div>
  )
}

function SectionBlock({ section, allSections, fragments, onChange, onDelete, onMoveItem, onEditFragment, onTailor }: {
  section: ResumeSection
  allSections: ResumeSection[]
  fragments: Map<number, Fragment>
  onChange: (fn: (s: ResumeSection) => ResumeSection) => void
  onDelete: () => void
  onMoveItem: (itemId: string, toSection: string) => void
  onEditFragment: (f: Fragment) => void
  onTailor: (item: ResumeItem, f: Fragment) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const [collapsed, setCollapsed] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const types = new Set(section.items.map((i) => fragments.get(i.fragmentId)?.type).filter(Boolean))
  const firstType = section.items.map((i) => fragments.get(i.fragmentId)?.type).find(Boolean)
  const lines = section.items.reduce((n, i) => {
    const f = fragments.get(i.fragmentId)
    return n + (f ? itemLines(i, f) : 0)
  }, 1.5)

  const onItemDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    onChange((s) => {
      const from = s.items.findIndex((i) => i.id === e.active.id)
      const to = s.items.findIndex((i) => i.id === e.over!.id)
      return { ...s, items: arrayMove(s.items, from, to) }
    })
  }

  return (
    <section ref={setNodeRef} className={`layout-section ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <header className="layout-section-head">
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag section"><GripVertical size={16} /></button>
        <button className="icon-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <input className="section-title-input" value={section.title} onChange={(e) => onChange((s) => ({ ...s, title: e.target.value }))} />
        {firstType && <span className={`type-pill type-${firstType}`}>{TYPES[firstType].label.split(' ')[0]}</span>}
        <span className="muted small nowrap">{section.items.length} · ≈{Math.round(lines)} lines</span>
        <button className="icon-btn danger" onClick={() => {
          if (section.items.length === 0 || confirm(`Remove the "${section.title}" section from this resume?`)) onDelete()
        }} aria-label="Remove section"><Trash2 size={15} /></button>
      </header>
      {types.size > 1 && (
        <div className="warn-inline"><AlertTriangle size={14} /> rendercv needs one entry type per section. Items of other types are skipped. Move them to another section.</div>
      )}
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDrag}>
          <SortableContext items={section.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="layout-items">
              {section.items.length === 0 && <div className="muted small drop-hint">Add fragments from the library on the left.</div>}
              {section.items.map((item) => {
                const f = fragments.get(item.fragmentId)
                return f ? (
                  <ItemRow
                    key={item.id}
                    item={item}
                    fragment={f}
                    mismatched={firstType !== undefined && f.type !== firstType}
                    otherSections={allSections.filter((s) => s.id !== section.id)}
                    onChange={(next) => onChange((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? next : i)) }))}
                    onRemove={() => onChange((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))}
                    onMove={(to) => onMoveItem(item.id, to)}
                    onEdit={() => onEditFragment(f)}
                    onTailor={() => onTailor(item, f)}
                  />
                ) : (
                  <div key={item.id} className="item-row missing">
                    Deleted fragment
                    <button className="icon-btn" onClick={() => onChange((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))}><X size={14} /></button>
                  </div>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

function ItemRow({ item, fragment: f, mismatched, otherSections, onChange, onRemove, onMove, onEdit, onTailor }: {
  item: ResumeItem
  fragment: Fragment
  mismatched: boolean
  otherSections: ResumeSection[]
  onChange: (i: ResumeItem) => void
  onRemove: () => void
  onMove: (sectionId: string) => void
  onEdit: () => void
  onTailor: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [open, setOpen] = useState(false)
  const content = itemContent(item, f)
  const { primary, secondary } = headline(f.type, content)
  const all = content.highlights.map((h) => h.id)
  const selected = item.highlightIds ?? all
  const hasHighlights = TYPES[f.type].highlights && content.highlights.length > 0

  const toggle = (id: string) => {
    const set = new Set(selected)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const next = all.filter((x) => set.has(x))
    onChange({ ...item, highlightIds: next.length === all.length ? null : next })
  }

  return (
    <div ref={setNodeRef} className={`item-row ${isDragging ? 'dragging' : ''} ${mismatched ? 'mismatch' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="item-head">
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag item"><GripVertical size={15} /></button>
        <button className="item-title" onClick={() => setOpen(!open)}>
          <span className="item-primary"><Md text={primary} /></span>
          {secondary && <span className="item-secondary">{secondary}</span>}
        </button>
        <span className="item-badges">
          {item.override && <span className="badge badge-accent" title="Tailored for this resume">tailored</span>}
          {hasHighlights && (
            <span className={`badge ${item.highlightIds ? 'badge-warn' : ''}`} title="Highlights included">{selected.length}/{all.length}</span>
          )}
          <span className="muted small nowrap">≈{Math.round(itemLines(item, f))}l</span>
        </span>
        <span className="item-actions">
          {hasHighlights && <button className="icon-btn" title="Choose highlights" onClick={() => setOpen(!open)}><Scissors size={14} /></button>}
          <button className="icon-btn" title="Tailor for this resume only" onClick={onTailor}><Wand2 size={14} /></button>
          <button className="icon-btn" title="Edit library fragment" onClick={onEdit}><Pencil size={14} /></button>
          <button className="icon-btn danger" title="Remove from resume" onClick={onRemove}><X size={15} /></button>
        </span>
      </div>
      {open && (
        <div className="item-detail">
          {hasHighlights ? (
            <>
              <ul className="hl-pick">
                {content.highlights.map((h) => (
                  <li key={h.id}>
                    <label className="check">
                      <input type="checkbox" checked={selected.includes(h.id)} onChange={() => toggle(h.id)} />
                      <span><Md text={h.text} /></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="row tight small">
                <button className="link-btn" onClick={() => onChange({ ...item, highlightIds: null })}>Select all</button>
                <button className="link-btn" onClick={() => onChange({ ...item, highlightIds: [] })}>Select none</button>
              </div>
            </>
          ) : (
            <FragmentPreview type={f.type} content={content} />
          )}
          {otherSections.length > 0 && (
            <div className="row small">
              <select value="" onChange={(e) => e.target.value && onMove(e.target.value)} aria-label="Move to section">
                <option value="">Move to section…</option>
                {otherSections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
