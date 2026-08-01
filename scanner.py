"""
Project Cortex — read-only Python project scanner.

Scans a local folder for .py files, parses imports with ast, resolves local
module relationships, and returns a graph-ready JSON structure.
"""

from __future__ import annotations

import ast
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

MAX_PYTHON_FILES = 300

IGNORED_DIRS = {
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "__pycache__",
    "node_modules",
    "venv",
    ".venv",
    "env",
    "dist",
    "build",
    "migrations",
    "site-packages",
}

ENTRY_POINT_NAMES = {
    "main.py",
    "app.py",
    "run.py",
    "server.py",
    "manage.py",
    "cli.py",
}

KNOWN_CONFIG_SETUP_NAMES = {
    "setup.py",
    "conftest.py",
    "settings.py",
    "config.py",
    "wsgi.py",
    "asgi.py",
    "__main__.py",
}

STDLIB_HINTS = {
    "os",
    "sys",
    "re",
    "json",
    "ast",
    "pathlib",
    "collections",
    "typing",
    "functools",
    "itertools",
    "datetime",
    "time",
    "math",
    "random",
    "logging",
    "subprocess",
    "threading",
    "multiprocessing",
    "asyncio",
    "http",
    "urllib",
    "email",
    "csv",
    "sqlite3",
    "hashlib",
    "hmac",
    "base64",
    "copy",
    "enum",
    "dataclasses",
    "abc",
    "contextlib",
    "tempfile",
    "shutil",
    "glob",
    "fnmatch",
    "traceback",
    "warnings",
    "inspect",
    "importlib",
    "pkgutil",
    "unittest",
    "doctest",
    "argparse",
    "configparser",
    "platform",
    "socket",
    "ssl",
    "struct",
    "io",
    "string",
    "textwrap",
    "pprint",
    "uuid",
    "queue",
    "signal",
    "ctypes",
    "gc",
    "weakref",
    "types",
    "operator",
    "statistics",
    "decimal",
    "fractions",
    "numbers",
    "array",
    "bisect",
    "heapq",
    "secrets",
    "gzip",
    "zipfile",
    "tarfile",
    "pickle",
    "shelve",
    "xml",
    "html",
    "webbrowser",
    "tkinter",
}


