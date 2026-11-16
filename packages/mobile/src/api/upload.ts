import { File, FileMode, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { API_URL, ApiError, getJson, postJson } from './client';
import { loadOwnerKey, saveOwnerKey } from './owner';
import { slimZip } from './slimZip';

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
  const slim = await withoutMedia(file);
  let stored: Response;
  try {
    const blob = await (await fetch(slim?.uri ?? file.uri)).blob();
    stored = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': file.mimeType || 'application/octet-stream' }, body: blob });
  } catch {
    throw new ApiError("Couldn't upload the file. Check your connection and try again.");
  } finally {
    slim?.delete();
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

/**
 * A copy of a picked zip without its photos and videos, in the cache folder, or null to upload the file as picked
 * (not a zip, nothing to drop, on the web, or the copy failed). Delete it once the upload has read it.
 */
async function withoutMedia(file: PickedExport): Promise<File | null> {
  if (Platform.OS === 'web' || !(/\.zip$/i.test(file.name) || /zip/i.test(file.mimeType ?? ''))) return null;
  const slim = new File(Paths.cache, 'upload-without-media.zip');
  let input: ReturnType<File['open']> | undefined;
  let output: ReturnType<File['open']> | undefined;
  try {
    input = new File(file.uri).open(FileMode.ReadOnly);
    if (slim.exists) slim.delete();
    slim.create();
    output = slim.open(FileMode.WriteOnly);
    const source = input;
    const sink = output;
    const size = await slimZip(
      {
        size: source.size ?? 0,
        read: (offset, length) => {
          source.offset = offset;
          return source.readBytes(length);
        },
      },
      (bytes) => sink.writeBytes(bytes),
    );
    if (size !== null) return slim;
  } catch {
    // Upload the original instead.
  } finally {
    input?.close();
    output?.close();
  }
  if (slim.exists) slim.delete();
  return null;
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
