/**
 * Smart parser for Ontario will clause text.
 *
 * Ported from DivorceMate's agreement editor — auto-detects (a)/(b) lettered
 * sub-items and (i)/(ii) roman numeral sub-sub-items, using indent levels
 * that map to CSS tab stops (3.5em / 7em / 10.5em).
 *
 * Auto-detection rules:
 *   - First line of a clause = intro (level 1)
 *   - If the intro ends with ":", following plain lines become lettered (level 2)
 *   - If a lettered item ends with ":", following plain lines become roman (level 3)
 *   - Explicit "(a)" / "(i)" prefixes in the template override auto-detection
 *
 * Returns a list of paragraphs with indent level + optional marker. The caller
 * wraps each in <p data-indent="N" data-marker="(a)">...</p> so CSS can render
 * the hanging-indent via ::before pseudo-elements.
 */

export type ClauseParagraph = {
  text: string
  indent: 1 | 2 | 3
  marker?: string
}

const ROMAN_SEQUENCE = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix',
  'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
]

const endsWithColon = (s: string) => /:\s*$/.test(s)

export function formatClauseText(raw: string): ClauseParagraph[] {
  if (!raw) return []

  // Prefer explicit paragraph breaks (\n\n); fall back to single \n for
  // library entries that use one-line-per-paragraph conventions.
  const useDoubleNewline = /\n\n/.test(raw)
  const parts = (useDoubleNewline ? raw.split(/\n\n+/) : raw.split(/\n+/))
    .map((s) => s.trim())
    .filter(Boolean)

  if (parts.length === 0) return []

  const result: ClauseParagraph[] = []

  // State: what "mode" are we in for auto-markers?
  //   body    → no numbering yet (first paragraph, or continuation)
  //   letters → subsequent plain lines get (a), (b), (c)...
  //   romans  → subsequent plain lines get (i), (ii), (iii)...
  let mode: 'body' | 'letters' | 'romans' = 'body'
  let letterCounter = 0  // 0 => 'a', 1 => 'b', ...
  let romanCounter = 0   // 0 => 'i', 1 => 'ii', ...

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i]

    // Explicit markers take precedence. Roman first (longer pattern).
    const romanMatch = text.match(/^\(([ivx]+)\)\s+([\s\S]*)/)
    const letterMatch = text.match(/^\(([a-z])\)\s+([\s\S]*)/)

    if (romanMatch) {
      const body = romanMatch[2].trim()
      result.push({ text: body, indent: 3, marker: `(${romanMatch[1]})` })
      mode = 'romans'
      const idx = ROMAN_SEQUENCE.indexOf(romanMatch[1])
      romanCounter = idx >= 0 ? idx + 1 : romanCounter + 1
      continue
    }

    if (letterMatch) {
      const body = letterMatch[2].trim()
      result.push({ text: body, indent: 2, marker: `(${letterMatch[1]})` })
      letterCounter = letterMatch[1].charCodeAt(0) - 0x61 + 1
      if (endsWithColon(body)) {
        mode = 'romans'
        romanCounter = 0
      } else {
        mode = 'letters'
      }
      continue
    }

    if (i === 0) {
      // First paragraph is always the clause intro at level 1.
      result.push({ text, indent: 1 })
      if (endsWithColon(text)) {
        mode = 'letters'
        letterCounter = 0
        romanCounter = 0
      }
      continue
    }

    // No explicit marker, not the intro — auto-assign based on mode.
    if (mode === 'romans') {
      const marker =
        romanCounter < ROMAN_SEQUENCE.length
          ? `(${ROMAN_SEQUENCE[romanCounter]})`
          : undefined
      if (marker) romanCounter++
      result.push({ text, indent: 3, marker })
    } else if (mode === 'letters') {
      const marker = `(${String.fromCharCode(0x61 + letterCounter)})`
      letterCounter++
      result.push({ text, indent: 2, marker })
      if (endsWithColon(text)) {
        mode = 'romans'
        romanCounter = 0
      }
    } else {
      // Continuation paragraph within the clause body.
      result.push({ text, indent: 1 })
    }
  }

  return result
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Generate will document HTML from an ordered list of included clauses,
 * with proper section numbering, sub-item (1.1, 1.2...) numbering, and
 * auto-detected (a)/(i) markers.
 *
 * Output format matches the CSS in globals.css under `.will-editor`:
 *   - <h2 data-num="1.">REVOCATION</h2>
 *   - <p data-numbered="1" data-num="1.1" data-indent="1">I revoke...</p>
 *   - <p data-indent="2" data-marker="(a)">Shares in any corporation...</p>
 *   - <p data-indent="3" data-marker="(i)">controlled by me...</p>
 */
