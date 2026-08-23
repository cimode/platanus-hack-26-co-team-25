import { describe, expect, it } from "vitest";

import { contentWords, repeatedBy, tooSimilar } from "./similarity.ts";

/**
 * `tooSimilar` is the refusal behind the prompt's "do not repeat" request. The
 * pairs below are real: the first two were shipped to participants as two
 * different blocks each, twenty seconds apart, by a pipeline that only *asked*
 * the model not to repeat itself.
 */

describe("tooSimilar", () => {
  it("catches the same anecdote told at a different lunch", () => {
    expect(
      tooSimilar(
        "En el almuerzo familiar tu tío cuenta una anécdota que ya todos conocen",
        "En el almuerzo navideño tu tía llega con un desconocido que cuenta la misma anécdota"
      )
    ).toBe(true);
  });

  it("lets the same motif with a different object through — motifs are the prompt's job", () => {
    // One shared phrase ("idéntico tuyo") and two shared words: a coincidence
    // at the scale of a room's forty newest scenarios, not a retelling.
    expect(
      tooSimilar(
        "Un perro callejero idéntico al tuyo te sigue a casa",
        "Un carrito idéntico al tuyo aparece en tu puesto"
      )
    ).toBe(false);
  });

  it("catches two shared phrases even with few shared words", () => {
    expect(
      tooSimilar(
        "Tu vecino saca un flamenco de plástico de tamaño real al balcón",
        "En el apagón la linterna revela un flamenco de plástico de tamaño real en la sala"
      )
    ).toBe(true);
  });

  it("lets two unrelated scenarios through", () => {
    const unrelated: [string, string][] = [
      [
        "Tu vecino te devuelve la licuadora llena de arena.",
        "Un perro entra a la boda y se lleva el ramo.",
      ],
      [
        "El taxi que pediste llega manejado por tu ex profesor.",
        "Llegas a la fiesta y tu vecino está usando tu misma camisa.",
      ],
      [
        "En la fila del supermercado la cajera canta cada precio en ópera.",
        "El perro de tu vecino aprendió a tocar el timbre y no para.",
      ],
      [
        "Tu abuela publica en el grupo familiar un meme sobre ti.",
        "En la playa una gaviota se lleva tu celular y contesta llamadas.",
      ],
    ];
    for (const [a, b] of unrelated) {
      expect(tooSimilar(a, b), `${a} vs ${b}`).toBe(false);
      expect(tooSimilar(b, a), `${b} vs ${a}`).toBe(false);
    }
  });

  it("is symmetric and ignores case, accents and punctuation", () => {
    const a = "¡Tu TÍO cuenta la anécdota del almuerzo, otra vez!";
    const b = "tu tio cuenta la anecdota del almuerzo otra vez";
    expect(tooSimilar(a, b)).toBe(true);
    expect(tooSimilar(b, a)).toBe(true);
  });

  it("treats an empty or all-stopword scenario as similar to nothing", () => {
    expect(tooSimilar("", "Un perro entra a la boda.")).toBe(false);
    expect(tooSimilar("y el de la", "Un perro entra a la boda.")).toBe(false);
  });
});

describe("contentWords", () => {
  it("drops Spanish function words and keeps the premise", () => {
    expect(
      contentWords("En el almuerzo familiar tu tío cuenta una anécdota")
    ).toEqual(["almuerzo", "familiar", "tio", "cuenta", "anecdota"]);
  });
});

describe("repeatedBy", () => {
  it("names the first scenario the candidate repeats, or null", () => {
    const seen = [
      "Tu vecino te devuelve la licuadora llena de arena.",
      "Un perro callejero idéntico al tuyo te sigue a casa",
    ];
    expect(
      repeatedBy(
        "Un perro callejero idéntico al tuyo te sigue hasta la casa",
        seen
      )
    ).toBe(seen[1]);
    expect(
      repeatedBy("La cajera canta cada precio en ópera.", seen)
    ).toBeNull();
  });
});
