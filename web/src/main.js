import { loadModel, generateStanza, listRhymeClasses } from "./markov.js";
import "./style.css";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let model = null;

// Which rhyme slot receives the next "click-to-fill" action (A, B, or C).
let activeRhymeTarget = "A";

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const form          = document.getElementById("params-form");
const genBtn        = document.getElementById("generate-btn");
const outputSection = document.getElementById("output-section");
const stanzaOutput  = document.getElementById("stanza-output");
const seedDisplay   = document.getElementById("seed-display");
const errorBox      = document.getElementById("error-box");
const rhymesSection = document.getElementById("rhymes-section");
const rhymesList    = document.getElementById("rhymes-list");
const rhymeFilter   = document.getElementById("rhyme-filter");
const rhymeCount    = document.getElementById("rhyme-count");

const rhymeInputs = {
  A: document.getElementById("rhyme-a"),
  B: document.getElementById("rhyme-b"),
  C: document.getElementById("rhyme-c"),
};

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------
async function init() {
  try {
    genBtn.textContent = "A carregar modelo…";
    genBtn.disabled = true;
    model = await loadModel("/model.json");
    genBtn.textContent = "Gerar oitava";
    genBtn.disabled = false;
    populateRhymesList(model);
  } catch (err) {
    showError(`Erro ao carregar o modelo: ${err.message}`);
    genBtn.textContent = "Erro ao carregar";
  }
}

// ---------------------------------------------------------------------------
// Form submission → generate
// ---------------------------------------------------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!model) return;

  hideError();
  outputSection.hidden = true;

  const rhymeA = rhymeInputs.A.value.trim();
  const rhymeB = rhymeInputs.B.value.trim();
  const rhymeC = rhymeInputs.C.value.trim();

  if (!rhymeA || !rhymeB || !rhymeC) {
    showError("Por favor preencha as três rimas (A, B e C).");
    return;
  }

  const targetSylStr = document.getElementById("target-syllables").value.trim();
  const targetSyllables = parseInt(targetSylStr, 10);
  if (!targetSylStr || isNaN(targetSyllables) || targetSyllables < 1) {
    showError("O número de sílabas métricas é obrigatório e deve ser um inteiro positivo.");
    return;
  }
  const triesVerse   = parseInt(document.getElementById("tries-verse").value, 10);
  const triesStanza  = parseInt(document.getElementById("tries-stanza").value, 10);
  const seedStr      = document.getElementById("seed").value.trim();
  const seed         = seedStr === "" ? null : parseInt(seedStr, 10);

  genBtn.disabled = true;
  genBtn.textContent = "A gerar…";

  // Run generation asynchronously so the browser can paint the "A gerar…" state.
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        const result = generateStanza(model, rhymeA, rhymeB, rhymeC, targetSyllables, {
          triesPerVerse: triesVerse,
          triesPerStanza: triesStanza,
          seed,
        });

        if (!result) {
          showError(
            "Não foi possível gerar uma oitava com estas rimas e parâmetros. " +
            "Tente outras rimas ou aumente o número de tentativas."
          );
        } else {
          renderStanza(result);
        }
      } catch (err) {
        showError(err.message);
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = "Gerar oitava";
      }
    }, 0);
  });
});

// ---------------------------------------------------------------------------
// Stanza rendering
// ---------------------------------------------------------------------------
const SCHEME = "ABABABCC";

function renderStanza({ stanza, syllables, seed: usedSeed }) {
  stanzaOutput.innerHTML = "";

  stanza.forEach((verse, i) => {
    const letter = SCHEME[i];
    const syl    = syllables[i];

    const row = document.createElement("div");
    row.className = `verse verse-${letter.toLowerCase()}`;

    const label = document.createElement("span");
    label.className = "rhyme-label";
    label.textContent = letter;
    label.setAttribute("aria-label", `Rima ${letter}`);

    const text = document.createElement("span");
    text.className = "verse-text";
    text.textContent = verse;

    const count = document.createElement("span");
    count.className = "syl-count";
    count.textContent = `[${syl}]`;
    count.setAttribute("aria-label", `${syl} sílabas métricas`);

    row.appendChild(label);
    row.appendChild(text);
    row.appendChild(count);
    stanzaOutput.appendChild(row);
  });

  seedDisplay.textContent = `Semente usada: ${usedSeed}`;
  outputSection.hidden = false;
  outputSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------------------------------------------------------------------------
// Rhyme classes browser
// ---------------------------------------------------------------------------
let allRhymeClasses = [];

function populateRhymesList(m) {
  allRhymeClasses = listRhymeClasses(m);
  renderRhymesList(allRhymeClasses);
  rhymesSection.hidden = false;
}

function renderRhymesList(classes) {
  rhymesList.innerHTML = "";
  rhymeCount.textContent = `${classes.length} classes`;

  classes.forEach(({ key, examples, total }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "rhyme-chip";
    chip.dataset.key = key;

    const keySpan = document.createElement("span");
    keySpan.className = "chip-key";
    keySpan.textContent = key;

    const exSpan = document.createElement("span");
    exSpan.className = "chip-examples";
    exSpan.textContent = examples.join(", ");

    chip.appendChild(keySpan);
    chip.appendChild(exSpan);
    chip.title = `${total} ocorrências — clique para copiar para a rima selecionada`;

    chip.addEventListener("click", () => fillRhyme(key));
    rhymesList.appendChild(chip);
  });
}

rhymeFilter.addEventListener("input", () => {
  const q = rhymeFilter.value.trim().toLowerCase();
  if (!q) {
    renderRhymesList(allRhymeClasses);
    return;
  }
  const filtered = allRhymeClasses.filter(
    ({ key, examples }) => key.includes(q) || examples.some((e) => e.includes(q))
  );
  renderRhymesList(filtered);
});

// ---------------------------------------------------------------------------
// Rhyme slot selection
// ---------------------------------------------------------------------------
function fillRhyme(key) {
  rhymeInputs[activeRhymeTarget].value = key;
  // Advance target: A → B → C → A.
  const order = ["A", "B", "C"];
  activeRhymeTarget = order[(order.indexOf(activeRhymeTarget) + 1) % 3];
  updateActiveRhymeHighlight();
}

function updateActiveRhymeHighlight() {
  document.querySelectorAll(".rhyme-target-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === activeRhymeTarget);
  });
}

// Build the A/B/C selector buttons next to the fieldset legend.
function buildRhymeTargetButtons() {
  const legend = document.querySelector("fieldset:first-of-type legend");
  const wrap = document.createElement("span");
  wrap.className = "target-btn-group";
  wrap.setAttribute("aria-label", "Selecione qual rima será preenchida ao clicar numa classe");

  ["A", "B", "C"].forEach((letter) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rhyme-target-btn";
    btn.dataset.target = letter;
    btn.textContent = letter;
    btn.setAttribute("aria-pressed", letter === activeRhymeTarget ? "true" : "false");
    btn.addEventListener("click", () => {
      activeRhymeTarget = letter;
      updateActiveRhymeHighlight();
      document.querySelectorAll(".rhyme-target-btn").forEach((b) => {
        b.setAttribute("aria-pressed", b.dataset.target === activeRhymeTarget ? "true" : "false");
      });
    });
    wrap.appendChild(btn);
  });

  legend.appendChild(wrap);
  updateActiveRhymeHighlight();
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildRhymeTargetButtons();
init();
