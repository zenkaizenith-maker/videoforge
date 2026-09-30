export interface UploadRequest { projectId: string; file: File; }
export interface StoredAsset { path: string; contentType: string; size: number; }

/** Storage stays provider-neutral; implementation follows bucket and MIME-policy setup. */
export interface StorageClient {
  upload(request: UploadRequest): Promise<StoredAsset>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  delete(path: string): Promise<void>;
}