def scan_project(folder_path: str) -> dict[str, Any]:
    """Scan a Python project folder and return graph + statistics JSON."""
    warnings: list[str] = []
    root = Path(folder_path).expanduser().resolve()

    if not root.exists():
        return _error_result(str(folder_path), "Folder path does not exist.", warnings)
    if not root.is_dir():
        return _error_result(str(folder_path), "Path is not a directory.", warnings)

    try:
        py_files = _collect_python_files(root, warnings)
    except PermissionError:
        return _error_result(str(root), "Permission denied while scanning folder.", warnings)

    if not py_files:
        return {
            "success": True,
            "nodes": [],
            "edges": [],
            "external_dependencies": [],
            "statistics": _empty_stats(root),
            "warnings": warnings
            + ["No Python files found in the selected folder."],
            "error": None,
        }

    truncated = False
    if len(py_files) > MAX_PYTHON_FILES:
        py_files = py_files[:MAX_PYTHON_FILES]
        truncated = True
        warnings.append(
            f"Project exceeds {MAX_PYTHON_FILES} Python files. "
            f"Only the first {MAX_PYTHON_FILES} were analyzed."
        )

    module_index = _build_module_index(root, py_files)
    file_records: dict[str, dict[str, Any]] = {}
    external_deps: set[str] = set()
    edges: list[dict[str, str]] = []
    edge_keys: set[tuple[str, str]] = set()

    for path in py_files:
        rel = _rel_id(root, path)
        record = {
            "id": rel,
            "label": path.name,
            "relative_path": rel,
            "folder": _folder_of(rel),
            "extension": ".py",
            "line_count": 0,
            "import_count": 0,
            "incoming_connections": 0,
            "outgoing_connections": 0,
            "importance_score": 0,
            "is_entry_point": False,
            "is_isolated": False,
            "is_possibly_disconnected": False,
            "has_parse_error": False,
            "has_main_guard": False,
            "estimated_role": "Unknown",
            "local_imports": [],
            "external_imports": [],
            "warnings": [],
            "connected_files": [],
        }

        try:
            source = path.read_text(encoding="utf-8-sig", errors="replace")
        except PermissionError:
            record["has_parse_error"] = True
            record["warnings"].append("Permission denied reading file.")
            warnings.append(f"Permission denied: {rel}")
            file_records[rel] = record
            continue
        except OSError as exc:
            record["has_parse_error"] = True
            record["warnings"].append(f"Could not read file: {exc}")
            warnings.append(f"Unreadable file: {rel}")
            file_records[rel] = record
            continue

        record["line_count"] = source.count("\n") + (1 if source and not source.endswith("\n") else 0)
        if not source.strip():
            record["line_count"] = 0

        record["has_main_guard"] = _has_main_guard(source)

        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            record["has_parse_error"] = True
            msg = f"Syntax error near line {exc.lineno}: {exc.msg}"
            record["warnings"].append(msg)
            warnings.append(f"{rel}: {msg}")
            file_records[rel] = record
            continue

        imports = _extract_imports(tree)
        local_targets: list[str] = []
        external_for_file: list[str] = []

        for imported in imports:
            resolved = _resolve_import(imported, rel, module_index, root)
            if resolved and resolved != rel:
                local_targets.append(resolved)
                key = (rel, resolved)
                if key not in edge_keys:
                    edge_keys.add(key)
                    edges.append({"source": rel, "target": resolved, "type": "import"})
            else:
                top = imported.split(".")[0]
                if top and top not in STDLIB_HINTS and not top.startswith("_"):
                    # Only treat as external if not resolvable locally
                    if not _looks_local_package(top, module_index):
                        external_for_file.append(top)
                        external_deps.add(top)

        # Deduplicate while preserving order
        record["local_imports"] = list(dict.fromkeys(local_targets))
        record["external_imports"] = list(dict.fromkeys(external_for_file))
        record["import_count"] = len(record["local_imports"]) + len(record["external_imports"])
        file_records[rel] = record

    incoming: dict[str, int] = defaultdict(int)
    outgoing: dict[str, int] = defaultdict(int)
    neighbors: dict[str, set[str]] = defaultdict(set)

    for edge in edges:
        outgoing[edge["source"]] += 1
        incoming[edge["target"]] += 1
        neighbors[edge["source"]].add(edge["target"])
        neighbors[edge["target"]].add(edge["source"])

    for rel, record in file_records.items():
        record["incoming_connections"] = incoming.get(rel, 0)
        record["outgoing_connections"] = outgoing.get(rel, 0)
        record["connected_files"] = sorted(neighbors.get(rel, set()))
        record["is_entry_point"] = _is_entry_point(record)
        record["estimated_role"] = _estimate_role(record)
        record["importance_score"] = _importance(record)
        record["is_possibly_disconnected"] = _is_possibly_disconnected(record)
        record["is_isolated"] = (
            record["incoming_connections"] == 0 and record["outgoing_connections"] == 0
        )
        if record["is_possibly_disconnected"]:
            record["warnings"].append("Possibly disconnected — verify before deleting.")

    nodes = list(file_records.values())
    nodes.sort(key=lambda n: (-n["importance_score"], n["relative_path"]))

    stats = _build_statistics(root, nodes, edges, sorted(external_deps), truncated)
    return {
        "success": True,
        "nodes": nodes,
        "edges": edges,
        "external_dependencies": sorted(external_deps, key=str.lower),
        "statistics": stats,
        "warnings": warnings,
        "error": None,
    }


def _error_result(path: str, message: str, warnings: list[str]) -> dict[str, Any]:
    warnings = list(warnings) + [message]
    return {
        "success": False,
        "nodes": [],
        "edges": [],
        "external_dependencies": [],
        "statistics": {
            "project_name": Path(path).name or "unknown",
            "folder_path": path,
            "python_file_count": 0,
            "folder_count": 0,
            "local_connection_count": 0,
            "external_dependency_count": 0,
            "total_lines": 0,
            "entry_points": [],
            "possibly_disconnected_files": [],
            "largest_file": None,
            "most_connected_file": None,
            "truncated": False,
        },
        "warnings": warnings,
        "error": message,
    }


