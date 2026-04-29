import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile, SalesData } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRANCHES, MONTHS } from '@/src/constants';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell
} from 'recharts';
import { Building2, TrendingUp, Target, Loader2, ChevronLeft, User, Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BranchesProps {
  profile: Profile | null;
  onEmployeeClick?: (employeeId: string) => void;
}

export default function Branches({ profile, onEmployeeClick }: BranchesProps) {
  const [data, setData] = useState<SalesData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Top-level filters
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  
  // Drill-down state
  const [detailedBranch, setDetailedBranch] = useState<string | null>(null);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>('All');

  const availableBranches = useMemo(() => {
    if (profile?.role === 'Admin') return ['All', ...BRANCHES];
    return profile?.branch_ids || [];
  }, [profile]);

  useEffect(() => {
    async function fetchData() {
      if (!profile) return;
      setLoading(true);
      try {
        // Fetch sales data
        let query = supabase.from('sales_data').select('*');
        query = query.eq('year', selectedYear);
        if (selectedMonth !== 'All') {
          query = query.eq('month', selectedMonth);
        }

        // Branch filtering
        const branchToQuery = selectedBranch === 'All' ? availableBranches.filter(b => b !== 'All') : [selectedBranch];
        if (branchToQuery.length > 0) {
          query = query.in('branch_id', branchToQuery);
        }

        const { data: sales, error } = await query;
        if (error) throw error;
        setData(sales || []);

        // Fetch users/profiles for the employee filter if we're in detailed view or we need them for the employee dropdown
        let pQuery = supabase.from('profiles').select('*');
        if (profile.role === 'Branch Head' && profile.branch_ids && profile.branch_ids.length > 0) {
          pQuery = pQuery.contains('branch_ids', [detailedBranch || profile.branch_ids[0]]);
        } else if (detailedBranch && detailedBranch !== 'All') {
          pQuery = pQuery.contains('branch_ids', [detailedBranch]);
        }
        
        const { data: pData } = await pQuery;
        setProfiles(pData || []);

      } catch (error) {
        console.error('Error fetching branch data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile, selectedYear, selectedMonth, selectedBranch, detailedBranch, availableBranches]);

  const branchPerformance = useMemo(() => {
    const branchesToShow = selectedBranch === 'All' 
      ? BRANCHES 
      : [selectedBranch];

    return branchesToShow.map(branchName => {
      const branchData = data.filter(d => d.branch_id === branchName);
      const target = branchData.reduce((acc, curr) => acc + curr.target_amount, 0);
      const actual = branchData.reduce((acc, curr) => acc + curr.actual_amount, 0);
      const achievement = target > 0 ? (actual / target) * 100 : 0;
      
      return {
        name: branchName,
        target,
        actual,
        achievement: Math.round(achievement)
      };
    }).filter(b => b.target > 0 || b.actual > 0 || selectedBranch !== 'All')
      .sort((a, b) => b.achievement - a.achievement);
  }, [data, selectedBranch]);

  const salespersonPerformance = useMemo(() => {
    if (!detailedBranch) return [];

    const branchProfiles = profiles.filter(p => p.branch_ids?.includes(detailedBranch));
    
    return branchProfiles.map(p => {
      const pData = data.filter(d => d.salesperson_id === p.id && d.branch_id === detailedBranch);
      const target = pData.reduce((acc, curr) => acc + curr.target_amount, 0);
      const actual = pData.reduce((acc, curr) => acc + curr.actual_amount, 0);
      const achievement = target > 0 ? (actual / target) * 100 : 0;

      return {
        id: p.id,
        name: p.full_name,
        role: p.role,
        target,
        actual,
        achievement: Math.round(achievement)
      };
    }).filter(s => selectedSalesperson === 'All' || s.id === selectedSalesperson)
      .sort((a, b) => b.achievement - a.achievement);
  }, [detailedBranch, data, profiles, selectedSalesperson]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-card p-3 rounded-2xl border border-border shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-secondary/20 h-9 px-3 rounded-xl border border-border">
          <Building2 size={14} className="text-muted-foreground" />
          <span className="text-[10px] font-black uppercase text-muted-foreground">Branch Name</span>
          <Select value={selectedBranch} onValueChange={(v) => { setSelectedBranch(v); setDetailedBranch(null); }}>
            <SelectTrigger className="w-[130px] h-7 border-none bg-transparent font-bold text-xs ring-0 focus:ring-0">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent>
              {availableBranches.map(b => (
                <SelectItem key={b} value={b} className="text-xs font-bold">{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 bg-secondary/20 h-9 px-3 rounded-xl border border-border">
          <Calendar size={14} className="text-muted-foreground" />
          <span className="text-[10px] font-black uppercase text-muted-foreground">Year</span>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[90px] h-7 border-none bg-transparent font-bold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={y.toString()} className="text-xs font-bold">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 bg-secondary/20 h-9 px-3 rounded-xl border border-border">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-[10px] font-black uppercase text-muted-foreground">Month</span>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[110px] h-7 border-none bg-transparent font-bold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All" className="text-xs font-bold">Full Year</SelectItem>
              {MONTHS.map(m => (
                <SelectItem key={m} value={m} className="text-xs font-bold">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {detailedBranch && (
          <div className="flex items-center gap-2 bg-primary/5 h-9 px-3 rounded-xl border border-primary/20">
            <User size={14} className="text-primary" />
            <span className="text-[10px] font-black uppercase text-primary">Employee</span>
            <Select value={selectedSalesperson} onValueChange={setSelectedSalesperson}>
              <SelectTrigger className="w-[150px] h-7 border-none bg-transparent font-bold text-xs text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" className="text-xs font-bold">All Employees</SelectItem>
                {profiles.filter(p => p.branch_ids?.includes(detailedBranch)).map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs font-bold">{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {detailedBranch ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <Button 
              variant="outline" 
              onClick={() => { setDetailedBranch(null); setSelectedSalesperson('All'); }}
              className="rounded-xl border-border shadow-sm font-black text-xs h-10 gap-2"
            >
              <ChevronLeft size={16} /> Back to Overview
            </Button>
            <div className="text-left md:text-right">
              <h2 className="text-xl font-black tracking-tight">{detailedBranch} Branch Details</h2>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{selectedMonth === 'All' ? `Year ${selectedYear}` : `${selectedMonth} ${selectedYear}`}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {salespersonPerformance.map((sp) => (
              <Card 
                key={sp.id} 
                className="border-border shadow-sm rounded-2xl bg-card overflow-hidden group hover:border-primary/40 cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => onEmployeeClick?.(sp.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black uppercase">
                        {sp.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h4 className="font-black text-sm">{sp.name}</h4>
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-70">
                          {sp.role}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-black tracking-tighter ${sp.achievement >= 100 ? 'text-emerald-600' : sp.achievement >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                        {sp.achievement}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground opacity-60">Target</span>
                      <span>₹{sp.target.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground opacity-60">Actual</span>
                      <span className="text-emerald-600">₹{sp.actual.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${sp.achievement >= 100 ? 'bg-emerald-500' : sp.achievement >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(sp.achievement, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {salespersonPerformance.length === 0 && (
              <div className="col-span-full py-20 text-center bg-secondary/10 rounded-3xl border-2 border-dashed border-border/50">
                <p className="text-muted-foreground font-bold">No employees found for this selection.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="text-primary" size={18} />
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Branch Achievement %</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="h-[400px] pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchPerformance} layout="vertical" margin={{ left: 20, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" unit="%" domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                      <Tooltip 
                        formatter={(value: any) => [`${value}%`, 'Achievement']}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <Bar dataKey="achievement" radius={[0, 4, 4, 0]} barSize={20}>
                        {branchPerformance.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.achievement >= 100 ? '#10b981' : entry.achievement >= 70 ? '#f59e0b' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[464px] pr-2 custom-scrollbar">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Branch Rankings (Click to View Employees)</h3>
              {branchPerformance.map((branch, idx) => (
                <Card 
                  key={branch.name} 
                  onClick={() => setDetailedBranch(branch.name)}
                  className="border-border shadow-sm rounded-xl overflow-hidden group hover:border-primary cursor-pointer active:scale-95 transition-all"
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center font-black text-xs text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-black text-sm tracking-tight">{branch.name}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Target size={10} />
                            ₹{(branch.target / 100000).toFixed(1)}L
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <TrendingUp size={10} />
                            ₹{(branch.actual / 100000).toFixed(1)}L
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`text-lg font-black tracking-tighter ${branch.achievement >= 100 ? 'text-emerald-600' : branch.achievement >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                      {branch.achievement}%
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="border-border shadow-sm rounded-2xl bg-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Detailed Branch Comparison</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-secondary/30 text-left">
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">Branch</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-right">Target Amount</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-right">Actual Amount</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-right">Gap</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-center">Achievement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchPerformance.map(branch => {
                      const gap = branch.target - branch.actual;
                      return (
                        <tr 
                          key={branch.name} 
                          onClick={() => setDetailedBranch(branch.name)}
                          className="hover:bg-secondary/20 transition-colors border-b border-border last:border-0 h-14 cursor-pointer"
                        >
                          <td className="px-6 py-3 font-black text-sm">{branch.name}</td>
                          <td className="px-6 py-3 text-right font-bold text-xs">₹{branch.target.toLocaleString()}</td>
                          <td className="px-6 py-3 text-right font-bold text-xs text-emerald-600">₹{branch.actual.toLocaleString()}</td>
                          <td className={`px-6 py-3 text-right font-bold text-xs ${gap > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {gap > 0 ? '-' : '+'}₹{Math.abs(gap).toLocaleString()}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="inline-flex items-center px-2 py-1 rounded-full bg-secondary/50 text-[10px] font-black text-foreground border border-border">
                              {branch.achievement}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
