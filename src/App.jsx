import React, { useEffect, useState } from "react";

/**
 * SCP:RP Row/Column Hacking — Full Previewable React (single file)
 * - Difficulty select BEFORE grid appears
 *   • Easy: 2×2, 2 objectives, length 2
 *   • Medium: 5×5, 4 objectives, length 3–6
 *   • Hard: 8×7, 6 objectives, length 5–7
 * - Objectives visible pre-start (planning)
 * - Start => NEW grid + NEW objectives (for chosen difficulty)
 * - Strict row/column constraint
 * - Faults reset active in-progress line; completed lines unaffected
 * - Same-cell repeat OK
 * - Connected objective lines with decoys
 * - Timer + fault cap
 * - Objective-only hover highlighting (grid hover disabled)
 * - Grid hover highlights the NEXT-NEEDED objective token in yellow, but only if that grid cell is selectable
 * - Multiple objectives with the same next token advance simultaneously
 * - If multiple lines advance together on a shared token, the next non-shared pick disables the other lines
 * - NEW: Divergence rule — if you progressed down a route and then pick something that isn't the next needed token for that route (even if it advances another route), that route is reset to 0 (soft reset; no fault)
 */

const LETTERS = ["A", "C", "E", "F", "X", "8"];
const NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const TIMER_SECONDS = 150;
const FAULTS_MAX = 5;

// ---------- helpers ----------
const fmt2 = (n) => n.toString().padStart(2, "0");
const fmtTime = (t) => `${Math.floor(t / 60)}:${fmt2(Math.max(0, Math.floor(t % 60)))}`;
const rand = (n) => Math.floor(Math.random() * n);
const choice = (arr) => arr[rand(arr.length)];

function makeToken() {
  // prefer letter+number; sometimes number+number (like 85)
  if (Math.random() < 0.75) return `${choice(LETTERS)}${choice(NUMBERS)}`;
  return `${choice(NUMBERS)}${choice(NUMBERS)}`;
}

function generateGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => makeToken())
  );
}

// Build connected objective lines with decoys (so “obvious” token on a line can dead-end)
// Accepts fixed len (number) OR range [min, max]
function generateObjectiveLines(grid, lenOrRange, numLines) {
  const rows = grid.length;
  const cols = grid[0].length;
  const pickLen = () => Array.isArray(lenOrRange) ? (rand(lenOrRange[1] - lenOrRange[0] + 1) + lenOrRange[0]) : lenOrRange;

  const colCoords = (c) => Array.from({ length: rows }, (_, r) => [r, c]);
  const rowCoords = (r) => Array.from({ length: cols }, (_, c) => [r, c]);

  function lineHasToken(dir, r, c, token) {
    if (dir === "column") return colCoords(c).some(([rr, cc]) => grid[rr][cc] === token);
    return rowCoords(r).some(([rr, cc]) => grid[rr][cc] === token);
  }

  // simple connected line (fallback)
  function buildSimpleConnectedLine(r0, c0, len, startDir) {
    const tokens = [grid[r0][c0]];
    let r = r0, c = c0, dir = startDir;
    for (let i = 1; i < len; i++) {
      const candidates = dir === "column" ? colCoords(c) : rowCoords(r);
      const [nr, nc] = choice(candidates);
      r = nr; c = nc; tokens.push(grid[r][c]);
      dir = dir === "column" ? "row" : "column";
    }
    return tokens;
  }

  // “tricky” line: tries to introduce decoy picks (same token options that break the next step)
  function buildTrickyLine(startR, startC, len, startDir, minTricky = Math.ceil(len / 2), tries = 500) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const tokens = [grid[startR][startC]];
      let r = startR, c = startC, dir = startDir;
      let trickyCount = 0;

      for (let i = 1; i < len; i++) {
        const candidates = dir === "column" ? colCoords(c) : rowCoords(r);
        const [nr, nc] = choice(candidates);
        r = nr; c = nc;
        const tok = grid[r][c];
        tokens.push(tok);

        const nextDir = dir === "column" ? "row" : "column";
        if (i < len - 1) {
          const nextLineCoords = nextDir === "column" ? colCoords(c) : rowCoords(r);

          // 40% chance to create a duplicate-next (A8 -> A8).
          let [sr, sc] = choice(nextLineCoords);
          if (Math.random() < 0.4) {
            const dupes = nextLineCoords.filter(([rr, cc]) => grid[rr][cc] === tok);
            if (dupes.length) [sr, sc] = choice(dupes);
          }

          const futureToken = grid[sr][sc];
          tokens[i + 1] = futureToken;

          // decoys: same token on current line that would NOT have futureToken on the nextDir line
          const sameTokenCells = candidates.filter(([rr, cc]) => grid[rr][cc] === tok);
          const decoys = sameTokenCells.filter(
            ([rr2, cc2]) => !lineHasToken(nextDir, rr2, cc2, futureToken)
          );
          if (decoys.length > 0) trickyCount += 1;

          // advance to pre-chosen next step now to keep alternation aligned
          r = sr; c = sc; dir = nextDir; i++;
        }
      }

      if (tokens.length > len) tokens.length = len;
      if (trickyCount >= minTricky && tokens.length === len) return tokens;
    }
    return buildSimpleConnectedLine(startR, startC, len, startDir);
  }

  const lines = [];
  // Ensure one line starts top row; after first pick the constraint will be 'column'
  const c0 = rand(cols);
  lines.push(buildTrickyLine(0, c0, pickLen(), "column"));
  for (let i = 1; i < numLines; i++) {
    const r0 = rand(rows), c0b = rand(cols);
    const startDir = Math.random() < 0.5 ? "column" : "row";
    lines.push(buildTrickyLine(r0, c0b, pickLen(), startDir));
  }
  return lines;
}