export type SimpleClause = {
  id: string
  name: string
  section: string
  subsection?: string
  parentId?: string
  sortOrder: number
  isFolder: boolean
  templateText: string
}

export function generateWillContent(
  clauseTree: SimpleClause[],
  selected: Set<string>,
  variables: Record<string, string>
): string {
  let sectionNum = 0
  let html = ''

  const substituteVariables = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `[${key}]`)

  const addParagraphs = (
    clauseId: string,
    raw: string,
    sn: number,
    sub: number | null
  ) => {
    const parts = formatClauseText(substituteVariables(raw))
    parts.forEach(({ text, indent, marker }, pi) => {
      // Only the first paragraph of a sub-clause gets a level-1 number (e.g. 1.1).
      const isNumbered = pi === 0 && sub !== null && indent === 1
      const numberedAttr = isNumbered ? ' data-numbered="1"' : ''
      const numAttr = isNumbered ? ` data-num="${sn}.${sub}"` : ''
      const markerAttr = marker ? ` data-marker="${escapeAttr(marker)}"` : ''
      html += `<p data-clause-id="${clauseId}" data-indent="${indent}"${numberedAttr}${numAttr}${markerAttr}>${text}</p>\n`
    })
  }

  const processFolder = (folder: SimpleClause, children: SimpleClause[]) => {
    const hasSelectedChildren = children.some((c) => selected.has(c.id))
    if (!hasSelectedChildren && !selected.has(folder.id)) return

    sectionNum++
    html += `<h2 data-clause-id="${folder.id}" data-num="${sectionNum}.">${folder.name.toUpperCase()}</h2>\n`

    if (folder.templateText) {
      addParagraphs(folder.id, folder.templateText, sectionNum, null)
    }

    let subNum = 0
    for (const child of children) {
      if (selected.has(child.id)) {
        subNum++
        addParagraphs(child.id, child.templateText, sectionNum, subNum)
      }
    }
  }

  // Group by parent: folders and their children
  const folders = clauseTree.filter((c) => c.isFolder && !c.parentId)
  const childrenByParent = new Map<string, SimpleClause[]>()
  for (const c of clauseTree) {
    if (c.parentId) {
      if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
      childrenByParent.get(c.parentId)!.push(c)
    }
  }
  for (const [, children] of childrenByParent) {
    children.sort((a, b) => a.sortOrder - b.sortOrder)
  }
  folders.sort((a, b) => a.sortOrder - b.sortOrder)

  for (const folder of folders) {
    const children = childrenByParent.get(folder.id) || []
    processFolder(folder, children)
  }

  // Handle orphan top-level clauses (no folder) — rare but possible.
  const orphans = clauseTree.filter((c) => !c.isFolder && !c.parentId)
  orphans.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const orphan of orphans) {
    if (!selected.has(orphan.id)) continue
    sectionNum++
    html += `<h2 data-clause-id="${orphan.id}" data-num="${sectionNum}.">${orphan.name.toUpperCase()}</h2>\n`
    addParagraphs(orphan.id, orphan.templateText, sectionNum, 1)
  }

  return html
}
