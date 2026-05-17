import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

// ── Editor chrome theme (uses CSS vars so it auto-follows dark/light) ────────

export const localPanelTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    background: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "1.6",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    padding: "12px 16px",
    caretColor: "var(--c-accent)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--c-accent)",
  },
  ".cm-selectionBackground, ::selection": {
    background: "rgba(var(--color-accent-rgb) / 0.18) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    background: "rgba(var(--color-accent-rgb) / 0.18) !important",
  },
  ".cm-activeLine": {
    background: "rgba(var(--color-accent-rgb) / 0.04)",
  },
  ".cm-gutters": {
    background: "var(--c-bg2)",
    color: "var(--c-text-dim)",
    border: "none",
    borderRight: "1px solid var(--c-border)",
  },
  ".cm-activeLineGutter": {
    background: "rgba(var(--color-accent-rgb) / 0.08)",
    color: "var(--c-accent)",
  },
  ".cm-matchingBracket": {
    background: "rgba(var(--color-accent-rgb) / 0.25)",
    outline: "none",
  },
  ".cm-nonmatchingBracket": {
    background: "rgba(var(--color-danger-a0) / 0.2)",
  },
  ".cm-placeholder": {
    color: "var(--c-text-dim)",
    opacity: "0.5",
    fontStyle: "italic",
  },
  ".cm-tooltip": {
    background: "var(--c-bg2)",
    border: "1px solid var(--c-border)",
    borderRadius: "4px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "rgba(var(--color-accent-rgb) / 0.2)",
    color: "var(--c-text-bright)",
  },
});

// ── Syntax highlight styles ───────────────────────────────────────────────────
// Two variants (dark/light) swapped via Compartment when html.light toggles.

const darkHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--c-syn-keyword)", fontWeight: "bold" },
  { tag: [t.bool, t.null], color: "var(--c-syn-bool)" },
  { tag: t.string, color: "var(--c-syn-string)" },
  { tag: [t.number, t.integer], color: "var(--c-syn-number)" },
  { tag: t.comment, color: "var(--c-syn-comment)", fontStyle: "italic" },
  // JSON property keys
  { tag: t.propertyName, color: "var(--c-syn-property)" },
  // HTML/XML tags and attributes
  { tag: t.tagName, color: "var(--c-syn-tag)" },
  { tag: t.attributeName, color: "var(--c-syn-attr-name)" },
  { tag: t.attributeValue, color: "var(--c-syn-attr-val)" },
  { tag: t.angleBracket, color: "var(--c-syn-bracket)" },
  // JS identifiers
  { tag: t.variableName, color: "var(--c-syn-variable)" },
  { tag: t.definition(t.variableName), color: "var(--c-syn-defn)" },
  { tag: t.function(t.variableName), color: "var(--c-syn-defn)" },
  { tag: t.typeName, color: "var(--c-syn-type)" },
  { tag: t.className, color: "var(--c-syn-type)" },
  { tag: t.operator, color: "var(--c-syn-operator)" },
  { tag: t.punctuation, color: "var(--c-syn-operator)" },
  { tag: t.separator, color: "var(--c-syn-operator)" },
  { tag: t.regexp, color: "var(--c-syn-regexp)" },
  { tag: t.escape, color: "var(--c-syn-escape)" },
  { tag: t.url, color: "var(--c-syn-string)", textDecoration: "underline" },
  { tag: t.invalid, color: "var(--c-syn-invalid)" },
]);

const lightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--c-syn-keyword)", fontWeight: "bold" },
  { tag: [t.bool, t.null], color: "var(--c-syn-bool)" },
  { tag: t.string, color: "var(--c-syn-string)" },
  { tag: [t.number, t.integer], color: "var(--c-syn-number)" },
  { tag: t.comment, color: "var(--c-syn-comment)", fontStyle: "italic" },
  { tag: t.propertyName, color: "var(--c-syn-property)" },
  { tag: t.tagName, color: "var(--c-syn-tag)" },
  { tag: t.attributeName, color: "var(--c-syn-attr-name)" },
  { tag: t.attributeValue, color: "var(--c-syn-attr-val)" },
  { tag: t.angleBracket, color: "var(--c-syn-bracket)" },
  { tag: t.variableName, color: "var(--c-syn-variable)" },
  { tag: t.definition(t.variableName), color: "var(--c-syn-defn)" },
  { tag: t.function(t.variableName), color: "var(--c-syn-defn)" },
  { tag: t.typeName, color: "var(--c-syn-type)" },
  { tag: t.className, color: "var(--c-syn-type)" },
  { tag: t.operator, color: "var(--c-syn-operator)" },
  { tag: t.punctuation, color: "var(--c-syn-operator)" },
  { tag: t.separator, color: "var(--c-syn-operator)" },
  { tag: t.regexp, color: "var(--c-syn-regexp)" },
  { tag: t.escape, color: "var(--c-syn-escape)" },
  { tag: t.url, color: "var(--c-syn-string)", textDecoration: "underline" },
  { tag: t.invalid, color: "var(--c-syn-invalid)" },
]);

export function getHighlightExtension(light: boolean): Extension {
  return syntaxHighlighting(light ? lightHighlight : darkHighlight);
}
