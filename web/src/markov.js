/**
 * markov.js
 * JavaScript port of the Python Markov stanza generator.
 *
 * Ported from:
 *   markov_utils.py  – approximate_rhyme_key, count_metric_syllables, _final_stress_adjustment
 *   markov_generate.py – generate_inverse_stanza, generate_stanza, ends_with_rhyme, validate_rhyme
 *   markov_model.py  – loadModel (JSON → in-memory model)
 *
 * Syllable counting note: the Python implementation uses pyphen (a full
 * Hunspell-backed hyphenation library). In the browser we use a vowel-nucleus
 * heuristic instead, which is less accurate but good enough for the
 * interactive demo. Per-word syllable counts are looked up from the
 * pre-computed `vocabulary` object in the model whenever possible, so for
 * known corpus words the result is identical to the Python version.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RHYME_SCHEME = "ABABABCC";

const VOWELS = "aeiouáéíóúâêôàãõ";
const VOWELS_SET = new Set(VOWELS);
const ACCENTED_VOWELS = new Set("áéíóúâêô");

// ---------------------------------------------------------------------------
// Unicode / text helpers
// ---------------------------------------------------------------------------

/** NFC-normalise and lowercase. */
function normalise(word) {
  return word.normalize("NFC").toLowerCase();
}

/** Strip all chars that are not Portuguese word chars. */
function wordChars(word) {
  return word.replace(/[^a-záéíóúâêôàãõç]/g, "");
}

// ---------------------------------------------------------------------------
// Syllable counting (heuristic – used only for OOV words)
// ---------------------------------------------------------------------------

/**
 * Count syllable nuclei (groups of consecutive vowels = one nucleus).
 * This is a fallback used only when a word is not in the vocabulary.
 */
export function countSyllables(word) {
  const w = normalise(word);
  const nuclei = (w.match(/[aeiouáéíóúâêôàãõ]+/g) || []).length;
  return Math.max(1, nuclei);
}

// ---------------------------------------------------------------------------
// Final-word stress adjustment
// ---------------------------------------------------------------------------

function finalStressAdjustment(word) {
  // word must already be normalised + stripped to word chars.
  const vowelIndices = [];
  for (let i = 0; i < word.length; i++) {
    if (VOWELS_SET.has(word[i])) vowelIndices.push(i);
  }
  if (vowelIndices.length === 0) return 0;

  const lastVowelIdx = vowelIndices[vowelIndices.length - 1];
  const lastVowel = word[lastVowelIdx];

  // Explicit acute/circumflex on the very last vowel nucleus → oxytone.
  if (ACCENTED_VOWELS.has(lastVowel)) return +1;

  const paroxytoneEndings = [
    "a", "e", "o", "i", "u",
    "as", "es", "os", "is", "us",
    "am", "em", "om",
    "ns", "ens",
    "ão", "ões", "ram",
  ];
  const isParoxytone = paroxytoneEndings.some((e) => word.endsWith(e));

  if (isParoxytone) {
    // Proparoxytone: explicit accent on a vowel before the last.
    const accentuated = vowelIndices.filter((i) => ACCENTED_VOWELS.has(word[i]));
    if (accentuated.length > 0 && accentuated[accentuated.length - 1] < lastVowelIdx) {
      return -1;
    }
    return 0;
  }

  // Ends in a consonant not in the paroxytone set → oxytone.
  return +1;
}

// ---------------------------------------------------------------------------
// Metric syllable counting
// ---------------------------------------------------------------------------

/**
 * Count metric (poetic) syllables for an array of words.
 *
 * @param {string[]} words
 * @param {Record<string, number>} syllablesMap  word → syllable count (from vocabulary)
 * @returns {number}
 */
export function countMetricSyllables(words, syllablesMap) {
  if (!words.length) return 0;

  let total = words.reduce((s, w) => s + (syllablesMap[w] ?? countSyllables(w)), 0);

  // Synaloepha: vowel-final word followed by vowel-initial word → -1.
  for (let i = 0; i < words.length - 1; i++) {
    const lastChar = words[i][words[i].length - 1];
    const firstChar = words[i + 1][0];
    if (VOWELS_SET.has(lastChar) && VOWELS_SET.has(firstChar)) {
      total -= 1;
    }
  }

  // Final-word stress adjustment.
  const last = wordChars(normalise(words[words.length - 1]));
  if (last) total += finalStressAdjustment(last);

  return total;
}

