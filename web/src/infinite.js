import { loadModel, generateStanza, listRhymeClasses } from "./markov.js";

const INTERVAL_MS = 3000;
const FADE_MS = 800; // must match the CSS transition duration

const COLUMNS = [
  document.getElementById("col-0"),
  document.getElementById("col-1"),
  document.getElementById("col-2"),
];
const STATUS = document.getElementById("status");

let model = null;
let rhymeKeys = [];

// Track which of the two layers is currently visible per column (0 or 1).
const activeLayer = [0, 0, 0];

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------
async function init() {
  STATUS.textContent = "A carregar modelo…";
  try {
    model = await loadModel(`${import.meta.env.BASE_URL}model.json`);
    rhymeKeys = listRhymeClasses(model).map((c) => c.key);
    STATUS.textContent = "";
    startLoop();
  } catch (err) {
    STATUS.textContent = `Erro ao carregar o modelo: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildStanzaHTML(result, a, b, c) {
  const frag = document.createDocumentFragment();

  if (!result) {
    const msg = document.createElement("p");
    msg.className = "stanza-error";
    msg.textContent = "O Camões ficou chateado.";
    frag.appendChild(msg);
    return frag;
  }

  const { stanza, syllables } = result;
  stanza.forEach((verse, i) => {
    const line = document.createElement("p");
    line.className = "verse";
    line.textContent = verse;
    frag.appendChild(line);
  });

  const tag = document.createElement("p");
  tag.className = "rhyme-tag";
  tag.textContent = `${a} · ${b} · ${c}`;
  frag.appendChild(tag);

  return frag;
}

// ---------------------------------------------------------------------------
// Crossfade a single column:
//   1. Generate new content (happens while old layer is still visible).
//   2. Write content into the hidden (back) layer.
//   3. Swap visibility: back becomes visible, front fades out.
//   4. Wait for the CSS transition to finish, then update bookkeeping.
// ---------------------------------------------------------------------------
async function crossfadeColumn(col, colIndex) {
  // Pick three distinct random rhyme classes.
  let a, b, c;
  do { a = pickRandom(rhymeKeys); } while (!a);
  do { b = pickRandom(rhymeKeys); } while (!b || b === a);
  do { c = pickRandom(rhymeKeys); } while (!c || c === a || c === b);

  // Generate while the current content is still on screen.
  const result = await generateStanza(model, a, b, c, 10);

  const layers = col.querySelectorAll(".layer");
  const front = activeLayer[colIndex];       // currently visible
  const back  = 1 - front;                  // hidden, receives new content

  // Write into the back layer (still opacity 0).
  layers[back].innerHTML = "";
  layers[back].appendChild(buildStanzaHTML(result, a, b, c));

  // Crossfade: show back, hide front.
  layers[back].classList.add("visible");
  layers[front].classList.remove("visible");

  // Wait for the CSS transition to finish before the next tick uses this column.
  await new Promise((resolve) => setTimeout(resolve, FADE_MS));

  activeLayer[colIndex] = back;
}

// ---------------------------------------------------------------------------
// Round-robin loop: col 0 → col 1 → col 2 → col 0 → …
// Each step waits INTERVAL_MS before triggering the next column's crossfade.
// ---------------------------------------------------------------------------
function startLoop() {
  let colIndex = 0;

  async function tick() {
    await crossfadeColumn(COLUMNS[colIndex], colIndex);
    colIndex = (colIndex + 1) % COLUMNS.length;
    setTimeout(tick, INTERVAL_MS);
  }

  tick();
}

init();
