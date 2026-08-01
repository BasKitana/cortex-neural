# Cortex Neural

**Project Cortex — Neural Codebase Analysis System**

Turn a local Python project into an interactive glowing neural network.

Cortex scans your folder, maps imports and relationships, and lets you explore the “brain” of the codebase — folders first, then drill into files.

![Screenshot placeholder](docs/screenshot-placeholder.png)

> Drop a real screenshot here when you have one (`docs/screenshot-placeholder.png`).

---

## What it does

1. You select a Python project folder
2. Cortex analyzes `.py` files, imports, entry points, and connections
3. The project appears as a neural graph
4. Double-click a folder to open what’s inside and remap connections
5. Click any file neuron to inspect details

Everything runs **locally**. Read-only. No cloud. No account.

---

## Features

- One-click Windows launcher (`run.bat` / desktop **CORTEX** shortcut)
- Native folder picker (Tkinter)
- AST-based import parsing + local import resolution
- Folder-first neural graph with drill-down navigation
- File neurons sized by importance
- Entry-point highlighting
- Possibly-disconnected file heuristics
- External dependencies listed separately (optional on-graph toggle)
- Futuristic dark HUD UI + short scan animation
- Zoom, pan, drag, recenter
- Safe ignore rules (`venv`, `__pycache__`, `.git`, etc.)
- Soft cap ~300 Python files so huge repos don’t freeze

---

## Quick start (Windows)

### Option A — one click

Double-click **`run.bat`**  
or use the desktop / Start Menu shortcut named **CORTEX**.

### Option B — terminal

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Browser opens to [http://127.0.0.1:5000](http://127.0.0.1:5000).

Then:

1. **Select Project Folder**
2. **Analyze Project**
3. Explore the graph
4. **Double-click a folder** to open it
5. Use **Up One Level**, breadcrumb, or Backspace to go back

Tip: `Ctrl+Shift+P` lets you paste a folder path if the dialog fails.

---

## Requirements

- Python 3
- Windows recommended for the folder dialog + `run.bat`
- Flask (installed via `requirements.txt`)
- Cytoscape.js loaded from CDN in the browser

---

## Project structure

```text
cortex-neural/
├── app.py              # Flask server + folder dialog
├── scanner.py          # AST scan, imports, graph JSON
├── requirements.txt
├── run.bat             # One-click launcher
├── README.md
├── templates/
│   └── index.html
├── static/
│   ├── styles.css
│   └── app.js
└── sample_project/     # Tiny demo project for testing
```

---

## How analysis works

| Piece | Behavior |
| --- | --- |
| Files | Each `.py` file becomes a neuron |
| Imports | `import` / `from ... import` parsed with `ast` |
| Local links | Resolved to project files when possible |
| External packages | Flask, requests, etc. listed separately |
| Entry points | `__main__` guards + names like `app.py`, `main.py` |
| Importance | Incoming/outgoing links + size + entry bonus |
| Folders | Aggregated at each view level; double-click drills in |

---

## Safety

Cortex is **read-only**. It never:

- Modifies or deletes your code
- Executes project code
- Installs the scanned project’s dependencies
- Sends source code to any external API

---

## Limitations

- Python only
- Dynamic imports are not resolved
- “Possibly disconnected” is a heuristic — verify before deleting
- Large projects capped around 300 files
- Folder dialog needs a desktop session

---

## Sample project

Use `sample_project/` to try the graph quickly after launch.

---

## Future ideas

1. Export graph (PNG / SVG / JSON)
2. Search and filter by role / folder / importance
3. Multi-language support (JS/TS/Go)
4. Git-history dependency timeline
5. Custom CORTEX app icon

---

## License

Personal / educational use.
