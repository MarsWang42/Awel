import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readAwelConfig, writeAwelConfig } from './awel-config.js';
import { awel } from './logger.js';

const MEMORY_SKILL_MD = `---
description: Read, write, or search project memories stored in .awel/memory.json. Use this skill when you need to save important project patterns, conventions, or decisions for future sessions, or retrieve past context about unfamiliar parts of the codebase.
---

# Memory — Persistent Project Knowledge

Awel stores persistent project memories in \`.awel/memory.json\`. These memories survive across sessions and help maintain context about the project.

## Data Format

The file contains a JSON array of memory entries:

\`\`\`json
[
  {
    "id": "uuid-string",
    "content": "Description of the fact, pattern, or rule",
    "tags": ["keyword1", "keyword2"],
    "scope": "always | contextual",
    "source": "agent",
    "createdAt": "ISO-timestamp",
    "usageCount": 0,
    "lastUsedAt": "ISO-timestamp"
  }
]
\`\`\`

## Scopes

- **always**: Injected into every conversation automatically. Use for project-wide rules, tech stack info, coding conventions.
- **contextual**: Only retrieved on demand via search. Use for specific facts about files, components, or past decisions.

## How to Read Memories

Read the file directly:

\`\`\`bash
cat .awel/memory.json
\`\`\`

## How to Write a Memory

1. Read the current file (or start with \`[]\` if it doesn't exist)
2. Append a new entry with a UUID, timestamp, and the fields above
3. Write the updated array back

Example using Bash:

\`\`\`bash
node -e "
const fs = require('fs');
const path = '.awel/memory.json';
const entries = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf-8')) : [];
entries.push({
  id: crypto.randomUUID(),
  content: 'YOUR MEMORY CONTENT HERE',
  tags: ['tag1', 'tag2'],
  scope: 'contextual',
  source: 'agent',
  createdAt: new Date().toISOString(),
  usageCount: 0,
  lastUsedAt: new Date().toISOString()
});
fs.mkdirSync('.awel', { recursive: true });
fs.writeFileSync(path, JSON.stringify(entries, null, 2) + '\\n');
console.log('Memory saved');
"
\`\`\`

## How to Search Memories

Read the file and filter by matching query keywords against content and tags (case-insensitive).
When you retrieve contextual memories, bump their \`usageCount\` and \`lastUsedAt\`.

## Guidelines

- When you discover important project patterns, conventions, or constraints, save them as memories.
- Use \`always\` scope sparingly — only for things every conversation needs (tech stack, coding rules, directory conventions).
- Use \`contextual\` scope for specific facts about files, components, or past decisions.
- Write factual, specific content. Avoid vague generalizations.
- Include relevant tags (file names, component names, library names) for better search.
- Before working on an unfamiliar part of the codebase, search memories for relevant context.
`;

const SKILL_REL_PATH = join('.claude', 'skills', 'memory', 'SKILL.md');

export function isMemorySkillInstalled(projectCwd: string): boolean {
    return existsSync(join(projectCwd, SKILL_REL_PATH));
}

export function installMemorySkill(projectCwd: string): void {
    const dir = join(projectCwd, '.claude', 'skills', 'memory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), MEMORY_SKILL_MD, 'utf-8');
}

/**
 * On first run, prompts the user to install the memory skill for Claude Code.
 * Persists the choice in .awel/config.json so we only ask once.
 */
export async function ensureMemorySkill(projectCwd: string): Promise<void> {
    const config = readAwelConfig(projectCwd);

    // Already asked — respect previous choice
    if (config.skillsInstalled !== undefined) {
        // If they said yes before but the file is missing (e.g. git clean), reinstall silently
        if (config.skillsInstalled && !isMemorySkillInstalled(projectCwd)) {
            installMemorySkill(projectCwd);
        }
        return;
    }

    const p = await import('@clack/prompts');

    const install = await p.confirm({
        message: 'Install Awel memory skill for Claude Code? (enables persistent project memories across sessions)',
        initialValue: true,
    });

    if (p.isCancel(install)) {
        // User cancelled — don't block startup, just skip
        writeAwelConfig(projectCwd, { ...config, skillsInstalled: false });
        return;
    }

    if (install) {
        installMemorySkill(projectCwd);
        awel.log('  Installed memory skill to .claude/skills/memory/SKILL.md');
    }

    writeAwelConfig(projectCwd, { ...config, skillsInstalled: install });
}
