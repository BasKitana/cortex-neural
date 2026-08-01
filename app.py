"""
Project Cortex — local Flask server.

Read-only neural codebase analysis for Python projects.
"""

from __future__ import annotations

import os
import threading
import webbrowser

from flask import Flask, jsonify, render_template, request

from scanner import scan_project

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/select-folder")
def select_folder():
    """Open a native folder dialog on the server machine and return the path."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except tk.TclError:
            pass
        root.update_idletasks()
        path = filedialog.askdirectory(parent=root, title="Select Python Project Folder")
        root.destroy()

        if not path:
            return jsonify({"success": False, "path": None, "error": "No folder selected."})

        return jsonify({"success": True, "path": path, "error": None})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"success": False, "path": None, "error": str(exc)}), 500


@app.post("/scan")
def scan():
    data = request.get_json(silent=True) or {}
    folder_path = (data.get("folder_path") or "").strip()

    if not folder_path:
        return jsonify(
            {
                "success": False,
                "nodes": [],
                "edges": [],
                "external_dependencies": [],
                "statistics": {},
                "warnings": ["No folder path provided."],
                "error": "No folder path provided.",
            }
        ), 400

    try:
        result = scan_project(folder_path)
        status = 200 if result.get("success") else 400
        return jsonify(result), status
    except Exception as exc:  # noqa: BLE001 — never crash the API
        return jsonify(
            {
                "success": False,
                "nodes": [],
                "edges": [],
                "external_dependencies": [],
                "statistics": {},
                "warnings": [str(exc)],
                "error": f"Scan failed: {exc}",
            }
        ), 500


if __name__ == "__main__":
    # Open browser once the server is about to listen.
    # With debug=True, only the reloader child should open the browser.
    debug = True
    if debug:
        if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    else:
        threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:5000")).start()

    app.run(host="127.0.0.1", port=5000, debug=debug, use_reloader=True)
