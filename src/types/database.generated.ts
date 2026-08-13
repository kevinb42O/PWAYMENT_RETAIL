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
        ]
      }
      customers: {
        Row: {
          address: string | null
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
      stock_movements: {
        Row: {
          client_request_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          occurred_at: string
          product_id: string
          product_name: string
          purchase_order_id: string | null
          quantity_delta: number
          reason: string
          store_id: string
          transaction_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          occurred_at: string
          product_id: string
          product_name: string
          purchase_order_id?: string | null
          quantity_delta: number
          reason: string
          store_id: string
          transaction_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          occurred_at?: string
          product_id?: string
          product_name?: string
          purchase_order_id?: string | null
          quantity_delta?: number
          reason?: string
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
          created_at: string
          currency: string
          email: string | null
          id: string
          is_demo: boolean
          legal_name: string | null
          locale: string
          name: string
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
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          name: string
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
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          name?: string
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
          external_id: string | null
          id: string
          is_demo: boolean | null
          is_finalized: boolean
          kind: string
          merchant_snapshot: Json
          occurred_at: string
          original_transaction_id: string | null
          payment_method: string
          register_id: string | null
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
          vat_12_cents: number
          vat_21_cents: number
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
          external_id?: string | null
          id?: string
          is_demo?: boolean | null
          is_finalized?: boolean
          kind?: string
          merchant_snapshot?: Json
          occurred_at: string
          original_transaction_id?: string | null
          payment_method: string
          register_id?: string | null
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
          vat_12_cents?: number
          vat_21_cents?: number
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
          external_id?: string | null
          id?: string
          is_demo?: boolean | null
          is_finalized?: boolean
          kind?: string
          merchant_snapshot?: Json
          occurred_at?: string
          original_transaction_id?: string | null
          payment_method?: string
          register_id?: string | null
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
          vat_12_cents?: number
          vat_21_cents?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_audit: {
        Args: {
          event_action: string
          event_detail?: Json
          target_store_id: string
        }
        Returns: string
      }
      change_test_subscription: {
        Args: { target_plan: string; target_store_id: string }
        Returns: Json
      }
      checkout_sale: {
        Args: { payload: Json; target_store_id: string }
        Returns: Json
      }
      finalize_daily_report: {
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
      get_store_entitlements: {
        Args: { target_store_id: string }
        Returns: Json
      }
      get_public_webshop: {
        Args: { store_identifier: string }
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
      record_void: {
        Args: { payload: Json; target_store_id: string }
        Returns: string
      }
      refund_sale: {
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
      simulate_test_trial: {
        Args: { days_remaining: number; target_store_id: string }
        Returns: Json
      }
      update_webshop_order: {
        Args: {
          payload: Json
          target_order_id: string
          target_store_id: string
        }
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
