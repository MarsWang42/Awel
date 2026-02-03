import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface AwelConfig {
    babelPlugin?: boolean;
    onboarded?: boolean;
    fresh?: boolean;
    createdAt?: string;
    skillsInstalled?: boolean;
}

export function readAwelConfig(projectCwd: string): AwelConfig {
    const configPath = join(projectCwd, '.awel', 'config.json');
    if (!existsSync(configPath)) return {};
    try {
        return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
        return {};
    }
}

export function writeAwelConfig(projectCwd: string, config: AwelConfig): void {
    const dir = join(projectCwd, '.awel');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function isProjectFresh(projectCwd: string): boolean {
    return readAwelConfig(projectCwd).fresh === true;
}

export function markProjectReady(projectCwd: string): void {
    const config = readAwelConfig(projectCwd);
    config.fresh = false;
    writeAwelConfig(projectCwd, config);
}
