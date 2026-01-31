// ─── Inspector Types ─────────────────────────────────────────

export interface SelectedElement {
    tag: string;
    component: string | null;
    source: string | null;
    text: string;
    className: string;
    line: number | null;
    column: number | null;
    props: Record<string, string> | null;
    componentChain: string[] | null;
    attributes: Record<string, string> | null;
    comment?: string;
    mode?: 'attach';
    // Enrichment fields (populated server-side)
    sourceSnippet?: string | null;
    propsTypeDefinition?: string | null;
}
