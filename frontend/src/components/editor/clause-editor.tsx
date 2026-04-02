'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WillDocumentType, WillClauseTemplate, SelectedWillClause } from '@/types/will-document'
import {
  getClauseTree,
  getClauseTemplate,
  resolveTemplateText,
  getDocumentTypeConfig,
  getClausesForDocumentType,
} from '@/lib/will-documents/index'
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
}

export function ClauseEditor({
  documentType,
  selectedClauses,
  onClausesChange,
  variables,
}: ClauseEditorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [infoExpanded, setInfoExpanded] = useState(true)
  const [koExpanded, setKoExpanded] = useState(false)

  const docConfig = getDocumentTypeConfig(documentType)
  const clauseTree = useMemo(() => getClauseTree(documentType), [documentType])

  // All leaf clauses for counting
  const allClauses = useMemo(() => getClausesForDocumentType(documentType).filter((c) => !c.isFolder), [documentType])

  // Filter tree by search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return clauseTree
    const q = searchQuery.toLowerCase()
    return clauseTree
      .map((folder) => ({
        ...folder,
        children: (folder.children ?? []).filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.section.toLowerCase().includes(q) ||
            (c.statute && c.statute.toLowerCase().includes(q)) ||
            (c.annotation && c.annotation.toLowerCase().includes(q))
        ),
      }))
      .filter((folder) => (folder.children?.length ?? 0) > 0 || folder.name.toLowerCase().includes(q))
  }, [clauseTree, searchQuery])

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

  // Get the text content for the selected clause
  const selectedClauseText = useMemo(() => {
    if (!selectedTemplate) return ''
    if (selectedClause?.customText) return selectedClause.customText
    return resolveTemplateText(selectedTemplate.templateText, variables)
  }, [selectedTemplate, selectedClause, variables])

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

  const toggleInclude = useCallback(
    (clauseId: string) => {
      const existing = selectedClauses.find((sc) => sc.clauseId === clauseId)
      if (existing) {
        onClausesChange(
          selectedClauses.map((sc) =>
            sc.clauseId === clauseId ? { ...sc, included: !sc.included } : sc
          )
        )
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
        }
      }
    },
    [selectedClauses, onClausesChange]
  )

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
    },
    [selectedClauseId, selectedClauses, onClausesChange]
  )

  const handleResetToDefault = useCallback(() => {
    if (!selectedClauseId) return
    onClausesChange(
      selectedClauses.map((sc) =>
        sc.clauseId === selectedClauseId ? { ...sc, customText: undefined } : sc
      )
    )
  }, [selectedClauseId, selectedClauses, onClausesChange])

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
    <div className="flex h-[calc(100vh-280px)] min-h-[500px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Left Panel — Clause Library */}
      <div className="flex w-[35%] flex-col border-r border-gray-200">
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
        <div className="flex-1 overflow-y-auto p-2">
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
                      <div key={clause.id} className="relative">
                        <ClauseTreeItem
                          clause={clause}
                          isSelected={selectedClauseId === clause.id}
                          isIncluded={includedSet.has(clause.id)}
                          onSelect={() => setSelectedClauseId(clause.id)}
                          onToggleInclude={() => toggleInclude(clause.id)}
                          depth={1}
                          hasCustomText={!!customTextMap[clause.id]}
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

      {/* Right Panel — Clause Detail / Editor */}
      <div className="flex w-[65%] flex-col">
        {selectedTemplate ? (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selectedTemplate.name}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">{selectedTemplate.section}{selectedTemplate.subsection ? ` / ${selectedTemplate.subsection}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClause?.aiGenerated && (
                    <Badge variant="info" className="text-xs">AI Generated</Badge>
                  )}
                  <Badge variant={selectedTemplate.tier === 1 ? 'secondary' : 'warning'}>
                    Tier {selectedTemplate.tier}
                  </Badge>
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
                  <span>Reference &amp; Annotations</span>
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
                        <span className="text-xs text-amber-700">{selectedTemplate.statute}</span>
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
                        <span className="shrink-0 text-xs font-medium text-gray-500 w-16">Note:</span>
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
              <RichTextEditor
                content={selectedClauseText}
                onChange={handleEditorChange}
                placeholder="Clause text will appear here..."
                variables={variables}
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
                  <span className="text-xs text-amber-600">Custom text applied</span>
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
                Select a clause from the library on the left to view and edit its content.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
