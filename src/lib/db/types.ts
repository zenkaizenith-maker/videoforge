/**
 * A deliberately small typed database placeholder. Replace with generated
 * Supabase types once the CLI is linked to the project.
 */
export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; display_name: string | null; created_at: string; updated_at: string } };
      projects: { Row: { id: string; owner_id: string; title: string; topic: string | null; status: "draft" | "active" | "archived"; created_at: string; updated_at: string } };
      project_settings: { Row: { project_id: string; aspect_ratio: string; target_duration_seconds: number; voice_style: string | null; visual_style: string | null; updated_at: string } };
      assets: {
        Row: {
          id: string;
          project_id: string;
          original_filename: string;
          storage_path: string;
          media_type: string;
          mime_type: string;
          file_size: number;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          assigned_scene_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}
