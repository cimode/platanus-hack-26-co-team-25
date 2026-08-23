import type { TagGroup } from "@/lib/domain/participant";
import { TAG_GROUPS } from "@/lib/domain/participant";

/**
 * The words the tag picker shows, recovered with the picker itself.
 *
 * The vocabulary lives in the domain (`participant/tags.ts`): thirty slugs, at
 * most twelve. Only the Spanish a person reads lives here, so the engine's
 * Jaccard kernel and the screen can never disagree about what a tag IS.
 */

export const TAGS_QUESTION = "¿En qué se te va el tiempo libre?";

export const TAG_LABELS: Record<string, string> = {
  fotografia: "Fotografía",
  ajedrez: "Ajedrez",
  astronomia: "Astronomía",
  plantas: "Plantas",
  videojuegos: "Videojuegos",
  manualidades: "Manualidades",
  anime: "Anime",
  "k-pop": "K-pop",
  reggaeton: "Reggaetón",
  podcasts: "Podcasts",
  "cine-de-culto": "Cine de culto",
  fantasia: "Fantasía",
  ramen: "Ramen",
  arepas: "Arepas",
  "cafe-de-especialidad": "Café de especialidad",
  picante: "Picante",
  reposteria: "Repostería",
  vegetariano: "Vegetariano",
  tango: "Tango",
  running: "Running",
  escalada: "Escalada",
  ciclismo: "Ciclismo",
  natacion: "Natación",
  senderismo: "Senderismo",
  perros: "Perros",
  gatos: "Gatos",
  aves: "Aves",
  reptiles: "Reptiles",
  peces: "Peces",
  "sin-mascotas": "Sin mascotas",
};

export const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  interests: "ratos libres",
  media: "pantallas",
  food: "comida",
  activity: "movimiento",
  pets: "animales",
};

export const TAG_GROUP_ORDER = Object.keys(TAG_GROUPS) as TagGroup[];
