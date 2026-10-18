import { loadModel, generateStanza, listRhymeClasses } from "./markov.js";

const btn     = document.getElementById("gen-btn");
const p1      = document.getElementById("p1");
const p2      = document.getElementById("p2");
const p3      = document.getElementById("p3");
const selectA = document.getElementById("rhyme-a");
const selectB = document.getElementById("rhyme-b");
const selectC = document.getElementById("rhyme-c");

let model = null;

// Persists across clicks; reset when any rhyme selection changes.
let usedFinals = new Set();

const MAX_ATTEMPTS = 10;

/** Extract the final word from a verse string. */
function finalWord(verse) {
  const words = verse.trim().toLowerCase().match(/[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*/g);
  return words ? words[words.length - 1] : null;
}

/** Populate all three selects from the model's rhyme classes (sorted by frequency). */
function populateSelects(m) {
  const classes = listRhymeClasses(m); // sorted by total descending

  [selectA, selectB, selectC].forEach((sel, i) => {
    const current = sel.value;
    sel.innerHTML = "";
    classes.forEach(({ key, examples }) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      opt.title = examples.slice(0, 5).join(", ");
      sel.appendChild(opt);
    });
    // Default each select to a different top rhyme class.
    if (classes[i]) sel.value = classes[i].key;
    // Restore previous selection if still valid.
    if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
  });
}

// Reset usedFinals whenever the user changes a rhyme — new combination, fresh slate.
[selectA, selectB, selectC].forEach((sel) => {
  sel.addEventListener("change", () => { usedFinals = new Set(); });
});

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "…";

  try {
    if (!model) {
      model = await loadModel(`${import.meta.env.BASE_URL}model.json`);
      populateSelects(model);
    }

    const rhymeA = selectA.value;
    const rhymeB = selectB.value;
    const rhymeC = selectC.value;

    if (!rhymeA || !rhymeB || !rhymeC) {
      p1.textContent = "Escolhe as três rimas primeiro.";
      p2.textContent = "";
      p3.textContent = "";
      return;
    }

    let result = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = await generateStanza(model, rhymeA, rhymeB, rhymeC, 10);
      if (!candidate) continue;

      const finals = candidate.stanza.map(finalWord);

      // All 8 finals must be non-null, distinct from each other, and not used before.
      const allDistinct = finals.every(Boolean)
        && new Set(finals).size === finals.length
        && finals.every((w) => !usedFinals.has(w));

      if (allDistinct) {
        result = candidate;
        finals.forEach((w) => usedFinals.add(w));
        break;
      }
    }

    if (!result) {
      p1.textContent = "O Camões ficou chateado.";
      p2.textContent = "";
      p3.textContent = "";
    } else {
      const { stanza } = result;
      // ABABABCC — 8 verses; spread across the three paragraphs (3 / 3 / 2)
      p1.textContent = stanza.slice(0, 3).join("\n");
      p2.textContent = stanza.slice(3, 6).join("\n");
      p3.textContent = stanza.slice(6, 8).join("\n");
      p1.style.whiteSpace = "pre-line";
      p2.style.whiteSpace = "pre-line";
      p3.style.whiteSpace = "pre-line";
    }
  } catch (err) {
    p1.textContent = `Erro: ${err.message}`;
    p2.textContent = "";
    p3.textContent = "";
  } finally {
    btn.disabled = false;
    btn.textContent = "mais uma";
  }
});
