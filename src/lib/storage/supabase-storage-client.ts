import { createServiceRoleClient } from "@/lib/supabase/server-service-role";
import type { StorageClient } from "./storage-client";

interface StorageResult {
  path: string;
  contentType: string;
  size: number;
}

export function createSupabaseStorageClient(): StorageClient {
  return {
    async upload({ projectId, file }) {
      const supabase = createServiceRoleClient();
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const objectPath = `${projectId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage
        .from("project-assets")
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      return { path: objectPath, contentType: file.type, size: file.size };
    },

    async createSignedUrl(path: string, expiresInSeconds: number) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.storage
        .from("project-assets")
        .createSignedUrl(path, expiresInSeconds);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Could not create a signed URL.");
      }

      return data.signedUrl;
    },

    async delete(path: string) {
      const supabase = createServiceRoleClient();
      const { error } = await supabase.storage.from("project-assets").remove([path]);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export async function uploadAssetBuffer(
  objectPath: string,
  buffer: Buffer,
  contentType: string = "video/mp4",
): Promise<{ path: string; size: number }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from("project-assets")
    .upload(objectPath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload ${objectPath}: ${error.message}`);
  }

  return { path: objectPath, size: buffer.length };
}

export async function downloadAssetBuffer(storagePath: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from("project-assets")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download ${storagePath}: ${error?.message ?? "Asset not found"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a signed upload URL for direct browser-to-Supabase uploads.
 * The returned `uploadUrl` accepts a PUT request with the file binary.
 * The `storagePath` is the object key that will be stored in the bucket.
 *
 * This avoids routing large file binary data through a Next.js server action
 * (which has a 4.5 MB body limit on Vercel).
 */
export async function createSignedUploadUrl(storagePath: string): Promise<{
  uploadUrl: string;
  token: string;
  storagePath: string;
}> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from("project-assets")
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? `Could not create signed upload URL for ${storagePath}`);
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storagePath,
  };
}

export async function createAssetSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 86400,
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from("project-assets")
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? `Could not create signed URL for ${storagePath}`);
  }

  return data.signedUrl;
}

