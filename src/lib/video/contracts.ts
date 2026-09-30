export interface VideoProbe {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  audioCodec?: string;
  fileSize?: number;
}
export interface VideoRenderer { render(jobId: string): Promise<{ outputPath: string }>; }


/** FFmpeg belongs in the independent worker, never a Next.js request. */
