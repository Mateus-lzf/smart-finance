export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      import_profiles: {
        Row: {
          columns: Json;
          created_at: string;
          headers: Json;
          mapping: Json;
          owner_user_id: string;
          project_id: string;
          schema_version: number;
          updated_at: string;
        };
        Insert: {
          columns: Json;
          created_at?: string;
          headers: Json;
          mapping: Json;
          owner_user_id: string;
          project_id: string;
          schema_version?: number;
          updated_at?: string;
        };
        Update: {
          columns?: Json;
          created_at?: string;
          headers?: Json;
          mapping?: Json;
          owner_user_id?: string;
          project_id?: string;
          schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_profiles_project_owner_fk";
            columns: ["project_id", "owner_user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "owner_user_id"];
          },
        ];
      };
      import_runs: {
        Row: {
          added_count: number;
          base_project_version: number | null;
          changed_count: number;
          completed_at: string | null;
          created_at: string;
          duplicate_count: number;
          error_code: string | null;
          file_hash: string | null;
          id: string;
          operation: string;
          original_filename: string | null;
          owner_user_id: string;
          project_id: string;
          removed_count: number;
          row_count: number;
          status: string;
        };
        Insert: {
          added_count?: number;
          base_project_version?: number | null;
          changed_count?: number;
          completed_at?: string | null;
          created_at?: string;
          duplicate_count?: number;
          error_code?: string | null;
          file_hash?: string | null;
          id?: string;
          operation: string;
          original_filename?: string | null;
          owner_user_id: string;
          project_id: string;
          removed_count?: number;
          row_count?: number;
          status?: string;
        };
        Update: {
          added_count?: number;
          base_project_version?: number | null;
          changed_count?: number;
          completed_at?: string | null;
          created_at?: string;
          duplicate_count?: number;
          error_code?: string | null;
          file_hash?: string | null;
          id?: string;
          operation?: string;
          original_filename?: string | null;
          owner_user_id?: string;
          project_id?: string;
          removed_count?: number;
          row_count?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_runs_project_owner_fk";
            columns: ["project_id", "owner_user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "owner_user_id"];
          },
        ];
      };
      project_preferences: {
        Row: {
          analytical_dimensions: Json;
          created_at: string;
          project_id: string;
          updated_at: string;
          user_id: string;
          visible_columns: Json;
        };
        Insert: {
          analytical_dimensions?: Json;
          created_at?: string;
          project_id: string;
          updated_at?: string;
          user_id: string;
          visible_columns?: Json;
        };
        Update: {
          analytical_dimensions?: Json;
          created_at?: string;
          project_id?: string;
          updated_at?: string;
          user_id?: string;
          visible_columns?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "project_preferences_project_user_fk";
            columns: ["project_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id", "owner_user_id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          owner_user_id: string;
          type: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          owner_user_id: string;
          type?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          owner_user_id?: string;
          type?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          additional_data: Json;
          amount: number;
          category: string;
          created_at: string;
          date: string;
          description: string;
          id: string;
          import_run_id: string | null;
          manually_modified: boolean;
          origin: string;
          owner_user_id: string;
          project_id: string;
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          additional_data?: Json;
          amount: number;
          category: string;
          created_at?: string;
          date: string;
          description: string;
          id?: string;
          import_run_id?: string | null;
          manually_modified?: boolean;
          origin: string;
          owner_user_id: string;
          project_id: string;
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          additional_data?: Json;
          amount?: number;
          category?: string;
          created_at?: string;
          date?: string;
          description?: string;
          id?: string;
          import_run_id?: string | null;
          manually_modified?: boolean;
          origin?: string;
          owner_user_id?: string;
          project_id?: string;
          type?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_import_run_project_owner_fk";
            columns: ["import_run_id", "project_id", "owner_user_id"];
            isOneToOne: false;
            referencedRelation: "import_runs";
            referencedColumns: ["id", "project_id", "owner_user_id"];
          },
          {
            foreignKeyName: "transactions_project_owner_fk";
            columns: ["project_id", "owner_user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "owner_user_id"];
          },
        ];
      };
      user_profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          locale: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          locale?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          locale?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
