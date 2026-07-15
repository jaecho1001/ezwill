/**
 * Custom Tiptap extensions for EZWill will clauses.
 *
 * Mirrors DivorceMate's approach: a custom Paragraph + Heading that preserve
 * data-clause-id, data-indent, data-numbered, data-num, data-marker and style
 * attributes through setContent/getHTML round-trips. Without these custom
 * extensions, Tiptap's default Paragraph strips unknown attributes, destroying
 * the hanging-indent sub-item markers.
 */

import { Paragraph } from '@tiptap/extension-paragraph'
import { Heading } from '@tiptap/extension-heading'

type AttrGetter = (attrs: Record<string, unknown>) => Record<string, unknown>

const dataAttr = (name: string) => ({
  default: null,
  parseHTML: (el: Element) => el.getAttribute(name),
  renderHTML: ((attrs: Record<string, unknown>) =>
    attrs[name] ? { [name]: String(attrs[name]) } : {}) as AttrGetter,
})

/**
 * Paragraph that preserves will-clause data attributes and inline styles.
 * Used inside the RichTextEditor so that when we roundtrip HTML through
 * editor.getHTML() → setContent(...), clause IDs, indent levels and markers
 * survive intact.
 */
export const ClauseParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-clause-id': dataAttr('data-clause-id'),
      'data-indent': dataAttr('data-indent'),
      'data-numbered': dataAttr('data-numbered'),
      'data-num': dataAttr('data-num'),
      'data-marker': dataAttr('data-marker'),
      style: {
        default: null,
        parseHTML: (el: Element) => el.getAttribute('style') || null,
        renderHTML: ((attrs: Record<string, unknown>) =>
          attrs.style ? { style: String(attrs.style) } : {}) as AttrGetter,
      },
    }
  },
})

/**
 * Heading that preserves will-clause data attributes for section numbering.
 * Still uses Tiptap's underlying heading level system — just augments with
 * our data-clause-id + data-num so CSS can render "1. APPOINTMENT" style
 * section headings.
 */
export const ClauseHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-clause-id': dataAttr('data-clause-id'),
      'data-num': dataAttr('data-num'),
    }
  },
}).configure({ levels: [1, 2, 3] })
