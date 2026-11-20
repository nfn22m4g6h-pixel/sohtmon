export type Currency = "TJS" | "CNY";
export type PaymentMethod = "cash" | "card" | "transfer";

export type ActionState = { ok?: boolean; error?: string; message?: string; id?: string } | null;

export type Category = { id: string; name: string; description: string | null; created_at: string };

export type Product = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  category_id: string | null;
  unit: string;
  purchase_price: number;
  purchase_currency: Currency;
  sale_price: number;
  sale_currency: Currency;
  avg_cost_tjs: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  categories?: { name: string } | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
};

export type CustomerBalance = {
  customer_id: string;
  currency: Currency;
  total_debt: number;
  total_paid: number;
  balance: number;
};

export type Sale = {
  id: string;
  number: number;
  customer_id: string | null;
  currency: Currency;
  rate: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  debt: number;
  payment_method: PaymentMethod;
  status: "completed" | "cancelled";
  note: string | null;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  customers?: { name: string; phone: string | null } | null;
  profiles?: { full_name: string } | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price: number;
  total: number;
  cost_tjs: number;
};

export type Settings = { company_name: string; cny_rate: number; receipt_footer: string };
