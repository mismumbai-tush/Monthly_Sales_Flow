import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile, SalesData, KPIStats } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts';
import { Users, Target, TrendingUp, Search, Filter } from 'lucide-react';

import { UNITS, BRANCHES } from '@/src/constants';

interface DashboardProps {
  profile: Profile | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const YEARS = [2024, 2025, 2026];

export default function Dashboard({ profile }: DashboardProps) {
  const [data, setData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    customer: '',
    month: 'All',
    year: 'All',
    unit: 'All',
    branch: 'All'
  });

  const profileId = profile?.id;
  const profileRole = profile?.role;
  const profileBranches = JSON.stringify(profile?.branch_ids);

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      let query = supabase.from('sales_data').select('*');

      // RBAC filtering
      if (profileRole === 'Sales Person') {
        query = query.eq('salesperson_id', profileId);
      } else if (profileRole === 'Branch Head' && profileBranches) {
        const branches = JSON.parse(profileBranches);
        if (branches.length > 0) {
          query = query.in('branch_id', branches);
        }
      }

      const { data: sales, error } = await query;
      if (error) throw error;
      setData(sales || []);
    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole, profileBranches]);

  useEffect(() => {
    if (profileId) {
      fetchData();
    }
  }, [profileId, fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchCustomer = item.customer_name.toLowerCase().includes(filters.customer.toLowerCase());
      const matchMonth = filters.month === 'All' || item.month === filters.month;
      const matchYear = filters.year === 'All' || item.year.toString() === filters.year;
      const matchUnit = filters.unit === 'All' || item.unit_name === filters.unit;
      const matchBranch = filters.branch === 'All' || item.branch_id === filters.branch;
      
      // Additional safety check for Branch Head visibility
      if (profile?.role === 'Branch Head' && profile.branch_ids) {
        if (!profile.branch_ids.includes(item.branch_id)) return false;
      }
      
      return matchCustomer && matchMonth && matchYear && matchUnit && matchBranch;
    });
  }, [data, filters, profile]);

  const stats = useMemo<KPIStats>(() => {
    const uniqueCustomers = new Set(filteredData.map(d => d.customer_name)).size;
    const totalTarget = filteredData.reduce((acc, curr) => acc + curr.target_amount, 0);
    const totalActual = filteredData.reduce((acc, curr) => acc + curr.actual_amount, 0);
    return { totalCustomers: uniqueCustomers, totalTarget, totalActual };
  }, [filteredData]);

  const unitChartData = useMemo(() => {
    const units = [...new Set(filteredData.map(d => d.unit_name))];
    return units.map(unit => ({
      name: unit,
      target: filteredData.filter(d => d.unit_name === unit).reduce((acc, curr) => acc + curr.target_amount, 0),
      actual: filteredData.filter(d => d.unit_name === unit).reduce((acc, curr) => acc + curr.actual_amount, 0),
    }));
  }, [filteredData]);

  const salespersonChartData = useMemo(() => {
    const salespersons = [...new Set(filteredData.map(d => d.salesperson_id))];
    // In a real app, you'd join with profiles to get names. Here we just use IDs or placeholders.
    return salespersons.map(id => ({
      name: `User ${(id as string).slice(0, 4)}`,
      target: filteredData.filter(d => d.salesperson_id === id).reduce((acc, curr) => acc + curr.target_amount, 0),
      actual: filteredData.filter(d => d.salesperson_id === id).reduce((acc, curr) => acc + curr.actual_amount, 0),
    }));
  }, [filteredData]);

  if (loading) {
    return <div className="flex justify-center p-12">Loading dashboard data...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-card p-2 px-4 rounded-xl border border-border shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search Customer Name..." 
            className="pl-9 border-none bg-transparent focus-visible:ring-0 shadow-none"
            value={filters.customer}
            onChange={(e) => setFilters(prev => ({ ...prev, customer: e.target.value }))}
          />
        </div>
        <div className="h-6 w-px bg-border mx-2" />
        <Select value={filters.month} onValueChange={(v) => setFilters(prev => ({ ...prev, month: v }))}>
          <SelectTrigger className="w-40 border-none bg-transparent focus:ring-0 shadow-none text-muted-foreground font-medium">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Months</SelectItem>
            {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.year} onValueChange={(v) => setFilters(prev => ({ ...prev, year: v }))}>
          <SelectTrigger className="w-32 border-none bg-transparent focus:ring-0 shadow-none text-muted-foreground font-medium">
            <SelectValue placeholder="All Years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Years</SelectItem>
            {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.unit} onValueChange={(v) => setFilters(prev => ({ ...prev, unit: v }))}>
          <SelectTrigger className="w-40 border-none bg-transparent focus:ring-0 shadow-none text-muted-foreground font-medium">
            <SelectValue placeholder="All Units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Units</SelectItem>
            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.branch} onValueChange={(v) => setFilters(prev => ({ ...prev, branch: v }))}>
          <SelectTrigger className="w-40 border-none bg-transparent focus:ring-0 shadow-none text-muted-foreground font-medium">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Branches</SelectItem>
            {BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* KPIs */}
        <Card className="border-border shadow-sm rounded-2xl flex flex-col justify-center p-6 bg-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Total Unique Customers</p>
          <p className="text-3xl font-bold tracking-tight">{stats.totalCustomers}</p>
          <p className="text-xs text-accent font-medium mt-2 flex items-center gap-1">
            <TrendingUp size={12} />
            ↑ 12% vs last month
          </p>
        </Card>

        <Card className="border-border shadow-sm rounded-2xl flex flex-col justify-center p-6 bg-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Total Plan / Target (Amt)</p>
          <p className="text-3xl font-bold tracking-tight">{stats.totalTarget.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground font-medium mt-2">Monthly Goal</p>
        </Card>

        <Card className="border-border shadow-sm rounded-2xl flex flex-col justify-center p-6 bg-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Total Actual (Amt)</p>
          <p className="text-3xl font-bold tracking-tight">{stats.totalActual.toLocaleString()}</p>
          <p className="text-xs text-orange-500 font-medium mt-2">
            {stats.totalTarget > 0 ? Math.round((stats.totalActual / stats.totalTarget) * 100) : 0}% Achievement
          </p>
        </Card>

        <Card className="border-border shadow-sm rounded-2xl flex flex-col justify-center p-6 bg-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Avg Deal Size</p>
          <p className="text-3xl font-bold tracking-tight">$12.4k</p>
          <p className="text-xs text-accent font-medium mt-2 flex items-center gap-1">
            <TrendingUp size={12} />
            ↑ 4.2%
          </p>
        </Card>

        {/* Charts */}
        <Card className="md:col-span-2 border-border shadow-sm rounded-2xl bg-card overflow-hidden flex flex-col h-[400px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold tracking-tight">Unit-wise Plan/Target vs Actual (Amt)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-4 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Bar dataKey="target" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="Plan / Target Amt" />
                <Bar dataKey="actual" fill="#4F46E5" radius={[4, 4, 0, 0]} name="Actual Amt" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border shadow-sm rounded-2xl bg-card overflow-hidden flex flex-col h-[400px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold tracking-tight">Salesperson: Plan/Target vs Actual (Amt)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-4 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salespersonChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} width={80} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Bar dataKey="target" fill="#E2E8F0" radius={[0, 4, 4, 0]} name="Plan / Target Amount" />
                <Bar dataKey="actual" fill="#6366F1" radius={[0, 4, 4, 0]} name="Actual Amount" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Full Width Row */}
        <Card className="md:col-span-4 border-border shadow-sm rounded-2xl bg-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold tracking-tight">Salesperson Revenue: Plan / Target vs Actual (Amt)</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px] flex items-center justify-around gap-4 pt-4">
            {salespersonChartData.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-3 flex-1">
                <div className="w-full max-w-[60px] bg-secondary rounded-lg relative overflow-hidden h-24">
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-primary transition-all duration-1000" 
                    style={{ height: `${Math.min(100, (item.actual / (item.target || 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] font-medium text-muted-foreground">{item.name}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
