import { useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { fetch } from "expo/fetch";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const OWNER_KEY_ITEM = "chatData.ownerKey";

let ownerKeyPromise: Promise<string> | null = null;

/**
 * This device's owner key, minted on first launch and kept in SecureStore. Every Convex function that reads or
 * writes the user's chat data takes it as `ownerKey`.
 */
export function getOwnerKey(convex: ConvexReactClient): Promise<string> {
  ownerKeyPromise ??= (async () => {
    const stored = await SecureStore.getItemAsync(OWNER_KEY_ITEM);
    if (stored) return stored;
    const ownerKey = await convex.action(api.owners.create, {});
    await SecureStore.setItemAsync(OWNER_KEY_ITEM, ownerKey);
    return ownerKey;
  })().catch((error) => {
    ownerKeyPromise = null;
    throw error;
  });
  return ownerKeyPromise;
}

/** The owner key once it is loaded (null until then). Pass "skip" to useQuery while it is null. */
export function useOwnerKey(): { ownerKey: string | null; error: Error | null } {
  const convex = useConvex();
  const [state, setState] = useState<{ ownerKey: string | null; error: Error | null }>({ ownerKey: null, error: null });
  useEffect(() => {
    let active = true;
    getOwnerKey(convex).then(
      (ownerKey) => active && setState({ ownerKey, error: null }),
      (error: unknown) => active && setState({ ownerKey: null, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      active = false;
    };
  }, [convex]);
  return state;
}

/**
 * Opens the system file picker for chat exports (zip, json, txt, csv, chat.db; several at once is fine), uploads each
 * file, and starts processing it. Returns one upload id per file, or an empty array if the user cancelled.
 * Watch progress with useQuery(api.uploads.get, { ownerKey, uploadId }).
 */
export async function pickAndUploadExports(
  convex: ConvexReactClient,
  ownerKey: string,
  options: { selfName?: string } = {},
): Promise<Id<"uploads">[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const uploadIds: Id<"uploads">[] = [];
  for (const asset of result.assets) {
    uploadIds.push(await uploadExport(convex, ownerKey, { uri: asset.uri, name: asset.name }, options));
  }
  return uploadIds;
}

/**
 * Uploads one export file from a local URI and starts processing it. selfName is the user's name as it appears in
 * the export, for exports that don't say which sender is the user (it's learned automatically otherwise).
 */
export async function uploadExport(
  convex: ConvexReactClient,
  ownerKey: string,
  file: { uri: string; name: string },
  options: { selfName?: string } = {},
): Promise<Id<"uploads">> {
  const uploadUrl = await convex.mutation(api.uploads.generateUploadUrl, { ownerKey });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new File(file.uri),
  });
  if (!response.ok) throw new Error("Upload failed (HTTP " + response.status + ")");
  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return await convex.mutation(api.uploads.start, {
    ownerKey,
    storageId,
    fileName: file.name,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    selfName: options.selfName,
  });
}
