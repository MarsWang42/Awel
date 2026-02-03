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

const DEV_SERVER_SKILL_MD = `---
description: Important rules for working with the dev server in Awel. You MUST follow these rules when the dev server needs restarting or when running dev commands.
---

# Dev Server — Awel Managed Process

**Awel manages the dev server process (e.g. \`npm run dev\`) automatically.** You do NOT control it directly.

## Critical Rules

1. **NEVER kill or restart the dev server yourself.** Do not run commands like:
   - \`kill\`, \`pkill\`, \`killall\` targeting the dev server process
   - \`npm run dev\`, \`npx next dev\`, or any command that starts a new dev server
   - \`lsof -i\` + \`kill\` to free the port

2. **If the dev server needs restarting** (e.g. after changing \`next.config.js\`, \`.env\`, or \`package.json\`), tell the user to restart it. Do not attempt to restart it yourself.

3. **The dev server auto-restarts** when it crashes. Awel watches the process and restarts it automatically. If there is a build error, fix the code — the server will restart on its own once the file is saved.

4. **HMR handles most changes.** After editing React components, pages, or styles, the browser updates automatically via Hot Module Replacement. No restart is needed.

## What You CAN Do

- Edit project files normally (Read, Write, Edit) — HMR will pick up changes
- Run \`npm install\` to add dependencies (Awel will detect the restart need)
- Run build/lint/test commands like \`npm run build\`, \`npx tsc --noEmit\`, \`npx eslint\`
`;

const MEMORY_SKILL_REL_PATH = join('.claude', 'skills', 'memory', 'SKILL.md');
const DEV_SERVER_SKILL_REL_PATH = join('.claude', 'skills', 'dev-server', 'SKILL.md');

export function isSkillsInstalled(projectCwd: string): boolean {
    return existsSync(join(projectCwd, MEMORY_SKILL_REL_PATH))
        && existsSync(join(projectCwd, DEV_SERVER_SKILL_REL_PATH));
}

export function installSkills(projectCwd: string): void {
    const memoryDir = join(projectCwd, '.claude', 'skills', 'memory');
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(join(memoryDir, 'SKILL.md'), MEMORY_SKILL_MD, 'utf-8');

    const devServerDir = join(projectCwd, '.claude', 'skills', 'dev-server');
    mkdirSync(devServerDir, { recursive: true });
    writeFileSync(join(devServerDir, 'SKILL.md'), DEV_SERVER_SKILL_MD, 'utf-8');
}

/**
 * On first run, prompts the user to install Awel skills for Claude Code.
 * Persists the choice in .awel/config.json so we only ask once.
 */
export async function ensureSkills(projectCwd: string): Promise<void> {
    const config = readAwelConfig(projectCwd);

    // Already asked — respect previous choice
    if (config.skillsInstalled !== undefined) {
        // If they said yes before but files are missing (e.g. git clean), reinstall silently
        if (config.skillsInstalled && !isSkillsInstalled(projectCwd)) {
            installSkills(projectCwd);
        }
        return;
    }

    const p = await import('@clack/prompts');

    const install = await p.confirm({
        message: 'Install Awel skills for Claude Code? (Highly recommended — includes project memory and dev server rules)',
        initialValue: true,
    });

    if (p.isCancel(install)) {
        // User cancelled — don't block startup, just skip
        writeAwelConfig(projectCwd, { ...config, skillsInstalled: false });
        return;
    }

    if (install) {
        installSkills(projectCwd);
        awel.log('  Installed skills to .claude/skills/');
    }

    writeAwelConfig(projectCwd, { ...config, skillsInstalled: install });
}