// ---------------------------------------------------------------------------
// Approximate rhyme key
// ---------------------------------------------------------------------------

const rhymeCache = new Map();

/**
 * Orthographic rhyme key heuristic – port of markov_utils.approximate_rhyme_key.
 * @param {string} word
 * @returns {string}
 */
export function approximateRhymeKey(word) {
  const cached = rhymeCache.get(word);
  if (cached !== undefined) return cached;

  let w = normalise(word);
  w = w.replace(/[^a-záéíóúâêôàãõç-]/g, "");
  if (!w) {
    rhymeCache.set(word, "");
    return "";
  }

  // Last explicitly accented vowel → use it as rhyme start.
  let accentIdx = -1;
  for (let i = w.length - 1; i >= 0; i--) {
    if (ACCENTED_VOWELS.has(w[i])) { accentIdx = i; break; }
  }
  if (accentIdx >= 0) {
    const key = w.slice(accentIdx);
    rhymeCache.set(word, key);
    return key;
  }

  // No written accent: collect all vowel positions.
  const vowelIndices = [];
  for (let i = 0; i < w.length; i++) {
    if (VOWELS_SET.has(w[i])) vowelIndices.push(i);
  }

  if (!vowelIndices.length) {
    const key = w.length >= 3 ? w.slice(-3) : w;
    rhymeCache.set(word, key);
    return key;
  }

  const penultimateEndings = [
    "a", "e", "o", "as", "es", "os",
    "am", "em", "ens", "ão", "ões", "ram",
  ];
  const usePenultimate = penultimateEndings.some((e) => w.endsWith(e)) && vowelIndices.length >= 2;

  const start = usePenultimate
    ? vowelIndices[vowelIndices.length - 2]
    : vowelIndices[vowelIndices.length - 1];

  const key = w.slice(start);
  rhymeCache.set(word, key);
  return key;
}

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

/**
 * Load model.json and return the in-memory model object.
 * Builds the starts_by_final index that the Python dataclass builds in __post_init__.
 *
 * @param {string} url  URL to model.json (default: '/model.json')
 * @returns {Promise<Model>}
 */
export async function loadModel(url = "/model.json") {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load model: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();

  // Transitions: "w1 w2" → { word: count, … }
  const transitions = {};
  for (const [key, counter] of Object.entries(data.transitions)) {
    transitions[key] = counter; // keep as plain object; we iterate .entries() later
  }

  // starts_by_final: finalWord → [ "w1 w2", … ] (the pairs that START with finalWord)
  // In the Python model: pair = (verse_inverse[-2], verse_inverse[-1])
  // verse_inverse[0] = first chosen word = final word of the reversed verse.
  // The Python index maps final → list of pairs starting with it.
  // Transition key = "word[i-2] word[i-1]" in the REVERSE walk order,
  // so the first element of the pair is the "current tip" of the expanding verse.
  // starts_by_final[w] = all keys whose first token == w.
  const startsByFinal = {};
  for (const key of Object.keys(transitions)) {
    const spaceIdx = key.indexOf(" ");
    const first = key.slice(0, spaceIdx);
    if (!startsByFinal[first]) startsByFinal[first] = [];
    startsByFinal[first].push(key);
  }

  return {
    transitions,
    finals_by_rhyme: data.finals_by_rhyme,
    vocabulary: data.vocabulary,      // word → { count, syllables }
    starts_by_final: startsByFinal,
  };
}

// ---------------------------------------------------------------------------
// PRNG (seeded) – xoshiro128** (32-bit output, fast, good quality)
// ---------------------------------------------------------------------------

