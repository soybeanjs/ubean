// Right-side outline (TOC) state for the current Doc Page.
// Mirrors the reference's use-doc-outline pattern.
// Doc pages set the outline via setDocOutline() from their parsed markdown headings.
//
// Per DESIGN.md D16: this type stays UI-agnostic (no @soybeanjs/headless/anchor
// dependency). `children` carries nested h3 items under an h2 parent; the layout
// maps this to SAnchor's AnchorOptionData { title, href, children }.
import { shallowRef } from 'vue';

/** UI-agnostic outline item shape. `value` is the heading anchor id (no '#'). */
export interface DocOutlineItem {
  label: string;
  value: string;
  level?: number;
  children?: DocOutlineItem[];
}

const docOutlineItems = shallowRef<DocOutlineItem[]>([]);

export function useDocOutline() {
  return docOutlineItems;
}

export function setDocOutline(items: DocOutlineItem[]) {
  docOutlineItems.value = items;
}

export function resetDocOutline() {
  docOutlineItems.value = [];
}

