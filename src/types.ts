export type UserRole = 'Admin' | 'Branch Head' | 'Sales Person';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  branch_ids?: string[]; // Support multiple branches for Branch Head
  full_name?: string;
}

export interface Branch {
  id: string;
  name: string;
}

export interface SalesData {
  id: string;
  customer_name: string;
  unit_name: string;
  month: string;
  year: number;
  target_unit: number;
  actual_unit: number;
  target_amount: number;
  actual_amount: number;
  salesperson_id: string;
  branch_id: string;
  created_at: string;
}

export interface KPIStats {
  totalCustomers: number;
  totalTarget: number;
  totalActual: number;
}
