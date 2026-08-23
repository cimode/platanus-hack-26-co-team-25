import { describe, expect, it } from "vitest";
import { EMOTES } from "../emotes/emotes";
import { AVATARS } from "../participant/avatar";
import {
  canvasTransform,
  FACE_PLATE,
  FACE_ZOOM,
  faceBytes,
  faceClips,
  faceSheet,
  hasFace,
  photoOval,
} from "./faces";
import { FACE_MANIFEST } from "./faces.manifest";

describe("the packed catalogue", () => {
  it("covers the idle plate and every emote, for every avatar", () => {
    for (const avatar of AVATARS) {
      const clips = faceClips(avatar);
      expect(clips, avatar).toContain(FACE_PLATE);
      for (const emote of EMOTES)
        expect(clips, `${avatar}/${emote}`).toContain(emote);
    }
  });

  it("costs a few dozen kilobytes per avatar, not a few megabytes", () => {
    // The whole point of the design: what a participant downloads to wear
    // their own face is small enough to stop being a decision.
    for (const avatar of AVATARS) {
      expect(faceBytes(avatar), avatar).toBeLessThan(100 * 1024);
      expect(faceBytes(avatar), avatar).toBeGreaterThan(0);
    }
  });

  it("agrees with the mask about how many frames there are", () => {
    for (const avatar of AVATARS)
      for (const clip of faceClips(avatar)) {
        const sheet = faceSheet(avatar, clip);
        expect(sheet, `${avatar}/${clip}`).not.toBeNull();
        expect(sheet?.painted).toBeLessThanOrEqual(sheet?.frames ?? 0);
      }
  });

  it("knows that walking away from camera shows no face at all", () => {
    // Not a gap in the data: the back of a head has no plate to paint, and a
    // screen reads this to skip the fetch entirely.
    expect(hasFace("avatar1", "walk-back")).toBe(false);
    expect(faceSheet("avatar1", "walk-back")?.painted).toBe(0);
  });

  it("finds a clip by sprite url as well as by key", () => {
    expect(faceSheet("/sprites/avatar2.png", FACE_PLATE)).toEqual(
      faceSheet("avatar2", FACE_PLATE)
    );
  });

  it("answers null for anything nobody packed, and never throws", () => {
    expect(faceSheet("avatar1", "moonwalk")).toBeNull();
    expect(faceSheet("avatar9", FACE_PLATE)).toBeNull();
    expect(faceSheet("not a sprite", FACE_PLATE)).toBeNull();
    expect(faceClips("avatar9")).toEqual([]);
    expect(faceBytes("avatar9")).toBe(0);
    expect(hasFace("avatar9", FACE_PLATE)).toBe(false);
  });

  it("points every entry at files under /sprites/faces", () => {
    for (const [avatar, clips] of Object.entries(FACE_MANIFEST))
      for (const [clip, sheet] of Object.entries(clips)) {
        expect(sheet.mask).toBe(`/sprites/faces/${avatar}/${clip}.png`);
        expect(sheet.transforms).toBe(`/sprites/faces/${avatar}/${clip}.json`);
      }
  });
});

describe("photoOval", () => {
  it("is the intake guide's oval at zoom 1", () => {
    // Same numbers the camera overlay draws, so a photo taken under the guide
    // and the crop taken from it agree by construction.
    expect(photoOval(100, 1)).toEqual({ cx: 50, cy: 44, rx: 30, ry: 38 });
  });

  it("cuts tighter as zoom rises, around the same centre", () => {
    const wide = photoOval(100, 1);
    const tight = photoOval(100, 1.5);
    expect(tight.cx).toBe(wide.cx);
    expect(tight.cy).toBe(wide.cy);
    expect(tight.rx).toBeLessThan(wide.rx);
    expect(tight.ry).toBeLessThan(wide.ry);
  });

  it("defaults to the zoom the packed matrices were solved for", () => {
    expect(photoOval(100)).toEqual(photoOval(100, FACE_ZOOM));
  });
});

describe("canvasTransform", () => {
  it("transposes into canvas order and scales pixels into the unit square", () => {
    // The affine reads qx = a*u + b*v + c, qy = d*u + e*v + f on paper;
    // canvas wants (m11, m12, m21, m22, dx, dy) with x' = m11*x + m21*y + dx.
    expect(canvasTransform([2, 3, 5, 7, 11, 13], 1)).toEqual([
      2, 7, 3, 11, 5, 13,
    ]);
  });

  it("maps the photo's corners where the affine says", () => {
    const affine = [10, 0, 4, 0, 20, 6] as const;
    const size = 100;
    const [m11, m12, m21, m22, dx, dy] = canvasTransform(affine, size);
    const at = (x: number, y: number) => [
      m11 * x + m21 * y + dx,
      m12 * x + m22 * y + dy,
    ];
    // (0,0) of the photo is the affine's translation; (size,size) is a+b+c.
    expect(at(0, 0)).toEqual([4, 6]);
    expect(at(size, 0)).toEqual([14, 6]);
    expect(at(0, size)).toEqual([4, 26]);
  });

  it("gives the same frame position whatever resolution the photo is", () => {
    const affine = [9, -2, 30, 3, 12, 44] as const;
    const corner = (size: number) => {
      const [m11, m12, m21, m22, dx, dy] = canvasTransform(affine, size);
      return [m11 * size + m21 * size + dx, m12 * size + m22 * size + dy];
    };
    // A 512px intake capture and a 4000px upload land on the same pixels.
    expect(corner(512)).toEqual(corner(4000));
  });
});
