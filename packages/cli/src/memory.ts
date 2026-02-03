import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface MemoryEntry {
    id: string;
    content: string;
    tags: string[];
    scope: 'always' | 'contextual';
    source: 'user' | 'agent';
    createdAt: string;
    usageCount: number;
    lastUsedAt: string;
}

function memoryPath(projectCwd: string): string {
    return join(projectCwd, '.awel', 'memory.json');
}

export function readMemories(projectCwd: string): MemoryEntry[] {
    const filePath = memoryPath(projectCwd);
    if (!existsSync(filePath)) return [];
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeMemories(projectCwd: string, entries: MemoryEntry[]): void {
    const dir = join(projectCwd, '.awel');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(memoryPath(projectCwd), JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export function addMemory(
    projectCwd: string,
    opts: { content: string; tags: string[]; scope: 'always' | 'contextual'; source: 'user' | 'agent' }
): MemoryEntry {
    const entries = readMemories(projectCwd);
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
        id: randomUUID(),
        content: opts.content,
        tags: opts.tags,
        scope: opts.scope,
        source: opts.source,
        createdAt: now,
        usageCount: 0,
        lastUsedAt: now,
    };
    entries.push(entry);
    writeMemories(projectCwd, entries);
    return entry;
}

export function deleteMemory(projectCwd: string, id: string): boolean {
    const entries = readMemories(projectCwd);
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    writeMemories(projectCwd, entries);
    return true;
}

export function searchMemories(projectCwd: string, query: string): MemoryEntry[] {
    const entries = readMemories(projectCwd);
    const contextual = entries.filter(e => e.scope === 'contextual');

    const queryTokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 0);

    if (queryTokens.length === 0) return [];

    const now = Date.now();
    const scored: { entry: MemoryEntry; score: number }[] = [];

    for (const entry of contextual) {
        const searchText = (entry.content + ' ' + entry.tags.join(' ')).toLowerCase();
        let matchCount = 0;
        for (const token of queryTokens) {
            if (searchText.includes(token)) {
                matchCount++;
            }
        }
        if (matchCount === 0) continue;

        // Recency factor: entries used more recently score higher
        const lastUsed = new Date(entry.lastUsedAt).getTime();
        const ageMs = Math.max(now - lastUsed, 1);
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recencyFactor = 1 / (1 + Math.log1p(ageDays));

        const usageFactor = 1 + Math.log1p(entry.usageCount);
        const score = matchCount * recencyFactor * usageFactor;

        scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map(s => s.entry);
}

export function touchMemories(projectCwd: string, ids: string[]): void {
    if (ids.length === 0) return;
    const entries = readMemories(projectCwd);
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    let changed = false;
    for (const entry of entries) {
        if (idSet.has(entry.id)) {
            entry.usageCount++;
            entry.lastUsedAt = now;
            changed = true;
        }
    }
    if (changed) {
        writeMemories(projectCwd, entries);
    }
}

const MAX_ALWAYS_CONTEXT_LENGTH = 3000;

export function getAlwaysMemoryContext(projectCwd: string): string | null {
    const entries = readMemories(projectCwd);
    const always = entries.filter(e => e.scope === 'always');
    if (always.length === 0) return null;

    let block = '[Project Memories]';
    for (const entry of always) {
        const line = `\n- ${entry.content}`;
        if (block.length + line.length > MAX_ALWAYS_CONTEXT_LENGTH) break;
        block += line;
    }
    return block;
}
