export type Role = "owner" | "admin" | "manager" | "cashier" | "warehouse";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  cashier: "Кассир",
  warehouse: "Кладовщик",
};

export const ROLES: Role[] = ["owner", "admin", "manager", "cashier", "warehouse"];

/**
 * Матрица прав. Должна совпадать с проверками в SQL
 * (supabase/migrations/*_functions.sql и *_rls.sql) — база остаётся источником истины.
 */
export const PERMISSIONS = {
  "dashboard.view": ["owner", "admin", "manager", "cashier", "warehouse"],
  "products.view": ["owner", "admin", "manager", "cashier", "warehouse"],
  "products.edit": ["owner", "admin", "manager", "warehouse"],
  "products.delete": ["owner", "admin"],
  "products.cost": ["owner", "admin", "manager", "warehouse"],
  "sales.view": ["owner", "admin", "manager", "cashier"],
  "sales.create": ["owner", "admin", "manager", "cashier"],
  "sales.price": ["owner", "admin", "manager"],
  "sales.cancel": ["owner", "admin"],
  "stock.view": ["owner", "admin", "manager", "warehouse"],
  "stock.edit": ["owner", "admin", "manager", "warehouse"],
  "customers.view": ["owner", "admin", "manager", "cashier"],
  "customers.edit": ["owner", "admin", "manager", "cashier"],
  "customers.delete": ["owner", "admin"],
  "cash.view": ["owner", "admin", "manager", "cashier"],
  "cash.edit": ["owner", "admin", "cashier"],
  "expenses.view": ["owner", "admin", "manager"],
  "expenses.delete": ["owner", "admin"],
  "reports.view": ["owner", "admin", "manager"],
  "employees.manage": ["owner", "admin"],
  "settings.edit": ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