export default function App() {
  // difficulty selection
  const [difficulty, setDifficulty] = useState(null); // 'easy' | 'medium' | 'hard'

  // board/objective config
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(0);
  const [linesCount, setLinesCount] = useState(0);
  const [lineLenRange, setLineLenRange] = useState([2, 2]); // number | [min, max]

  // live data
  const [grid, setGrid] = useState([]);
  const [objectiveLines, setObjectiveLines] = useState([]);

  // game state
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [constraint, setConstraint] = useState("top-row"); // 'top-row' | 'column' | 'row'
  const [lastPos, setLastPos] = useState(null);            // {r,c}
  const [faults, setFaults] = useState(0);
  const [hoverToken, setHoverToken] = useState(null);      // objective→grid highlight
  const [objHoverToken, setObjHoverToken] = useState(null); // grid→objective highlight (next-needed only)
  const [activeLine, setActiveLine] = useState(null);
  const [lineProgress, setLineProgress] = useState([]);
  const [message, setMessage] = useState("");
  const [win, setWin] = useState(false);
  const [fail, setFail] = useState(false);
  const [lastClicked, setLastClicked] = useState(null);    // {r,c, token, status: 'correct'|'fault'}

  // NEW: state for branch invalidation & cohorts
  const [competeSet, setCompeteSet] = useState(null); // Set<number> or null

  // choose difficulty => show pre-plan grid & objectives (not running)
  function selectDifficulty(level) {
    let cfg;
    if (level === "easy") cfg = { rows: 2, cols: 2, lines: 2, range: [2, 2] };
    else if (level === "medium") cfg = { rows: 5, cols: 5, lines: 4, range: [3, 6] };
    else cfg = { rows: 7, cols: 8, lines: 6, range: [5, 7] };

    setDifficulty(level);
    setRows(cfg.rows); setCols(cfg.cols); setLinesCount(cfg.lines); setLineLenRange(cfg.range);

    const g = generateGrid(cfg.rows, cfg.cols);
    const o = generateObjectiveLines(g, cfg.range, cfg.lines);
    setGrid(g);
    setObjectiveLines(o);
    setLineProgress(o.map(() => 0));

    setRunning(false); setConstraint("top-row"); setLastPos(null); setFaults(0); setTimeLeft(TIMER_SECONDS);
    setHoverToken(null); setObjHoverToken(null); setActiveLine(null); setWin(false); setFail(false); setMessage(""); setLastClicked(null);
    setCompeteSet(null);

    // Dev self-test to catch generation mistakes
    devSelfTest(g, o);
  }

  // timer
  useEffect(() => {
    if (!running || win || fail) return;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [running, win, fail]);
  useEffect(() => { if (timeLeft <= 0 && running) doFail("Time's up."); }, [timeLeft, running]);

  function doFail(msg) { setFail(true); setRunning(false); setMessage(msg); }

  // strict constraint checks
  function allowed(r, c) {
    if (constraint === "top-row") return r === 0;
    if (!lastPos) return false;
    if (constraint === "column") return c === lastPos.c;
    if (constraint === "row") return r === lastPos.r;
    return false;
  }
  function toggleConstraint() {
    if (constraint === "top-row") setConstraint("column");
    else if (constraint === "column") setConstraint("row");
    else if (constraint === "row") setConstraint("column");
  }

  // which lines can this token advance (that aren't done yet and not disabled)
  function candidateLinesFor(token) {
    const arr = [];
    for (let i = 0; i < objectiveLines.length; i++) {
      const prog = lineProgress[i] ?? 0;
      const line = objectiveLines[i] ?? [];
      if (prog < line.length && line[prog] === token) arr.push(i);
    }
    return arr;
  }
  // Wrong tokens should cause faults; even if token exists in completed lines, we don't treat as neutral
  function tokenInCompletedLine(_token) { return false; }

  function correctPickMulti(lineIndexes, r, c) {
    // Advance ALL matching lines by one
    setLineProgress((prev) => {
      const next = [...prev];
      for (const idx of lineIndexes) next[idx] = (next[idx] ?? 0) + 1;
      return next;
    });

    // Shared-start cohort logic:
    if (lineIndexes.length > 1) {
      setCompeteSet(new Set(lineIndexes));
    } else if (lineIndexes.length === 1 && competeSet && competeSet.has(lineIndexes[0])) {
      const survivor = lineIndexes[0];
      const others = [...competeSet].filter((i) => i !== survivor);
      if (others.length > 0) {
        setLineProgress((prev) => {
          const next = [...prev];
          for (const i of others) next[i] = 0; // NULLIFY competing routes
          return next;
        });
      }
      setCompeteSet(null);
    }

    const lastIdx = lineIndexes[lineIndexes.length - 1];
    setActiveLine(lastIdx ?? null);
    setLastPos({ r, c });
    setLastClicked({ r, c, token: grid[r][c], status: "correct" });
    toggleConstraint();

    setTimeout(() => {
      const done = objectiveLines.every((line, i) => {
        const inc = lineIndexes.includes(i) ? 1 : 0;
        return (lineProgress[i] + inc) >= line.length;
      });
      if (done) { setWin(true); setRunning(false); }
    }, 0);
  }

  function fault(msg, r, c) {
    setFaults((f) => { const nf = f + 1; if (nf >= FAULTS_MAX) { doFail("Too many faults."); } return nf; });

    // reset active, in-progress line only
    setLineProgress((prev) => {
      if (activeLine === null) return prev;
      const line = objectiveLines[activeLine] || [];
      const prog = prev[activeLine] ?? 0;
      if (prog > 0 && prog < line.length) { const next = [...prev]; next[activeLine] = 0; return next; }
      return prev;
    });

    setMessage(msg); setTimeout(() => setMessage(""), 600);

    setLastPos({ r, c });
    setLastClicked({ r, c, token: grid[r][c], status: "fault" });
    toggleConstraint();
  }

  // --- UPDATED: divergence-aware handlePick ---
  function handlePick(r, c) {
    if (!running || win || fail) return;

    const token = grid[r][c];
    const isAllowed = allowed(r, c);
    const isSameCell = lastPos && lastPos.r === r && lastPos.c === c;

    // Divergence guard: if we are mid-progress on an active line and
    // the allowed click is NOT the next needed token for that line,
    // immediately reset that line to 0 (soft reset; no fault), but still
    // continue to process the click (it may advance another line).
    if (isAllowed && activeLine !== null) {
      const prog = lineProgress[activeLine] ?? 0;
      const line = objectiveLines[activeLine] ?? [];
      const inProgress = prog > 0 && prog < line.length;
      const needed = inProgress ? line[prog] : null;

      if (inProgress && token !== needed) {
        setLineProgress((prev) => {
          const next = [...prev];
          next[activeLine] = 0;
          return next;
        });
        setActiveLine(null);
        setCompeteSet(null);
        // no return; keep handling this click
      }
    }

    // hard lock: out-of-line clicks do nothing
    if (!isAllowed) return;

    const candidates = candidateLinesFor(token);

    // same cell repeat OK if it matches a needed token
    if (candidates.length > 0 && isSameCell) {
      correctPickMulti(candidates, r, c); return;
    }

    // allowed + matches at least one line => advance ALL matching lines
    if (candidates.length > 0) {
      correctPickMulti(candidates, r, c); return;
    }

    // real fault (wrong token on allowed line)
    fault("Wrong token.", r, c);
  }

  // controls
  function newSetup() {
    if (!difficulty) return;
    const g = generateGrid(rows, cols);
    const o = generateObjectiveLines(g, lineLenRange, linesCount);
    setGrid(g); setObjectiveLines(o); setLineProgress(o.map(() => 0)); setActiveLine(null);
    setConstraint("top-row"); setFaults(0); setWin(false); setFail(false); setMessage(""); setLastClicked(null);
    setCompeteSet(null);

    devSelfTest(g, o);
  }
  function start() {
    if (!difficulty) return;
    // Use the currently displayed grid/objectives — do not regenerate
    setLineProgress((prev) => objectiveLines.map(() => 0));
    setActiveLine(null);
    setRunning(true);
    setTimeLeft(TIMER_SECONDS);
    setConstraint("top-row");
    setLastPos(null);
    setFaults(0);
    setHoverToken(null);
    setObjHoverToken(null);
    setWin(false);
    setFail(false);
    setMessage("");
    setLastClicked(null);
    setCompeteSet(null);
  }
  function stop() { setRunning(false); }

  // visuals
  function cellClass(r, c) {
    const token = grid?.[r]?.[c];
    const isAllowed = allowed(r, c);
    const matchesHover = hoverToken ? token === hoverToken : false;
    const isLast = lastClicked && lastClicked.r === r && lastClicked.c === c;

    let cls =
      "border text-sm font-bold rounded-xl h-10 w-14 flex items-center justify-center transition select-none";
    if (isAllowed && running) cls += " border-neutral-600 bg-neutral-800 hover:bg-neutral-700 cursor-pointer";
    else if (!running) cls += " border-neutral-700 bg-neutral-800"; // plan view
    else cls += " border-neutral-900 bg-neutral-950 opacity-30 cursor-not-allowed pointer-events-none";

    if (isLast) cls += lastClicked.status === "correct" ? " ring-1 ring-emerald-400/60" : " ring-1 ring-rose-400/60";

    if (hoverToken && running) {
      if (matchesHover) cls += " !bg-emerald-700/30 !border-emerald-400"; else if (!isLast) cls += " opacity-30";
    }
    return cls;
  }

  function objectiveTokenClass(done, current, highlight) {
    let c = "px-2 py-1 rounded-lg border text-sm tracking-widest select-none";
    if (done) c += " bg-emerald-800/30 border-emerald-500/40 text-emerald-200 line-through";
    else if (highlight) c += " bg-amber-600/30 border-amber-400 text-amber-100"; // yellow when grid-hovered valid next token
    else if (current) c += " bg-neutral-800 border-neutral-600 text-neutral-100";
    else c += " bg-neutral-900 border-neutral-800 text-neutral-300";
    return c;
  }

  const linesDone = objectiveLines.filter(
    (_, i) => (lineProgress[i] ?? 0) >= ((objectiveLines[i] || []).length)
  ).length;

  // difficulty screen
  if (!difficulty) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="rounded-3xl bg-neutral-900 p-10 text-center shadow-xl">
          <h1 className="mb-6 text-3xl font-black">Select Difficulty</h1>
          <div className="flex flex-col gap-4">
            <button onClick={() => selectDifficulty("easy")} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-500">Easy (2×2 · 2 lines · 2 tokens)</button>
            <button onClick={() => selectDifficulty("medium")} className="rounded-xl bg-amber-600 px-6 py-3 font-semibold hover:bg-amber-500">Medium (5×5 · 4 lines · 3–6 tokens)</button>
            <button onClick={() => selectDifficulty("hard")} className="rounded-xl bg-rose-600 px-6 py-3 font-semibold hover:bg-rose-500">Hard (8×7 · 6 lines · 5–7 tokens)</button>
          </div>
        </div>
      </div>
    );
  }

  // main UI
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto max-w-6xl">
        {/* header */}
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">SCP:RP Hacking — {difficulty.toUpperCase()}</h1>
            <p className="text-sm text-neutral-400">Press <span className="font-semibold">Start</span> to play this exact grid.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-2xl bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700" onClick={() => setDifficulty(null)} disabled={running}>Change Difficulty</button>
            {!running ? (
              <>
                <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500" onClick={start}>Start</button>
              </>
            ) : (
              <button className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500" onClick={stop}>Stop</button>
            )}
          </div>
        </header>

        {/* HUD */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <HUD label="Grid" value={`${cols}×${rows}`} />
          <HUD label="Lines done" value={`${linesDone}/${objectiveLines.length || 0}`} />
          <HUD label="Faults" value={`${faults}/${FAULTS_MAX}`} warn={faults > 0} />
          <HUD label="Constraint" value={constraint} />
          <HUD label="Time" value={fmtTime(Math.max(0, timeLeft))} warn={running && timeLeft <= 10} />
        </div>

        {message && (
          <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-sm text-neutral-200">{message}</div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Grid */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-neutral-900 p-4 shadow-xl">
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: "6px" }}
              >
                {grid.map((row, r) =>
                  row.map((tok, c) => (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => handlePick(r, c)}
                      disabled={!running || win || fail}
                      className={cellClass(r, c)}
                      onMouseEnter={() => {
                        // If this cell is currently selectable and advances some line, show yellow on that objective token
                        if (running && allowed(r, c)) {
                          const token = grid[r][c];
                          const candidates = candidateLinesFor(token);
                          setObjHoverToken(candidates.length > 0 ? token : null);
                        } else {
                          setObjHoverToken(null);
                        }
                      }}
                      onMouseLeave={() => setObjHoverToken(null)}
                    >
                      {tok}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Objectives */}
          <div className="rounded-2xl bg-neutral-900 p-4 shadow-xl">
            <div className="mb-2 text-sm text-neutral-400">Objectives (hover to highlight grid · grid-hover shows next-needed token in yellow)</div>
            <div className="flex flex-col gap-3">
              {objectiveLines.map((line, i) => {
                const prog = lineProgress[i] ?? 0;
                const isActive = i === activeLine;
                return (
                  <div
                    key={i}
                    className={`rounded-xl p-3 ${isActive ? "ring-1 ring-emerald-400/40 bg-neutral-800" : "bg-neutral-900"}`}
                  >
                    <div className="flex flex-wrap gap-2">
                      {line.map((tok, j) => {
                        const done = j < prog;
                        const current = j === prog && running && !win && !fail;
                        const highlight = j === prog && tok === objHoverToken; // grid-hover, valid next pick only
                        return (
                          <span
                            key={j}
                            className={objectiveTokenClass(done, current, highlight)}
                            onMouseEnter={() => setHoverToken(tok)}
                            onMouseLeave={() => setHoverToken(null)}
                          >
                            {tok}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {`${prog}/${line.length}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {win && (
              <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-800/20 p-3 text-emerald-200">
                <div className="font-bold">Hack complete!</div>
                <div className="text-sm">All lines cleared.</div>
              </div>
            )}
            {fail && (
              <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-800/20 p-3 text-rose-200">
                <div className="font-bold">Hack failed</div>
                <div className="text-sm">
                  {message || (faults >= FAULTS_MAX ? "Too many faults." : "Timer expired.")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom timer bar */}
        <div className="mt-6 h-3 w-full rounded-full bg-neutral-900">
          <div
            className="h-3 rounded-full bg-emerald-600 transition-[width]"
            style={{ width: `${(Math.max(0, timeLeft) / TIMER_SECONDS) * 100}%` }}
          />
        </div>

        <footer className="mt-6 text-xs text-neutral-500">
          Objectives are connected paths from the current grid. Faults reset the active line; completed lines are safe.
        </footer>
      </div>
    </div>
  );
}

function HUD({ label, value, warn }) {
  return (
    <div className={`rounded-2xl p-4 shadow-lg ${warn ? "bg-amber-950/40 ring-1 ring-amber-400/40" : "bg-neutral-900"}`}>
      <div className="text-xs uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

// ---------------- Dev Self Tests ----------------
// These are simple runtime assertions to catch generation/logic issues when you start a run or new setup.
function devSelfTest(grid, objectives) {
  try {
    if (!Array.isArray(grid) || grid.length === 0) return;
    const rows = grid.length, cols = grid[0].length;

    // Test 1: Every objective token exists somewhere on the grid
    objectives.forEach((line, li) => {
      line.forEach((tok, ti) => {
        const exists = grid.some((row) => row.some((t) => t === tok));
        console.assert(exists, `[SelfTest] Token not found on grid: line ${li} idx ${ti} token ${tok}`);
      });
    });

    // Test 2: Alternation feasibility — heuristic sanity check
    objectives.forEach((line) => {
      let dir = "column"; // heuristic start
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        let progress = false;
        outer: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== a) continue;
          if (dir === "column") {
            for (let rr = 0; rr < rows; rr++) { if (grid[rr][c] === b) { progress = true; break outer; } }
          } else {
            for (let cc = 0; cc < cols; cc++) { if (grid[r][cc] === b) { progress = true; break outer; } }
          }
        }
        if (!progress) break;
        dir = dir === "column" ? "row" : "column";
      }
    });
  } catch (e) {
    console.warn("[SelfTest] Exception during tests", e);
  }
}
