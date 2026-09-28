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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organization: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organization?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roads: {
        Row: {
          base_slope_deg: number
          category: string | null
          created_at: string
          curves: Json
          description: string | null
          elevation_profile: Json
          id: string
          is_public: boolean
          lane_count: number
          lane_width_m: number
          length_m: number
          median_width_m: number
          name: string
          notes: string | null
          owner_id: string | null
          preview_thumbnail: string | null
          road_type: Database["public"]["Enums"]["road_type"]
          road_width_m: number
          shoulder_width_m: number
          slopes: Json
          surface_mu: number
          surface_type: string
          updated_at: string
        }
        Insert: {
          base_slope_deg?: number
          category?: string | null
          created_at?: string
          curves?: Json
          description?: string | null
          elevation_profile?: Json
          id?: string
          is_public?: boolean
          lane_count?: number
          lane_width_m?: number
          length_m: number
          median_width_m?: number
          name: string
          notes?: string | null
          owner_id?: string | null
          preview_thumbnail?: string | null
          road_type: Database["public"]["Enums"]["road_type"]
          road_width_m?: number
          shoulder_width_m?: number
          slopes?: Json
          surface_mu?: number
          surface_type?: string
          updated_at?: string
        }
        Update: {
          base_slope_deg?: number
          category?: string | null
          created_at?: string
          curves?: Json
          description?: string | null
          elevation_profile?: Json
          id?: string
          is_public?: boolean
          lane_count?: number
          lane_width_m?: number
          length_m?: number
          median_width_m?: number
          name?: string
          notes?: string | null
          owner_id?: string | null
          preview_thumbnail?: string | null
          road_type?: Database["public"]["Enums"]["road_type"]
          road_width_m?: number
          shoulder_width_m?: number
          slopes?: Json
          surface_mu?: number
          surface_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      simulation_samples: {
        Row: {
          fuel_rate_lps: number
          heading_rad: number
          id: number
          idx: number
          lat_accel: number
          long_accel: number
          owner_id: string
          s_m: number
          safety_score: number
          simulation_id: string
          speed_mps: number
          steering_deg: number
          t_s: number
          x: number
          y: number
          z: number
        }
        Insert: {
          fuel_rate_lps?: number
          heading_rad?: number
          id?: number
          idx: number
          lat_accel?: number
          long_accel?: number
          owner_id: string
          s_m: number
          safety_score?: number
          simulation_id: string
          speed_mps: number
          steering_deg?: number
          t_s: number
          x: number
          y: number
          z?: number
        }
        Update: {
          fuel_rate_lps?: number
          heading_rad?: number
          id?: number
          idx?: number
          lat_accel?: number
          long_accel?: number
          owner_id?: string
          s_m?: number
          safety_score?: number
          simulation_id?: string
          speed_mps?: number
          steering_deg?: number
          t_s?: number
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulation_samples_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          ai_summary: Json | null
          created_at: string
          id: string
          name: string
          owner_id: string
          params: Json
          results: Json | null
          road_id: string
          status: Database["public"]["Enums"]["sim_status"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          ai_summary?: Json | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          params?: Json
          results?: Json | null
          road_id: string
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          ai_summary?: Json | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          params?: Json
          results?: Json | null
          road_id?: string
          status?: Database["public"]["Enums"]["sim_status"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulations_road_id_fkey"
            columns: ["road_id"]
            isOneToOne: false
            referencedRelation: "roads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brake_efficiency: number | null
          category: Database["public"]["Enums"]["vehicle_category"]
          cog_height_m: number
          compression_ratio: number | null
          created_at: string
          cylinders: number | null
          differential_type: string | null
          displacement_cc: number | null
          drag_coeff: number
          drive_layout: string | null
          engine_efficiency: number
          engine_type: string | null
          final_drive_ratio: number | null
          front_brake_type: string | null
          front_track_m: number | null
          frontal_area_m2: number
          fuel_efficiency: number | null
          fuel_energy_mj_per_l: number
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          ground_clearance_m: number | null
          gvw_kg: number | null
          has_abs: boolean | null
          has_ebd: boolean | null
          has_esc: boolean | null
          height_m: number | null
          id: string
          idle_rpm: number | null
          is_public: boolean
          length_m: number | null
          lift_coeff: number | null
          manufacturer: string | null
          mass_kg: number
          max_power_kw: number
          max_rpm: number | null
          max_torque_nm: number
          model_year: number | null
          name: string
          notes: string | null
          num_gears: number | null
          owner_id: string | null
          rear_brake_type: string | null
          rear_spoiler: boolean | null
          rear_track_m: number | null
          rolling_resist_coeff: number
          tank_capacity_l: number | null
          tire_friction_mu: number
          tire_pressure_kpa: number | null
          tire_radius_m: number | null
          tire_type: string | null
          tire_width_mm: number | null
          top_speed_kmh: number | null
          track_m: number
          transmission_type: string | null
          turbocharged: boolean | null
          updated_at: string
          vehicle_type: string | null
          wheelbase_m: number
          width_m: number | null
          zero_to_100_s: number | null
        }
        Insert: {
          brake_efficiency?: number | null
          category: Database["public"]["Enums"]["vehicle_category"]
          cog_height_m: number
          compression_ratio?: number | null
          created_at?: string
          cylinders?: number | null
          differential_type?: string | null
          displacement_cc?: number | null
          drag_coeff: number
          drive_layout?: string | null
          engine_efficiency?: number
          engine_type?: string | null
          final_drive_ratio?: number | null
          front_brake_type?: string | null
          front_track_m?: number | null
          frontal_area_m2: number
          fuel_efficiency?: number | null
          fuel_energy_mj_per_l?: number
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          ground_clearance_m?: number | null
          gvw_kg?: number | null
          has_abs?: boolean | null
          has_ebd?: boolean | null
          has_esc?: boolean | null
          height_m?: number | null
          id?: string
          idle_rpm?: number | null
          is_public?: boolean
          length_m?: number | null
          lift_coeff?: number | null
          manufacturer?: string | null
          mass_kg: number
          max_power_kw: number
          max_rpm?: number | null
          max_torque_nm: number
          model_year?: number | null
          name: string
          notes?: string | null
          num_gears?: number | null
          owner_id?: string | null
          rear_brake_type?: string | null
          rear_spoiler?: boolean | null
          rear_track_m?: number | null
          rolling_resist_coeff?: number
          tank_capacity_l?: number | null
          tire_friction_mu?: number
          tire_pressure_kpa?: number | null
          tire_radius_m?: number | null
          tire_type?: string | null
          tire_width_mm?: number | null
          top_speed_kmh?: number | null
          track_m: number
          transmission_type?: string | null
          turbocharged?: boolean | null
          updated_at?: string
          vehicle_type?: string | null
          wheelbase_m: number
          width_m?: number | null
          zero_to_100_s?: number | null
        }
        Update: {
          brake_efficiency?: number | null
          category?: Database["public"]["Enums"]["vehicle_category"]
          cog_height_m?: number
          compression_ratio?: number | null
          created_at?: string
          cylinders?: number | null
          differential_type?: string | null
          displacement_cc?: number | null
          drag_coeff?: number
          drive_layout?: string | null
          engine_efficiency?: number
          engine_type?: string | null
          final_drive_ratio?: number | null
          front_brake_type?: string | null
          front_track_m?: number | null
          frontal_area_m2?: number
          fuel_efficiency?: number | null
          fuel_energy_mj_per_l?: number
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          ground_clearance_m?: number | null
          gvw_kg?: number | null
          has_abs?: boolean | null
          has_ebd?: boolean | null
          has_esc?: boolean | null
          height_m?: number | null
          id?: string
          idle_rpm?: number | null
          is_public?: boolean
          length_m?: number | null
          lift_coeff?: number | null
          manufacturer?: string | null
          mass_kg?: number
          max_power_kw?: number
          max_rpm?: number | null
          max_torque_nm?: number
          model_year?: number | null
          name?: string
          notes?: string | null
          num_gears?: number | null
          owner_id?: string | null
          rear_brake_type?: string | null
          rear_spoiler?: boolean | null
          rear_track_m?: number | null
          rolling_resist_coeff?: number
          tank_capacity_l?: number | null
          tire_friction_mu?: number
          tire_pressure_kpa?: number | null
          tire_radius_m?: number | null
          tire_type?: string | null
          tire_width_mm?: number | null
          top_speed_kmh?: number | null
          track_m?: number
          transmission_type?: string | null
          turbocharged?: boolean | null
          updated_at?: string
          vehicle_type?: string | null
          wheelbase_m?: number
          width_m?: number | null
          zero_to_100_s?: number | null
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
      fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | "cng"
      road_type:
        | "highway"
        | "mountain"
        | "hairpin"
        | "race_track"
        | "off_road"
        | "urban"
        | "village"
      sim_status: "draft" | "running" | "completed" | "failed"
      vehicle_category:
        | "sedan"
        | "suv"
        | "truck"
        | "sports"
        | "off_road"
        | "motorcycle"
        | "commercial"
        | "ev"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      fuel_type: ["petrol", "diesel", "electric", "hybrid", "cng"],
      road_type: [
        "highway",
        "mountain",
        "hairpin",
        "race_track",
        "off_road",
        "urban",
        "village",
      ],
      sim_status: ["draft", "running", "completed", "failed"],
      vehicle_category: [
        "sedan",
        "suv",
        "truck",
        "sports",
        "off_road",
        "motorcycle",
        "commercial",
        "ev",
      ],
    },
  },
} as const
