/**
 * Faces: the participant's own photo, on their own avatar.
 *
 *   import { useFacedSprite } from "@/components/faces";
 *   const source = useFacedSprite(avatar, participant.photoUrl);
 *   <AvatarSprite avatar={avatar} height="8.5rem" source={source} />
 *
 * Nothing about the result is stored: it is composed from the shared artwork
 * and one photo when a frame is drawn. See `src/lib/domain/faces/faces.ts`.
 */

export {
  FACE_PLATE,
  type FaceAffine,
  type FaceSheet,
  type FaceTransforms,
  faceBytes,
  faceClips,
  faceSheet,
  hasFace,
} from "@/lib/domain/faces/faces";
export { compositeClip, croppedPhoto, resetFaceCache } from "./composite";
export { FaceGallery } from "./face-gallery";
export { useFacedSprite } from "./use-faced-sprite";
