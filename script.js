// ===== Game settings =====
const PART_SECONDS = 20; // time for each part
const POINTS_CORRECT = 10; // right spot, right waste
const POINTS_PARTIAL = 5; // right spot, wrong waste
const REVEAL_DELAY = 1500; // ms to show missed spots before the part results
const SHOW_HOTSPOTS = true; // testing aid. Set to false for real sessions.

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

const toastEl = document.createElement("div");
toastEl.className = "toast hidden";
sceneWrapEl.appendChild(toastEl);

// ===== Game state =====
let scene = SCENES[0];
let partIndex = 0;
let timeLeft = PART_SECONDS;
let timerId = null;
let revealTimeoutId = null;
let toastTimeoutId = null;
let active = false;
let pendingId = null;
let score = 0;
let results = {}; // hotspot id -> { chosen, correct, points }
let buttonMode = "menu"; // "start", "nextPart", "results", "menu"

// ===== Helpers =====
function part() {
  return scene.parts[partIndex];
}
function allHotspots() {
  return scene.parts.flatMap((p) => p.hotspots);
}
function foundInPart() {
  return part().hotspots.filter((h) => results[h.id]).length;
}
function maxScore() {
  return allHotspots().length * POINTS_CORRECT;
}
function partLabel() {
  return `Part ${partIndex + 1} of ${scene.parts.length}: ${part().name}`;
}
function isLastPart() {
  return partIndex === scene.parts.length - 1;
}

function wasteTag(code) {
  return `<span class="tag w-${code.toLowerCase()}">${code}</span>`;
}

function updateStatus() {
  timerEl.textContent = timeLeft;
  scoreEl.textContent = score;
  foundCountEl.textContent = `${foundInPart()} / ${part().hotspots.length}`;
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
    popupBtn.hidden = true;
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

// ===== Build the current part: artwork + hotspots =====
function buildScene() {
  sceneEl.innerHTML = "";

  if (part().image) {
    const img = document.createElement("img");
    img.src = part().image;
    img.alt = `${scene.name}: ${part().name}`;
    img.draggable = false;
    sceneEl.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "scene-placeholder";
    ph.textContent = `Artwork coming: ${part().name}`;
    sceneEl.appendChild(ph);
  }

  part().hotspots.forEach((h) => {
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

function markSpot(h, state) {
  const spot = sceneEl.querySelector(`.hotspot[data-id="${h.id}"]`);
  spot.classList.remove("debug");
  spot.classList.add(state);
  spot.style.setProperty("--c", `var(--w-${h.waste.toLowerCase()})`);
  spot.innerHTML = wasteTag(h.waste);
}

// ===== Scene menu =====
function showSceneMenu() {
  clearInterval(timerId);
  clearTimeout(revealTimeoutId);
  active = false;
  pendingId = null;

  sceneLabelEl.textContent = "Choose a scene";
  const buttons = SCENES.map((s, i) => {
    const img = s.thumb || s.parts[0].image;
    return `<button class="scene-choice" data-index="${i}">
      ${img ? `<img src="${img}" alt="">` : ""}
      <span>${s.name}</span>
      <small>${s.parts.length} parts</small>
    </button>`;
  }).join("");

  showPopup(
    "Waste Hunt",
    "Choose a scene",
    `<div class="scene-grid">${buttons}</div>`,
    null,
  );
  setMode("menu", "Choose a scene", true);
}

// ===== Load a scene (starts at Part 1) =====
function loadScene(index) {
  scene = SCENES[index];
  partIndex = 0;
  score = 0;
  results = {};
  loadPart(true);
}

// ===== Load a part and show its briefing =====
function loadPart(first = false) {
  clearInterval(timerId);
  clearTimeout(revealTimeoutId);
  timeLeft = PART_SECONDS;
  pendingId = null;
  active = false;

  sceneLabelEl.textContent = `${scene.name}: Part ${partIndex + 1} of ${scene.parts.length}`;
  buildScene();
  updateStatus();

  const count = part().hotspots.length;
  const html = `
    ${first ? `<p>${scene.briefing}</p>` : ""}
    <p><strong>${part().name}:</strong> ${part().intro}</p>
    <p>There are <strong>${count} wastes</strong> to find in ${PART_SECONDS} seconds.</p>
    ${first ? `<p>Right waste: <strong>+${POINTS_CORRECT}</strong> &nbsp;|&nbsp; Right spot, wrong waste: <strong>+${POINTS_PARTIAL}</strong></p>` : ""}
  `;
  showPopup(partLabel(), first ? scene.name : part().name, html, "Start");
  setMode("start", "Start");
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
    if (timeLeft <= 0) endPart();
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
  if (results[spot.dataset.id]) return;

  pendingId = spot.dataset.id;
  openPicker();
});

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
  const h = part().hotspots.find((x) => x.id === pendingId);
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

  if (foundInPart() === part().hotspots.length) endPart();
}

// ===== End a part =====
function endPart() {
  if (!active) return;
  clearInterval(timerId);
  active = false;
  pendingId = null;
  hidePopup();

  part().hotspots.forEach((h) => {
    if (!results[h.id]) markSpot(h, "missed");
  });

  setMode("wait", "Reviewing...", true);
  revealTimeoutId = setTimeout(showPartResults, REVEAL_DELAY);
}

// ===== Short results after each part (teaching moment) =====
function resultRow(h, showPart = false) {
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
  const partName = showPart
    ? scene.parts.find((p) => p.hotspots.includes(h)).name
    : "";
  return `<tr class="${rowClass}">
    <td>${wasteTag(h.waste)}</td>
    <td>${showPart ? `<small>${partName}</small><br>` : ""}<strong>${h.label}</strong><br><small>${h.why}</small></td>
    <td>${answer}</td>
    <td>${r ? r.points : 0}</td>
  </tr>`;
}

function showPartResults() {
  const rows = part()
    .hotspots.map((h) => resultRow(h))
    .join("");
  const nextText = isLastPart()
    ? "See Final Results"
    : `Next: Part ${partIndex + 2}`;

  showPopup(
    partLabel(),
    `${part().name} complete`,
    `
    <p>Found <strong>${foundInPart()} of ${part().hotspots.length}</strong>. Running score: <strong>${score}</strong></p>
    <table class="results-table">
      <thead><tr><th>Waste</th><th>What was there</th><th>Your answer</th><th>Pts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `,
    nextText,
  );
  setMode(isLastPart() ? "results" : "nextPart", nextText);
}

// ===== Final results and debrief =====
function showResults() {
  const spots = allHotspots();
  const correct = Object.values(results).filter((r) => r.correct).length;
  const found = Object.keys(results).length;
  const partial = found - correct;
  const missed = spots.length - found;

  const rows = spots.map((h) => resultRow(h, true)).join("");
  const debrief = scene.debrief.map((q) => `<li>${q}</li>`).join("");

  showPopup(
    scene.name,
    "Scene complete: results",
    `
    <p>Score: <strong>${score} / ${maxScore()}</strong></p>
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
  setMode("menu", "Choose Scene");
}

// ===== Both buttons share one handler =====
function handleMainButton() {
  if (buttonMode === "start") startHunt();
  else if (buttonMode === "nextPart") {
    partIndex++;
    loadPart();
  } else if (buttonMode === "results") showResults();
  else if (buttonMode === "menu") showSceneMenu();
}

startBtn.addEventListener("click", handleMainButton);
popupBtn.addEventListener("click", handleMainButton);

// ===== Testing aid: log click position as % =====
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
