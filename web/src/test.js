import { loadModel, generateStanza } from "./markov.js";

const btn = document.getElementById("gen-btn");
const p1  = document.getElementById("p1");
const p2  = document.getElementById("p2");
const p3  = document.getElementById("p3");

let model = null;

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "…";

  try {
    if (!model) model = await loadModel(`${import.meta.env.BASE_URL}model.json`);

    const result = await generateStanza(model, "ados", "al", "aram", 10);

    if (!result) {
      p1.textContent = "O Camões ficou chateado";
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
    btn.textContent = "maid uma";
  }
});