function makePRNG(seed) {
  // Splitmix64-inspired 32-bit seed expansion.
  let s0 = seed ^ 0xdeadbeef;
  let s1 = seed ^ 0x12345678;
  let s2 = seed ^ 0xabcdef01;
  let s3 = seed ^ 0x87654321;

  function next() {
    // xoshiro128** step.
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  }
  function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

  /** Uniform float in [0, 1). */
  function random() { return (next() >>> 0) / 0x100000000; }

  /** Pick a random element from an array. */
  function choice(arr) { return arr[Math.floor(random() * arr.length)]; }

  /**
   * Weighted random choice from parallel arrays items/weights.
   * Returns null for an empty array.
   */
  function weightedChoice(items, weights) {
    if (!items.length) return null;
    const total = weights.reduce((s, w) => s + w, 0);
    let r = random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates in-place shuffle. */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  return { random, choice, weightedChoice, shuffle };
}

// ---------------------------------------------------------------------------
// Rhyme validation
// ---------------------------------------------------------------------------

/**
 * Returns the rhyme key for a word, or throws if the corpus has no such class.
 * @param {object} model
 * @param {string} rhyme
 * @returns {string}  the rhyme key
 */
export function validateRhyme(model, rhyme) {
  const key = approximateRhymeKey(rhyme);
  if (!key) throw new Error(`Invalid rhyme "${rhyme}": no letters left after normalisation.`);
  if (!model.finals_by_rhyme[key]) {
    // Simple close-match: find keys that share a common suffix.
    const allKeys = Object.keys(model.finals_by_rhyme);
    const close = allKeys
      .map((k) => ({ k, score: longestCommonSuffix(k, key) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ k }) => k);
    const hint = close.length ? ` Did you mean: ${close.join(", ")}?` : "";
    throw new Error(`Rhyme "${rhyme}" (key "${key}") does not occur in the corpus.${hint}`);
  }
  return key;
}

function longestCommonSuffix(a, b) {
  let i = a.length - 1, j = b.length - 1, len = 0;
  while (i >= 0 && j >= 0 && a[i] === b[j]) { i--; j--; len++; }
  return len;
}

// ---------------------------------------------------------------------------
// ends_with_rhyme
// ---------------------------------------------------------------------------

const WORD_RE = /[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*/g;

export function endsWithRhyme(verse, expectedKey) {
  const words = [...verse.toLowerCase().matchAll(WORD_RE)].map((m) => m[0]);
  if (!words.length) return false;
  return approximateRhymeKey(words[words.length - 1]) === expectedKey;
}

// ---------------------------------------------------------------------------
// generate_inverse_stanza
// ---------------------------------------------------------------------------

/**
 * Port of markov_generate.generate_inverse_stanza.
 *
 * @param {object} model
 * @param {string} rhyme         – target rhyme word / ending
 * @param {number} maxWords
 * @param {object} rng           – PRNG returned by makePRNG
 * @param {number|null} targetSyllables
 * @returns {string|null}
 */
export function generateInverseStanza(model, rhyme, maxWords, rng, targetSyllables) {
  const rhymeKey = approximateRhymeKey(rhyme);
  const finals = model.finals_by_rhyme[rhymeKey];
  if (!finals) return null;

  const finalCandidates = Object.keys(finals);
  rng.shuffle(finalCandidates);

  // Uniform choice (matching the Python code: weighted line is commented out).
  const finalWord = rng.choice(finalCandidates);
  const pairs = model.starts_by_final[finalWord];
  if (!pairs) {
    // Word exists but lacks context in the model.
    if (targetSyllables !== null) return null;
    return capitalise(finalWord);
  }

  const pair = rng.choice(pairs);           // pair is "w1 w2"
  const spaceIdx = pair.indexOf(" ");
  const w0 = pair.slice(0, spaceIdx);
  const w1 = pair.slice(spaceIdx + 1);
  const verseInverse = [w0, w1];

  while (verseInverse.length < maxWords) {
    const last2 = verseInverse[verseInverse.length - 2] + " " + verseInverse[verseInverse.length - 1];
    const options = model.transitions[last2];
    if (!options) break;
    const items = Object.keys(options);
    const weights = Object.values(options);
    const nextWord = rng.weightedChoice(items, weights);
    if (!nextWord) break;
    verseInverse.push(nextWord);
  }

  const verseWords = [...verseInverse].reverse();

  if (targetSyllables !== null) {
    const sylMap = {};
    for (const w of verseWords) {
      if (model.vocabulary[w]) sylMap[w] = model.vocabulary[w].syllables;
    }
    if (countMetricSyllables(verseWords, sylMap) !== targetSyllables) return null;
  }

  return capitalise(verseWords.join(" "));
}

function capitalise(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// generate_stanza
// ---------------------------------------------------------------------------

/**
 * Port of markov_generate.generate_stanza.
 *
 * @param {object} model
 * @param {string} rhymeA
 * @param {string} rhymeB
 * @param {string} rhymeC
 * @param {object} opts
 * @param {number}      [opts.maxWords=10]
 * @param {number}      [opts.triesPerVerse=30]
 * @param {number}      [opts.triesPerStanza=20]
 * @param {number|null} [opts.seed=null]          null → random seed
 * @param {number|null} [opts.targetSyllables=10]
 * @returns {{ stanza: string[], syllables: number[] }|null}
 *   Returns an object with the stanza lines and their metric syllable counts,
 *   or null on failure.
 */
export function generateStanza(model, rhymeA, rhymeB, rhymeC, opts = {}) {
  const {
    maxWords = 10,
    triesPerVerse = 30,
    triesPerStanza = 20,
    seed = null,
    targetSyllables = 10,
  } = opts;

  if (maxWords < 2) throw new Error(`maxWords must be at least 2, got ${maxWords}.`);
  if (triesPerVerse < 1 || triesPerStanza < 1) {
    throw new Error(
      `triesPerVerse and triesPerStanza must be at least 1, got ${triesPerVerse} and ${triesPerStanza}.`
    );
  }

  const classes = { A: rhymeA, B: rhymeB, C: rhymeC };
  const keys = {};
  for (const [letter, rhyme] of Object.entries(classes)) {
    keys[letter] = validateRhyme(model, rhyme);
  }

  const effectiveSeed = seed !== null ? seed : Math.floor(Math.random() * 0xffffffff);
  const rng = makePRNG(effectiveSeed);
  const schema = [...RHYME_SCHEME]; // ['A','B','A','B','A','B','C','C']

  for (let stanzaTry = 0; stanzaTry < triesPerStanza; stanzaTry++) {
    const stanza = [];
    let failed = false;

    for (const letter of schema) {
      const rhyme = classes[letter];
      const key = keys[letter];
      let accepted = null;

      for (let verseTry = 0; verseTry < triesPerVerse; verseTry++) {
        const candidate = generateInverseStanza(
          model, rhyme, maxWords, rng, targetSyllables
        );
        if (candidate && endsWithRhyme(candidate, key)) {
          accepted = candidate;
          break;
        }
      }

      if (!accepted) { failed = true; break; }
      stanza.push(accepted);
    }

    if (!failed && stanza.length === 8) {
      const valid = stanza.every((verse, i) => endsWithRhyme(verse, keys[schema[i]]));
      if (valid) {
        // Compute metric syllable counts for display.
        const syllables = stanza.map((verse) => {
          const words = [...verse.toLowerCase().matchAll(WORD_RE)].map((m) => m[0]);
          const sylMap = {};
          for (const w of words) {
            if (model.vocabulary[w]) sylMap[w] = model.vocabulary[w].syllables;
          }
          return countMetricSyllables(words, sylMap);
        });
        return { stanza, syllables, seed: effectiveSeed };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: list rhyme classes sorted by frequency
// ---------------------------------------------------------------------------

/**
 * Returns an array of { key, examples, total } sorted by total descending.
 * @param {object} model
 * @returns {Array<{key: string, examples: string[], total: number}>}
 */
export function listRhymeClasses(model) {
  return Object.entries(model.finals_by_rhyme)
    .map(([key, counts]) => ({
      key,
      examples: Object.keys(counts).slice(0, 6),
      total: Object.values(counts).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);
}
