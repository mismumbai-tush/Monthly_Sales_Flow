import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile, SalesData, KPIStats } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, AreaChart, Area
} from 'recharts';
import { Users, Target, TrendingUp, Search, Filter, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [salespersons, setSalespersons] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    customer: '',
    month: 'All',
    year: 'All',
    unit: 'All',
    branch: 'All',
    salesperson: 'All'
  });

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, customer: searchTerm }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const profileId = profile?.id;
  const profileRole = profile?.role;
  const profileBranches = JSON.stringify(profile?.branch_ids);

  const fetchSalespersons = useCallback(async () => {
    try {
      let query = supabase.from('profiles').select('id, full_name, branch_ids').eq('role', 'Sales Person');
      
      const { data: users, error } = await query;
      if (error) throw error;
      setSalespersons(users || []);
    } catch (error) {
      console.error('Error fetching salespersons:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      let query = supabase.from('sales_data').select('*');

      // Add a default filter to not fetch historical data unnecessarily
      // If user hasn't selected a specific year, default to current year
      if (filters.year === 'All') {
        query = query.eq('year', new Date().getFullYear());
      } else {
        query = query.eq('year', parseInt(filters.year));
      }

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
  }, [profileId, profileRole, profileBranches, filters.year]);

  useEffect(() => {
    if (profileId) {
      fetchData();
      fetchSalespersons();
    }
  }, [profileId, fetchData, fetchSalespersons]);

  const availableSalespersons = useMemo(() => {
    let list = salespersons;
    
    // If Branch filter is active, only show salespeople in that branch
    if (filters.branch !== 'All') {
      list = list.filter(s => s.branch_ids?.includes(filters.branch));
    }
    
    // If Branch Head, they only see salespeople in their own branches
    if (profileRole === 'Branch Head' && profile?.branch_ids) {
      list = list.filter(s => s.branch_ids?.some(b => profile.branch_ids?.includes(b)));
    }

    // If Sales Person, they only see themselves
    if (profileRole === 'Sales Person') {
      list = list.filter(s => s.id === profileId);
    }

    return list;
  }, [salespersons, filters.branch, profileRole, profile?.branch_ids, profileId]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchCustomer = item.customer_name.toLowerCase().includes(filters.customer.toLowerCase());
      const matchMonth = filters.month === 'All' || item.month === filters.month;
      const matchYear = filters.year === 'All' || item.year.toString() === filters.year;
      const matchUnit = filters.unit === 'All' || item.unit_name === filters.unit;
      const matchBranch = filters.branch === 'All' || item.branch_id === filters.branch;
      const matchSalesperson = filters.salesperson === 'All' || item.salesperson_id === filters.salesperson;
      
      // Additional safety check for Branch Head visibility
      if (profile?.role === 'Branch Head' && profile.branch_ids) {
        if (!profile.branch_ids.includes(item.branch_id)) return false;
      }
      
      return matchCustomer && matchMonth && matchYear && matchUnit && matchBranch && matchSalesperson;
    });
  }, [data, filters, profile]);

  const stats = useMemo<KPIStats>(() => {
    const uniqueCustomers = new Set(filteredData.map(d => d.customer_name)).size;
    const totalTarget = filteredData.reduce((acc, curr) => acc + curr.target_amount, 0);
    const totalActual = filteredData.filter(d => d.actual_amount > 0).reduce((acc, curr) => acc + curr.actual_amount, 0);
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
    const salespersonIds = [...new Set(filteredData.map(d => d.salesperson_id))];
    return salespersonIds.map(id => {
      const sp = salespersons.find(s => s.id === id);
      const name = sp?.full_name || `User ${(id as string).slice(0, 4)}`;
      return {
        name,
        target: filteredData.filter(d => d.salesperson_id === id).reduce((acc, curr) => acc + curr.target_amount, 0),
        actual: filteredData.filter(d => d.salesperson_id === id).reduce((acc, curr) => acc + curr.actual_amount, 0),
      };
    });
  }, [filteredData, salespersons]);

  const monthlyTrendData = useMemo(() => {
    return MONTHS.map(month => ({
      name: month.substring(0, 3),
      actual: filteredData.filter(d => d.month === month).reduce((acc, curr) => acc + curr.actual_amount, 0),
      target: filteredData.filter(d => d.month === month).reduce((acc, curr) => acc + curr.target_amount, 0),
    })).filter(d => d.actual > 0 || d.target > 0);
  }, [filteredData]);

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <div className="flex flex-wrap gap-4 p-4 bg-muted/20 rounded-xl border border-border">
            <Skeleton className="h-10 flex-1 min-w-[200px]" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-[400px] md:col-span-2 rounded-2xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary" />
            <h2 className="text-lg font-black tracking-tight text-foreground">Sales Performance Filters</h2>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <div className="text-[10px] lg:text-xs text-muted-foreground font-extrabold uppercase tracking-widest bg-secondary/80 px-2 lg:px-3 py-1 rounded-full whitespace-nowrap border border-border">
              Last View: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 items-end bg-card p-3 rounded-2xl border border-border shadow-sm">
          <div className="flex-1 min-w-[150px] space-y-1 order-1 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Search Customer</Label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Search..." 
                className="pl-8 h-9 border-muted/50 bg-secondary/5 focus-visible:ring-primary/20 rounded-lg font-bold text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 order-2 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Year</Label>
            <Select value={filters.year} onValueChange={(v) => setFilters(prev => ({ ...prev, year: v }))}>
              <SelectTrigger className="h-9 w-full lg:w-24 border-muted/50 bg-secondary/5 focus:ring-primary/20 rounded-lg font-bold text-xs">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Years</SelectItem>
                {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 order-3 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Month</Label>
            <Select value={filters.month} onValueChange={(v) => setFilters(prev => ({ ...prev, month: v }))}>
              <SelectTrigger className="h-9 w-full lg:w-32 border-muted/50 bg-secondary/5 focus:ring-primary/20 rounded-lg font-bold text-xs">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Months</SelectItem>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 order-4 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Unit</Label>
            <Select value={filters.unit} onValueChange={(v) => setFilters(prev => ({ ...prev, unit: v }))}>
              <SelectTrigger className="h-9 w-full lg:w-32 border-muted/50 bg-secondary/5 focus:ring-primary/20 rounded-lg font-bold text-xs">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Units</SelectItem>
                {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 order-5 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Branch</Label>
            <Select value={filters.branch} onValueChange={(v) => {
              setFilters(prev => ({ ...prev, branch: v, salesperson: 'All' }));
            }}>
              <SelectTrigger className="h-9 w-full lg:w-32 border-muted/50 bg-secondary/5 focus:ring-primary/20 rounded-lg font-bold text-xs">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Branches</SelectItem>
                {BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 order-6 lg:order-none">
            <Label className="text-[9px] font-black uppercase tracking-widest text-foreground ml-1">Salesperson</Label>
            <Select value={filters.salesperson} onValueChange={(v) => setFilters(prev => ({ ...prev, salesperson: v }))}>
              <SelectTrigger className="h-9 w-full lg:w-36 border-muted/50 bg-secondary/5 focus:ring-primary/20 rounded-lg font-bold text-xs">
                <SelectValue placeholder="Salesperson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Persons</SelectItem>
                {availableSalespersons.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border shadow-sm rounded-xl flex flex-col justify-center py-3 px-4 bg-card border-l-4 border-l-blue-500 h-24">
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground mb-1">Unique Customers</p>
          <p className="text-xl font-bold tracking-tight leading-[1.1]">{stats.totalCustomers}</p>
          <div className="text-[10px] text-blue-500 font-medium mt-1 flex items-center gap-1">
            <Users size={10} />
            Active Base
          </div>
        </Card>

        <Card className="border-border shadow-sm rounded-xl flex flex-col justify-center py-3 px-4 bg-card border-l-4 border-l-amber-500 h-24">
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground mb-1">Total Target</p>
          <p className="text-xl font-bold tracking-tight leading-[1.1]">₹{stats.totalTarget.toLocaleString()}</p>
          <div className="text-[10px] text-muted-foreground font-medium mt-1 flex items-center gap-1">
            <Target size={10} />
            Budgeted
          </div>
        </Card>

        <Card className="border-border shadow-sm rounded-xl flex flex-col justify-center py-3 px-4 bg-card border-l-4 border-l-emerald-500 h-24">
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground mb-1">Total Actual</p>
          <p className="text-xl font-bold tracking-tight text-emerald-600 leading-[1.1]">₹{stats.totalActual.toLocaleString()}</p>
          <div className="text-[10px] font-bold mt-1 flex items-center gap-1">
            {stats.totalTarget > 0 ? (
              <span className={stats.totalActual >= stats.totalTarget ? "text-emerald-500" : "text-amber-500"}>
                {Math.round((stats.totalActual / stats.totalTarget) * 100)}% Achievement
              </span>
            ) : <span className="text-muted-foreground">0% Achievement</span>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Charts */}
        <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden flex flex-col h-[300px] lg:h-[350px]">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Unit-wise Target vs Actual</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pb-4 pt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} interval={0} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: '10px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                <Bar dataKey="target" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="Target" animationDuration={500} barSize={10} />
                <Bar dataKey="actual" fill="#4F46E5" radius={[4, 4, 0, 0]} name="Actual" animationDuration={500} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden flex flex-col h-[300px] lg:h-[350px]">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Salesperson: Target vs Actual</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pb-4 pt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salespersonChartData} layout="vertical" margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} width={70} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: '10px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                <Bar dataKey="target" fill="#E2E8F0" radius={[0, 4, 4, 0]} name="Target" animationDuration={500} barSize={8} />
                <Bar dataKey="actual" fill="#6366F1" radius={[0, 4, 4, 0]} name="Actual" animationDuration={500} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden h-[350px]">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Salesperson Revenue Performance</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pb-4 pt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salespersonChartData} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} angle={-45} textAnchor="end" height={60} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '10px' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="actual" name="Actual Revenue" animationDuration={1000} barSize={14}>
                  {salespersonChartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4F46E5' : '#6366F1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Trend Chart */}
        <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden h-[350px]">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Monthly Achievement Trend</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pb-4 pt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '10px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                <Area type="monotone" dataKey="actual" stroke="#4F46E5" fillOpacity={1} fill="url(#colorActual)" name="Actual" animationDuration={1500} />
                <Line type="monotone" dataKey="target" stroke="#94A3B8" strokeDasharray="5 5" name="Target" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
