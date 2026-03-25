import { environment } from "@raycast/api";
import fs from "fs";
import path from "path";
import YAML from "yaml";

export interface BoolParam {
  id: string;
  name: string;
  type: "bool";
  flag: string;
  default?: boolean;
}

export interface StringParam {
  id: string;
  name: string;
  type: "string";
  template?: string; // e.g. "TOOLKIT={{value}}" — defaults to "{{value}}"
  options?: string[];
  allowCustom?: boolean;
  default?: string;
  required?: boolean; // default false: if true, form validation blocks submission when empty
  includeIfEmpty?: boolean; // default false: omit entire template when value is empty
}

export type ActionParam = BoolParam | StringParam;

export interface ProjectAction {
  name: string;
  command: string;
  icon?: string;
  terminal?: boolean;
  params?: ActionParam[];
}

export function resolveCommand(command: string, paramValues: Record<string, string | boolean>, params: ActionParam[]): string {
  let resolved = command;

  for (const param of params) {
    const placeholder = `{{${param.id}}}`;
    const value = paramValues[param.id];

    let replacement = "";
    if (param.type === "bool") {
      replacement = value ? param.flag : "";
    } else {
      const strValue = (value as string) || "";
      const template = param.template || "{{value}}";
      if (strValue || param.includeIfEmpty) {
        replacement = template.replace("{{value}}", strValue);
      }
    }

    resolved = resolved.replace(placeholder, replacement);
  }

  // collapse multiple spaces into one and trim
  return resolved.replace(/\s{2,}/g, " ").trim();
}

export interface Project {
  id: string;
  name: string;
  path: string;
  icon?: string;
  actions?: ProjectAction[];
}

export interface Config {
  globalActions: ProjectAction[];
  projects: Project[];
}

const CONFIG_PATH = path.join(environment.supportPath, "config.yaml");

const DEFAULT_CONFIG: Config = {
  globalActions: [
    {
      name: "Open in VS Code",
      command: "code {{open_in_workspace}} .",
      icon: "💻",
      params: [
        { id: "open_in_workspace", name: "Open in Workspace?", type: "bool", flag: "--add" },
      ],
    },
    { name: "Open in Sublime Text", command: "subl .", icon: "📝" },
    {
      name: "Run Claude Code",
      command: "claude {{use_git_worktree}}",
      icon: "🤖",
      terminal: true,
      params: [
        { id: "use_git_worktree", name: "Use Git Worktree?", type: "bool", flag: "-w" },
      ],
    },
    { name: "Open in Finder", command: "open .", icon: "📁" },
    { name: "Open in Terminal", command: "open -a iTerm .", icon: "🖥️" },
  ],
  projects: [
    {
      id: "desktop",
      name: "Desktop",
      path: "~/Desktop",
      icon: "🖥️",
    },
    {
      id: "example",
      name: "Example Project",
      path: "~/Desktop/example-folder",
      actions: [
        { name: "Run Dev Server", command: "npm run dev", icon: "🚀", terminal: true },
      ],
    },
  ],
};

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, YAML.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return YAML.parse(raw) as Config;
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, YAML.stringify(config));
}

export function resolveProjectPath(projectPath: string): string {
  return projectPath.replace(/^~/, process.env.HOME || "");
}

// Recency tracking: stores { projectId: ISO timestamp }
const RECENCY_PATH = path.join(environment.supportPath, "recency.json");

export function loadRecency(): Record<string, string> {
  if (!fs.existsSync(RECENCY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(RECENCY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function touchProject(projectId: string): void {
  const recency = loadRecency();
  recency[projectId] = new Date().toISOString();
  fs.mkdirSync(path.dirname(RECENCY_PATH), { recursive: true });
  fs.writeFileSync(RECENCY_PATH, JSON.stringify(recency, null, 2));
}

export function sortProjectsByRecency(projects: Project[]): Project[] {
  const recency = loadRecency();
  return [...projects].sort((a, b) => {
    const aTime = recency[a.id] || "";
    const bTime = recency[b.id] || "";
    if (aTime && bTime) return bTime.localeCompare(aTime); // most recent first
    if (aTime) return -1; // a has been used, b hasn't
    if (bTime) return 1;
    return 0; // both unused, preserve config order
  });
}
