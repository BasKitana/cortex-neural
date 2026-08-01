/* Project Cortex — frontend controller (folder drill-down graph) */

(() => {
  "use strict";

  const SCAN_MESSAGES = [
    "INITIALIZING PROJECT SCAN",
    "MAPPING FILE STRUCTURE",
    "ANALYZING IMPORTS",
    "LOCATING ENTRY POINTS",
    "BUILDING SYNAPTIC NETWORK",
    "CALCULATING FILE IMPORTANCE",
    "ANALYSIS COMPLETE",
  ];

  const FOLDER_COLORS = [
    "#3aa0ff",
    "#2ec4ff",
    "#5b8cff",
    "#4db8ff",
    "#6aa8e8",
    "#3d7fd4",
    "#58c4e8",
    "#7aa2ff",
  ];

  const state = {
    folderPath: null,
    scanData: null,
    cy: null,
    nodeMap: new Map(),
    folderMeta: new Map(),
    viewPath: "",
    particleTimer: null,
  };

  const el = {
    folderPath: document.getElementById("folder-path"),
    btnSelect: document.getElementById("btn-select"),
    btnAnalyze: document.getElementById("btn-analyze"),
    btnUp: document.getElementById("btn-up"),
    btnRecenter: document.getElementById("btn-recenter"),
    btnReset: document.getElementById("btn-reset"),
    toggleExternal: document.getElementById("toggle-external"),
    scanStatus: document.getElementById("scan-status"),
    statsList: document.getElementById("stats-list"),
    externalTags: document.getElementById("external-tags"),
    warningsSection: document.getElementById("warnings-section"),
    warningsList: document.getElementById("warnings-list"),
    cyRoot: document.getElementById("cy"),
    vizEmpty: document.getElementById("viz-empty"),
    viewBar: document.getElementById("view-bar"),
    breadcrumb: document.getElementById("breadcrumb"),
    inspectHeading: document.getElementById("inspect-heading"),
    inspectEmpty: document.getElementById("inspect-empty"),
    inspectBody: document.getElementById("inspect-body"),
    inspectList: document.getElementById("inspect-list"),
    connectedList: document.getElementById("connected-list"),
    overlay: document.getElementById("scan-overlay"),
    overlayMessage: document.getElementById("overlay-message"),
    progressFill: document.getElementById("progress-fill"),
    overlayPercent: document.getElementById("overlay-percent"),
  };

  function setStatus(text) {
    el.scanStatus.textContent = text;
  }

  function setFolderPath(path) {
    state.folderPath = path;
    el.folderPath.textContent = path || "No project selected";
    el.folderPath.title = path || "No project selected";
    el.btnAnalyze.disabled = !path;
  }

  function normalizeView(viewPath) {
    if (!viewPath || viewPath === "." || viewPath === "/") return "";
    return String(viewPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function folderColor(folder) {
    let hash = 0;
    const key = folder || ".";
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return FOLDER_COLORS[hash % FOLDER_COLORS.length];
  }

  function nodeSize(importance) {
    return Math.max(24, Math.min(70, 24 + importance * 2.2));
  }

  async function selectFolder() {
    setStatus("Opening folder dialog…");
    el.btnSelect.disabled = true;
    try {
      const res = await fetch("/select-folder", { method: "POST" });
      const data = await res.json();
      if (data.success && data.path) {
        setFolderPath(data.path);
        setStatus("Folder selected — ready to analyze");
      } else {
        setStatus(data.error || "No folder selected");
      }
    } catch (err) {
      setStatus("Folder selection failed");
      console.error(err);
    } finally {
      el.btnSelect.disabled = false;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runScanAnimation(totalMs = 2400) {
    el.overlay.hidden = false;
    const steps = SCAN_MESSAGES.length;
    const stepMs = totalMs / steps;
    for (let i = 0; i < steps; i += 1) {
      el.overlayMessage.textContent = SCAN_MESSAGES[i];
      const pct = Math.round(((i + 1) / steps) * 100);
      el.progressFill.style.width = `${pct}%`;
      el.overlayPercent.textContent = `${pct}%`;
      await sleep(stepMs);
    }
  }

  async function analyzeProject() {
    if (!state.folderPath) return;

    el.btnAnalyze.disabled = true;
    el.btnSelect.disabled = true;
    setStatus("Scanning project…");

    const animPromise = runScanAnimation(2400);

    let data;
    try {
      const res = await fetch("/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: state.folderPath }),
      });
      data = await res.json();
    } catch (err) {
      console.error(err);
      await animPromise;
      el.overlay.hidden = true;
      setStatus("Scan request failed");
      el.btnAnalyze.disabled = false;
      el.btnSelect.disabled = false;
      return;
    }

    await animPromise;
    el.overlay.hidden = true;
    el.btnSelect.disabled = false;
    el.btnAnalyze.disabled = false;

    if (!data || (data.error && (!data.nodes || !data.nodes.length) && !data.success)) {
      setStatus(data.error || "Scan failed");
      renderWarnings(data.warnings || [data.error || "Scan failed"]);
      return;
    }

    state.scanData = data;
    state.nodeMap = new Map((data.nodes || []).map((n) => [n.id, n]));
    state.viewPath = "";
    renderStats(data.statistics || {});
    renderExternal(data.external_dependencies || []);
    renderWarnings(data.warnings || []);
    renderGraph();
    setStatus(
      data.nodes && data.nodes.length
        ? `Analysis complete — ${data.nodes.length} files mapped`
        : "No Python files found"
    );
  }

  function renderStats(stats) {
    const rows = [
      ["Project", stats.project_name || "—"],
      ["Python files", stats.python_file_count ?? "—"],
      ["Folders", stats.folder_count ?? "—"],
      ["Local links", stats.local_connection_count ?? "—"],
      ["External deps", stats.external_dependency_count ?? "—"],
      ["Total lines", stats.total_lines ?? "—"],
      [
        "Entry points",
        Array.isArray(stats.entry_points) && stats.entry_points.length
          ? stats.entry_points.length
          : "0",
      ],
      [
        "Largest file",
        stats.largest_file
          ? `${stats.largest_file.path} (${stats.largest_file.line_count})`
          : "—",
      ],
      [
        "Most connected",
        stats.most_connected_file
          ? `${stats.most_connected_file.path} (${stats.most_connected_file.connections})`
          : "—",
      ],
    ];

    el.statsList.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="stat-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`
      )
      .join("");
  }

  function renderExternal(deps) {
    if (!deps.length) {
      el.externalTags.innerHTML = '<span class="muted">None detected</span>';
      return;
    }
    el.externalTags.innerHTML = deps
      .map((d) => `<span class="tag">${escapeHtml(d)}</span>`)
      .join("");
  }

  function renderWarnings(warnings) {
    if (!warnings || !warnings.length) {
      el.warningsSection.hidden = true;
      el.warningsList.innerHTML = "";
      return;
    }
    el.warningsSection.hidden = false;
    el.warningsList.innerHTML = warnings
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join("");
  }

  /**
   * Map a file path to the visible neuron id at the current view level.
   * Folders become dir:<path>; files stay as relative paths.
   */
  function resolveVisible(fileRelPath, viewPath) {
    const v = normalizeView(viewPath);
    const parts = String(fileRelPath).replace(/\\/g, "/").split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

    if (!v) {
      if (!folder) {
        return { type: "file", id: fileRelPath, folderPath: "" };
      }
      const top = folder.split("/")[0];
      return { type: "folder", id: `dir:${top}`, folderPath: top };
    }

    const under =
      folder === v ||
      folder.startsWith(`${v}/`) ||
      fileRelPath === v ||
      fileRelPath.startsWith(`${v}/`);

    if (!under) return null;

    if (folder === v) {
      return { type: "file", id: fileRelPath, folderPath: v };
    }

    if (folder.startsWith(`${v}/`)) {
      const child = folder.slice(v.length + 1).split("/")[0];
      const childPath = `${v}/${child}`;
      return { type: "folder", id: `dir:${childPath}`, folderPath: childPath };
    }

    return null;
  }

  function displayName(folderPath) {
    if (!folderPath) return "root";
    const parts = folderPath.split("/");
    return parts[parts.length - 1];
  }

  function buildViewModel(data, viewPath) {
    const v = normalizeView(viewPath);
    const folderAgg = new Map();
    const fileNodes = [];
    const visibleIds = new Set();

    (data.nodes || []).forEach((n) => {
      const mapped = resolveVisible(n.id, v);
      if (!mapped) return;

      if (mapped.type === "file") {
        fileNodes.push(n);
        visibleIds.add(n.id);
        return;
      }

      let agg = folderAgg.get(mapped.folderPath);
      if (!agg) {
        agg = {
          type: "folder",
          id: mapped.id,
          folderPath: mapped.folderPath,
          label: displayName(mapped.folderPath),
          file_count: 0,
          line_count: 0,
          importance_score: 0,
          has_entry_point: false,
          has_parse_error: false,
          has_disconnected: false,
          files: [],
          external_imports: new Set(),
        };
        folderAgg.set(mapped.folderPath, agg);
      }
      agg.file_count += 1;
      agg.line_count += n.line_count || 0;
      agg.importance_score += n.importance_score || 0;
      if (n.is_entry_point) agg.has_entry_point = true;
      if (n.has_parse_error) agg.has_parse_error = true;
      if (n.is_possibly_disconnected) agg.has_disconnected = true;
      agg.files.push(n.id);
      (n.external_imports || []).forEach((dep) => agg.external_imports.add(dep));
      visibleIds.add(mapped.id);
    });

    // Aggregate edges between visible neurons.
    // Cross-boundary imports attach to an OUTSIDE node when drilled in.
    const edgeMap = new Map();
    const incoming = new Map();
    const outgoing = new Map();
    const neighbors = new Map();
    let outsideUsed = false;
    const OUTSIDE_ID = "dir:__outside__";

    function bump(map, key, amount = 1) {
      map.set(key, (map.get(key) || 0) + amount);
    }

    function addNeighbor(a, b) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }

    function addEdge(srcId, tgtId) {
      if (srcId === tgtId) return;
      const key = `${srcId}->${tgtId}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          source: srcId,
          target: tgtId,
          weight: 0,
          type: "import",
        });
      }
      edgeMap.get(key).weight += 1;
      bump(outgoing, srcId);
      bump(incoming, tgtId);
      addNeighbor(srcId, tgtId);
    }

    (data.edges || []).forEach((e) => {
      const src = resolveVisible(e.source, v);
      const tgt = resolveVisible(e.target, v);

      if (src && tgt) {
        addEdge(src.id, tgt.id);
        return;
      }

      // Only show OUTSIDE portal when drilled into a folder
      if (!v) return;

      if (src && !tgt) {
        outsideUsed = true;
        addEdge(src.id, OUTSIDE_ID);
      } else if (!src && tgt) {
        outsideUsed = true;
        addEdge(OUTSIDE_ID, tgt.id);
      }
    });

    if (outsideUsed) {
      folderAgg.set("__outside__", {
        type: "folder",
        id: OUTSIDE_ID,
        folderPath: "",
        label: "OUTSIDE",
        file_count: 0,
        line_count: 0,
        importance_score: 8,
        has_entry_point: false,
        has_parse_error: false,
        has_disconnected: false,
        files: [],
        external_imports: new Set(),
        isOutside: true,
      });
      visibleIds.add(OUTSIDE_ID);
    }

    const folderNodes = Array.from(folderAgg.values()).map((f) => {
      const imp = Math.round(f.importance_score * 10) / 10;
      return {
        ...f,
        external_imports: Array.from(f.external_imports),
        importance_score: imp,
        incoming_connections: incoming.get(f.id) || 0,
        outgoing_connections: outgoing.get(f.id) || 0,
        connected: Array.from(neighbors.get(f.id) || []),
        size: nodeSize(Math.max(imp / Math.max(f.file_count, 1), f.file_count * 2)),
      };
    });

    const files = fileNodes.map((n) => ({
      ...n,
      type: "file",
      incoming_connections: incoming.has(n.id)
        ? incoming.get(n.id)
        : n.incoming_connections,
      outgoing_connections: outgoing.has(n.id)
        ? outgoing.get(n.id)
        : n.outgoing_connections,
      connected: Array.from(neighbors.get(n.id) || n.connected_files || []),
      size: nodeSize(n.importance_score || 0),
    }));

    // Prefer view-level connection counts for files when aggregation applied
    files.forEach((n) => {
      if (incoming.has(n.id)) n.incoming_connections = incoming.get(n.id);
      if (outgoing.has(n.id)) n.outgoing_connections = outgoing.get(n.id);
    });

    return {
      folders: folderNodes,
      files,
      edges: Array.from(edgeMap.values()),
      neighbors,
    };
  }

  function buildElements(data) {
    const view = buildViewModel(data, state.viewPath);
    state.folderMeta = new Map(view.folders.map((f) => [f.id, f]));

    const elements = [];

    view.folders.forEach((f) => {
      let kind = "folder";
      if (f.isOutside) kind = "folder outside";
      else if (f.has_parse_error) kind = "folder error";
      else if (f.has_entry_point) kind = "folder entry";
      elements.push({
        group: "nodes",
        data: {
          id: f.id,
          label: f.label,
          kind: "folder",
          folderPath: f.folderPath,
          size: f.isOutside ? 42 : f.size,
          importance: f.importance_score,
          isOutside: !!f.isOutside,
        },
        classes: kind,
      });
    });

    view.files.forEach((n) => {
      let kind = "normal";
      if (n.has_parse_error) kind = "error";
      else if (n.is_entry_point) kind = "entry";
      else if (n.is_possibly_disconnected) kind = "disconnected";

      elements.push({
        group: "nodes",
        data: {
          id: n.id,
          label: n.label,
          kind: "file",
          folder: n.folder || ".",
          size: n.size,
          importance: n.importance_score || 0,
        },
        classes: kind,
      });
    });

    view.edges.forEach((e, idx) => {
      elements.push({
        group: "edges",
        data: {
          id: `e-${idx}-${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
          weight: e.weight || 1,
        },
      });
    });

    if (el.toggleExternal.checked && data.external_dependencies) {
      const visibleFileIds = new Set(view.files.map((f) => f.id));
      const folderFiles = new Map(
        view.folders.map((f) => [f.id, new Set(f.files)])
      );

      data.external_dependencies.forEach((dep) => {
        const id = `ext:${dep}`;
        let used = false;

        (data.nodes || []).forEach((n) => {
          if (!(n.external_imports || []).includes(dep)) return;
          const mapped = resolveVisible(n.id, state.viewPath);
          if (!mapped) return;

          if (!used) {
            elements.push({
              group: "nodes",
              data: {
                id,
                label: dep,
                kind: "external",
                size: 18,
              },
              classes: "external",
            });
            used = true;
          }

          elements.push({
            group: "edges",
            data: {
              id: `ext-e-${mapped.id}-${dep}`,
              source: mapped.id,
              target: id,
            },
            classes: "external-edge",
          });
          void visibleFileIds;
          void folderFiles;
        });
      });
    }

    return { elements, view };
  }

  function graphStylesheet() {
    return [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "text-valign": "bottom",
          "text-halign": "center",
          "font-family": "IBM Plex Mono, monospace",
          "font-size": 10,
          color: "#9eb6cc",
          "text-margin-y": 8,
          "background-color": "#3aa0ff",
          "border-width": 2,
          "border-color": "#6ec8ff",
          width: "data(size)",
          height: "data(size)",
          "z-index": 10,
        },
      },
      {
        selector: "node.folder",
        style: {
          shape: "round-rectangle",
          "background-color": "#149a9a",
          "border-color": "#1ec8c8",
          "border-width": 3,
          color: "#9ff6f0",
          "font-family": "Orbitron, sans-serif",
          "font-size": 11,
          "text-margin-y": 10,
          "shadow-blur": 16,
          "shadow-color": "#1ec8c8",
          "shadow-opacity": 0.7,
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,
        },
      },
      {
        selector: "node.folder.entry",
        style: {
          "background-color": "#c9a227",
          "border-color": "#ffe08a",
          color: "#ffe8a8",
          "shadow-color": "#e0b44a",
        },
      },
      {
        selector: "node.folder.outside",
        style: {
          shape: "diamond",
          "background-color": "#2a3344",
          "border-color": "#7f93a8",
          "border-style": "dashed",
          color: "#9eb6cc",
          "shadow-opacity": 0.2,
        },
      },
      {
        selector: "node.entry",
        style: {
          "background-color": "#e0b44a",
          "border-color": "#ffe08a",
          "border-width": 3,
          color: "#ffe8a8",
          "shadow-blur": 20,
          "shadow-color": "#e0b44a",
          "shadow-opacity": 0.85,
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,
        },
      },
      {
        selector: "node.disconnected",
        style: {
          "background-color": "#4a3f60",
          "border-color": "#9a88c0",
          "border-style": "dashed",
          "border-width": 2,
          opacity: 0.75,
          color: "#b5a6d4",
        },
      },
      {
        selector: "node.error",
        style: {
          "background-color": "#7a2030",
          "border-color": "#ff4d5a",
          "border-width": 3,
          color: "#ffb0b6",
        },
      },
      {
        selector: "node.external",
        style: {
          shape: "round-rectangle",
          width: 44,
          height: 24,
          "background-color": "#123048",
          "border-color": "#00d4ff",
          "border-width": 1,
          "font-size": 8,
          color: "#00d4ff",
        },
      },
      {
        selector: "edge",
        style: {
          width: "mapData(weight, 1, 8, 1.5, 4)",
          "line-color": "rgba(58, 160, 255, 0.55)",
          "target-arrow-color": "rgba(58, 160, 255, 0.85)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.9,
          opacity: 0.85,
        },
      },
      {
        selector: "edge.external-edge",
        style: {
          "line-style": "dashed",
          "line-color": "rgba(0, 212, 255, 0.25)",
          "target-arrow-color": "rgba(0, 212, 255, 0.35)",
          width: 1,
        },
      },
      {
        selector: "node.dimmed",
        style: { opacity: 0.18 },
      },
      {
        selector: "edge.dimmed",
        style: { opacity: 0.08 },
      },
      {
        selector: "node.highlight",
        style: {
          "border-width": 4,
          "border-color": "#ffffff",
          "z-index": 999,
        },
      },
      {
        selector: "edge.highlight",
        style: {
          width: 3,
          "line-color": "#00d4ff",
          "target-arrow-color": "#00d4ff",
          opacity: 1,
          "z-index": 998,
        },
      },
    ];
  }

  function applyFileTints(cy) {
    cy.nodes(".normal, .entry, .disconnected, .error").forEach((node) => {
      if (node.hasClass("entry") || node.hasClass("error") || node.hasClass("disconnected")) {
        return;
      }
      const color = folderColor(node.data("folder"));
      node.style({
        "background-color": color,
        "border-color": color,
      });
    });
  }

  function updateBreadcrumb() {
    const v = normalizeView(state.viewPath);
    el.viewBar.hidden = !state.scanData;
    el.btnUp.disabled = !v;

    const parts = v ? v.split("/") : [];
    let html = `<button type="button" data-path="" class="${v ? "" : "current"}">PROJECT</button>`;
    let acc = "";
    parts.forEach((part, idx) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLast = idx === parts.length - 1;
      html += `<span class="sep">/</span>`;
      html += `<button type="button" data-path="${escapeAttr(acc)}" class="${isLast ? "current" : ""}">${escapeHtml(part)}</button>`;
    });
    el.breadcrumb.innerHTML = html;
    el.breadcrumb.querySelectorAll("button[data-path]").forEach((btn) => {
      if (btn.classList.contains("current")) return;
      btn.addEventListener("click", () => {
        openView(btn.getAttribute("data-path") || "");
      });
    });
  }

  function openView(path) {
    state.viewPath = normalizeView(path);
    clearInspection();
    renderGraph();
    const label = state.viewPath || "project root";
    setStatus(`Viewing ${label}`);
  }

  function goUp() {
    const v = normalizeView(state.viewPath);
    if (!v) return;
    const parts = v.split("/");
    parts.pop();
    openView(parts.join("/"));
  }

  function renderGraph() {
    const data = state.scanData;
    if (!data) return;

    if (typeof cytoscape === "undefined") {
      setStatus("Cytoscape failed to load");
      return;
    }

    el.vizEmpty.classList.add("hidden");
    el.cyRoot.classList.remove("visible");
    updateBreadcrumb();

    if (state.cy) {
      state.cy.destroy();
      state.cy = null;
    }
    stopParticles();

    const { elements, view } = buildElements(data);
    if (!view.folders.length && !view.files.length) {
      el.vizEmpty.classList.remove("hidden");
      el.btnRecenter.disabled = true;
      clearInspection();
      return;
    }

    state.cy = cytoscape({
      container: el.cyRoot,
      elements,
      style: graphStylesheet(),
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 650,
        fit: true,
        padding: 50,
        nodeRepulsion: 12000,
        idealEdgeLength: 120,
        gravity: 0.2,
        numIter: 1400,
        randomize: true,
      },
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
    });

    applyFileTints(state.cy);
    el.btnRecenter.disabled = false;

    requestAnimationFrame(() => {
      el.cyRoot.classList.add("visible");
    });

    state.cy.on("tap", "node", (evt) => {
      const node = evt.target;
      if (node.hasClass("external")) {
        clearHighlight();
        return;
      }
      if (node.hasClass("folder")) {
        selectFolderNode(node.id());
        return;
      }
      selectFileNode(node.id());
    });

    state.cy.on("dbltap", "node.folder", (evt) => {
      if (evt.originalEvent) evt.originalEvent.preventDefault();
      if (evt.target.data("isOutside")) return;
      const folderPath = evt.target.data("folderPath");
      if (folderPath) openView(folderPath);
    });

    state.cy.on("tap", (evt) => {
      if (evt.target === state.cy) {
        clearHighlight();
        clearInspection();
      }
    });

    startParticles();
  }

  function highlightNode(id) {
    if (!state.cy) return;
    const node = state.cy.getElementById(id);
    if (!node || node.empty()) return;
    clearHighlight();
    const neighborhood = node.closedNeighborhood();
    state.cy.elements().addClass("dimmed");
    neighborhood.removeClass("dimmed");
    node.addClass("highlight");
    node.connectedEdges().addClass("highlight");
    neighborhood.nodes().addClass("highlight");
  }

  function selectFileNode(id) {
    const record = state.nodeMap.get(id);
    if (!record) return;
    highlightNode(id);
    showFileInspection(record);
  }

  function selectFolderNode(id) {
    const meta = state.folderMeta.get(id);
    if (!meta) return;
    highlightNode(id);
    showFolderInspection(meta);
  }

  function clearHighlight() {
    if (!state.cy) return;
    state.cy.elements().removeClass("dimmed highlight");
  }

  function clearInspection() {
    el.inspectEmpty.hidden = false;
    el.inspectBody.hidden = true;
    el.inspectList.innerHTML = "";
    el.connectedList.innerHTML = "";
    if (el.inspectHeading) el.inspectHeading.textContent = "IDENTITY";
  }

  function showFileInspection(n) {
    el.inspectEmpty.hidden = true;
    el.inspectBody.hidden = false;
    if (el.inspectHeading) el.inspectHeading.textContent = "FILE IDENTITY";

    const roleNote = `${n.estimated_role || "Unknown"} (estimated)`;
    let badges = "";
    if (n.is_entry_point) badges += '<span class="badge entry">ENTRY POINT</span> ';
    if (n.is_possibly_disconnected) {
      badges += '<span class="badge dim">POSSIBLY DISCONNECTED</span> ';
    }
    if (n.has_parse_error) badges += '<span class="badge warn">PARSE ERROR</span>';

    const warnText = (n.warnings || []).join(" · ") || "—";
    const fields = [
      ["File name", n.label],
      ["Relative path", n.relative_path],
      ["Folder", n.folder],
      ["Line count", n.line_count],
      ["Local imports", (n.local_imports || []).length],
      ["External imports", (n.external_imports || []).join(", ") || "—"],
      ["Incoming connections", n.incoming_connections],
      ["Outgoing connections", n.outgoing_connections],
      ["Importance score", n.importance_score],
      ["Detected role", roleNote],
      ["Warnings", warnText],
      ["Flags", badges || "—"],
    ];

    el.inspectList.innerHTML = fields
      .map(([k, v]) => {
        const value = k === "Flags" ? String(v) : escapeHtml(String(v));
        return `<div class="stat-row"><dt>${escapeHtml(k)}</dt><dd>${value}</dd></div>`;
      })
      .join("");

    renderConnectedList(n.connected_files || []);
  }

  function showFolderInspection(f) {
    el.inspectEmpty.hidden = true;
    el.inspectBody.hidden = false;
    if (el.inspectHeading) el.inspectHeading.textContent = "FOLDER IDENTITY";

    let badges = '<span class="badge entry">FOLDER</span> ';
    if (f.isOutside) badges = '<span class="badge dim">OUTSIDE VIEW</span> ';
    if (f.has_entry_point) badges += '<span class="badge entry">CONTAINS ENTRY</span> ';
    if (f.has_parse_error) badges += '<span class="badge warn">HAS PARSE ERRORS</span>';

    const fields = f.isOutside
      ? [
          ["Node", "OUTSIDE"],
          ["Meaning", "Imports crossing out of / into this folder"],
          ["Incoming links", f.incoming_connections],
          ["Outgoing links", f.outgoing_connections],
          ["Hint", "Use Up One Level or breadcrumb to leave this view"],
        ]
      : [
          ["Folder name", f.label],
          ["Path", f.folderPath],
          ["Python files", f.file_count],
          ["Total lines", f.line_count],
          ["Importance (sum)", f.importance_score],
          ["Incoming links", f.incoming_connections],
          ["Outgoing links", f.outgoing_connections],
          ["External imports", (f.external_imports || []).join(", ") || "—"],
          ["Flags", badges],
          ["Hint", "Double-click to open this folder"],
        ];

    el.inspectList.innerHTML = fields
      .map(([k, v]) => {
        const value = k === "Flags" ? String(v) : escapeHtml(String(v));
        return `<div class="stat-row"><dt>${escapeHtml(k)}</dt><dd>${value}</dd></div>`;
      })
      .join("");

    renderConnectedList(f.connected || [], true);
  }

  function renderConnectedList(connected, allowFolderJump = false) {
    if (!connected.length) {
      el.connectedList.innerHTML =
        '<li class="muted" style="border:none;cursor:default">No connections in this view</li>';
      return;
    }

    el.connectedList.innerHTML = connected
      .map((c) => {
        const isDir = String(c).startsWith("dir:");
        const label = isDir ? `${String(c).slice(4)} (folder)` : c;
        return `<li data-id="${escapeAttr(c)}">${escapeHtml(label)}</li>`;
      })
      .join("");

    el.connectedList.querySelectorAll("li[data-id]").forEach((li) => {
      li.addEventListener("click", () => {
        const id = li.getAttribute("data-id");
        if (String(id).startsWith("dir:")) {
          if (allowFolderJump) selectFolderNode(id);
          return;
        }
        // If file not in current view, jump to its folder then select
        if (!state.cy || state.cy.getElementById(id).empty()) {
          const rec = state.nodeMap.get(id);
          if (rec) {
            const folder = rec.folder === "." ? "" : rec.folder;
            openView(folder);
            setTimeout(() => selectFileNode(id), 50);
          }
          return;
        }
        selectFileNode(id);
      });
    });
  }

  function recenter() {
    if (!state.cy) return;
    state.cy.fit(undefined, 40);
    state.cy.center();
  }

  function resetAll() {
    stopParticles();
    if (state.cy) {
      state.cy.destroy();
      state.cy = null;
    }
    state.scanData = null;
    state.nodeMap = new Map();
    state.folderMeta = new Map();
    state.viewPath = "";
    setFolderPath(null);
    renderStats({});
    renderExternal([]);
    renderWarnings([]);
    clearInspection();
    el.vizEmpty.classList.remove("hidden");
    el.cyRoot.classList.remove("visible");
    el.viewBar.hidden = true;
    el.btnRecenter.disabled = true;
    el.btnUp.disabled = true;
    el.progressFill.style.width = "0%";
    el.overlayPercent.textContent = "0%";
    setStatus("Ready");
  }

  function startParticles() {
    stopParticles();
    if (!state.cy) return;

    const canvas = document.createElement("canvas");
    canvas.id = "particle-layer";
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;";
    el.cyRoot.parentElement.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const particles = [];

    function resize() {
      const rect = el.cyRoot.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function spawn() {
      if (!state.cy) return;
      const edges = state.cy.edges().filter((e) => !e.hasClass("external-edge"));
      if (!edges.length) return;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      particles.push({ edge, t: 0, speed: 0.004 + Math.random() * 0.008 });
      if (particles.length > 40) particles.shift();
    }

    let lastSpawn = 0;
    function frame(ts) {
      if (!state.cy || !canvas.isConnected) return;
      const rect = el.cyRoot.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (ts - lastSpawn > 180) {
        spawn();
        lastSpawn = ts;
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.t += p.speed;
        if (p.t >= 1 || p.edge.removed()) {
          particles.splice(i, 1);
          continue;
        }
        const src = p.edge.source().renderedPosition();
        const tgt = p.edge.target().renderedPosition();
        const x = src.x + (tgt.x - src.x) * p.t;
        const y = src.y + (tgt.y - src.y) * p.t;
        ctx.beginPath();
        ctx.fillStyle = `rgba(0, 212, 255, ${0.85 - p.t * 0.4})`;
        ctx.shadowColor = "#00d4ff";
        ctx.shadowBlur = 8;
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      state.particleTimer = requestAnimationFrame(frame);
    }

    state.particleTimer = requestAnimationFrame(frame);
    state._particleCanvas = canvas;
    state._particleResize = resize;
  }

  function stopParticles() {
    if (state.particleTimer) {
      cancelAnimationFrame(state.particleTimer);
      state.particleTimer = null;
    }
    if (state._particleCanvas) {
      state._particleCanvas.remove();
      state._particleCanvas = null;
    }
    if (state._particleResize) {
      window.removeEventListener("resize", state._particleResize);
      state._particleResize = null;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  el.btnSelect.addEventListener("click", selectFolder);
  el.btnAnalyze.addEventListener("click", analyzeProject);
  el.btnUp.addEventListener("click", goUp);
  el.btnRecenter.addEventListener("click", recenter);
  el.btnReset.addEventListener("click", resetAll);
  el.toggleExternal.addEventListener("change", () => {
    if (state.scanData) renderGraph();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && state.scanData && normalizeView(state.viewPath)) {
      const tag = (e.target && e.target.tagName) || "";
      if (tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        goUp();
      }
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") {
      const path = window.prompt("Enter project folder path:");
      if (path) {
        setFolderPath(path.trim());
        setStatus("Folder path set — ready to analyze");
      }
    }
  });

  setStatus("Ready");
})();
