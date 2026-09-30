import { z } from "zod";
import {
  ASSET_ACCEPTED_TYPES,
  ASSET_MAX_FILE_SIZE,
  type AssetFilter,
  type AssetMediaType,
} from "@/lib/assets/types";

export const assetMediaTypeSchema = z.enum(["image", "video", "audio"]);

export const assetFilterSchema = z.object({
  filter: z.enum(["all", "image", "video", "audio", "unassigned"]).default("all"),
  search: z.string().default(""),
});

const allAccepted = [
  ...ASSET_ACCEPTED_TYPES.image,
  ...ASSET_ACCEPTED_TYPES.video,
  ...ASSET_ACCEPTED_TYPES.audio,
];

export const uploadAssetSchema = z.object({
  projectId: z.string().trim().min(1, "A project is required.").max(128),
  file: z
    .instanceof(File)
    .refine((file) => file.size <= ASSET_MAX_FILE_SIZE, {
      message: `Files must be smaller than ${Math.round(ASSET_MAX_FILE_SIZE / 1024 / 1024)} MB.`,
    })
    .refine(
      (file) => allAccepted.includes(file.type),
      { message: "Unsupported file type." },
    ),
});

export const assignAssetSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  assetId: z.string().trim().min(1),
  sceneId: z.string().trim().max(80).nullable().optional(),
});

export const deleteAssetSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  assetId: z.string().trim().min(1),
});

export type UploadAssetInput = z.infer<typeof uploadAssetSchema>;
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;
export type DeleteAssetInput = z.infer<typeof deleteAssetSchema>;
export type AssetFilterInput = z.infer<typeof assetFilterSchema>;
