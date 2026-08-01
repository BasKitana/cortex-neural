# Project Cortex

**Neural Codebase Analysis System**

Project Cortex is a local, read-only visual scanner that turns a Python project into an interactive glowing neural network. Select a project folder, analyze imports and relationships, and explore the “brain” of the codebase as a holographic graph.

![Screenshot placeholder](docs/screenshot-placeholder.png)

> *Add a screenshot of the neural graph view here after your first run.*

---

## Features

- Native folder selection (Tkinter dialog)
- Recursive Python file discovery with safe ignore rules
- AST-based import parsing and local import resolution
- Directed synaptic graph of file relationships (Cytoscape.js)
- Entry-point detection and importance scoring
- Possibly-disconnected file heuristics
- External dependency listing (kept off the main graph by default)
- Futuristic dark HUD interface with scan animation
- Click-to-inspect file identity panel
- Zoom, pan, drag, recenter
- Graceful handling of unreadable files, syntax errors, and large projects

---

## Installation

```bash
cd project-cortex
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

---

## How to run

**One-click (Windows):** double-click `run.bat`

That script creates `venv` if needed, installs requirements, and starts the app.

Or manually:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Your browser should open to [http://127.0.0.1:5000](http://127.0.0.1:5000).

1. Click **Select Project Folder**
2. Choose a local Python project
3. Click **Analyze Project**
4. Explore the neural network and click any neuron for details

**Tip:** If the folder dialog is unavailable in your environment, press `Ctrl+Shift+P` in the app and paste a folder path manually.

---

## Supported project type

- **Python projects only** (`.py` files)
- Local folders on the machine running the Flask server
- Typical layouts: apps, scripts, packages, Flask/Django-style trees

---

## Current limitations

- Single-language support (Python)
- Import resolution is heuristic; dynamic imports are not resolved
- Possibly-disconnected detection is a heuristic — verify before deleting anything
- Very large projects are capped at ~300 Python files
- Folder dialog requires a desktop session (Tkinter)
- Read-only: never modifies, deletes, or executes project code
- Circular imports are tolerated as normal directed edges

---

## Safety

Project Cortex is **read-only**. It inspects source files locally and never:

- Modifies or deletes files
- Executes project code
- Installs project dependencies
- Sends source code to external APIs

---

## Project structure

```text
project-cortex/
├── app.py
├── scanner.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── styles.css
    └── app.js
```

---

## Future improvements

1. Multi-language support (JavaScript, TypeScript, Go)
2. Export graph as PNG / SVG / JSON
3. Timeline view of dependency change across git history
4. Smarter role detection with lightweight pattern libraries
5. Optional 3D / WebGL neural rendering
6. Search and filter neurons by role, folder, or importance

---

## License

Personal / educational use. Built as a local engineering analysis tool.