def _empty_stats(root: Path) -> dict[str, Any]:
    return {
        "project_name": root.name,
        "folder_path": str(root),
        "python_file_count": 0,
        "folder_count": 0,
        "local_connection_count": 0,
        "external_dependency_count": 0,
        "total_lines": 0,
        "entry_points": [],
        "possibly_disconnected_files": [],
        "largest_file": None,
        "most_connected_file": None,
        "truncated": False,
    }


def _collect_python_files(root: Path, warnings: list[str]) -> list[Path]:
    found: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune ignored / hidden directories in-place
        kept = []
        for name in dirnames:
            if name in IGNORED_DIRS:
                continue
            if name.startswith("."):
                continue
            kept.append(name)
        dirnames[:] = sorted(kept)

        for filename in sorted(filenames):
            if not filename.endswith(".py"):
                continue
            if filename.startswith(".") and filename != ".py":
                # skip hidden python files except weird edge case
                continue
            full = Path(dirpath) / filename
            try:
                if full.is_file():
                    found.append(full)
            except OSError:
                warnings.append(f"Skipped inaccessible path: {full}")
    found.sort(key=lambda p: str(p).lower())
    return found


def _rel_id(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _folder_of(rel: str) -> str:
    parent = Path(rel).parent.as_posix()
    return "." if parent in ("", ".") else parent


def _build_module_index(root: Path, py_files: list[Path]) -> dict[str, str]:
    """Map dotted module names and package paths to relative file ids."""
    index: dict[str, str] = {}
    for path in py_files:
        rel = _rel_id(root, path)
        parts = Path(rel).with_suffix("").parts
        if parts[-1] == "__init__":
            module = ".".join(parts[:-1])
            if module:
                index[module] = rel
                index["/".join(parts[:-1])] = rel
        else:
            module = ".".join(parts)
            index[module] = rel
            index["/".join(parts)] = rel
            # Also index bare filename-style package.module for nested cases
    return index


def _extract_imports(tree: ast.AST) -> list[str]:
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name:
                    modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                # Relative imports handled separately with module + level
                base = node.module or ""
                modules.append(("." * node.level) + base)
            elif node.module:
                modules.append(node.module)
                # Also try module.child for `from routes import users`
                for alias in node.names:
                    if alias.name and alias.name != "*":
                        modules.append(f"{node.module}.{alias.name}")
    return modules


def _resolve_import(
    imported: str,
    current_rel: str,
    module_index: dict[str, str],
    root: Path,
) -> str | None:
    # Relative import: .foo / ..bar
    if imported.startswith("."):
        level = 0
        while level < len(imported) and imported[level] == ".":
            level += 1
        remainder = imported[level:]
        current_parts = list(Path(current_rel).parts[:-1])  # package of current file
        if level > len(current_parts) + 1:
            return None
        # PEP 328: level 1 = current package
        up = level - 1
        base_parts = current_parts[: len(current_parts) - up] if up else current_parts
        if remainder:
            candidate_parts = base_parts + remainder.split(".")
        else:
            candidate_parts = base_parts
        return _lookup_parts(candidate_parts, module_index)

    # Absolute
    parts = imported.split(".")
    # Try progressively shorter prefixes: a.b.c -> a.b.c, a.b, a
    for end in range(len(parts), 0, -1):
        hit = _lookup_parts(parts[:end], module_index)
        if hit:
            return hit
    return None


def _lookup_parts(parts: list[str], module_index: dict[str, str]) -> str | None:
    if not parts:
        return None
    dotted = ".".join(parts)
    if dotted in module_index:
        return module_index[dotted]
    slashed = "/".join(parts)
    if slashed in module_index:
        return module_index[slashed]
    # file.py style
    as_file = slashed + ".py"
    for key, value in module_index.items():
        if value == as_file or key == as_file.replace(".py", "").replace("/", "."):
            return value
    # package/__init__.py
    init_path = slashed + "/__init__.py"
    for value in module_index.values():
        if value == init_path:
            return value
    return None


def _looks_local_package(top: str, module_index: dict[str, str]) -> bool:
    if top in module_index:
        return True
    prefix = top + "."
    return any(key.startswith(prefix) for key in module_index)


def _has_main_guard(source: str) -> bool:
    # Lightweight string check is fine; also covered conceptually by AST if needed
    return '__name__' in source and '__main__' in source and '==' in source


def _is_entry_point(record: dict[str, Any]) -> bool:
    name = record["label"].lower()
    if name in ENTRY_POINT_NAMES:
        return True
    if record.get("has_main_guard"):
        return True
    # High fan-out local importer heuristic
    if record.get("outgoing_connections", 0) >= 5:
        return True
    return False


def _estimate_role(record: dict[str, Any]) -> str:
    name = record["label"].lower()
    folder = record["folder"].lower()
    folder_parts = folder.replace("\\", "/").split("/")

    if record["is_entry_point"] or name in ENTRY_POINT_NAMES:
        return "Application entry point"
    if name.startswith("test_") or name.endswith("_test.py") or "tests" in folder_parts or folder_parts[-1] == "test":
        return "Test"
    if name in KNOWN_CONFIG_SETUP_NAMES or "config" in name or "settings" in name:
        return "Configuration"
    if any(p in ("routes", "controllers", "views", "api", "endpoints") for p in folder_parts):
        return "Route or controller"
    if any(p in ("models", "model", "schemas", "entities") for p in folder_parts):
        return "Database model"
    if any(p in ("services", "service") for p in folder_parts):
        return "Service"
    if any(p in ("utils", "util", "helpers", "common", "lib") for p in folder_parts):
        return "Utility"
    if any(p in ("templates", "static", "ui", "frontend", "components") for p in folder_parts):
        return "UI component"
    if name in ("setup.py",) or folder == ".":
        # top-level scripts often
        if record.get("has_main_guard"):
            return "Script"
    if record.get("has_main_guard"):
        return "Script"
    return "Unknown"


def _importance(record: dict[str, Any]) -> float:
    score = (
        record["incoming_connections"] * 3
        + record["outgoing_connections"] * 2
        + min(record["line_count"] / 50, 5)
        + (10 if record["is_entry_point"] else 0)
    )
    return round(score, 2)


def _is_possibly_disconnected(record: dict[str, Any]) -> bool:
    name = record["label"].lower()
    if record["incoming_connections"] > 0:
        return False
    if record["is_entry_point"]:
        return False
    if name == "__init__.py":
        return False
    if name.startswith("test_") or name.endswith("_test.py") or "test" in record["folder"].lower():
        return False
    if name in KNOWN_CONFIG_SETUP_NAMES:
        return False
    return True


def _build_statistics(
    root: Path,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, str]],
    external_deps: list[str],
    truncated: bool,
) -> dict[str, Any]:
    folders = {n["folder"] for n in nodes if n["folder"] != "."}
    # Count unique folder paths including nested parents
    all_folders: set[str] = set()
    for folder in folders:
        parts = folder.split("/")
        for i in range(len(parts)):
            all_folders.add("/".join(parts[: i + 1]))

    entry_points = [n["relative_path"] for n in nodes if n["is_entry_point"]]
    disconnected = [n["relative_path"] for n in nodes if n["is_possibly_disconnected"]]

    largest = None
    if nodes:
        largest_node = max(nodes, key=lambda n: n["line_count"])
        largest = {
            "path": largest_node["relative_path"],
            "line_count": largest_node["line_count"],
        }

    most_connected = None
    if nodes:
        best = max(
            nodes,
            key=lambda n: n["incoming_connections"] + n["outgoing_connections"],
        )
        most_connected = {
            "path": best["relative_path"],
            "connections": best["incoming_connections"] + best["outgoing_connections"],
        }

    return {
        "project_name": root.name,
        "folder_path": str(root),
        "python_file_count": len(nodes),
        "folder_count": len(all_folders),
        "local_connection_count": len(edges),
        "external_dependency_count": len(external_deps),
        "total_lines": sum(n["line_count"] for n in nodes),
        "entry_points": entry_points,
        "possibly_disconnected_files": disconnected,
        "largest_file": largest,
        "most_connected_file": most_connected,
        "truncated": truncated,
    }
