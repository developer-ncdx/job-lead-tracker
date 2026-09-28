export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type JobLeadTimestampKind = "published" | "created" | "updated"

export type Database = {
  public: {
    Tables: {
      job_leads: {
        Row: {
          id: string
          user_id: string | null
          title: string
          description: string
          url: string
          source: string | null
          source_job_id: string | null
          company: string | null
          location: string | null
          is_remote: boolean | null
          is_priority: boolean
          source_timestamp_at: string | null
          source_timestamp_kind: JobLeadTimestampKind | null
          first_seen_at: string
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          title: string
          description?: string
          url: string
          source?: string | null
          source_job_id?: string | null
          company?: string | null
          location?: string | null
          is_remote?: boolean | null
          is_priority?: boolean
          source_timestamp_at?: string | null
          source_timestamp_kind?: JobLeadTimestampKind | null
          first_seen_at?: string
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          title?: string
          description?: string
          url?: string
          source?: string | null
          source_job_id?: string | null
          company?: string | null
          location?: string | null
          is_remote?: boolean | null
          is_priority?: boolean
          source_timestamp_at?: string | null
          source_timestamp_kind?: JobLeadTimestampKind | null
          first_seen_at?: string
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type JobLead = Database["public"]["Tables"]["job_leads"]["Row"]

export type JobLeadUpdate = Pick<JobLead, "title" | "description" | "url">
