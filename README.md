# Project Launcher (Raycast Extension)

A Raycast extension for quickly navigating to project folders and running common commands. Configure your projects and actions in a single YAML file, then launch anything in a few keystrokes.

## How it works

You define your projects and actions in a `config.yaml` file. Each project has a path and optional project-specific actions. Global actions (like "Open in VS Code") are available for every project.

When you open the extension, you get a searchable list of projects sorted by recent use. Select a project to see its available actions, then run one.

### Example config

```yaml
globalActions:
  - name: Open in VS Code
    command: code .
    icon: 💻
  - name: Open in Terminal
    command: open -a iTerm .
    icon: 🖥️

projects:
  - id: my-api
    name: My API
    path: ~/Projects/my-api
    icon: 🚀
    actions:
      - name: Run Dev Server
        command: make run
        icon: 🛠️
        terminal: true

  - id: my-site
    name: My Website
    path: ~/Projects/my-site
    icon: 🌐
```

### Parameterized actions

Actions can include parameters that prompt for input before running:

```yaml
actions:
  - name: Run Migration
    command: ./migrate --target {{env}} {{dry_run}}
    icon: 🗃️
    terminal: true
    params:
      - id: env
        name: Environment
        type: string
        options:
          - dev
          - prod
        default: dev
        required: true
      - id: dry_run
        name: Dry Run?
        type: bool
        flag: --dry-run
```

## Setup

Clone the repo and install dependencies:

```bash
git clone https://github.com/ben-tanen/project-launcher-raycast.git
cd project-launcher-raycast
npm install
```

Build and import into Raycast:

```bash
npm run build
```

Then open Raycast, go to **Extensions > +** (or search "Import Extension"), and point it to the cloned directory.

Alternatively, run `npm run dev` to load it in development mode with hot reload.

## Configuration

The config file is created automatically the first time you run the extension. You can open it from within the extension using `Cmd+Shift+,`. It lives at:

```
~/Library/Application Support/com.raycast.macos/extensions/project-launcher/config.yaml
```
