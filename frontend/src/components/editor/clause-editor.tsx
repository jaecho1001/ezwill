'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { WillDocumentType, WillClauseTemplate, SelectedWillClause } from '@/types/will-document'
import {
  getClauseTree,
  getClauseTemplate,
  resolveTemplateText,
  getDocumentTypeConfig,
  getClausesForDocumentType,
  buildDefaultSelections,
} from '@/lib/will-documents/index'
import { formatClauseText, generateWillContent, type SimpleClause } from '@/lib/will-documents/format-clause'
import { FactsPanel } from './facts-panel'
import type { WillVault } from '@/types/will-vault'
import { isClauseApplicable, type Applicability } from '@/lib/will-documents/applicable'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { RichTextEditor } from './rich-text-editor'
import { ClauseTreeItem } from './clause-tree-item'

interface ClauseEditorProps {
  documentType: WillDocumentType
  selectedClauses: SelectedWillClause[]
  onClausesChange: (clauses: SelectedWillClause[]) => void
  variables: Record<string, string>
  /** If provided, a collapsible Facts panel surfaces the live vault at
   *  the top of the clause library, with deep links back into intake. */
  willId?: string
  vault?: WillVault
}

export function ClauseEditor({
  documentType,
  selectedClauses,
  onClausesChange,
  variables,
  willId,
  vault,
}: ClauseEditorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [infoExpanded, setInfoExpanded] = useState(() => {
    // Default-collapse reference panels on viewports under 800px tall so the
    // editor itself gets room. Users can still open them manually.
    if (typeof window !== 'undefined') return window.innerHeight >= 800
    return true
  })
  const [koExpanded, setKoExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<'clause' | 'full'>('clause')
  const [showVarsDrawer, setShowVarsDrawer] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [applicabilityFilter, setApplicabilityFilter] = useState<'all' | 'applicable'>('applicable')
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null)
  const treeScrollRef = useRef<HTMLDivElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const recentlyAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const docConfig = getDocumentTypeConfig(documentType)
  const clauseTree = useMemo(() => getClauseTree(documentType), [documentType])

  // All leaf clauses for counting
  const allClauses = useMemo(() => getClausesForDocumentType(documentType).filter((c) => !c.isFolder), [documentType])
  const documentClauseIds = useMemo(
    () => new Set(getClausesForDocumentType(documentType).map((clause) => clause.id)),
    [documentType]
  )
  const defaultClauseIds = useMemo(
    () => new Set(docConfig?.defaultClauseIds ?? []),
    [docConfig]
  )

  // Auto-expand folders whose children match the search query so results
  // are visible without the user manually opening each folder.
  useEffect(() => {
    if (!searchQuery.trim()) return
    const q = searchQuery.toLowerCase()
    const toExpand = new Set<string>()
    for (const folder of clauseTree) {
      const hit =
        folder.name.toLowerCase().includes(q) ||
        (folder.children ?? []).some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.section.toLowerCase().includes(q) ||
            (c.statute && c.statute.toLowerCase().includes(q)) ||
            (c.annotation && c.annotation.toLowerCase().includes(q))
        )
      if (hit) toExpand.add(folder.id)
    }
    setExpandedFolders((prev) => new Set([...prev, ...toExpand]))
  }, [searchQuery, clauseTree])

  // Applicability lookup per clause id based on the live vault. Clauses
  // without a vault see every rule as 'unknown' — we map that to 'yes' to
  // stay backward compatible for callers that don't pass a vault.
  const applicabilityById = useMemo(() => {
    const map = new Map<string, Applicability>()
    const all = getClausesForDocumentType(documentType)
    for (const c of all) {
      map.set(c.id, vault ? isClauseApplicable(c, vault) : 'yes')
    }
    return map
  }, [documentType, vault])

  // Filter tree by search query + applicability. When the filter is set to
  // 'applicable', hide any clause whose applicability evaluates to 'no'.
  // Keep 'unknown' visible so users can still see + flag missing intake.
  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const passApplicability = (id: string) => {
      if (applicabilityFilter === 'all') return true
      return applicabilityById.get(id) !== 'no'
    }
    return clauseTree
      .map((folder) => ({
        ...folder,
        children: (folder.children ?? []).filter((c) => {
          if (!passApplicability(c.id)) return false
          if (!q) return true
          return (
            c.name.toLowerCase().includes(q) ||
            c.section.toLowerCase().includes(q) ||
            (c.statute && c.statute.toLowerCase().includes(q)) ||
            (c.annotation && c.annotation.toLowerCase().includes(q))
          )
        }),
      }))
      .filter((folder) => {
        if ((folder.children?.length ?? 0) > 0) return true
        if (!q) return false
        return folder.name.toLowerCase().includes(q)
      })
  }, [clauseTree, searchQuery, applicabilityById, applicabilityFilter])

  // Included clause IDs as a Set for fast lookup
  const includedSet = useMemo(
    () => new Set(selectedClauses.filter((sc) => sc.included).map((sc) => sc.clauseId)),
    [selectedClauses]
  )

  // Custom text map
  const customTextMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const sc of selectedClauses) {
      if (sc.customText) map[sc.clauseId] = sc.customText
    }
    return map
  }, [selectedClauses])

  // Currently selected clause template + selection data
  const selectedTemplate = selectedClauseId ? getClauseTemplate(selectedClauseId) : null
  const selectedClause = selectedClauseId
    ? selectedClauses.find((sc) => sc.clauseId === selectedClauseId)
    : null

  // Get the text content for the selected clause. Template text is plain
  // and gets wrapped into <p data-indent data-marker> so the .will-editor
  // CSS can render hanging indents and (a)/(i) markers. Custom HTML from a
  // prior edit is passed through untouched — ClauseParagraph preserves the
  // attributes on round-trip.
  const selectedClauseText = useMemo(() => {
    if (!selectedTemplate) return ''
    if (selectedClause?.customText) return selectedClause.customText
    const raw = resolveTemplateText(selectedTemplate.templateText, variables)
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return formatClauseText(raw)
      .map(({ text, indent, marker }) => {
        const markerAttr = marker ? ` data-marker="${esc(marker)}"` : ''
        return `<p data-indent="${indent}"${markerAttr}>${text}</p>`
      })
      .join('')
  }, [selectedTemplate, selectedClause, variables])

  // Full-document HTML for the preview pane. Uses generateWillContent so
  // section/subsection numbering (1., 1.1 …) is applied across clauses, with
  // customText overriding templateText where the user has edited.
  const fullDocumentHtml = useMemo(() => {
    const allForDoc = getClausesForDocumentType(documentType)
    const customById = new Map(
      selectedClauses.filter((sc) => sc.customText).map((sc) => [sc.clauseId, sc.customText!])
    )
    const sortById = new Map(
      selectedClauses.map((sc) => [sc.clauseId, sc.sortOrder])
    )
    const included = new Set(
      selectedClauses.filter((sc) => sc.included).map((sc) => sc.clauseId)
    )
    // Feed generateWillContent text that reflects the user's edits. For
    // customText, strip HTML tags so the parser gets plain text (the parser
    // re-emits structured <p> tags).
    const stripTags = (html: string) =>
      html.replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*p\s*>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()

    const tree: SimpleClause[] = allForDoc.map((c) => {
      const override = customById.get(c.id)
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        subsection: c.subsection,
        parentId: c.parentId,
        sortOrder: sortById.get(c.id) ?? c.sortOrder,
        isFolder: c.isFolder,
        templateText: override ? stripTags(override) : c.templateText,
      }
    })
    return generateWillContent(tree, included, variables)
  }, [documentType, selectedClauses, variables])

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const selectClause = useCallback((clauseId: string, openEditor = true) => {
    const template = getClauseTemplate(clauseId)
    if (!template || !documentClauseIds.has(clauseId)) return
    if (template.parentId) {
      setExpandedFolders((prev) => new Set([...prev, template.parentId!]))
    }
    setSelectedClauseId(clauseId)
    if (openEditor) setViewMode('clause')
  }, [documentClauseIds])

  const flashAddedClause = useCallback((clauseId: string) => {
    setRecentlyAddedId(clauseId)
    if (recentlyAddedTimerRef.current) clearTimeout(recentlyAddedTimerRef.current)
    recentlyAddedTimerRef.current = setTimeout(() => setRecentlyAddedId(null), 1800)
  }, [])

  // Keep the editor anchored to a clause that belongs to the active document.
  // New documents open on their first included leaf clause and its section is
  // expanded automatically.
  useEffect(() => {
    if (selectedClauseId && documentClauseIds.has(selectedClauseId)) return
    const firstIncluded = selectedClauses.find(
      (clause) => clause.included && !getClauseTemplate(clause.clauseId)?.isFolder
    )
    const firstAvailable = allClauses[0]
    const nextId = firstIncluded?.clauseId ?? firstAvailable?.id ?? null
    if (nextId) selectClause(nextId, viewMode !== 'full')
    else setSelectedClauseId(null)
  }, [allClauses, documentClauseIds, selectedClauseId, selectedClauses, selectClause, viewMode])

  // Selection from any entry point (tree, add checkbox, or full preview) keeps
  // the navigator synchronized and visibly highlights the corresponding row.
  useEffect(() => {
    if (!selectedClauseId) return
    requestAnimationFrame(() => {
      const row = treeScrollRef.current?.querySelector<HTMLElement>(
        `[data-clause-tree-id="${selectedClauseId}"]`
      )
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [selectedClauseId, expandedFolders])

  // In full-document mode, highlight and scroll to the currently selected
  // clause. Clicking a different preview clause uses the reverse path below.
  useEffect(() => {
    const preview = previewScrollRef.current
    if (!preview) return
    preview.querySelectorAll('.clause-editor-active').forEach((node) => {
      node.classList.remove('clause-editor-active')
    })
    if (!selectedClauseId || viewMode !== 'full') return
    const matches = preview.querySelectorAll<HTMLElement>(
      `[data-clause-id="${selectedClauseId}"]`
    )
    matches.forEach((node) => node.classList.add('clause-editor-active'))
    matches[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedClauseId, viewMode, fullDocumentHtml])

  const toggleInclude = useCallback(
    (clauseId: string) => {
      const existing = selectedClauses.find((sc) => sc.clauseId === clauseId)
      if (existing) {
        const willInclude = !existing.included
        onClausesChange(
          selectedClauses.map((sc) =>
            sc.clauseId === clauseId ? { ...sc, included: willInclude } : sc
          )
        )
        if (willInclude) {
          selectClause(clauseId)
          flashAddedClause(clauseId)
        }
      } else {
        const template = getClauseTemplate(clauseId)
        if (template) {
          onClausesChange([
            ...selectedClauses,
            {
              clauseId,
              section: template.section,
              subsection: template.subsection,
              included: true,
              aiGenerated: false,
              sortOrder: selectedClauses.length,
            },
          ])
          selectClause(clauseId)
          flashAddedClause(clauseId)
        }
      }
    },
    [selectedClauses, onClausesChange, selectClause, flashAddedClause]
  )

  const markSaved = useCallback(() => {
    setSaveState('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved')
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
    }, 400)
  }, [])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (recentlyAddedTimerRef.current) clearTimeout(recentlyAddedTimerRef.current)
  }, [])

  const handleEditorChange = useCallback(
    (html: string) => {
      if (!selectedClauseId) return
      const existing = selectedClauses.find((sc) => sc.clauseId === selectedClauseId)
      if (existing) {
        onClausesChange(
          selectedClauses.map((sc) =>
            sc.clauseId === selectedClauseId ? { ...sc, customText: html } : sc
          )
        )
      } else {
        const template = getClauseTemplate(selectedClauseId)
        if (template) {
          onClausesChange([
            ...selectedClauses,
            {
              clauseId: selectedClauseId,
              section: template.section,
              subsection: template.subsection,
              included: true,
              customText: html,
              aiGenerated: false,
              sortOrder: selectedClauses.length,
            },
          ])
        }
      }
      markSaved()
    },
    [selectedClauseId, selectedClauses, onClausesChange, markSaved]
  )

  const handleResetAll = useCallback(() => {
    if (!confirm('Reset all clauses to their defaults?\n\nThis will discard every custom edit in this document and restore the default clause selection.')) {
      return
    }
    const defaults = buildDefaultSelections(documentType)
    // If we have vault context, auto-exclude clauses the applicability
    // engine rejects — users can still toggle them back on manually.
    const filtered = vault
      ? defaults.map((sc) => ({
          ...sc,
          included: applicabilityById.get(sc.clauseId) === 'no' ? false : sc.included,
        }))
      : defaults
    onClausesChange(filtered)
    markSaved()
  }, [documentType, onClausesChange, markSaved, vault, applicabilityById])

  const handleResetToDefault = useCallback(() => {
    if (!selectedClauseId) return
    onClausesChange(
      selectedClauses.map((sc) =>
        sc.clauseId === selectedClauseId ? { ...sc, customText: undefined } : sc
      )
    )
  }, [selectedClauseId, selectedClauses, onClausesChange])

  // Drag-and-drop reorder within the same parent folder. Updates sortOrder
  // on both clauses; the document preview (which reads sortOrder) reflects
  // the new order immediately. Cross-folder drops are rejected so clauses
  // can't be moved under a folder they don't belong in.
  const handleDragReorder = useCallback(
    (dragClauseId: string, dropClauseId: string) => {
      if (dragClauseId === dropClauseId) return
      const drag = getClauseTemplate(dragClauseId)
      const drop = getClauseTemplate(dropClauseId)
      if (!drag || !drop) return
      if (drag.parentId !== drop.parentId) return

      // Ensure both clauses exist in selectedClauses so we have sortOrder
      // entries to swap.
      const ensureEntry = (tmpl: WillClauseTemplate, arr: SelectedWillClause[]) => {
        if (arr.some((sc) => sc.clauseId === tmpl.id)) return arr
        return [
          ...arr,
          {
            clauseId: tmpl.id,
            section: tmpl.section,
            subsection: tmpl.subsection,
            included: false,
            aiGenerated: false,
            sortOrder: tmpl.sortOrder,
          },
        ]
      }
      let next = ensureEntry(drag, selectedClauses)
      next = ensureEntry(drop, next)

      const siblings = next
        .filter((sc) => {
          const t = getClauseTemplate(sc.clauseId)
          return t && t.parentId === drag.parentId
        })
        .sort((a, b) => a.sortOrder - b.sortOrder)

      const fromIdx = siblings.findIndex((sc) => sc.clauseId === dragClauseId)
      const toIdx = siblings.findIndex((sc) => sc.clauseId === dropClauseId)
      if (fromIdx < 0 || toIdx < 0) return

      const [moved] = siblings.splice(fromIdx, 1)
      siblings.splice(toIdx, 0, moved)

      const newOrder = new Map<string, number>()
      siblings.forEach((sc, i) => newOrder.set(sc.clauseId, i))
      onClausesChange(
        next.map((sc) =>
          newOrder.has(sc.clauseId) ? { ...sc, sortOrder: newOrder.get(sc.clauseId)! } : sc
        )
      )
      markSaved()
    },
    [selectedClauses, onClausesChange, markSaved]
  )

  const moveClause = useCallback(
    (clauseId: string, direction: 'up' | 'down') => {
      const idx = selectedClauses.findIndex((sc) => sc.clauseId === clauseId)
      if (idx === -1) return
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= selectedClauses.length) return

      const updated = [...selectedClauses]
      const temp = updated[idx].sortOrder
      updated[idx] = { ...updated[idx], sortOrder: updated[swapIdx].sortOrder }
      updated[swapIdx] = { ...updated[swapIdx], sortOrder: temp }
      ;[updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]]
      onClausesChange(updated)
    },
    [selectedClauses, onClausesChange]
  )

  const includedCount = selectedClauses.filter((sc) => sc.included).length

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-240px)] min-h-[520px]">
      {/* Top toolbar — view toggle, variables, reset, save state */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('clause')}
            className={cn(
              'px-3 py-1 rounded transition-colors',
              viewMode === 'clause' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Clause view
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={cn(
              'px-3 py-1 rounded transition-colors',
              viewMode === 'full' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Full document
          </button>
        </div>
        {docConfig && (
          <span className="text-xs text-gray-500 hidden sm:inline">
            {docConfig.shortName} · {includedCount} of {allClauses.length} clauses
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              'text-[11px] transition-opacity',
              saveState === 'idle' ? 'opacity-0' : 'opacity-100',
              saveState === 'saving' ? 'text-gray-400' : 'text-green-600'
            )}
            aria-live="polite"
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : ''}
          </span>
          {vault && (
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setApplicabilityFilter('applicable')}
                className={cn(
                  'px-2 py-1 rounded transition-colors',
                  applicabilityFilter === 'applicable'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
                title="Hide clauses that don't apply to you"
              >
                Applicable
              </button>
              <button
                type="button"
                onClick={() => setApplicabilityFilter('all')}
                className={cn(
                  'px-2 py-1 rounded transition-colors',
                  applicabilityFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                All
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowVarsDrawer((p) => !p)}>
            {showVarsDrawer ? 'Hide' : 'Show'} variables
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResetAll}>
            Reset all
          </Button>
        </div>
      </div>

      {/* Variables drawer */}
      {showVarsDrawer && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">Document variables</span>
            <span className="text-[10px] text-gray-400">{Object.keys(variables).length} keys · read-only preview</span>
          </div>
          <div className="grid max-h-40 gap-x-4 gap-y-1 overflow-y-auto px-3 py-2 text-xs sm:grid-cols-2">
            {Object.keys(variables).length === 0 && (
              <span className="text-gray-400 italic">No variables set yet — fill out client intake to populate.</span>
            )}
            {Object.entries(variables).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <span className="shrink-0 font-mono text-gray-500">{`{{${k}}}`}</span>
                <span className="min-w-0 truncate text-gray-800" title={v}>{v || <em className="text-gray-400">—</em>}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Left Panel — Clause Library */}
      <div className="flex w-[35%] flex-col border-r border-gray-200">
        {willId && vault && <FactsPanel willId={willId} vault={vault} />}
        {/* Search */}
        <div className="border-b border-gray-200 p-3">
          <Input
            placeholder="Search clauses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Tree */}
        <div ref={treeScrollRef} className="flex-1 overflow-y-auto p-2">
          {filteredTree.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No clauses match your search.</p>
          ) : (
            <div className="space-y-0.5">
              {filteredTree.map((folder) => (
                <div key={folder.id}>
                  {/* Folder header */}
                  <button
                    type="button"
                    onClick={() => toggleFolder(folder.id)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <svg
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform',
                        expandedFolders.has(folder.id) && 'rotate-90'
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-900">{folder.section}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {(folder.children ?? []).filter((c) => includedSet.has(c.id)).length}/
                      {(folder.children ?? []).length}
                    </span>
                  </button>

                  {/* Children */}
                  {expandedFolders.has(folder.id) &&
                    (folder.children ?? []).map((clause) => (
                      <div key={clause.id} data-clause-tree-id={clause.id} className="relative scroll-m-3">
                        <ClauseTreeItem
                          clause={clause}
                          isSelected={selectedClauseId === clause.id}
                          isIncluded={includedSet.has(clause.id)}
                          onSelect={() => selectClause(clause.id)}
                          onToggleInclude={() => toggleInclude(clause.id)}
                          depth={1}
                          hasCustomText={!!customTextMap[clause.id]}
                          isDefault={defaultClauseIds.has(clause.id)}
                          isRecentlyAdded={recentlyAddedId === clause.id}
                          applicability={applicabilityById.get(clause.id)}
                          draggable
                          isDragTarget={dragOverId === clause.id && dragId !== clause.id}
                          onDragStart={(id) => setDragId(id)}
                          onDragOver={(id) => setDragOverId(id)}
                          onDrop={(id) => {
                            if (dragId) handleDragReorder(dragId, id)
                            setDragId(null)
                            setDragOverId(null)
                          }}
                          onDragEnd={() => {
                            setDragId(null)
                            setDragOverId(null)
                          }}
                        />
                        {/* Up/Down reorder arrows — visible on hover */}
                        {selectedClauseId === clause.id && (
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                moveClause(clause.id, 'up')
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                              title="Move up"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                moveClause(clause.id, 'down')
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                              title="Move down"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom stats */}
        <div className="border-t border-gray-200 px-3 py-2">
          <p className="text-xs text-gray-500">
            {includedCount} of {allClauses.length} clauses included
          </p>
        </div>
      </div>

      {/* Right Panel — Clause Detail / Editor / Full-document preview */}
      <div className="flex w-[65%] flex-col">
        {viewMode === 'full' ? (
          <div
            ref={previewScrollRef}
            className="flex-1 overflow-y-auto p-6"
            onClick={(event) => {
              const target = event.target as HTMLElement
              const clauseNode = target.closest<HTMLElement>('[data-clause-id]')
              const clauseId = clauseNode?.dataset.clauseId
              if (!clauseId) return
              const template = getClauseTemplate(clauseId)
              const editableClauseId = template?.isFolder
                ? selectedClauses.find((selection) => {
                    const child = getClauseTemplate(selection.clauseId)
                    return selection.included && child?.parentId === clauseId
                  })?.clauseId
                : clauseId
              if (editableClauseId) selectClause(editableClauseId)
            }}
          >
            {includedCount === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                No clauses included yet. Toggle inclusion checkboxes on the left to build the document.
              </div>
            ) : (
              <div
                className="will-editor will-editor-clickable mx-auto max-w-3xl rounded border border-gray-100 bg-white p-8 shadow-inner"
                dangerouslySetInnerHTML={{ __html: fullDocumentHtml }}
              />
            )}
          </div>
        ) : selectedTemplate ? (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a6a1e]">Clause heading</p>
                  <h3 className="mt-0.5 text-base font-semibold text-gray-900">{selectedTemplate.name}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">{selectedTemplate.section}{selectedTemplate.subsection ? ` / ${selectedTemplate.subsection}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClause?.aiGenerated && (
                    <Badge variant="info" className="text-xs">AI Generated</Badge>
                  )}
                  <Badge variant={selectedTemplate.tier === 1 ? 'secondary' : 'warning'}>
                    Tier {selectedTemplate.tier}
                  </Badge>
                  {defaultClauseIds.has(selectedTemplate.id) && (
                    <Badge variant="outline">Default clause</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Info bar — collapsible */}
            {(selectedTemplate.statute || selectedTemplate.caselaw || selectedTemplate.annotation) && (
              <div className="border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setInfoExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between px-5 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <span>Firm Reference &amp; Drafting Notes</span>
                  <svg
                    className={cn('h-3.5 w-3.5 transition-transform', infoExpanded && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {infoExpanded && (
                  <div className="space-y-2 px-5 pb-3">
                    {selectedTemplate.statute && (
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 w-16">Statute:</span>
                        <span className="text-xs text-[#1B2A4A]">{selectedTemplate.statute}</span>
                      </div>
                    )}
                    {selectedTemplate.caselaw && (
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 w-16">Case law:</span>
                        <span className="text-xs text-gray-600">{selectedTemplate.caselaw}</span>
                      </div>
                    )}
                    {selectedTemplate.annotation && (
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 w-16">Purpose:</span>
                        <span className="text-xs text-gray-600 leading-relaxed">{selectedTemplate.annotation}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Korean annotation — collapsible */}
            {selectedTemplate.annotationKo && (
              <div className="border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setKoExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between px-5 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <span>Korean Annotation</span>
                  <svg
                    className={cn('h-3.5 w-3.5 transition-transform', koExpanded && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {koExpanded && (
                  <div className="px-5 pb-3">
                    <p className="text-xs text-gray-600 leading-relaxed">{selectedTemplate.annotationKo}</p>
                  </div>
                )}
              </div>
            )}

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clause text</p>
                <p className="text-[11px] text-gray-400">Firm-authored template · editable for this client</p>
              </div>
              <RichTextEditor
                content={selectedClauseText}
                onChange={handleEditorChange}
                placeholder="Clause text will appear here..."
                variables={variables}
                className="will-editor"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetToDefault}
                disabled={!selectedClause?.customText}
              >
                Reset to Default
              </Button>
              <div className="flex items-center gap-2">
                {selectedClause?.customText && (
                  <span className="text-xs text-[#8a6a1e]">Custom text applied</span>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="mt-3 text-sm font-medium text-gray-900">No clause selected</h3>
              <p className="mt-1 text-xs text-gray-500">
                Select a clause from the library on the left to view and edit its content, or switch to the Full document view to preview the whole will.
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
