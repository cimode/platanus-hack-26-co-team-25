// What each avatar wears (read off `avatar-sheet.png`) and what each emote does.
// The prompts are the part of the pipeline that took iteration to get right:
// the face must stay blank (the photo overlay anchors to the head), the head
// must stay still, and the clip must END in the start pose so the room can cut
// back to idle with no visible seam. Keep those sentences when adding emotes.

export const AVATARS = {
  avatar1:
    "brown wavy hair, cream ribbed knit sweater, dark blue jeans, white sneakers",
  avatar2:
    "dark messy hair, black t-shirt with a thin silver chain necklace, khaki cargo pants, black and white sneakers",
  avatar3:
    "long wavy brown hair, gold hoop earrings, black tank top, cream wide-leg pants, small brown shoulder bag, white sneakers",
  avatar4:
    "brown hair tied in a bun, white top under an open olive green shirt, blue jeans, cream tote bag, white sneakers",
};

/**
 * `action` is the only part that changes per emote. `trim` is the default
 * number of seconds to keep (the model pads the clip with standing still once
 * the gesture is over) and `start` the seconds to skip; the judge may override
 * both per clip. `lastFrame: false` drops the end-on-the-plate constraint.
 */
export const EMOTES = {
  celebrate: {
    action:
      "The character celebrates with joy: throws both arms up in the air, hops up and down twice, " +
      "then lowers the arms and returns to the exact same standing pose as the start.",
    trim: 4,
  },
  wave: {
    action:
      "The character greets someone: raises the right hand next to the head and waves it side to " +
      "side three times with a small friendly bounce, then lowers it and returns to the exact same " +
      "standing pose as the start.",
    trim: 3,
  },
  cry: {
    action:
      "The character cries: covers the face with both hands, the shoulders shake up and down, " +
      "the head tilts down, and big bright blue pixel tear drops fall from between the hands " +
      "down to the floor, then lowers the hands and returns to the exact same standing pose " +
      "as the start.",
    trim: 4,
  },
  walk: {
    action:
      "The character walks toward the camera in place, front view: one full walking cycle with " +
      "arms swinging and knees lifting, feet staying on the same spot, then stops and returns to " +
      "the exact same standing pose as the start.",
    trim: 3,
  },
  angry: {
    action:
      "The character gets angry: clenches both fists, stomps the right foot twice, shakes the fists " +
      "in front of the chest while two small puffs of pixel steam rise from the top of the head, " +
      "then unclenches and returns to the exact same standing pose as the start.",
    trim: 3.5,
  },
  fight: {
    action:
      "The character fights an invisible opponent: raises both fists into a boxing guard, throws " +
      "two quick punches forward, right fist then left fist, with a small bounce on the feet, then " +
      "drops the guard and returns to the exact same standing pose as the start.",
    trim: 3.5,
  },
  defeat: {
    action:
      "The character is defeated: the shoulders drop, the head hangs forward, the body sinks down " +
      "onto one knee with both arms hanging loose, holds there for a moment, then stands back up " +
      "and returns to the exact same standing pose as the start.",
    trim: 4.5,
  },
  love: {
    action:
      "The character falls in love: clasps both hands together over the chest and sways gently " +
      "side to side while three big pixel-art red hearts float up from the chest and fade out, " +
      "then lowers the hands and returns to the exact same standing pose as the start.",
    trim: 4,
  },
  // Locomotion sheets. The character TURNS first and stays turned, so these
  // cannot end on the plate (no last frame) and are trimmed after the turn:
  // `start` skips it, `loop` tells the room the sheet may repeat.
  "walk-back": {
    action:
      "The character turns around to show its back to the camera and then walks in place away " +
      "from the camera for the rest of the clip: a steady walking cycle seen from behind, arms " +
      "swinging, knees lifting, feet staying on the same spot, never turning back.",
    lastFrame: false,
    start: 1.5,
    trim: 5,
    loop: true,
  },
  "walk-right": {
    action:
      "The character turns to its right to show its side profile to the camera and then walks in " +
      "place toward the right edge of the frame for the rest of the clip: a steady walking cycle " +
      "in side view, arms swinging, knees lifting, feet staying on the same spot, never turning back.",
    lastFrame: false,
    start: 2,
    trim: 5,
    loop: true,
  },
  // The plate faces slightly left already, so turning RIGHT comes out clean and
  // turning left failed twice (3/4 view, or over-rotated to the back). Left-facing
  // sheets are the right-facing clip mirrored at pack time (`pnpm emotes:pack --mirror`).
  "walk-left": { mirrorOf: "walk-right", loop: true },
  "sad-walk-left": { mirrorOf: "sad-walk-right", loop: true },
  "sad-walk-right": {
    action:
      "The character turns to its right and walks slowly in place toward the right edge of the " +
      "frame for the rest of the clip, in side view, head hanging down, shoulders slumped, dragging " +
      "the feet, while a small grey pixel-art rain cloud floats just above the head and drops blue " +
      "pixel raindrops onto it the whole time, never turning back.",
    lastFrame: false,
    start: 1.5,
    trim: 5,
    loop: true,
  },
};

/**
 * What the model may draw under the feet.
 *   none   -- nothing at all (the model still tends to add a grey ground patch on hops)
 *   shadow -- no floor, no platform, no tile: only a small soft dark drop shadow
 */
export const GROUNDS = {
  none: "no shadows on the green,",
  shadow:
    "no floor, no ground, no platform, no tile and no patch of any kind under the feet -- the " +
    "character floats on the plain green with only a small, soft, dark elliptical drop shadow " +
    "directly beneath the feet that stays on the green while the body moves,",
};

export function promptFor(avatar, emote, { ground = "none" } = {}) {
  const look = AVATARS[avatar];
  const spec = EMOTES[emote];
  const floor = GROUNDS[ground];
  if (!look) throw new Error(`unknown avatar ${avatar}`);
  if (!spec) throw new Error(`unknown emote ${emote}`);
  if (!floor) throw new Error(`unknown ground ${ground}`);
  return (
    "2D pixel-art sprite animation, Habbo-style character in 3/4 isometric view, standing on a " +
    `flat solid bright green screen background. ${spec.action} ` +
    "The head stays still and the face remains a blank, featureless skin-colored oval with no eyes, " +
    `nose or mouth. Same ${look} throughout. ` +
    `Static camera, no zoom, no pan, no background objects, ${floor} crisp chunky ` +
    "pixels, limited color palette, sprite sheet style."
  );
}
