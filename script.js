// ===== Game settings =====
const ROUND_SECONDS = 60; // length of the hunt
const POINTS_CORRECT = 10; // right waste
const POINTS_PARTIAL = 5; // right panel, wrong waste
const REVEAL_DELAY = 1500; // ms to show missed panels before the results pop-up

// ===== Page elements =====
const sceneEl = document.getElementById("scene");
const sceneWrapEl = document.querySelector(".scene-wrap");
const sceneLabelEl = document.getElementById("scene-label");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const foundCountEl = document.getElementById("found-count");
const startBtn = document.getElementById("start-btn");
const popupEl = document.getElementById("popup");
const popupStepEl = document.getElementById("popup-step");
const popupTitleEl = document.getElementById("popup-title");
const popupBodyEl = document.getElementById("popup-body");
const popupBtn = document.getElementById("popup-btn");

// Feedback message shown briefly over the scene
const toastEl = document.createElement("div");
toastEl.className = "toast hidden";
sceneWrapEl.appendChild(toastEl);

// ===== Game state =====
let scene = SCENES[0];
let timeLeft = ROUND_SECONDS;
let timerId = null;
let revealTimeoutId = null;
let toastTimeoutId = null;
let active = false; // true only while the clock is running
let pendingN = null; // panel waiting for a waste choice
let score = 0;
let results = {}; // panel number -> { chosen, correct, points }
let buttonMode = "menu"; // "menu", "start" or "restart"

// ===== Helpers =====
const panelCount = () => scene.panels.length;
const foundCount = () => Object.keys(results).length;
const maxScore = () => panelCount() * POINTS_CORRECT;
const getPanel = (n) => scene.panels.find((p) => p.n === n);
const panelImage = (s, n) => `${s.folder}/${n}.jpg`;

function wasteTag(code) {
  return `<span class="tag w-${code.toLowerCase()}">${code}</span>`;
}

function updateStatus() {
  timerEl.textContent = timeLeft;
  scoreEl.textContent = score;
  foundCountEl.textContent = `${foundCount()} / ${panelCount()}`;
}

function setMode(mode, text, disabled = false) {
  buttonMode = mode;
  startBtn.textContent = text;
  startBtn.disabled = disabled;
}

// ===== Pop-up controls =====
function showPopup(step, title, html, buttonText) {
  popupStepEl.textContent = step;
  popupTitleEl.textContent = title;
  popupBodyEl.innerHTML = html;
  popupBtn.hidden = !buttonText;
  if (buttonText) popupBtn.textContent = buttonText;
  popupEl.classList.remove("hidden");
}

function hidePopup() {
  popupEl.classList.add("hidden");
}

function showToast(message, good) {
  toastEl.textContent = message;
  toastEl.className = `toast ${good ? "good" : "partial"}`;
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

// ===== Build the board: one tile per panel, row by row =====
function buildScene() {
  sceneEl.innerHTML = "";

  scene.rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "tile-row";

    row.forEach((n) => {
      const p = getPanel(n);
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.dataset.n = n;
      tile.style.flex = p.r; // wider panels get more width, so row heights match
      tile.innerHTML = `<img src="${panelImage(scene, n)}" alt="" draggable="false"><span class="tile-badge"></span>`;
      rowEl.appendChild(tile);
    });

    sceneEl.appendChild(rowEl);
  });
}

// Color a tile once it's answered or revealed
function markTile(p, state) {
  const tile = sceneEl.querySelector(`.tile[data-n="${p.n}"]`);
  tile.classList.add(state); // "found", "partial" or "missed"
  tile.style.setProperty("--c", `var(--w-${p.waste.toLowerCase()})`);
  tile.querySelector(".tile-badge").innerHTML = wasteTag(p.waste);
}

// ===== Scene menu =====
function showSceneMenu() {
  clearInterval(timerId);
  clearTimeout(revealTimeoutId);
  active = false;
  pendingN = null;

  sceneLabelEl.textContent = "Choose a scene";
  const buttons = SCENES.map(
    (s, i) => `
    <button class="scene-choice" data-index="${i}">
      <img src="${panelImage(s, 1)}" alt="">
      <span>${s.name}</span>
    </button>`,
  ).join("");

  showPopup(
    "Waste Hunt",
    "Choose a scene",
    `<div class="scene-grid">${buttons}</div>`,
    null,
  );
  setMode("menu", "Choose a scene", true);
}
popupEl.classList.add("menu");

