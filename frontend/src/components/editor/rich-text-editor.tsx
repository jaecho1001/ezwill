'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { EditorToolbar } from './editor-toolbar'
import { PlaceholderHighlight } from './placeholder-highlight'
import { ClauseParagraph, ClauseHeading } from './clause-paragraph'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  variables?: Record<string, string>
  className?: string
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start typing...',
  editable = true,
  variables = {},
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable built-in paragraph + heading so our custom extensions
        // (which preserve data-indent / data-marker / data-num etc.) take over.
        paragraph: false,
        heading: false,
      }),
      ClauseParagraph,
      ClauseHeading,
      Highlight.configure({ multicolor: true }),
      Underline,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      PlaceholderHighlight.configure({ variables }),
    ],
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
          'prose-headings:font-semibold prose-headings:text-gray-900',
          'prose-p:text-gray-700 prose-p:leading-relaxed',
          'prose-ul:list-disc prose-ol:list-decimal',
          '[&_.ProseMirror-placeholder]:text-gray-400'
        ),
      },
    },
    immediatelyRender: false,
  })

  // Sync content from outside
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editable, editor])

  // Track selection for floating toolbar
  const [hasSelection, setHasSelection] = useState(false)
  const [selectionCoords, setSelectionCoords] = useState<{ top: number; left: number } | null>(null)

  const updateSelection = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) {
      setHasSelection(false)
      return
    }
    setHasSelection(true)
    // Get selection coordinates for positioning the floating menu
    const domSelection = window.getSelection()
    if (domSelection && domSelection.rangeCount > 0) {
      const range = domSelection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelectionCoords({ top: rect.top - 40, left: rect.left + rect.width / 2 })
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', updateSelection)
    editor.on('blur', () => setHasSelection(false))
    return () => {
      editor.off('selectionUpdate', updateSelection)
    }
  }, [editor, updateSelection])

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm', className)}>
      {editable && <EditorToolbar editor={editor} />}

      {/* Floating toolbar on text selection */}
      {editor && editable && hasSelection && selectionCoords && (
        <div
          className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-lg"
          style={{ top: selectionCoords.top, left: selectionCoords.left, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition-colors',
              editor.isActive('bold') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded text-xs italic transition-colors',
              editor.isActive('italic') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded text-xs transition-colors',
              editor.isActive('highlight') ? 'bg-yellow-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <span className="rounded bg-yellow-200 px-0.5">H</span>
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}
