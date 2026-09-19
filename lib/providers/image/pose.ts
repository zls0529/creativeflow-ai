import 'server-only';
import sharp from 'sharp';
import { storage } from '@/lib/storage';
import type { ImageRequest } from './base';
import { z } from 'zod';

export const openPoseModel = 'control_v11p_sd15_openpose_fp16.safetensors';
export function validateDetectedPose(output: unknown) {
  try {
    const ui=z.object({openpose_json:z.array(z.string()).length(1)}).parse(output);
    const frames=z.array(z.object({people:z.array(z.object({pose_keypoints_2d:z.array(z.number()).length(54)})).length(1)})).length(1).parse(JSON.parse(ui.openpose_json[0]));
    const points=frames[0].people[0].pose_keypoints_2d;
    // COCO18 hips, knees and ankles must be visible; incomplete detection is not a verified pose.
    if (![8,9,10,11,12,13].every(i=>points[i*3+2]>0)) throw new Error();
  } catch { throw new Error('OpenPose could not verify one complete lower-body pose. Use a clear single-person, full-body reference with both ankles visible; no pose success was recorded.'); }
}
export function poseReference(request: Pick<ImageRequest, 'references'>) {
  const refs = (request.references || []).filter(r => r.role === 'pose');
  if (refs.length > 1) throw new Error('Choose only one pose reference per campaign.');
  const ref = refs[0];
  if (ref && (!/^[a-zA-Z0-9-]+$/.test(ref.id) || !['image/png','image/jpeg','image/webp'].includes(ref.mime))) throw new Error('Invalid pose reference. Use a stored PNG, JPEG or WebP image.');
  return ref;
}
export async function validatePoseImage(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Pose reference must be an image under 5 MB.');
  try {
    const image = sharp(bytes, {limitInputPixels: 16000000, animated: false});
    const m = await image.metadata();
    if (!['png','jpeg','webp'].includes(m.format || '') || !m.width || !m.height || Math.min(m.width,m.height) < 64 || (m.pages || 1) > 1) throw new Error();
    // Strip metadata and preserve the full frame; never use source pixels as the generation latent.
    return await image.rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  } catch { throw new Error('Invalid pose reference: use a decodable, single-frame PNG, JPEG or WebP, at least 64 pixels per side and at most 16 megapixels.'); }
}
export async function loadPoseReference(request: ImageRequest) {
  const ref = poseReference(request);
  if (!ref) throw new Error('sports_pose requires a pose reference. Upload one image with the pose role.');
  let bytes: Buffer;
  try { bytes = await storage.get(ref.id); } catch { throw new Error('Pose reference is missing from project storage. Upload it again.'); }
  return {id:ref.id, bytes:await validatePoseImage(bytes)};
}
export function poseDependencyError(capabilities: Record<string, { input?: {required?: Record<string, unknown[]>} }>, model: string) {
  for (const name of ['LoadImage','OpenposePreprocessor','ControlNetLoader','ControlNetApplyAdvanced']) if (!capabilities?.[name]?.input?.required) return `missing node ${name}`;
  const models = capabilities.ControlNetLoader.input?.required?.control_net_name?.[0];
  if (!Array.isArray(models) || !models.includes(model)) return 'configured SD1.5 OpenPose model is not installed/visible in ComfyUI';
  return undefined;
}
