'use client'

import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g

/**
 * Tiptap extension that visually highlights {{placeholder}} tokens
 * in the editor with a distinct blue background style.
 */
export const PlaceholderHighlight = Extension.create({
  name: 'placeholderHighlight',

  addOptions() {
    return {
      variables: {} as Record<string, string>,
    }
  },

  addProseMirrorPlugins() {
    const extensionThis = this

    return [
      new Plugin({
        key: new PluginKey('placeholderHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { doc } = state

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return

              const text = node.text
              let match: RegExpExecArray | null

              PLACEHOLDER_REGEX.lastIndex = 0
              while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
                const start = pos + match.index
                const end = start + match[0].length
                const varName = match[1]
                const resolvedValue = extensionThis.options.variables[varName]
                const title = resolvedValue
                  ? `${varName}: ${resolvedValue}`
                  : `${varName} (unresolved)`

                decorations.push(
                  Decoration.inline(start, end, {
                    class: 'placeholder-token',
                    title,
                    style:
                      'background-color: #dbeafe; color: #1e40af; font-family: ui-monospace, monospace; font-size: 0.875em; padding: 1px 4px; border-radius: 4px; cursor: help;',
                  })
                )
              }
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})
