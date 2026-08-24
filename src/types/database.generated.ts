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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_entries: {
        Row: {
          action: string
          detail: Json | null
          id: string
          is_demo: boolean
          occurred_at: string
          source: string
          store_id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          detail?: Json | null
          id?: string
          is_demo?: boolean
          occurred_at?: string
          source?: string
          store_id: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          detail?: Json | null
          id?: string
          is_demo?: boolean
          occurred_at?: string
          source?: string
          store_id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_features: {
        Row: {
          category: string
          created_at: string
          feature_key: string
          name: string
          value_type: string
        }
        Insert: {
          category: string
          created_at?: string
          feature_key: string
          name: string
          value_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          feature_key?: string
          name?: string
          value_type?: string
        }
        Relationships: []
      }
      billing_plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          limit_value: number | null
          plan_code: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          limit_value?: number | null
          plan_code: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          limit_value?: number | null
          plan_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "billing_features"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "billing_plan_features_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      billing_plans: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name: string
          rank: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          rank: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      business_actions: {
        Row: {
          action_type: string
          baseline: Json
          completed_at: string | null
          created_at: string
          customer_ids: Json | null
          description: string
          due_at: string | null
          external_id: string | null
          id: string
          inventory_items: Json | null
          is_demo: boolean
          note: string | null
          owner_name: string | null
          owner_user_id: string | null
          source_signal_id: string
          status: string
          store_id: string
          title: string
          transaction_ids: Json | null
          updated_at: string
        }
        Insert: {
          action_type: string
          baseline?: Json
          completed_at?: string | null
          created_at?: string
          customer_ids?: Json | null
          description: string
          due_at?: string | null
          external_id?: string | null
          id?: string
          inventory_items?: Json | null
          is_demo?: boolean
          note?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          source_signal_id: string
          status: string
          store_id: string
          title: string
          transaction_ids?: Json | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          baseline?: Json
          completed_at?: string | null
          created_at?: string
          customer_ids?: Json | null
          description?: string
          due_at?: string | null
          external_id?: string | null
          id?: string
          inventory_items?: Json | null
          is_demo?: boolean
          note?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          source_signal_id?: string
          status?: string
          store_id?: string
          title?: string
          transaction_ids?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_actions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          parent_id: string | null
          sort_order: number | null
          store_id: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number | null
          store_id: string
          updated_at?: string
          vat_rate: number
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          store_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_parent_id_fkey"
            columns: ["store_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          billing_profile: Json | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          last_visit_at: string | null
          name: string
          notes: string | null
          phone: string | null
          price_group: string | null
          store_id: string
          total_spent_cents: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          address?: string | null
          billing_profile?: Json | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_visit_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          price_group?: string | null
          store_id: string
          total_spent_cents?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          address?: string | null
          billing_profile?: Json | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_visit_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          price_group?: string | null
          store_id?: string
          total_spent_cents?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_product_lines: {
        Row: {
          cashier_name: string | null
          category_name: string | null
          cost_cents: number
          created_at: string
          daily_report_id: string
          discount_cents: number
          document_number: string
          gross_cents: number
          gross_profit_cents: number
          id: string
          net_revenue_cents: number
          occurred_at: string
          product_external_id: string | null
          product_id: string | null
          product_name: string
          product_type: string
          quantity: number
          signed_quantity: number
          sku: string | null
          store_id: string
          transaction_id: string
          transaction_kind: string
          transaction_line_id: string
          unit_price_cents: number
          variant: string | null
          vat_cents: number
          vat_rate: number
        }
        Insert: {
          cashier_name?: string | null
          category_name?: string | null
          cost_cents: number
          created_at?: string
          daily_report_id: string
          discount_cents: number
          document_number: string
          gross_cents: number
          gross_profit_cents: number
          id?: string
          net_revenue_cents: number
          occurred_at: string
          product_external_id?: string | null
          product_id?: string | null
          product_name: string
          product_type: string
          quantity: number
          signed_quantity: number
          sku?: string | null
          store_id: string
          transaction_id: string
          transaction_kind: string
          transaction_line_id: string
          unit_price_cents: number
          variant?: string | null
          vat_cents: number
          vat_rate: number
        }
        Update: {
          cashier_name?: string | null
          category_name?: string | null
          cost_cents?: number
          created_at?: string
          daily_report_id?: string
          discount_cents?: number
          document_number?: string
          gross_cents?: number
          gross_profit_cents?: number
          id?: string
          net_revenue_cents?: number
          occurred_at?: string
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string
          product_type?: string
          quantity?: number
          signed_quantity?: number
          sku?: string | null
          store_id?: string
          transaction_id?: string
          transaction_kind?: string
          transaction_line_id?: string
          unit_price_cents?: number
          variant?: string | null
          vat_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_product_lines_store_id_daily_report_id_fkey"
            columns: ["store_id", "daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "daily_report_product_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_product_lines_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "daily_report_product_lines_transaction_line_id_fkey"
            columns: ["transaction_line_id"]
            isOneToOne: false
            referencedRelation: "transaction_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_transactions: {
        Row: {
          daily_report_id: string
          store_id: string
          transaction_id: string
        }
        Insert: {
          daily_report_id: string
          store_id: string
          transaction_id: string
        }
        Update: {
          daily_report_id?: string
          store_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_transactions_store_id_daily_report_id_fkey"
            columns: ["store_id", "daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "daily_report_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_transactions_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          cash_difference_cents: number | null
          cash_difference_reason: string | null
          closed_by_user_id: string | null
          closed_by_user_name: string | null
          counted_cash_cents: number | null
          created_at: string
          expected_cash_cents: number | null
          hash: string
          hash_payload_version: number
          id: string
          is_demo: boolean
          occurred_at: string
          opening_float_cents: number | null
          previous_hash: string | null
          register_id: string | null
          report_number: number
          shift_id: string | null
          store_id: string
          totals: Json
        }
        Insert: {
          cash_difference_cents?: number | null
          cash_difference_reason?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          expected_cash_cents?: number | null
          hash: string
          hash_payload_version?: number
          id?: string
          is_demo?: boolean
          occurred_at: string
          opening_float_cents?: number | null
          previous_hash?: string | null
          register_id?: string | null
          report_number: number
          shift_id?: string | null
          store_id: string
          totals: Json
        }
        Update: {
          cash_difference_cents?: number | null
          cash_difference_reason?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          expected_cash_cents?: number | null
          hash?: string
          hash_payload_version?: number
          id?: string
          is_demo?: boolean
          occurred_at?: string
          opening_float_cents?: number | null
          previous_hash?: string | null
          register_id?: string | null
          report_number?: number
          shift_id?: string | null
          store_id?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_store_id_register_id_fkey"
            columns: ["store_id", "register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "daily_reports_store_id_shift_id_fkey"
            columns: ["store_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "register_shifts"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      employee_work_patterns: {
        Row: {
          break_minutes: number
          created_at: string
          effective_from: string
          effective_until: string | null
          employee_id: string
          end_time: string | null
          id: string
          location_label: string | null
          role_label: string | null
          scheduled_minutes: number
          start_time: string | null
          store_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          employee_id: string
          end_time?: string | null
          id?: string
          location_label?: string | null
          role_label?: string | null
          scheduled_minutes: number
          start_time?: string | null
          store_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          break_minutes?: number
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          employee_id?: string
          end_time?: string | null
          id?: string
          location_label?: string | null
          role_label?: string | null
          scheduled_minutes?: number
          start_time?: string | null
          store_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_work_patterns_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      gift_card_events: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          client_request_id: string | null
          created_at: string
          customer_id: string | null
          daily_report_id: string | null
          event_type: string
          external_id: string | null
          gift_card_code: string
          gift_card_id: string
          id: string
          note: string | null
          occurred_at: string
          payment_tenders: Json
          source: string
          store_id: string
          transaction_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          client_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          daily_report_id?: string | null
          event_type: string
          external_id?: string | null
          gift_card_code: string
          gift_card_id: string
          id?: string
          note?: string | null
          occurred_at: string
          payment_tenders?: Json
          source?: string
          store_id: string
          transaction_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          balance_before_cents?: number
          client_request_id?: string | null
          created_at?: string
          customer_id?: string | null
          daily_report_id?: string | null
          event_type?: string
          external_id?: string | null
          gift_card_code?: string
          gift_card_id?: string
          id?: string
          note?: string | null
          occurred_at?: string
          payment_tenders?: Json
          source?: string
          store_id?: string
          transaction_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_events_daily_report_fk"
            columns: ["store_id", "daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "gift_card_events_store_id_customer_id_fkey"
            columns: ["store_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "gift_card_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_events_store_id_gift_card_id_fkey"
            columns: ["store_id", "gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "gift_card_events_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance_cents: number
          code: string
          created_at: string
          customer_id: string | null
          expires_at: string | null
          external_id: string | null
          id: string
          initial_cents: number
          is_active: boolean
          is_demo: boolean
          issued_at: string
          store_id: string
          updated_at: string
        }
        Insert: {
          balance_cents: number
          code: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          initial_cents: number
          is_active?: boolean
          is_demo?: boolean
          issued_at: string
          store_id: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          code?: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          initial_cents?: number
          is_active?: boolean
          is_demo?: boolean
          issued_at?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_store_id_customer_id_fkey"
            columns: ["store_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "gift_cards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          client_request_id: string
          counted_stock_qty: number
          created_at: string
          expected_stock_qty: number
          id: string
          note: string | null
          occurred_at: string
          product_id: string
          product_name: string
          quantity_delta: number
          reason: string
          store_id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          client_request_id: string
          counted_stock_qty: number
          created_at?: string
          expected_stock_qty: number
          id?: string
          note?: string | null
          occurred_at?: string
          product_id: string
          product_name: string
          quantity_delta: number
          reason: string
          store_id: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          client_request_id?: string
          counted_stock_qty?: number
          created_at?: string
          expected_stock_qty?: number
          id?: string
          note?: string | null
          occurred_at?: string
          product_id?: string
          product_name?: string
          quantity_delta?: number
          reason?: string
          store_id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          code: string
          created_at: string
          external_id: string | null
          id: string
          is_active: boolean
          is_sellable: boolean
          location_type: string
          name: string
          normalized_code: string | null
          sort_order: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_sellable?: boolean
          location_type?: string
          name: string
          normalized_code?: string | null
          sort_order?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_sellable?: boolean
          location_type?: string
          name?: string
          normalized_code?: string | null
          sort_order?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          lot_code: string
          manufactured_on: string | null
          normalized_lot_code: string | null
          product_id: string
          status: string
          store_id: string
          supplier_lot_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          lot_code: string
          manufactured_on?: string | null
          normalized_lot_code?: string | null
          product_id: string
          status?: string
          store_id: string
          supplier_lot_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          lot_code?: string
          manufactured_on?: string | null
          normalized_lot_code?: string | null
          product_id?: string
          status?: string
          store_id?: string
          supplier_lot_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      inventory_serial_units: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          lot_id: string | null
          normalized_serial_number: string | null
          product_id: string
          received_at: string | null
          serial_number: string
          sold_at: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          normalized_serial_number?: string | null
          product_id: string
          received_at?: string | null
          serial_number: string
          sold_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          normalized_serial_number?: string | null
          product_id?: string
          received_at?: string | null
          serial_number?: string
          sold_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_serial_units_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serial_units_store_id_location_id_fkey"
            columns: ["store_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "inventory_serial_units_store_id_lot_id_product_id_fkey"
            columns: ["store_id", "lot_id", "product_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["store_id", "id", "product_id"]
          },
          {
            foreignKeyName: "inventory_serial_units_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      inventory_stock_balances: {
        Row: {
          available_qty: number | null
          created_at: string
          id: string
          location_id: string
          lot_id: string | null
          on_hand_qty: number
          product_id: string
          reserved_qty: number
          store_id: string
          updated_at: string
        }
        Insert: {
          available_qty?: number | null
          created_at?: string
          id?: string
          location_id: string
          lot_id?: string | null
          on_hand_qty?: number
          product_id: string
          reserved_qty?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          available_qty?: number | null
          created_at?: string
          id?: string
          location_id?: string
          lot_id?: string | null
          on_hand_qty?: number
          product_id?: string
          reserved_qty?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_balances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_balances_store_id_location_id_fkey"
            columns: ["store_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "inventory_stock_balances_store_id_lot_id_product_id_fkey"
            columns: ["store_id", "lot_id", "product_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["store_id", "id", "product_id"]
          },
          {
            foreignKeyName: "inventory_stock_balances_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_accounts: {
        Row: {
          balance_year: number
          created_at: string
          employee_id: string
          entitlement_status: string
          id: string
          leave_type_id: string
          opening_minutes: number
          store_id: string
          updated_at: string
        }
        Insert: {
          balance_year: number
          created_at?: string
          employee_id: string
          entitlement_status?: string
          id?: string
          leave_type_id: string
          opening_minutes?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          balance_year?: number
          created_at?: string
          employee_id?: string
          entitlement_status?: string
          id?: string
          leave_type_id?: string
          opening_minutes?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_accounts_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "leave_accounts_store_id_leave_type_id_fkey"
            columns: ["store_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_ledger_entries: {
        Row: {
          actor_user_id: string | null
          amount_minutes: number
          created_at: string
          entry_kind: string
          id: string
          leave_account_id: string
          reason: string
          request_id: string | null
          store_id: string
        }
        Insert: {
          actor_user_id?: string | null
          amount_minutes: number
          created_at?: string
          entry_kind: string
          id?: string
          leave_account_id: string
          reason: string
          request_id?: string | null
          store_id: string
        }
        Update: {
          actor_user_id?: string | null
          amount_minutes?: number
          created_at?: string
          entry_kind?: string
          id?: string
          leave_account_id?: string
          reason?: string
          request_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_ledger_entries_store_id_leave_account_id_fkey"
            columns: ["store_id", "leave_account_id"]
            isOneToOne: false
            referencedRelation: "leave_accounts"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "leave_ledger_entries_store_id_request_id_fkey"
            columns: ["store_id", "request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_request_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: number
          metadata: Json
          note: string | null
          request_id: string
          store_id: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: never
          metadata?: Json
          note?: string | null
          request_id: string
          store_id: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: never
          metadata?: Json
          note?: string | null
          request_id?: string
          store_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_request_events_store_id_request_id_fkey"
            columns: ["store_id", "request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_request_segments: {
        Row: {
          created_at: string
          id: string
          leave_account_id: string | null
          minutes: number
          request_id: string
          segment_year: number
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          leave_account_id?: string | null
          minutes: number
          request_id: string
          segment_year: number
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          leave_account_id?: string | null
          minutes?: number
          request_id?: string
          segment_year?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_request_segments_store_id_leave_account_id_fkey"
            columns: ["store_id", "leave_account_id"]
            isOneToOne: false
            referencedRelation: "leave_accounts"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "leave_request_segments_store_id_request_id_fkey"
            columns: ["store_id", "request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          client_request_id: string
          coverage_risk: string
          coverage_snapshot: Json
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          employee_id: string
          employee_note: string | null
          end_date: string
          id: string
          leave_type_id: string
          start_date: string
          status: string
          store_id: string
          submitted_at: string
          total_minutes: number
          updated_at: string
        }
        Insert: {
          client_request_id: string
          coverage_risk?: string
          coverage_snapshot?: Json
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          employee_id: string
          employee_note?: string | null
          end_date: string
          id?: string
          leave_type_id: string
          start_date: string
          status?: string
          store_id: string
          submitted_at?: string
          total_minutes: number
          updated_at?: string
        }
        Update: {
          client_request_id?: string
          coverage_risk?: string
          coverage_snapshot?: Json
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          employee_id?: string
          employee_note?: string | null
          end_date?: string
          id?: string
          leave_type_id?: string
          start_date?: string
          status?: string
          store_id?: string
          submitted_at?: string
          total_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "leave_requests_store_id_leave_type_id_fkey"
            columns: ["store_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      leave_types: {
        Row: {
          allows_negative_balance: boolean
          approval_required: boolean
          code: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_paid: boolean
          minimum_notice_days: number
          name: string
          requires_balance: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          allows_negative_balance?: boolean
          approval_required?: boolean
          code: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          minimum_notice_days?: number
          name: string
          requires_balance?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          allows_negative_balance?: boolean
          approval_required?: boolean
          code?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          minimum_notice_days?: number
          name?: string
          requires_balance?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_events: {
        Row: {
          created_at: string
          event_name: string
          id: number
          source_path: string
          target: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: never
          source_path: string
          target?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: never
          source_path?: string
          target?: string | null
        }
        Relationships: []
      }
      marketing_leads: {
        Row: {
          company: string
          consented_at: string
          created_at: string
          current_system: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          locations: string | null
          message: string
          request_type: string
          source_path: string
          status: string
        }
        Insert: {
          company: string
          consented_at: string
          created_at?: string
          current_system?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          locations?: string | null
          message: string
          request_type: string
          source_path: string
          status?: string
        }
        Update: {
          company?: string
          consented_at?: string
          created_at?: string
          current_system?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          locations?: string | null
          message?: string
          request_type?: string
          source_path?: string
          status?: string
        }
        Relationships: []
      }
      pos_discount_approval_attempts: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          requester_user_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          requester_user_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          requester_user_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_discount_approval_attempts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_discount_approvals: {
        Row: {
          approved_at: string
          approved_by_user_id: string
          cart_id: number
          consumed_at: string | null
          consumed_by_transaction_id: string | null
          discount_cents: number
          expires_at: string
          id: string
          reason: string
          requester_user_id: string
          store_id: string
        }
        Insert: {
          approved_at?: string
          approved_by_user_id: string
          cart_id: number
          consumed_at?: string | null
          consumed_by_transaction_id?: string | null
          discount_cents: number
          expires_at: string
          id?: string
          reason: string
          requester_user_id: string
          store_id: string
        }
        Update: {
          approved_at?: string
          approved_by_user_id?: string
          cart_id?: number
          consumed_at?: string | null
          consumed_by_transaction_id?: string | null
          discount_cents?: number
          expires_at?: string
          id?: string
          reason?: string
          requester_user_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_discount_approvals_consumed_by_transaction_id_fkey"
            columns: ["consumed_by_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discount_approvals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_manager_approval_pins: {
        Row: {
          created_at: string
          pin_hash: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          pin_hash: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          pin_hash?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_manager_approval_pins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_families: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          is_active: boolean
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_families_store_id_category_id_fkey"
            columns: ["store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "product_families_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_option_definitions: {
        Row: {
          created_at: string
          display_order: number | null
          family_id: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          family_id: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          family_id?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_family_option_definitions_store_id_family_id_fkey"
            columns: ["store_id", "family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "product_family_option_definitions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_option_values: {
        Row: {
          created_at: string
          definition_id: string
          display_order: number | null
          family_id: string
          id: string
          is_active: boolean
          normalized_value: string | null
          store_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          display_order?: number | null
          family_id: string
          id?: string
          is_active?: boolean
          normalized_value?: string | null
          store_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          display_order?: number | null
          family_id?: string
          id?: string
          is_active?: boolean
          normalized_value?: string | null
          store_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_family_option_values_store_id_definition_id_family_fkey"
            columns: ["store_id", "definition_id", "family_id"]
            isOneToOne: false
            referencedRelation: "product_family_option_definitions"
            referencedColumns: ["store_id", "id", "family_id"]
          },
          {
            foreignKeyName: "product_family_option_values_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_variants: {
        Row: {
          created_at: string
          display_name: string | null
          display_order: number | null
          family_id: string
          option_signature: string
          product_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          display_order?: number | null
          family_id: string
          option_signature?: string
          product_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          display_order?: number | null
          family_id?: string
          option_signature?: string
          product_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_family_variants_store_id_family_id_fkey"
            columns: ["store_id", "family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "product_family_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_variants_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      product_identifiers: {
        Row: {
          created_at: string
          id: string
          identifier_type: string
          identifier_value: string
          is_active: boolean
          is_primary: boolean
          is_scannable: boolean
          normalized_value: string | null
          product_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier_type: string
          identifier_value: string
          is_active?: boolean
          is_primary?: boolean
          is_scannable?: boolean
          normalized_value?: string | null
          product_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier_type?: string
          identifier_value?: string
          is_active?: boolean
          is_primary?: boolean
          is_scannable?: boolean
          normalized_value?: string | null
          product_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_identifiers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      product_inventory_profiles: {
        Row: {
          allow_negative_stock: boolean
          base_unit_code: string
          created_at: string
          product_id: string
          quantity_scale: number
          stock_mode: string
          store_id: string
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          base_unit_code?: string
          created_at?: string
          product_id: string
          quantity_scale?: number
          stock_mode?: string
          store_id: string
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          base_unit_code?: string
          created_at?: string
          product_id?: string
          quantity_scale?: number
          stock_mode?: string
          store_id?: string
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_inventory_profiles_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      product_packaging_units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_purchasable: boolean
          is_sellable: boolean
          label: string
          normalized_code: string | null
          product_id: string
          quantity_in_base_unit: number
          store_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_purchasable?: boolean
          is_sellable?: boolean
          label: string
          normalized_code?: string | null
          product_id: string
          quantity_in_base_unit: number
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_purchasable?: boolean
          is_sellable?: boolean
          label?: string
          normalized_code?: string | null
          product_id?: string
          quantity_in_base_unit?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_packaging_units_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_packaging_units_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      product_variant_option_values: {
        Row: {
          created_at: string
          definition_id: string
          family_id: string
          product_id: string
          store_id: string
          value_id: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          family_id: string
          product_id: string
          store_id: string
          value_id: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          family_id?: string
          product_id?: string
          store_id?: string
          value_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_option_values_store_id_definition_id_famil_fkey"
            columns: ["store_id", "definition_id", "family_id"]
            isOneToOne: false
            referencedRelation: "product_family_option_definitions"
            referencedColumns: ["store_id", "id", "family_id"]
          },
          {
            foreignKeyName: "product_variant_option_values_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_option_values_store_id_product_id_family_i_fkey"
            columns: ["store_id", "product_id", "family_id"]
            isOneToOne: false
            referencedRelation: "product_family_variants"
            referencedColumns: ["store_id", "product_id", "family_id"]
          },
          {
            foreignKeyName: "product_variant_option_values_store_id_value_id_family_id__fkey"
            columns: ["store_id", "value_id", "family_id", "definition_id"]
            isOneToOne: false
            referencedRelation: "product_family_option_values"
            referencedColumns: ["store_id", "id", "family_id", "definition_id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          category_name: string
          color: string | null
          cost_price_cents: number | null
          created_at: string
          custom_fields: Json
          external_id: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          min_stock_qty: number | null
          name: string
          price_cents: number
          price_tiers: Json
          product_type: string
          sku: string | null
          stock_qty: number | null
          store_id: string
          subcategory: string | null
          supplier: string | null
          supplier_code: string | null
          updated_at: string
          variant: string | null
          vat_rate: number
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          category_name: string
          color?: string | null
          cost_price_cents?: number | null
          created_at?: string
          custom_fields?: Json
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          min_stock_qty?: number | null
          name: string
          price_cents: number
          price_tiers?: Json
          product_type?: string
          sku?: string | null
          stock_qty?: number | null
          store_id: string
          subcategory?: string | null
          supplier?: string | null
          supplier_code?: string | null
          updated_at?: string
          variant?: string | null
          vat_rate: number
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          category_name?: string
          color?: string | null
          cost_price_cents?: number | null
          created_at?: string
          custom_fields?: Json
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          min_stock_qty?: number | null
          name?: string
          price_cents?: number
          price_tiers?: Json
          product_type?: string
          sku?: string | null
          stock_qty?: number | null
          store_id?: string
          subcategory?: string | null
          supplier?: string | null
          supplier_code?: string | null
          updated_at?: string
          variant?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_category_id_fkey"
            columns: ["store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          forecast_snapshot: Json
          id: string
          ordered_qty: number
          product_external_id: string | null
          product_id: string | null
          product_name: string
          purchase_order_id: string
          received_qty: number
          sku: string | null
          store_id: string
          unit_cost_cents: number | null
        }
        Insert: {
          created_at?: string
          forecast_snapshot?: Json
          id?: string
          ordered_qty: number
          product_external_id?: string | null
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          received_qty?: number
          sku?: string | null
          store_id: string
          unit_cost_cents?: number | null
        }
        Update: {
          created_at?: string
          forecast_snapshot?: Json
          id?: string
          ordered_qty?: number
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          received_qty?: number
          sku?: string | null
          store_id?: string
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_lines_store_id_purchase_order_id_fkey"
            columns: ["store_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_delivery_at: string | null
          external_id: string | null
          id: string
          is_demo: boolean
          note: string | null
          ordered_at: string | null
          owner_name: string | null
          owner_user_id: string | null
          received_at: string | null
          reference: string | null
          source: string
          status: string
          store_id: string
          supplier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_delivery_at?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          note?: string | null
          ordered_at?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          received_at?: string | null
          reference?: string | null
          source?: string
          status: string
          store_id: string
          supplier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_delivery_at?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          note?: string | null
          ordered_at?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          received_at?: string | null
          reference?: string | null
          source?: string
          status?: string
          store_id?: string
          supplier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      register_shifts: {
        Row: {
          cash_difference_cents: number | null
          cash_difference_reason: string | null
          closed_at: string | null
          closed_by_user_id: string | null
          closed_by_user_name: string | null
          counted_cash_cents: number | null
          created_at: string
          expected_cash_cents: number | null
          id: string
          is_demo: boolean
          opened_at: string
          opened_by_user_id: string | null
          opened_by_user_name: string | null
          opening_float_cents: number
          register_id: string
          shift_number: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          cash_difference_cents?: number | null
          cash_difference_reason?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          expected_cash_cents?: number | null
          id?: string
          is_demo?: boolean
          opened_at: string
          opened_by_user_id?: string | null
          opened_by_user_name?: string | null
          opening_float_cents: number
          register_id: string
          shift_number: number
          status: string
          store_id: string
          updated_at?: string
        }
        Update: {
          cash_difference_cents?: number | null
          cash_difference_reason?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          expected_cash_cents?: number | null
          id?: string
          is_demo?: boolean
          opened_at?: string
          opened_by_user_id?: string | null
          opened_by_user_name?: string | null
          opening_float_cents?: number
          register_id?: string
          shift_number?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_shifts_store_id_register_id_fkey"
            columns: ["store_id", "register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      registers: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          is_active: boolean
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          asset_type: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          identifier_value: string | null
          number: string
          payload: Json
          route: string
          status: string
          store_id: string
          substatus: string
          tracking_token: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id: string
          identifier_value?: string | null
          number: string
          payload: Json
          route: string
          status: string
          store_id: string
          substatus?: string
          tracking_token: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          identifier_value?: string | null
          number?: string
          payload?: Json
          route?: string
          status?: string
          store_id?: string
          substatus?: string
          tracking_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          adjustment_reason: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          note: string | null
          occurred_at: string
          product_id: string
          product_name: string
          purchase_order_id: string | null
          quantity_after: number | null
          quantity_before: number | null
          quantity_delta: number
          reason: string
          return_disposition: string | null
          store_id: string
          transaction_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          adjustment_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          note?: string | null
          occurred_at: string
          product_id: string
          product_name: string
          purchase_order_id?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_delta: number
          reason: string
          return_disposition?: string | null
          store_id: string
          transaction_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          adjustment_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          note?: string | null
          occurred_at?: string
          product_id?: string
          product_name?: string
          purchase_order_id?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_delta?: number
          reason?: string
          return_disposition?: string | null
          store_id?: string
          transaction_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_purchase_order_id_fkey"
            columns: ["store_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      store_capability_assessments: {
        Row: {
          assessed_at: string
          assessed_by_user_id: string | null
          assessment_note: string | null
          capability_code: string
          source: string
          state: string
          store_id: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          assessed_by_user_id?: string | null
          assessment_note?: string | null
          capability_code: string
          source: string
          state: string
          store_id: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          assessed_by_user_id?: string | null
          assessment_note?: string | null
          capability_code?: string
          source?: string
          state?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_capability_assessments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_memberships: {
        Row: {
          created_at: string
          role: string
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          status?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_module_settings: {
        Row: {
          created_at: string
          custom_label: string | null
          enabled: boolean
          module_key: string
          sort_order: number
          store_id: string
          updated_at: string
          visible_roles: string[]
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          enabled?: boolean
          module_key: string
          sort_order: number
          store_id: string
          updated_at?: string
          visible_roles?: string[]
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          enabled?: boolean
          module_key?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
          visible_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "store_module_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_retail_profiles: {
        Row: {
          profile_code: string
          profile_version: number
          selected_at: string
          selected_by_user_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          profile_code: string
          profile_version?: number
          selected_at?: string
          selected_by_user_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          profile_code?: string
          profile_version?: number
          selected_at?: string
          selected_by_user_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_retail_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_subscriptions: {
        Row: {
          activation_source: string
          billing_cycle: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_ends_at: string | null
          current_period_started_at: string | null
          plan_code: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          store_id: string
          test_mode: boolean
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          activation_source?: string
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          current_period_started_at?: string | null
          plan_code: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          store_id: string
          test_mode?: boolean
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          activation_source?: string
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          current_period_started_at?: string | null
          plan_code?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          store_id?: string
          test_mode?: boolean
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "store_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          country_code: string
          commercial_return_policy: Json
          created_at: string
          currency: string
          email: string | null
          id: string
          industry_code: string
          is_demo: boolean
          legal_name: string | null
          locale: string
          name: string
          customer_insight_settings: Json
          pace_recommendation_rules: Json
          onboarding_completed_at: string | null
          onboarding_config: Json
          phone: string | null
          postal_code: string | null
          receipt_footer: string | null
          return_policy: string | null
          timezone: string
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country_code?: string
          commercial_return_policy?: Json
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry_code?: string
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          name: string
          customer_insight_settings?: Json
          pace_recommendation_rules?: Json
          onboarding_completed_at?: string | null
          onboarding_config?: Json
          phone?: string | null
          postal_code?: string | null
          receipt_footer?: string | null
          return_policy?: string | null
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country_code?: string
          commercial_return_policy?: Json
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry_code?: string
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          name?: string
          customer_insight_settings?: Json
          pace_recommendation_rules?: Json
          onboarding_completed_at?: string | null
          onboarding_config?: Json
          phone?: string | null
          postal_code?: string | null
          receipt_footer?: string | null
          return_policy?: string | null
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          actor_user_id: string | null
          event_type: string
          id: string
          metadata: Json
          new_plan_code: string | null
          new_status: string | null
          occurred_at: string
          previous_plan_code: string | null
          previous_status: string | null
          source: string
          store_id: string
        }
        Insert: {
          actor_user_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_plan_code?: string | null
          new_status?: string | null
          occurred_at?: string
          previous_plan_code?: string | null
          previous_status?: string | null
          source: string
          store_id: string
        }
        Update: {
          actor_user_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_plan_code?: string | null
          new_status?: string | null
          occurred_at?: string
          previous_plan_code?: string | null
          previous_status?: string | null
          source?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_new_plan_code_fkey"
            columns: ["new_plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscription_events_previous_plan_code_fkey"
            columns: ["previous_plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscription_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_lines: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          line_external_id: string
          line_total_cents: number
          modifiers: Json
          notes: string | null
          product_external_id: string | null
          product_id: string | null
          product_name: string
          product_snapshot: Json
          quantity: number
          sku: string | null
          store_id: string
          transaction_id: string
          unit_cost_cents: number | null
          unit_price_cents: number
          vat_rate: number
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          line_external_id: string
          line_total_cents: number
          modifiers?: Json
          notes?: string | null
          product_external_id?: string | null
          product_id?: string | null
          product_name: string
          product_snapshot?: Json
          quantity: number
          sku?: string | null
          store_id: string
          transaction_id: string
          unit_cost_cents?: number | null
          unit_price_cents: number
          vat_rate: number
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          line_external_id?: string
          line_total_cents?: number
          modifiers?: Json
          notes?: string | null
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string
          product_snapshot?: Json
          quantity?: number
          sku?: string | null
          store_id?: string
          transaction_id?: string
          unit_cost_cents?: number | null
          unit_price_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "transaction_lines_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      transaction_tenders: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method: string
          store_id: string
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method: string
          store_id: string
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?: string
          store_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tenders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tenders_store_id_transaction_id_fkey"
            columns: ["store_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      transactions: {
        Row: {
          client_request_id: string
          correction_reason: string | null
          created_at: string
          customer_id: string | null
          discount_approved_by_user_id: string | null
          discount_cents: number
          discount_reason: string | null
          document_number: string
          document_request: Json | null
          external_id: string | null
          id: string
          invoice_issued_at: string | null
          invoice_number: string | null
          is_demo: boolean | null
          is_finalized: boolean
          kind: string
          merchant_snapshot: Json
          occurred_at: string
          original_transaction_id: string | null
          payment_method: string
          receipt_barcode: string
          receipt_barcode_version: number
          register_id: string | null
          return_disposition: string | null
          rounding_adjustment_cents: number
          shift_id: string | null
          source: string
          store_id: string
          subtotal_cents: number
          table_id: number
          tendered_cents: number | null
          tip_cents: number
          total_cents: number
          user_id: string | null
          user_name: string | null
          vat_0_cents: number
          vat_12_cents: number
          vat_21_cents: number
          vat_6_cents: number
          vat_breakdown: Json
          vat_snapshot_version: number
        }
        Insert: {
          client_request_id: string
          correction_reason?: string | null
          created_at?: string
          customer_id?: string | null
          discount_approved_by_user_id?: string | null
          discount_cents?: number
          discount_reason?: string | null
          document_number: string
          document_request?: Json | null
          external_id?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          is_demo?: boolean | null
          is_finalized?: boolean
          kind?: string
          merchant_snapshot?: Json
          occurred_at: string
          original_transaction_id?: string | null
          payment_method: string
          receipt_barcode: string
          receipt_barcode_version?: number
          register_id?: string | null
          return_disposition?: string | null
          rounding_adjustment_cents?: number
          shift_id?: string | null
          source?: string
          store_id: string
          subtotal_cents: number
          table_id?: number
          tendered_cents?: number | null
          tip_cents?: number
          total_cents: number
          user_id?: string | null
          user_name?: string | null
          vat_0_cents?: number
          vat_12_cents?: number
          vat_21_cents?: number
          vat_6_cents?: number
          vat_breakdown?: Json
          vat_snapshot_version?: number
        }
        Update: {
          client_request_id?: string
          correction_reason?: string | null
          created_at?: string
          customer_id?: string | null
          discount_approved_by_user_id?: string | null
          discount_cents?: number
          discount_reason?: string | null
          document_number?: string
          document_request?: Json | null
          external_id?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          is_demo?: boolean | null
          is_finalized?: boolean
          kind?: string
          merchant_snapshot?: Json
          occurred_at?: string
          original_transaction_id?: string | null
          payment_method?: string
          receipt_barcode?: string
          receipt_barcode_version?: number
          register_id?: string | null
          return_disposition?: string | null
          rounding_adjustment_cents?: number
          shift_id?: string | null
          source?: string
          store_id?: string
          subtotal_cents?: number
          table_id?: number
          tendered_cents?: number | null
          tip_cents?: number
          total_cents?: number
          user_id?: string | null
          user_name?: string | null
          vat_0_cents?: number
          vat_12_cents?: number
          vat_21_cents?: number
          vat_6_cents?: number
          vat_breakdown?: Json
          vat_snapshot_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_store_id_customer_id_fkey"
            columns: ["store_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_original_transaction_id_fkey"
            columns: ["store_id", "original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "transactions_store_id_register_id_fkey"
            columns: ["store_id", "register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "transactions_store_id_shift_id_fkey"
            columns: ["store_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "register_shifts"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      void_entries: {
        Row: {
          amount_cents: number
          by_user_id: string
          by_user_name: string
          client_request_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          occurred_at: string
          product_id: string | null
          product_name: string
          quantity: number
          reason: string
          store_id: string
          table_id: number
        }
        Insert: {
          amount_cents: number
          by_user_id: string
          by_user_name: string
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          occurred_at: string
          product_id?: string | null
          product_name: string
          quantity: number
          reason: string
          store_id: string
          table_id: number
        }
        Update: {
          amount_cents?: number
          by_user_id?: string
          by_user_name?: string
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          occurred_at?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string
          store_id?: string
          table_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "void_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "void_entries_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      webshop_order_lines: {
        Row: {
          created_at: string
          id: string
          line_total_cents: number
          product_external_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          store_id: string
          unit_price_cents: number
          variant: string | null
          webshop_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_cents: number
          product_external_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          sku?: string | null
          store_id: string
          unit_price_cents: number
          variant?: string | null
          webshop_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total_cents?: number
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          store_id?: string
          unit_price_cents?: number
          variant?: string | null
          webshop_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webshop_order_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webshop_order_lines_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "webshop_order_lines_store_id_webshop_order_id_fkey"
            columns: ["store_id", "webshop_order_id"]
            isOneToOne: false
            referencedRelation: "webshop_orders"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      webshop_orders: {
        Row: {
          client_request_id: string
          confirmation_email: Json
          coupon_code: string | null
          created_at: string
          customer_snapshot: Json
          delivery_mode: string
          discount_cents: number
          external_id: string | null
          fulfillment_status: string
          id: string
          inventory_status: string
          is_demo: boolean | null
          note: string | null
          order_number: string
          payment_method: string
          payment_reference: string | null
          payment_status: string
          pickup_address: string | null
          shipping_address: Json | null
          shipping_cents: number
          source: string
          status: string
          store_id: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          client_request_id: string
          confirmation_email?: Json
          coupon_code?: string | null
          created_at?: string
          customer_snapshot: Json
          delivery_mode: string
          discount_cents?: number
          external_id?: string | null
          fulfillment_status: string
          id?: string
          inventory_status: string
          is_demo?: boolean | null
          note?: string | null
          order_number: string
          payment_method: string
          payment_reference?: string | null
          payment_status: string
          pickup_address?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          source: string
          status: string
          store_id: string
          subtotal_cents: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          client_request_id?: string
          confirmation_email?: Json
          coupon_code?: string | null
          created_at?: string
          customer_snapshot?: Json
          delivery_mode?: string
          discount_cents?: number
          external_id?: string | null
          fulfillment_status?: string
          id?: string
          inventory_status?: string
          is_demo?: boolean | null
          note?: string | null
          order_number?: string
          payment_method?: string
          payment_reference?: string | null
          payment_status?: string
          pickup_address?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          source?: string
          status?: string
          store_id?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webshop_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      webshop_product_settings: {
        Row: {
          created_at: string
          description: string | null
          image_url: string | null
          is_featured: boolean
          is_published: boolean
          product_id: string
          store_id: string
          updated_at: string
          variants: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean
          product_id: string
          store_id: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean
          product_id?: string
          store_id?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "webshop_product_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webshop_product_settings_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      webshop_settings: {
        Row: {
          created_at: string
          custom_domain: string | null
          is_demo: boolean
          is_enabled: boolean
          settings: Json
          store_id: string
          subdomain: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          is_demo?: boolean
          is_enabled?: boolean
          settings?: Json
          store_id: string
          subdomain?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          is_demo?: boolean
          is_enabled?: boolean
          settings?: Json
          store_id?: string
          subdomain?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webshop_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_availability_exceptions: {
        Row: {
          availability: string
          created_at: string
          created_by_user_id: string
          employee_id: string
          ends_at: string
          id: string
          note: string | null
          starts_at: string
          store_id: string
          updated_at: string
        }
        Insert: {
          availability: string
          created_at?: string
          created_by_user_id: string
          employee_id: string
          ends_at: string
          id?: string
          note?: string | null
          starts_at: string
          store_id: string
          updated_at?: string
        }
        Update: {
          availability?: string
          created_at?: string
          created_by_user_id?: string
          employee_id?: string
          ends_at?: string
          id?: string
          note?: string | null
          starts_at?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_availability_exceptions_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      workforce_calendar_days: {
        Row: {
          calendar_date: string
          consumes_leave: boolean
          created_at: string
          day_type: string
          name: string
          source: string
          store_id: string
          updated_at: string
        }
        Insert: {
          calendar_date: string
          consumes_leave?: boolean
          created_at?: string
          day_type: string
          name: string
          source?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          calendar_date?: string
          consumes_leave?: boolean
          created_at?: string
          day_type?: string
          name?: string
          source?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_calendar_days_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_competencies: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_competencies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_coverage_rules: {
        Row: {
          competency_id: string | null
          created_at: string
          id: string
          is_active: boolean
          minimum_present: number
          name: string
          store_id: string
          updated_at: string
          weekday: number | null
        }
        Insert: {
          competency_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          minimum_present?: number
          name: string
          store_id: string
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          competency_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          minimum_present?: number
          name?: string
          store_id?: string
          updated_at?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_coverage_rules_store_id_competency_id_fkey"
            columns: ["store_id", "competency_id"]
            isOneToOne: false
            referencedRelation: "workforce_competencies"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "workforce_coverage_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_employee_competencies: {
        Row: {
          competency_id: string
          created_at: string
          employee_id: string
          level: number
          store_id: string
          updated_at: string
          valid_until: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          competency_id: string
          created_at?: string
          employee_id: string
          level?: number
          store_id: string
          updated_at?: string
          valid_until?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          competency_id?: string
          created_at?: string
          employee_id?: string
          level?: number
          store_id?: string
          updated_at?: string
          valid_until?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_employee_competencies_store_id_competency_id_fkey"
            columns: ["store_id", "competency_id"]
            isOneToOne: false
            referencedRelation: "workforce_competencies"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "workforce_employee_competencies_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      workforce_employees: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          employee_number: string | null
          employment_end_date: string | null
          employment_start_date: string
          employment_status: string
          id: string
          store_id: string
          timezone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          employee_number?: string | null
          employment_end_date?: string | null
          employment_start_date?: string
          employment_status?: string
          id?: string
          store_id: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          employee_number?: string | null
          employment_end_date?: string | null
          employment_start_date?: string
          employment_status?: string
          id?: string
          store_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_leave_approval_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_leave_approval_pins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_roster_events: {
        Row: {
          actor_user_id: string
          created_at: string
          event_type: string
          id: number
          metadata: Json
          roster_id: string
          shift_id: string | null
          store_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          roster_id: string
          shift_id?: string | null
          store_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          roster_id?: string
          shift_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_roster_events_store_id_roster_id_fkey"
            columns: ["store_id", "roster_id"]
            isOneToOne: false
            referencedRelation: "workforce_rosters"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      workforce_rosters: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          published_at: string | null
          published_by_user_id: string | null
          status: string
          store_id: string
          updated_at: string
          version: number
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          published_at?: string | null
          published_by_user_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
          version?: number
          week_start: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          published_at?: string | null
          published_by_user_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          version?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_rosters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_shifts: {
        Row: {
          break_minutes: number
          created_at: string
          created_by_user_id: string
          employee_id: string
          ends_at: string
          id: string
          location_label: string | null
          note: string | null
          role_label: string | null
          roster_id: string
          source: string
          starts_at: string
          store_id: string
          updated_at: string
          updated_by_user_id: string
          version: number
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          created_by_user_id: string
          employee_id: string
          ends_at: string
          id?: string
          location_label?: string | null
          note?: string | null
          role_label?: string | null
          roster_id: string
          source?: string
          starts_at: string
          store_id: string
          updated_at?: string
          updated_by_user_id: string
          version?: number
        }
        Update: {
          break_minutes?: number
          created_at?: string
          created_by_user_id?: string
          employee_id?: string
          ends_at?: string
          id?: string
          location_label?: string | null
          note?: string | null
          role_label?: string | null
          roster_id?: string
          source?: string
          starts_at?: string
          store_id?: string
          updated_at?: string
          updated_by_user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workforce_shifts_store_id_employee_id_fkey"
            columns: ["store_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "workforce_employees"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "workforce_shifts_store_id_roster_id_fkey"
            columns: ["store_id", "roster_id"]
            isOneToOne: false
            referencedRelation: "workforce_rosters"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_pace_product_recommendations: {
        Args: {
          target_store_id: string
          purchased_product_external_ids: string[]
          result_limit?: number
        }
        Returns: {
          product_external_id: string
          pair_sale_count: number
          confidence: number
          evidence_label: string
        }[]
      }
      adjust_leave_balance: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      adjust_leave_balance_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      append_audit: {
        Args: {
          event_action: string
          event_detail?: Json
          target_store_id: string
        }
        Returns: string
      }
      apply_migration_activation: {
        Args: { migration_payload: Json; target_store_id: string }
        Returns: Json
      }
      apply_migration_category_relations: {
        Args: { relations_payload: Json; target_store_id: string }
        Returns: Json
      }
      apply_retail_catalog_relations: {
        Args: { relations_payload: Json; target_store_id: string }
        Returns: Json
      }
      upsert_manual_catalog_batch: {
        Args: { batch_payload: Json; target_store_id: string }
        Returns: Json
      }
      apply_workforce_patterns: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      apply_workforce_patterns_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      approve_pos_discount: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      change_test_subscription: {
        Args: { target_plan: string; target_store_id: string }
        Returns: Json
      }
      checkout_sale: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      checkout_sale_payment_v1: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      checkout_sale_v1: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      copy_workforce_week: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      copy_workforce_week_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      decide_leave_request: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      decide_leave_request_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      delete_workforce_shift: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      delete_workforce_shift_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      finalize_daily_report: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      finalize_daily_report_v3: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      get_daily_report_day_summaries: {
        Args: { business_timezone?: string; target_store_id: string }
        Returns: Json
      }
      get_daily_report_detail: {
        Args: { target_daily_report_id: string; target_store_id: string }
        Returns: Json
      }
      get_module_navigation: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_platform_session: { Args: never; Returns: Json }
      get_public_service_order: {
        Args: { tracking_token: string }
        Returns: Json
      }
      get_public_webshop: { Args: { store_identifier: string }; Returns: Json }
      get_retail_platform_capabilities: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_store_entitlements: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_store_platform_feature_flags: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_workforce_bootstrap: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_workforce_bootstrap_internal: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_workforce_bootstrap_legacy_payload: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_workforce_roster: {
        Args: {
          range_end: string
          range_start: string
          target_store_id: string
        }
        Returns: Json
      }
      get_workforce_roster_internal: {
        Args: {
          range_end: string
          range_start: string
          target_store_id: string
        }
        Returns: Json
      }
      ingest_github_development_update: {
        Args: { payload: Json }
        Returns: Json
      }
      list_service_orders: { Args: { target_store_id: string }; Returns: Json }
      lookup_return_ticket: {
        Args: { barcode: string; target_store_id: string }
        Returns: Json
      }
      mutate_gift_card: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      mutate_gift_card_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      place_public_webshop_order: {
        Args: { payload: Json; store_identifier: string }
        Returns: Json
      }
      platform_create_release: {
        Args: {
          release_description: string
          release_enabled: boolean
          release_feature_key: string
          release_risk_level: string
          release_target_mode: string
          release_target_store_ids?: string[]
          release_title: string
        }
        Returns: Json
      }
      platform_delete_store: {
        Args: {
          deletion_reason: string
          expected_store_name: string
          target_store_id: string
        }
        Returns: Json
      }
      platform_get_overview: { Args: never; Returns: Json }
      platform_get_store_detail: {
        Args: { target_store_id: string }
        Returns: Json
      }
      platform_get_support_snapshot: {
        Args: { target_store_id: string }
        Returns: Json
      }
      platform_list_audit_entries: {
        Args: { page_limit?: number; search_term?: string }
        Returns: Json
      }
      platform_list_development_updates: {
        Args: {
          before_id?: string
          before_pushed_at?: string
          page_limit?: number
        }
        Returns: Json
      }
      platform_list_incidents: {
        Args: {
          page_limit?: number
          severity_filter?: string
          status_filter?: string
        }
        Returns: Json
      }
      platform_list_integration_runs: {
        Args: { page_limit?: number; target_store_id: string }
        Returns: Json
      }
      platform_list_members: { Args: never; Returns: Json }
      platform_list_releases: { Args: never; Returns: Json }
      platform_list_stores: {
        Args: {
          health_filter?: string
          page_limit?: number
          search_term?: string
        }
        Returns: Json
      }
      platform_refresh_store_health_snapshots: { Args: never; Returns: number }
      platform_request_support_access: {
        Args: {
          access_reason: string
          consent_confirmed: boolean
          requested_scope?: string
          target_store_id: string
        }
        Returns: Json
      }
      platform_revoke_support_access: {
        Args: { grant_id: string }
        Returns: undefined
      }
      platform_transition_release: {
        Args: { next_status: string; target_release_id: string }
        Returns: Json
      }
      platform_update_incident: {
        Args: {
          next_status: string
          operator_note?: string
          target_incident_id: string
        }
        Returns: Json
      }
      platform_update_store_subscription: {
        Args: {
          change_reason: string
          target_plan: string
          target_status: string
          target_store_id: string
        }
        Returns: Json
      }
      platform_upsert_member: {
        Args: {
          member_email: string
          member_role: string
          member_scopes: string[]
          member_status?: string
        }
        Returns: Json
      }
      publish_workforce_roster: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      publish_workforce_roster_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      record_integration_run: {
        Args: {
          run_created_count?: number
          run_error_code?: string
          run_error_count?: number
          run_error_fingerprint?: string
          run_event_message?: string
          run_event_type?: string
          run_id: string
          run_mapping_summary?: Json
          run_operation: string
          run_row_count?: number
          run_skipped_count?: number
          run_source_format: string
          run_source_name: string
          run_status: string
          run_updated_count?: number
          target_store_id: string
        }
        Returns: Json
      }
      record_inventory_adjustment: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      record_platform_health_event: {
        Args: { payload: Json }
        Returns: undefined
      }
      record_void: {
        Args: { payload: Json; target_store_id: string }
        Returns: string
      }
      refund_sale: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      refund_sale_receipt_v2: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      refund_sale_v1: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      reopen_workforce_roster: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      reopen_workforce_roster_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_module_navigation: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_purchase_order: {
        Args: { payload: Json; target_store_id: string }
        Returns: string
      }
      save_purchase_order_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: string
      }
      save_service_order: {
        Args: { order_payload: Json; target_store_id: string }
        Returns: Json
      }
      save_service_order_internal: {
        Args: { order_payload: Json; target_store_id: string }
        Returns: Json
      }
      save_store_retail_profile: {
        Args: { profile_payload: Json; target_store_id: string }
        Returns: Json
      }
      save_workforce_employee: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_workforce_pattern: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_workforce_pattern_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_workforce_shift: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      save_workforce_shift_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      seal_migration_activation: {
        Args: { lock_payload: Json; target_store_id: string }
        Returns: boolean
      }
      set_leave_approval_pin: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      set_pos_manager_approval_pin: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      simulate_test_trial: {
        Args: { days_remaining: number; target_store_id: string }
        Returns: Json
      }
      submit_leave_request: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      submit_leave_request_internal: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      submit_public_event: {
        Args: {
          marketing_event_name: string
          marketing_source_path: string
          marketing_target?: string
        }
        Returns: undefined
      }
      submit_public_lead: {
        Args: {
          lead_company: string
          lead_consented_at: string
          lead_current_system: string
          lead_email: string
          lead_first_name: string
          lead_last_name: string
          lead_locations: string
          lead_message: string
          lead_request_type: string
          lead_source_path: string
        }
        Returns: string
      }
      undo_migration_activation: {
        Args: { target_migration_id: string; target_store_id: string }
        Returns: boolean
      }
      update_webshop_order: {
        Args: {
          payload: Json
          target_order_id: string
          target_store_id: string
        }
        Returns: Json
      }
      verify_leave_approval_pin: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      withdraw_leave_request: {
        Args: { target_request_id: string; target_store_id: string }
        Returns: Json
      }
      withdraw_leave_request_internal: {
        Args: { target_request_id: string; target_store_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
