// Hand-written minimal version of the Supabase-generated database types.
// Covers only the tables the app queries; timestamps are returned as ISO strings.

/** JSON value shape of jsonb columns (Supabase's generated `Json` type). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

/**
 * Persisted processing lifecycle of a document (column documents.processing_status):
 * 'pending' right after upload, 'processing' while extraction/OCR runs,
 * 'completed' once content is persisted, 'failed' when the pipeline
 * errored (the UI offers a retry). Only 'completed' documents are openable.
 */
export type DocumentProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subjects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          name: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          owner_id: string;
          subject_id: string;
          name: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          subject_id: string;
          name: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          owner_id: string;
          topic_id: string;
          original_name: string;
          storage_path: string;
          mime_type: string;
          size: number;
          created_at: string;
          updated_at: string;
          /**
           * Persisted per-page extraction data (see documentContent.ts);
           * NULL = none yet. Optional in Row: list queries do not select
           * this column, so rows may carry no `content` key at all.
           */
          content?: Json | null;
          /**
           * Processing lifecycle (see DocumentProcessingStatus). Optional
           * in Row: queries that do not select the column report no key.
           */
          processing_status?: DocumentProcessingStatus | null;
          /**
           * Persisted semantic metadata (title, documentType, subject,
           * summary, keyTopics, analyzedAt). NULL = not analyzed yet.
           */
          understanding?: Json | null;
        };
        Insert: {
          id: string;
          owner_id: string;
          topic_id: string;
          original_name: string;
          storage_path: string;
          mime_type: string;
          size: number;
          created_at?: string;
          updated_at?: string;
          content?: Json | null;
          processing_status?: DocumentProcessingStatus | null;
          understanding?: Json | null;
        };
        Update: {
          original_name?: string;
          topic_id?: string;
          updated_at?: string;
          content?: Json | null;
          processing_status?: DocumentProcessingStatus | null;
          understanding?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
