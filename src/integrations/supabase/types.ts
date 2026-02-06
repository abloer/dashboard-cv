export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          activity: string
          created_at: string
          id: string
          result: string
          result_type: Database["public"]["Enums"]["activity_result_type"]
          timestamp: string
          unit_id: string | null
        }
        Insert: {
          activity: string
          created_at?: string
          id?: string
          result: string
          result_type?: Database["public"]["Enums"]["activity_result_type"]
          timestamp?: string
          unit_id?: string | null
        }
        Update: {
          activity?: string
          created_at?: string
          id?: string
          result?: string
          result_type?: Database["public"]["Enums"]["activity_result_type"]
          timestamp?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "fleet_units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      daily_summary: {
        Row: {
          active_dump_trucks: number | null
          active_excavators: number | null
          avg_cycle_time: number | null
          created_at: string
          date: string
          id: string
          overall_efficiency: number | null
          total_dump_trucks: number | null
          total_excavators: number | null
          total_loads: number | null
          total_volume_m3: number | null
        }
        Insert: {
          active_dump_trucks?: number | null
          active_excavators?: number | null
          avg_cycle_time?: number | null
          created_at?: string
          date?: string
          id?: string
          overall_efficiency?: number | null
          total_dump_trucks?: number | null
          total_excavators?: number | null
          total_loads?: number | null
          total_volume_m3?: number | null
        }
        Update: {
          active_dump_trucks?: number | null
          active_excavators?: number | null
          avg_cycle_time?: number | null
          created_at?: string
          date?: string
          id?: string
          overall_efficiency?: number | null
          total_dump_trucks?: number | null
          total_excavators?: number | null
          total_loads?: number | null
          total_volume_m3?: number | null
        }
        Relationships: []
      }
      fleet_units: {
        Row: {
          created_at: string
          id: string
          last_update: string
          location: string
          operator: string | null
          productivity: number | null
          status: Database["public"]["Enums"]["fleet_status"]
          type: Database["public"]["Enums"]["equipment_type"]
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_update?: string
          location: string
          operator?: string | null
          productivity?: number | null
          status?: Database["public"]["Enums"]["fleet_status"]
          type: Database["public"]["Enums"]["equipment_type"]
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_update?: string
          location?: string
          operator?: string | null
          productivity?: number | null
          status?: Database["public"]["Enums"]["fleet_status"]
          type?: Database["public"]["Enums"]["equipment_type"]
          unit_id?: string
        }
        Relationships: []
      }
      productivity_metrics: {
        Row: {
          created_at: string
          cycle_time_dig: number | null
          cycle_time_dump: number | null
          cycle_time_swing: number | null
          date: string
          hour: number | null
          id: string
          loads_count: number | null
          productivity_percentage: number | null
          unit_id: string | null
          volume_m3: number | null
        }
        Insert: {
          created_at?: string
          cycle_time_dig?: number | null
          cycle_time_dump?: number | null
          cycle_time_swing?: number | null
          date?: string
          hour?: number | null
          id?: string
          loads_count?: number | null
          productivity_percentage?: number | null
          unit_id?: string | null
          volume_m3?: number | null
        }
        Update: {
          created_at?: string
          cycle_time_dig?: number | null
          cycle_time_dump?: number | null
          cycle_time_swing?: number | null
          date?: string
          hour?: number | null
          id?: string
          loads_count?: number | null
          productivity_percentage?: number | null
          unit_id?: string | null
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productivity_metrics_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "fleet_units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          date_generated: string
          date_range_end: string | null
          date_range_start: string | null
          file_path: string | null
          file_size: string | null
          id: string
          name: string
          report_type: string
        }
        Insert: {
          created_at?: string
          date_generated?: string
          date_range_end?: string | null
          date_range_start?: string | null
          file_path?: string | null
          file_size?: string | null
          id?: string
          name: string
          report_type: string
        }
        Update: {
          created_at?: string
          date_generated?: string
          date_range_end?: string | null
          date_range_start?: string | null
          file_path?: string | null
          file_size?: string | null
          id?: string
          name?: string
          report_type?: string
        }
        Relationships: []
      }
      VIDEO_ANALITYC: {
        Row: {
          ID: number
          FILE_NAME: string | null
          BENCH_HEIGHT: number | null
          FRONT_LOADING_AREA_LENGTH: number | null
          DIGGING_TIME: number | null
          SWINGING_TIME: number | null
          DUMPING_TIME: number | null
          LOADING_TIME: number | null
          ANALITYC_TYPE: string | null
          LOCATION: string | null
          OPERATOR: string | null
          AVG_CYCLETIME: number | null
        }
        Insert: {
          ID?: number
          FILE_NAME?: string | null
          BENCH_HEIGHT?: number | null
          FRONT_LOADING_AREA_LENGTH?: number | null
          DIGGING_TIME?: number | null
          SWINGING_TIME?: number | null
          DUMPING_TIME?: number | null
          LOADING_TIME?: number | null
          ANALITYC_TYPE?: string | null
          LOCATION?: string | null
          OPERATOR?: string | null
          AVG_CYCLETIME?: number | null
        }
        Update: {
          ID?: number
          FILE_NAME?: string | null
          BENCH_HEIGHT?: number | null
          FRONT_LOADING_AREA_LENGTH?: number | null
          DIGGING_TIME?: number | null
          SWINGING_TIME?: number | null
          DUMPING_TIME?: number | null
          LOADING_TIME?: number | null
          ANALITYC_TYPE?: string | null
          LOCATION?: string | null
          OPERATOR?: string | null
          AVG_CYCLETIME?: number | null
        }
        Relationships: []
      }
      EXCAVATOR_DATA: {
        Row: {
          ID: number
          EXCAVATOR_TYPE_FK: number | null
          VIDEO_ANALITYC_FK: number | null
        }
        Insert: {
          ID?: number
          EXCAVATOR_TYPE_FK?: number | null
          VIDEO_ANALITYC_FK?: number | null
        }
        Update: {
          ID?: number
          EXCAVATOR_TYPE_FK?: number | null
          VIDEO_ANALITYC_FK?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_EXCAVATOR_DATA_EXCAVATOR_TYPE_FK_EXCAVATOR_TYPE"
            columns: ["EXCAVATOR_TYPE_FK"]
            isOneToOne: false
            referencedRelation: "EXCAVATOR_TYPE"
            referencedColumns: ["ID"]
          },
          {
            foreignKeyName: "fk_EXCAVATOR_DATA_VIDEO_ANALITYC_FK_VIDEO_ANALITYC"
            columns: ["VIDEO_ANALITYC_FK"]
            isOneToOne: false
            referencedRelation: "VIDEO_ANALITYC"
            referencedColumns: ["ID"]
          },
        ]
      }
      DUMP_TRUCK_DATA: {
        Row: {
          ID: number
          VIDEO_ANALITYC_FK: number | null
          DUMP_TRUCK_TYPE_FK: number | null
          QUEUE_TIME: number | null
          ESTIMATED_LOAD: number | null
        }
        Insert: {
          ID?: number
          VIDEO_ANALITYC_FK?: number | null
          DUMP_TRUCK_TYPE_FK?: number | null
          QUEUE_TIME?: number | null
          ESTIMATED_LOAD?: number | null
        }
        Update: {
          ID?: number
          VIDEO_ANALITYC_FK?: number | null
          DUMP_TRUCK_TYPE_FK?: number | null
          QUEUE_TIME?: number | null
          ESTIMATED_LOAD?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_DUMP_TRUCK_DATA_DUMP_TRUCK_TYPE_FK_DUMP_TRUCK_TYPE"
            columns: ["DUMP_TRUCK_TYPE_FK"]
            isOneToOne: false
            referencedRelation: "DUMP_TRUCK_TYPE"
            referencedColumns: ["ID"]
          },
          {
            foreignKeyName: "fk_DUMP_TRUCK_DATA_VIDEO_ANALITYC_FK_VIDEO_ANALITYC"
            columns: ["VIDEO_ANALITYC_FK"]
            isOneToOne: false
            referencedRelation: "VIDEO_ANALITYC"
            referencedColumns: ["ID"]
          },
        ]
      }
      EXCAVATOR_TYPE: {
        Row: {
          ID: number
          TYPE: string | null
        }
        Insert: {
          ID?: number
          TYPE?: string | null
        }
        Update: {
          ID?: number
          TYPE?: string | null
        }
        Relationships: []
      }
      DUMP_TRUCK_TYPE: {
        Row: {
          ID: number
          TYPE: string | null
          TURNING_RADIUS: number | null
        }
        Insert: {
          ID?: number
          TYPE?: string | null
          TURNING_RADIUS?: number | null
        }
        Update: {
          ID?: number
          TYPE?: string | null
          TURNING_RADIUS?: number | null
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
      activity_result_type: "success" | "warning" | "info" | "error"
      equipment_type: "Excavator" | "Dump Truck" | "Loader" | "Dozer"
      fleet_status: "Active" | "Idle" | "Maintenance"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_result_type: ["success", "warning", "info", "error"],
      equipment_type: ["Excavator", "Dump Truck", "Loader", "Dozer"],
      fleet_status: ["Active", "Idle", "Maintenance"],
    },
  },
} as const