// ===== Load a scene and show the briefing =====
function loadScene(index) {
  scene = SCENES[index];
  timeLeft = ROUND_SECONDS;
  score = 0;
  results = {};
  pendingN = null;
  active = false;
  popupEl.classList.remove("menu");
  sceneLabelEl.textContent = `Scene: ${scene.name}`;
  buildScene();
  updateStatus();

  showPopup(
    "Waste Hunt",
    scene.name,
    `<p>${scene.briefing}</p>
     <p>Right waste: <strong>+${POINTS_CORRECT}</strong> &nbsp;|&nbsp; Wrong waste: <strong>+${POINTS_PARTIAL}</strong></p>`,
    "Start Hunt",
  );
  setMode("start", "Start Hunt");
}

// ===== Start the clock =====
function startHunt() {
  active = true;
  hidePopup();
  setMode("start", "Hunt in progress", true);
  updateStatus();

  timerId = setInterval(() => {
    timeLeft--;
    updateStatus();
    if (timeLeft <= 0) endHunt();
  }, 1000);
}

// ===== Clicks on a panel =====
sceneEl.addEventListener("click", (event) => {
  if (!active || pendingN) return;
  const tile = event.target.closest(".tile");
  if (!tile) return;

  const n = Number(tile.dataset.n);
  if (results[n]) return; // already answered

  pendingN = n;
  openPicker();
});

// ===== Waste picker =====
function openPicker() {
  const buttons = Object.entries(WASTES)
    .map(
      ([code, w]) =>
        `<button class="waste-choice" data-waste="${code}">${wasteTag(code)}<span>${w.name}</span></button>`,
    )
    .join("");
  showPopup(
    "Waste spotted",
    "Which waste is this?",
    `<div class="picker-grid">${buttons}</div>`,
    null,
  );
}

popupBodyEl.addEventListener("click", (event) => {
  const choice = event.target.closest(".waste-choice");
  if (choice && pendingN) scoreAnswer(choice.dataset.waste);

  const sceneBtn = event.target.closest(".scene-choice");
  if (sceneBtn) loadScene(Number(sceneBtn.dataset.index));
});

// ===== Scoring with partial credit =====
function scoreAnswer(code) {
  const p = getPanel(pendingN);
  const correct = code === p.waste;
  const points = correct ? POINTS_CORRECT : POINTS_PARTIAL;

  score += points;
  results[p.n] = { chosen: code, correct, points };
  markTile(p, correct ? "found" : "partial");

  pendingN = null;
  hidePopup();
  updateStatus();

  showToast(
    correct
      ? `Correct: ${WASTES[code].name} (+${points})`
      : `Partly right: this is ${WASTES[p.waste].name}, not ${WASTES[code].name} (+${points})`,
    correct,
  );

  if (foundCount() === panelCount()) endHunt();
}

// ===== End the hunt =====
function endHunt() {
  if (!active) return;
  clearInterval(timerId);
  active = false;
  pendingN = null;
  hidePopup();

  scene.panels.forEach((p) => {
    if (!results[p.n]) markTile(p, "missed");
  });

  setMode("restart", "Choose Scene");
  revealTimeoutId = setTimeout(showResults, REVEAL_DELAY);
}

// ===== Results and debrief pop-up =====
function showResults() {
  const correct = Object.values(results).filter((r) => r.correct).length;
  const partial = foundCount() - correct;
  const missed = panelCount() - foundCount();

  const rows = scene.panels
    .map((p) => {
      const r = results[p.n];
      const answer = !r
        ? "Missed"
        : r.correct
          ? "Correct"
          : `Chose ${WASTES[r.chosen].name}`;
      const rowClass = !r
        ? "row-missed"
        : r.correct
          ? "row-correct"
          : "row-partial";
      return `<tr class="${rowClass}">
      <td>${wasteTag(p.waste)}</td>
      <td><strong>${p.label}</strong><br><small>${p.why}</small></td>
      <td>${answer}</td>
      <td>${r ? r.points : 0}</td>
    </tr>`;
    })
    .join("");

  const debrief = scene.debrief.map((q) => `<li>${q}</li>`).join("");

  showPopup(
    "Waste Hunt",
    "Hunt complete: results",
    `
    <p>Score: <strong>${score} / ${maxScore()}</strong> in ${ROUND_SECONDS - timeLeft} seconds.</p>
    <p>Correct: <strong>${correct}</strong> &nbsp;|&nbsp; Wrong waste: <strong>${partial}</strong> &nbsp;|&nbsp; Not answered: <strong>${missed}</strong></p>
    <table class="results-table">
      <thead><tr><th>Waste</th><th>What was there</th><th>Your answer</th><th>Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h3>Debrief questions</h3>
    <ol>${debrief}</ol>
  `,
    "Choose Scene",
  );
}

// ===== Both buttons share one handler =====
function handleMainButton() {
  if (buttonMode === "start") startHunt();
  else if (buttonMode === "restart") showSceneMenu();
}

startBtn.addEventListener("click", handleMainButton);
popupBtn.addEventListener("click", handleMainButton);

// ===== Run on page load =====
showSceneMenu();
