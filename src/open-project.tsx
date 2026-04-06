import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  getPreferenceValues,
  Icon,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { exec, execFile } from "child_process";
import fs from "fs";
import { useState } from "react";
import {
  loadConfig,
  resolveAttributes,
  resolveCommand,
  resolveProjectPath,
  shouldShowAction,
  sortProjectsByRecency,
  touchProject,
  getConfigPath,
  type ActionParam,
  type Project,
  type ProjectAction,
} from "./config";

const LOG_FILE = "/tmp/project-launcher.log";
function log(msg: string) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
}

function OpenConfigAction() {
  return (
    <Action
      title="Open Config"
      icon={Icon.Gear}
      shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
      onAction={() => {
        const { configEditor } = getPreferenceValues<{ configEditor: string }>();
        const editor = configEditor || "open";
        execFile("/bin/zsh", ["-l", "-c", `${editor} "${getConfigPath()}"`], (error, stdout, stderr) => {
          if (error) {
            showToast({ style: Toast.Style.Failure, title: "Error", message: `${error.message} | stderr: ${stderr}` });
          }
        });
      }}
    />
  );
}

export default function Command() {
  const config = loadConfig();
  const sortedProjects = sortProjectsByRecency(config.projects);

  const allTags = [...new Set(config.projects.flatMap((p) => p.tags || []))].sort();
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const filteredProjects = selectedTag === "all"
    ? sortedProjects
    : sortedProjects.filter((p) => p.tags?.includes(selectedTag));

  return (
    <List
      searchBarPlaceholder="Search projects..."
      searchBarAccessory={
        allTags.length > 0 ? (
          <List.Dropdown tooltip="Filter by Tag" storeValue onChange={setSelectedTag}>
            <List.Dropdown.Item title="All" value="all" />
            <List.Dropdown.Section>
              {allTags.map((tag) => (
                <List.Dropdown.Item key={tag} title={tag} value={tag} />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        ) : undefined
      }
    >
      {filteredProjects.map((project) => (
        <List.Item
          key={project.id}
          title={project.name}
          subtitle={project.path}
          icon={project.icon || Icon.Folder}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Actions"
                icon={Icon.ArrowRight}
                target={<ProjectActions project={project} />}
              />
              <OpenConfigAction />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ProjectActions({ project }: { project: Project }) {
  const config = loadConfig();
  const resolvedPath = resolveProjectPath(project.path);

  const projectActions = (project.actions || []).filter((a) => shouldShowAction(a, project));
  const globalActions = config.globalActions.filter((a) => shouldShowAction(a, project));
  const attrs = project.attributes || {};

  return (
    <List searchBarPlaceholder={`Actions for ${project.name}...`}>
      {projectActions.length > 0 && (
        <List.Section title="Project Actions">
          {projectActions.map((action, idx) => (
            <ActionItem key={`project-${idx}`} action={action} cwd={resolvedPath} projectId={project.id} attributes={attrs} />
          ))}
        </List.Section>
      )}
      {globalActions.length > 0 && (
        <List.Section title="Global Actions">
          {globalActions.map((action, idx) => (
            <ActionItem key={`global-${idx}`} action={action} cwd={resolvedPath} projectId={project.id} attributes={attrs} />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function getDefaultParamValues(params: ActionParam[]): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const param of params) {
    if (param.type === "bool") {
      values[param.id] = param.default || false;
    } else {
      values[param.id] = param.default || "";
    }
  }
  return values;
}

function hasUnfilledRequired(params: ActionParam[]): boolean {
  return params.some((p) => p.type === "string" && p.required && !p.default);
}

function ActionItem({ action, cwd, projectId, attributes }: { action: ProjectAction; cwd: string; projectId: string; attributes: Record<string, string> }) {
  const hasParams = action.params && action.params.length > 0;
  const canRunDefaults = hasParams && !hasUnfilledRequired(action.params || []);

  const resolve = (cmd: string) => resolveAttributes(cmd, attributes);

  const runWithDefaults = () => {
    touchProject(projectId);
    const defaults = getDefaultParamValues(action.params || []);
    const resolved = resolve(resolveCommand(action.command, defaults, action.params || []));
    runCommand(action.name, resolved, cwd, action.terminal);
  };

  return (
    <List.Item
      title={action.name}
      subtitle={resolve(action.command)}
      icon={action.icon || Icon.Terminal}
      actions={
        <ActionPanel>
          {hasParams ? (
            <>
              {canRunDefaults ? (
                <>
                  <Action
                    title="Run with Defaults"
                    icon={Icon.Play}
                    onAction={runWithDefaults}
                  />
                  <Action.Push
                    title="Configure & Run"
                    icon={Icon.Gear}
                    shortcut={{ modifiers: ["cmd"], key: "return" }}
                    target={<ParamForm action={action} cwd={cwd} projectId={projectId} attributes={attributes} />}
                  />
                </>
              ) : (
                <Action.Push
                  title="Configure & Run"
                  icon={Icon.Play}
                  target={<ParamForm action={action} cwd={cwd} projectId={projectId} attributes={attributes} />}
                />
              )}
            </>
          ) : (
            <Action
              title="Run"
              icon={Icon.Play}
              onAction={() => {
                touchProject(projectId);
                runCommand(action.name, resolve(action.command), cwd, action.terminal);
              }}
            />
          )}
          <Action.CopyToClipboard
            title="Copy Command"
            content={`cd "${cwd}" && ${resolve(resolveCommand(action.command, getDefaultParamValues(action.params || []), action.params || []))}`}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <OpenConfigAction />
        </ActionPanel>
      }
    />
  );
}

function ParamForm({ action, cwd, projectId, attributes }: { action: ProjectAction; cwd: string; projectId: string; attributes: Record<string, string> }) {
  const params = action.params || [];
  const requiredIds = new Set(params.filter((p) => p.type === "string" && p.required).map((p) => p.id));

  return (
    <Form
      navigationTitle={action.name}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run"
            icon={Icon.Play}
            onSubmit={(values) => {
              // validate required fields
              for (const id of requiredIds) {
                if (!values[id]) {
                  showToast({ style: Toast.Style.Failure, title: "Required", message: `${params.find((p) => p.id === id)?.name} is required` });
                  return;
                }
              }
              touchProject(projectId);
              const resolved = resolveAttributes(resolveCommand(action.command, values, params), attributes);
              runCommand(action.name, resolved, cwd, action.terminal);
            }}
          />
          <OpenConfigAction />
        </ActionPanel>
      }
    >
      {params.map((param) => {
        if (param.type === "bool") {
          return (
            <Form.Checkbox
              key={param.id}
              id={param.id}
              label={param.name}
              defaultValue={param.default || false}
            />
          );
        }

        // String param with options
        if (param.options && param.options.length > 0) {
          const items = param.options.map((opt) => (
            <Form.Dropdown.Item key={opt} value={opt} title={opt} />
          ));

          return (
            <Form.Dropdown
              key={param.id}
              id={param.id}
              title={param.name}
              defaultValue={param.default || ""}
            >
              {!param.required && <Form.Dropdown.Item key="__empty__" value="" title="(none)" />}
              {items}
            </Form.Dropdown>
          );
        }

        // Plain string param (free text)
        return (
          <Form.TextField
            key={param.id}
            id={param.id}
            title={param.name}
            defaultValue={param.default || ""}
            placeholder={param.required ? `${param.name} (required)` : param.name}
          />
        );
      })}
    </Form>
  );
}

async function runCommand(name: string, command: string, cwd: string, terminal?: boolean) {
  await closeMainWindow();

  if (!terminal) {
    const fullCommand = `cd ${JSON.stringify(cwd)} && ${command}`;
    log(`Running: ${fullCommand}`);
    execFile("/bin/zsh", ["-l", "-c", fullCommand], (error, stdout, stderr) => {
      log(`Result: error=${error?.message} stdout=${stdout} stderr=${stderr}`);
      if (error) {
        showToast({ style: Toast.Style.Failure, title: "Error", message: `${error.message} | stderr: ${stderr}` });
      } else {
        showToast({ style: Toast.Style.Success, title: `Ran: "${name}"`, message: cwd });
      }
    });
  } else {
    // Terminal commands (like `claude`) should open in a new terminal window
    const cdAndRun = `cd ${JSON.stringify(cwd)} && ${command}`;

    const script = `tell application "iTerm"
  activate
  if (count of windows) > 0 then
    tell first window
      create tab with default profile
      tell current session
        write text ${JSON.stringify(cdAndRun)}
      end tell
    end tell
  else
    set newWindow to (create window with default profile)
    tell current session of newWindow
      write text ${JSON.stringify(cdAndRun)}
    end tell
  end if
end tell`;

    execFile("osascript", ["-e", script], (error) => {
      if (error) {
        // Fallback: try Terminal.app
        const fallbackScript = `tell application "Terminal"
  activate
  do script ${JSON.stringify(cdAndRun)}
end tell`;
        execFile("osascript", ["-e", fallbackScript], (err2) => {
          if (err2) {
            showToast({ style: Toast.Style.Failure, title: "Error", message: err2.message });
          } else {
            showToast({ style: Toast.Style.Success, title: "Opened in Terminal", message: command });
          }
        });
      } else {
        showToast({ style: Toast.Style.Success, title: "Opened in iTerm", message: command });
      }
    });
  }
}
