// ===== Game settings =====
const ROUND_SECONDS = 60; // length of the hunt
const POINTS_CORRECT = 10; // right spot, right waste
const POINTS_PARTIAL = 5; // right spot, wrong waste
const REVEAL_DELAY = 1500; // ms to show missed spots before the results pop-up
const SHOW_HOTSPOTS = false; // testing aid: outlines the spots. Set to false for real sessions.

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
let pendingId = null; // hotspot waiting for a waste choice
let score = 0;
let results = {}; // hotspot id -> { chosen, correct, points }
let buttonMode = "start"; // "start" or "restart"

// ===== Helpers =====
function foundCount() {
  return Object.keys(results).length;
}

function maxScore() {
  return scene.hotspots.length * POINTS_CORRECT;
}

function wasteTag(code) {
  return `<span class="tag w-${code.toLowerCase()}">${code}</span>`;
}

function updateStatus() {
  timerEl.textContent = timeLeft;
  scoreEl.textContent = score;
  foundCountEl.textContent = `${foundCount()} / ${scene.hotspots.length}`;
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
  if (buttonText) {
    popupBtn.textContent = buttonText;
    popupBtn.hidden = false;
  } else {
    popupBtn.hidden = true; // the waste picker has its own buttons
  }
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

// ===== Build the scene: artwork + invisible hotspots =====
function buildScene() {
  sceneEl.innerHTML = "";

  if (scene.image) {
    const img = document.createElement("img");
    img.src = scene.image;
    img.alt = scene.name;
    img.draggable = false;
    sceneEl.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "scene-placeholder";
    ph.textContent = "Scene artwork goes here (Step 4)";
    sceneEl.appendChild(ph);
  }

  scene.hotspots.forEach((h) => {
    const spot = document.createElement("div");
    spot.className = "hotspot";
    spot.dataset.id = h.id;
    spot.style.left = h.x + "%";
    spot.style.top = h.y + "%";
    spot.style.width = h.w + "%";
    spot.style.height = h.h + "%";
    if (SHOW_HOTSPOTS) {
      spot.classList.add("debug");
      spot.innerHTML = `<span class="debug-label">${h.label}</span>`;
    }
    sceneEl.appendChild(spot);
  });
}

// Color a hotspot once it's answered or revealed
function markSpot(h, state) {
  const spot = sceneEl.querySelector(`.hotspot[data-id="${h.id}"]`);
  spot.classList.remove("debug");
  spot.classList.add(state); // "found", "partial" or "missed"
  spot.style.setProperty("--c", `var(--w-${h.waste.toLowerCase()})`);
  spot.innerHTML = wasteTag(h.waste);
}

// ===== Load a scene and show the briefing =====
function loadScene(index = 0) {
  clearInterval(timerId);
  clearTimeout(revealTimeoutId);

  scene = SCENES[index];
  timeLeft = ROUND_SECONDS;
  score = 0;
  results = {};
  pendingId = null;
  active = false;

  sceneLabelEl.textContent = `Scene: ${scene.name}`;
  buildScene();
  updateStatus();

  showPopup(
    "Waste Hunt",
    scene.name,
    `<p>${scene.briefing}</p>
     <p>Right waste: <strong>+${POINTS_CORRECT}</strong> &nbsp;|&nbsp; Right spot, wrong waste: <strong>+${POINTS_PARTIAL}</strong></p>`,
    "Start Hunt",
  );
  setMode("start", "Start Hunt");
}
// ===== Scene menu =====
function showSceneMenu() {
  clearInterval(timerId);
  clearTimeout(revealTimeoutId);
  active = false;
  pendingId = null;

  sceneLabelEl.textContent = "Choose a scene";
  const buttons = SCENES.map(
    (s, i) => `
    <button class="scene-choice" data-index="${i}">
      ${s.image ? `<img src="${s.image}" alt="">` : ""}
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

// ===== Clicks on the scene =====
sceneEl.addEventListener("click", (event) => {
  if (!active || pendingId) return;

  const spot = event.target.closest(".hotspot");
  if (!spot) {
    showMiss(event);
    return;
  }
  if (results[spot.dataset.id]) return; // already found

  pendingId = spot.dataset.id;
  openPicker();
});

// Small "X" where a click found no waste (no penalty)
function showMiss(event) {
  const rect = sceneEl.getBoundingClientRect();
  const mark = document.createElement("div");
  mark.className = "miss-mark";
  mark.textContent = "✕";
  mark.style.left = ((event.clientX - rect.left) / rect.width) * 100 + "%";
  mark.style.top = ((event.clientY - rect.top) / rect.height) * 100 + "%";
  sceneEl.appendChild(mark);
  setTimeout(() => mark.remove(), 600);
}

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
  if (choice && pendingId) scoreAnswer(choice.dataset.waste);

  const sceneBtn = event.target.closest(".scene-choice");
  if (sceneBtn) loadScene(Number(sceneBtn.dataset.index));
});

// ===== Scoring with partial credit =====
function scoreAnswer(code) {
  const h = scene.hotspots.find((x) => x.id === pendingId);
  const correct = code === h.waste;
  const points = correct ? POINTS_CORRECT : POINTS_PARTIAL;

  score += points;
  results[h.id] = { chosen: code, correct, points };
  markSpot(h, correct ? "found" : "partial");

  pendingId = null;
  hidePopup();
  updateStatus();

  showToast(
    correct
      ? `Correct: ${WASTES[code].name} (+${points})`
      : `Partly right: this is ${WASTES[h.waste].name}, not ${WASTES[code].name} (+${points})`,
    correct,
  );

  if (foundCount() === scene.hotspots.length) endHunt();
}

// ===== End the hunt =====
function endHunt() {
  if (!active) return;
  clearInterval(timerId);
  active = false;
  pendingId = null;
  hidePopup();

  // Reveal everything that was missed
  scene.hotspots.forEach((h) => {
    if (!results[h.id]) markSpot(h, "missed");
  });

  setMode("restart", "Choose Scene");
  revealTimeoutId = setTimeout(showResults, REVEAL_DELAY);
}

// ===== Results and debrief pop-up =====
function showResults() {
  const total = scene.hotspots.length;
  const correct = Object.values(results).filter((r) => r.correct).length;
  const partial = foundCount() - correct;
  const missed = total - foundCount();

  const rows = scene.hotspots
    .map((h) => {
      const r = results[h.id];
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
      <td>${wasteTag(h.waste)}</td>
      <td><strong>${h.label}</strong><br><small>${h.why}</small></td>
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
    <p>Correct: <strong>${correct}</strong> &nbsp;|&nbsp; Right spot, wrong waste: <strong>${partial}</strong> &nbsp;|&nbsp; Missed: <strong>${missed}</strong></p>
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
  else showSceneMenu();
}

startBtn.addEventListener("click", handleMainButton);
popupBtn.addEventListener("click", handleMainButton);
// ===== Testing aid: log click position as % (only when SHOW_HOTSPOTS is true) =====
if (SHOW_HOTSPOTS) {
  sceneEl.addEventListener("click", (event) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
    console.log(`Clicked at x: ${x}, y: ${y}`);
  });
}
// ===== Run on page load =====
showSceneMenu();
