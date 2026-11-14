/* sort-table.js - vanilla click-to-sort for data tables (Task 108, UI only).
 * No dependencies. Loaded once per page (base.html + injected in app/main.py).
 *
 * Behaviour
 *  - Click a column header: first click = ascending, second click = descending.
 *    The active column shows an arrow (asc ▲ / desc ▼); other columns show none.
 *  - Numeric columns (negatives, %, currency $, thousands commas) sort by value.
 *  - Blank / dash cells ("", "—", "-", "n/a", ...) always sort LAST, both ways.
 *  - Text columns sort case-insensitively.
 *  - Tables that have no <th> get their first row promoted to a clickable header.
 *  - Layout tables (a cell that directly wraps another <table>) are left untouched.
 *  - Default order is never changed until a header is clicked.
 */
(function () {
  "use strict";

  var MISSING = Number.MAX_VALUE;
  var DASHES = { "": 1, "-": 1, "\u2013": 1, "\u2014": 1, "\u2015": 1, "n/a": 1, "na": 1, "null": 1, "none": 1, "nil": 1, "?": 1 };

  function normNum(s) {
    if (s === "") return null;
    var neg = false, str = s;
    if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1).trim(); }   // (1,234) => -1234
    str = str.replace(/%$/, "").trim();                                        // 12.5% => 12.5
    if (str === "" || str === "+" || str === "-" || str === ".") return null;
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(str)) return null;
    var v = parseFloat(str);
    if (!isFinite(v)) return null;
    return neg ? -v : v;
  }

  /* Parse one cell into { kind, num, str }. kind: 'num' | 'text' | 'missing'. */
  function parseCell(raw) {
    var t = (raw == null ? "" : String(raw)).replace(/[\u00a0\u2007\u202f]/g, " ").trim();
    var cleaned = t.replace(/[$€£¥₩₹]/g, "").replace(/,/g, "").trim();  // strip currency + thousands commas
    var n = normNum(cleaned);
    if (n !== null) return { kind: "num", num: n, str: t.toLowerCase() };
    var low = t.toLowerCase();
    if (DASHES[low]) return { kind: "missing", num: null, str: low };
    return { kind: "text", num: null, str: low };
  }

  function cellText(row, idx) {
    return row.cells && row.cells[idx] ? row.cells[idx].textContent : "";
  }

  function thCount(row) {
    var n = 0, c = row.cells;
    for (var i = 0; i < c.length; i++) if (c[i].tagName === "TH") n++;
    return n;
  }

  /* Find the header row (the row with the most <th>) or -1 if the table has none. */
  function headerRowIndex(rows) {
    var best = -1, bestN = 0;
    for (var i = 0; i < rows.length; i++) {
      var n = thCount(rows[i]);
      if (n > bestN) { bestN = n; best = i; }
    }
    return bestN > 0 ? best : -1;
  }

  /* A layout table wraps other tables directly inside its cells. */
  function isLayoutTable(table) {
    var cells = table.querySelectorAll("td, th");
    for (var i = 0; i < cells.length; i++) if (cells[i].querySelector("table")) return true;
    return false;
  }

  /* Promote the first row of a header-less table to a header row of <th>. */
  function promoteFirstRow(rows) {
    var cells = rows[0].cells;
    for (var i = cells.length - 1; i >= 0; i--) {
      var td = cells[i];
      var th = document.createElement("th");
      th.innerHTML = td.innerHTML;
      th.className = td.className;
      th.colSpan = td.colSpan;
      td.parentNode.replaceChild(th, td);
    }
  }

  function makeComparator(colIdx, dir) {
    // classify the column: numeric if there are numbers and no more text cells
    var numN = 0, txtN = 0;
    for (var i = 0; i < this.rows.length; i++) {   // `this` = context object below
      var p = parseCell(cellText(this.rows[i], colIdx));
      if (p.kind === "num") numN++;
      else if (p.kind === "text") txtN++;
    }
    var numeric = numN > 0 && numN >= txtN;

    return function (ra, rb) {
      var a = parseCell(cellText(ra.row, colIdx));
      var b = parseCell(cellText(rb.row, colIdx));
      var aMissing = (a.kind === "missing") || (numeric && a.kind !== "num");
      var bMissing = (b.kind === "missing") || (numeric && b.kind !== "num");
      // blanks / dashes always last, regardless of direction
      if (aMissing && bMissing) return ra.i - rb.i;
      if (aMissing) return 1;
      if (bMissing) return -1;
      var cmp;
      if (numeric) {
        cmp = a.num - b.num;
      } else {
        cmp = a.str < b.str ? -1 : (a.str > b.str ? 1 : 0);  // case-insensitive (already lowercased)
      }
      if (cmp !== 0) return dir * cmp;
      return ra.i - rb.i;   // stable
    };
  }

  function clearArrows(headerRow) {
    for (var i = 0; i < headerRow.cells.length; i++) {
      var th = headerRow.cells[i];
      if (th.getAttribute && th.getAttribute("data-sort-arrow") !== null) {
        th.removeAttribute("data-sort-arrow");
        var s = th.querySelector(".sort-arrow");
        if (s && s.parentNode === th) th.removeChild(s);
      }
    }
  }

  function setArrow(th, dir) {
    clearArrows(th.parentNode);
    var s = document.createElement("span");
    s.className = "sort-arrow";
    s.textContent = dir < 0 ? " \u25bc" : " \u25b2";   // ▼ / ▲
    th.appendChild(s);
    th.setAttribute("data-sort-arrow", dir < 0 ? "desc" : "asc");
  }

  function enableTable(table) {
    var rows = Array.prototype.slice.call(table.rows);
    if (rows.length < 2) return;

    var hIdx = headerRowIndex(rows);
    if (hIdx === -1) {
      if (isLayoutTable(table)) return;         // skip layout tables
      if (rows[0].cells.length < 2) return;     // need at least 2 columns
      if (rows.length < 3) return;              // < 2 data rows -> nothing to sort; do not mutate
      promoteFirstRow(rows);
      rows = Array.prototype.slice.call(table.rows);
      hIdx = 0;
    }
    if (isLayoutTable(table)) return;

    var headerRow = rows[hIdx];
    var dataRows = rows.slice(hIdx + 1);
    if (dataRows.length < 2) return;

    var container = dataRows[0].parentNode;
    var state = { col: -1, dir: 1 };

    for (var c = 0; c < headerRow.cells.length; c++) {
      (function (colIdx, th) {
        if (!th || th.tagName !== "TH") return;
        if (th.colSpan && th.colSpan > 1) return;   // ambiguous multi-column header
        th.classList.add("sortable");
        th.style.cursor = "pointer";
        if (!th.style.userSelect) th.style.userSelect = "none";
        th.addEventListener("click", function () {
          if (state.col === colIdx) { state.dir = -state.dir; }
          else { state.col = colIdx; state.dir = 1; }
          var ctx = { rows: dataRows };
          var cmp = makeComparator.call(ctx, colIdx, state.dir);
          var decorated = dataRows.map(function (r, i) { return { row: r, i: i }; });
          decorated.sort(cmp);
          for (var k = 0; k < decorated.length; k++) container.appendChild(decorated[k].row);
          setArrow(th, state.dir);
        });
      })(c, headerRow.cells[c]);
    }
  }

  function init() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      try { enableTable(tables[i]); } catch (e) { /* never break the page */ }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
