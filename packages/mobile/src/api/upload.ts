import { API_URL, ApiError, getJson, postJson } from './client';
import { loadOwnerKey, saveOwnerKey } from './owner';

/** POST /account once per device; later calls reuse the stored key. */
export async function ensureAccount(): Promise<string> {
  const existing = await loadOwnerKey();
  if (existing) return existing;
  const { ownerKey } = await postJson<{ ownerKey: string }>('/account', {});
  await saveOwnerKey(ownerKey);
  return ownerKey;
}

export type PickedExport = { uri: string; name: string; mimeType?: string };

/**
 * Uploads a picked export (a .textrovert file, a WhatsApp or Instagram export, ...) for this device's account:
 * POST /upload/url, POST the bytes there (no size cap), then POST /upload/commit. Resolves to the upload id that
 * GET /status reports on.
 */
export async function uploadExport(file: PickedExport, selfName?: string): Promise<string> {
  if (!API_URL) throw new ApiError('No API is set up. Set EXPO_PUBLIC_API_URL to upload your chats.');
  await ensureAccount();
  const { uploadUrl } = await postJson<{ uploadUrl: string }>('/upload/url', {});
  const blob = await (await fetch(file.uri)).blob();
  let stored: Response;
  try {
    stored = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': file.mimeType || 'application/octet-stream' }, body: blob });
  } catch {
    throw new ApiError("Couldn't upload the file. Check your connection and try again.");
  }
  if (!stored.ok) throw new ApiError('The upload failed (' + stored.status + '). Try again.', stored.status);
  const { storageId } = (await stored.json()) as { storageId: string };
  let timeZone = 'America/Los_Angeles';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
  } catch {
    // Keep the default.
  }
  const { uploadId } = await postJson<{ uploadId: string }>('/upload/commit', {
    storageId,
    fileName: file.name,
    timeZone,
    ...(selfName?.trim() ? { selfName: selfName.trim() } : {}),
  });
  return uploadId;
}

export type StageName = 'stats' | 'search' | 'ask' | 'episodes' | 'facts';
export interface Stage {
  state: 'pending' | 'running' | 'ready' | 'failed';
  done: number;
  total: number;
}
export interface UploadStatus {
  owner: 'demo' | 'account';
  upload: { id: string; fileName: string; status: string; error: string | null } | null;
  stages: Record<StageName, Stage>;
}

/** GET /status: how far each stage has got for the upload (the latest one when no id is given). */
export const fetchStatus = (uploadId?: string) => getJson<UploadStatus>('/status' + (uploadId ? '?uploadId=' + encodeURIComponent(uploadId) : ''));

export interface OnboardingAnswers {
  chatType?: string;
  app?: string;
  method?: string;
  selfName?: string;
  /** "Anything else Textrovert should know?" */
  notes?: string;
  email?: string;
  uploadId?: string;
  fileName?: string;
  skippedUpload: boolean;
}

/** POST /onboarding: saves the onboarding answers on this device's account (creating it if needed). */
export async function saveOnboarding(answers: OnboardingAnswers): Promise<void> {
  if (!API_URL) return;
  await ensureAccount();
  await postJson<{ ok: true }>('/onboarding', answers);
}
