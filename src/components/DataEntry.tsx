import { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Loader2, Trash2, ClipboardList, X } from 'lucide-react';
import { toast } from 'sonner';
import { UNITS } from '@/src/constants';
import { Label } from '@/components/ui/label';

interface DataEntryProps {
  profile: Profile | null;
  view: 'planning' | 'actuals';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface SalesRow {
  id: string;
  customerName: string;
  unit: string;
  targets: Record<string, number>;
  actuals: Record<string, number>;
  dbIds?: Record<string, string>; // Map month to DB row ID
  salespersonIds?: Record<string, string>; // Map month to original salesperson ID
}

export default function DataEntry({ profile, view }: DataEntryProps) {
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedUnit, setSelectedUnit] = useState<string>('All');
  
  // Bulk entry state
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<string>(selectedMonth === 'All' ? '' : selectedMonth);
  const [bulkCustomer, setBulkCustomer] = useState<string>('');
  const [bulkTargets, setBulkTargets] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (isBulkOpen) {
      setBulkMonth(selectedMonth === 'All' ? '' : selectedMonth);
    }
  }, [isBulkOpen, selectedMonth]);

  const years = Array.from({ length: 11 }, (_, i) => 2026 + i);

  const displayMonths = selectedMonth === 'All' ? MONTHS : [selectedMonth];
  const displayShortMonths = selectedMonth === 'All' ? SHORT_MONTHS : [SHORT_MONTHS[MONTHS.indexOf(selectedMonth)]];
  const isAllMonths = selectedMonth === 'All';

  useEffect(() => {
    if (profile?.branch_ids && profile.branch_ids.length > 0) {
      setSelectedBranch(profile.branch_ids[0]);
    } else {
      setSelectedBranch('default_branch');
    }
  }, [profile]);

  useEffect(() => {
    fetchExistingData();
  }, [view, selectedBranch, selectedYear]);

  const fetchExistingData = async () => {
    if (!profile || !selectedBranch) return;
    setLoading(true);
    try {
      let query = supabase
        .from('sales_data')
        .select('*')
        .eq('year', selectedYear)
        .eq('branch_id', selectedBranch);

      // Branch Head sees all salespeople in their branch, Sales Person only sees own
      if (profile.role === 'Sales Person') {
        query = query.eq('salesperson_id', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        // Group data by customer and unit
        const grouped: Record<string, SalesRow> = {};
        data.forEach(item => {
          const key = `${item.customer_name}-${item.unit_name}`;
          if (!grouped[key]) {
            grouped[key] = {
              id: key,
              customerName: item.customer_name,
              unit: item.unit_name,
              targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              actuals: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              dbIds: {},
              salespersonIds: {}
            };
          }
          grouped[key].targets[item.month] = item.target_amount;
          grouped[key].actuals[item.month] = item.actual_amount;
          if (grouped[key].dbIds) grouped[key].dbIds![item.month] = item.id;
          if (grouped[key].salespersonIds) grouped[key].salespersonIds![item.month] = item.salesperson_id;
        });
        setRows(Object.values(grouped));
      } else if (view === 'planning') {
        // If planning and no data, show empty rows
        const initialRows: SalesRow[] = Array.from({ length: 5 }).map(() => ({
          id: Math.random().toString(36).substring(2, 11),
          customerName: '',
          unit: '',
          targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
          actuals: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
          salespersonIds: {}
        }));
        setRows(initialRows);
      } else {
        setRows([]);
      }
    } catch (error: any) {
      toast.error('Failed to fetch data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    setRows([...rows, {
      id: Math.random().toString(36).substring(2, 11),
      customerName: '',
      unit: '',
      targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
      actuals: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
      salespersonIds: {}
    }]);
  };

  const removeRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const updateRow = (id: string, field: string, value: any) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const updateMonthlyValue = (rowId: string, month: string, type: 'targets' | 'actuals', value: number) => {
    setRows(rows.map(r => {
      if (r.id === rowId) {
        return {
          ...r,
          [type]: { ...r[type], [month]: value }
        };
      }
      return r;
    }));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const payload: any[] = [];
      const updatePayload: any[] = [];

      // Determine which months to process (all months or just the selected one)
      const monthsToProcess = selectedMonth === 'All' ? MONTHS : [selectedMonth];

      for (const row of rows) {
        if (!row.customerName || !row.unit) continue;

        monthsToProcess.forEach(month => {
          const entry = {
            customer_name: row.customerName,
            unit_name: row.unit,
            month,
            year: selectedYear,
            target_amount: row.targets[month] || 0,
            actual_amount: row.actuals[month] || 0,
            salesperson_id: row.salespersonIds?.[month] || profile.id,
            branch_id: selectedBranch,
            target_unit: 0,
            actual_unit: 0
          };

          if (row.dbIds?.[month]) {
            updatePayload.push({
              id: row.dbIds[month],
              ...entry
            });
          } else if (row.targets[month] > 0 || row.actuals[month] > 0) {
            payload.push(entry);
          }
        });
      }

      if (payload.length > 0) {
        const { error } = await supabase.from('sales_data').insert(payload);
        if (error) throw error;
      }

      if (updatePayload.length > 0) {
        const { error } = await supabase.from('sales_data').upsert(updatePayload);
        if (error) throw error;
      }

      toast.success('Data saved successfully!');
      fetchExistingData();
    } catch (error: any) {
      console.error('Submit Error:', error);
      toast.error('Save failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!profile || !bulkMonth || !bulkCustomer) {
      toast.error('Please select Month and enter Customer Name');
      return;
    }
    setLoading(true);
    try {
      const payload: any[] = [];
      
      for (const unit of UNITS) {
        const targetValue = parseFloat(bulkTargets[unit] || '0');
        if (targetValue > 0) {
          payload.push({
            customer_name: bulkCustomer,
            unit_name: unit,
            month: bulkMonth,
            year: selectedYear,
            target_amount: targetValue,
            actual_amount: 0,
            salesperson_id: profile.id,
            branch_id: selectedBranch,
            target_unit: 0,
            actual_unit: 0
          });
        }
      }

      if (payload.length > 0) {
        // Find existing records first to see if we should update or insert
        const { data: existingRecords } = await supabase
          .from('sales_data')
          .select('id, customer_name, unit_name, month, year, branch_id')
          .eq('customer_name', bulkCustomer)
          .eq('month', bulkMonth)
          .eq('year', selectedYear)
          .eq('branch_id', selectedBranch);

        const finalPayload = payload.map(p => {
          const match = existingRecords?.find(er => er.unit_name === p.unit_name);
          if (match) {
            return { ...p, id: match.id };
          }
          return p;
        });

        const { error } = await supabase.from('sales_data').upsert(finalPayload);
        if (error) throw error;
      }

      toast.success('Multi-unit targets saved successfully!');
      setIsBulkOpen(false);
      setBulkMonth('');
      setBulkCustomer('');
      setBulkTargets({});
      fetchExistingData();
    } catch (error: any) {
      toast.error('Bulk save failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto pb-10 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
        .sticky-col {
          position: sticky !important;
          background-color: hsl(var(--card)) !important;
          z-index: 10;
        }
        .sticky-header {
          position: sticky !important;
          z-index: 20;
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .scale-in-center {
          animation: scaleIn 0.2s ease-out forwards;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground)/0.3);
        }
      `}} />
      <div className="flex flex-wrap lg:flex-nowrap justify-between items-center gap-4 bg-card p-3 rounded-xl shadow-sm border border-border">
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
          <div className="min-w-max pr-2 mr-2 border-r border-border">
            <h2 className="text-sm font-black uppercase tracking-tight leading-none text-primary">
              {view === 'planning' ? 'Target Planning' : 'Actual Sales Entry'}
            </h2>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">Branch: {selectedBranch}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/20 h-9 px-2 rounded-lg border border-border">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Year</span>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-[80px] h-7 font-black text-xs border-none bg-background shadow-sm rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y.toString()} className="font-bold">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/20 h-9 px-2 rounded-lg border border-border">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Month</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[110px] h-7 font-black text-xs border-none bg-background shadow-sm rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" className="font-bold">All Months</SelectItem>
                {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/20 h-9 px-2 rounded-lg border border-border">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Unit</span>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-[110px] h-7 font-black text-xs border-none bg-background shadow-sm rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" className="font-bold">All Units</SelectItem>
                {UNITS.map(u => <SelectItem key={u} value={u} className="font-bold">{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto justify-end">
          {view === 'planning' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsBulkOpen(true)} className="font-bold rounded-lg border-primary/20 hover:bg-primary/5 text-primary text-xs h-9">
                <ClipboardList size={14} className="mr-2" />
                Multi-Unit Bulk Plan
              </Button>
              <Button variant="outline" size="sm" onClick={addRow} className="font-bold rounded-lg border-primary/20 hover:bg-primary/5 text-primary text-xs h-9">
                <Plus size={14} className="mr-2" />
                Add Row
              </Button>
            </>
          )}
          <Button onClick={handleSubmit} size="sm" disabled={loading} className="font-bold rounded-lg px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 text-xs h-9">
            {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
            {view === 'planning' ? 'Submit Plan' : 'Save Actuals'}
          </Button>
        </div>
      </div>

      {/* Bulk Modal Implementation - Simpler version to avoid hook issues */}
      {isBulkOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-border shadow-2xl flex flex-col scale-in-center">
            <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/10">
              <h2 className="text-xl font-black uppercase tracking-tight">Bulk Target Entry</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsBulkOpen(false)} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                <X size={18} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Month</Label>
                  <Select value={bulkMonth} onValueChange={setBulkMonth}>
                    <SelectTrigger className="h-12 bg-secondary/20 border-border rounded-xl shadow-none font-bold">
                      <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Name</Label>
                  <Input 
                    placeholder="Enter Customer Name" 
                    value={bulkCustomer}
                    onChange={(e) => setBulkCustomer(e.target.value)}
                    className="h-12 bg-secondary/20 border-border rounded-xl shadow-none font-bold"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Enter Targets for Units</Label>
                <div className="grid grid-cols-2 gap-4">
                  {UNITS.map(unit => (
                    <div key={unit} className="flex items-center justify-between gap-4 bg-secondary/10 p-3 rounded-xl border border-border/50 group hover:border-primary/50 transition-colors">
                      <span className="text-xs font-black uppercase tracking-tighter text-foreground group-hover:text-primary transition-colors">{unit}</span>
                      <Input 
                        type="number"
                        placeholder="0"
                        value={bulkTargets[unit] || ''}
                        onChange={(e) => setBulkTargets({...bulkTargets, [unit]: e.target.value})}
                        className="w-28 h-9 text-right font-black text-xs bg-background border-border rounded-lg shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3 bg-secondary/5">
              <Button variant="ghost" onClick={() => setIsBulkOpen(false)} className="font-bold text-xs uppercase tracking-widest h-11 px-8 rounded-xl hover:bg-secondary/80">Cancel</Button>
              <Button onClick={handleBulkSubmit} disabled={loading} className="font-black text-xs uppercase tracking-widest h-11 px-10 rounded-xl bg-primary shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-[0.98]">
                {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                Save Bulk Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border shadow-md bg-card relative">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-secondary">
              <th className={`${isAllMonths ? 'sticky left-0 z-30' : ''} bg-secondary p-2 text-left border-r border-b border-border min-w-[40px] font-black uppercase text-[10px] tracking-widest text-foreground h-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Sr.</th>
              <th className={`${isAllMonths ? 'sticky left-[40px] z-30' : ''} bg-secondary p-2 text-left border-r border-b border-border min-w-[220px] font-black uppercase text-[10px] tracking-widest text-foreground h-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Customer Name</th>
              <th className={`${isAllMonths ? 'sticky left-[260px] z-30' : ''} bg-secondary p-2 text-left border-r border-b border-border min-w-[150px] font-black uppercase text-[10px] tracking-widest text-foreground h-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Unit</th>
              <th colSpan={displayMonths.length} className="p-1 text-center border-b border-border bg-primary/5 font-black uppercase text-[10px] tracking-widest text-primary h-6 z-10">
                Target & Actual Data (AMT)
              </th>
            </tr>
            <tr className="bg-secondary/80 backdrop-blur-sm">
              <th className={`${isAllMonths ? 'sticky left-0 z-30' : ''} bg-secondary border-r border-b border-border h-6 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}></th>
              <th className={`${isAllMonths ? 'sticky left-[40px] z-30' : ''} bg-secondary border-r border-b border-border h-6 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}></th>
              <th className={`${isAllMonths ? 'sticky left-[260px] z-30' : ''} bg-secondary border-r border-b border-border h-6 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}></th>
              {displayShortMonths.map(m => (
                <th key={m} className={`p-1 text-center text-[10px] font-black uppercase tracking-tighter border-r border-b border-border last:border-r-0 ${isAllMonths ? 'min-w-[160px]' : 'min-w-[200px]'} h-6 z-10 bg-secondary/50`}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(r => selectedUnit === 'All' || r.unit === selectedUnit)
              .map((row, idx) => (
              <tr key={row.id} className="hover:bg-secondary/5 transition-colors h-12 group">
                <td className={`${isAllMonths ? 'sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} bg-card group-hover:bg-card px-2 py-1 text-center border-r border-b border-border font-bold text-[11px] text-muted-foreground transition-all`}>{idx + 1}</td>
                <td className={`${isAllMonths ? 'sticky left-[40px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} bg-card group-hover:bg-card px-1 py-1 border-r border-b border-border transition-all`}>
                  <Input 
                    value={row.customerName}
                    onChange={(e) => updateRow(row.id, 'customerName', e.target.value)}
                    placeholder="Customer"
                    disabled={view === 'actuals'}
                    className="border-none shadow-none focus-visible:ring-0 h-10 font-black text-xs bg-transparent"
                  />
                </td>
                <td className={`${isAllMonths ? 'sticky left-[260px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} bg-card group-hover:bg-card px-1 py-1 border-r border-b border-border transition-all`}>
                  <Select 
                    value={row.unit} 
                    onValueChange={(v) => updateRow(row.id, 'unit', v)}
                    disabled={view === 'actuals'}
                  >
                    <SelectTrigger className="border-none shadow-none focus:ring-0 h-10 font-bold text-xs bg-transparent">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                {displayMonths.map(m => {
                  const monthIdx = MONTHS.indexOf(m);
                  
                  // Calculate Carry Forward Logic (Only Shortfalls/Red)
                  let cumulativeCarryForward = 0;
                  for (let i = 0; i < monthIdx; i++) {
                    const prevMonth = MONTHS[i];
                    const prevOrigTarget = row.targets[prevMonth] || 0;
                    const prevActual = row.actuals[prevMonth] || 0;
                    const currentAdjustedTarget = prevOrigTarget + cumulativeCarryForward;
                    const gap = currentAdjustedTarget - prevActual;
                    // Carry forward only if there is a shortfall (gap > 0)
                    cumulativeCarryForward = gap > 0 ? gap : 0;
                  }

                  const originalTarget = row.targets[m] || 0;
                  const adjustedTarget = originalTarget + cumulativeCarryForward;
                  const actual = row.actuals[m] || 0;
                  const diff = actual - adjustedTarget;
                  
                  return (
                    <td key={m} className="px-1 py-1 border-r border-b border-border last:border-r-0">
                      <div className="flex flex-col gap-1 justify-center h-full">
                        {view === 'planning' ? (
                          <Input 
                            type="number"
                            value={row.targets[m] || ''}
                            onChange={(e) => updateMonthlyValue(row.id, m, 'targets', parseFloat(e.target.value) || 0)}
                            className="h-10 border-border/40 text-center font-black text-sm px-1 focus-visible:ring-primary/30"
                          />
                        ) : (
                          <div className="space-y-1.5 py-1">
                            <div className="flex flex-col text-[9px] font-black px-2 py-1 text-muted-foreground bg-secondary/10 rounded-sm border border-border/10">
                              <div className="flex justify-between items-center mb-0.5">
                                <span>TARGET</span>
                                <span className="text-foreground text-[11px]">₹{adjustedTarget.toLocaleString()}</span>
                              </div>
                              {cumulativeCarryForward !== 0 && (
                                <div className="flex justify-between items-center text-[8px] opacity-70 border-t border-border/20 pt-0.5">
                                  <span>{originalTarget.toLocaleString()} (Orig)</span>
                                  <span className={cumulativeCarryForward > 0 ? 'text-red-500' : 'text-green-500'}>
                                    {cumulativeCarryForward > 0 ? '+' : ''}{cumulativeCarryForward.toLocaleString()} {cumulativeCarryForward > 0 ? 'Gap' : 'Surplus'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center px-1 gap-2">
                              <div className="flex-1 relative">
                                <Input 
                                  type="number"
                                  value={row.actuals[m] || ''}
                                  onChange={(e) => updateMonthlyValue(row.id, m, 'actuals', parseFloat(e.target.value) || 0)}
                                  placeholder="Enter Actual"
                                  className="h-10 border-none shadow-none text-center font-black text-sm px-1 bg-transparent focus-visible:ring-0 flex-1 placeholder:text-muted-foreground/30 placeholder:font-normal"
                                />
                              </div>
                              <div className={`min-w-[55px] text-right text-[10px] font-black leading-none flex flex-col items-end pt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {actual > 0 ? (
                                  <>
                                    <span className="text-[14px] leading-none">{diff >= 0 ? '▲' : '▼'}</span>
                                    <span className="tracking-tighter">₹{Math.abs(diff).toLocaleString()}</span>
                                  </>
                                ) : <span className="text-muted-foreground/20 italic font-medium">Pending</span>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                {view === 'planning' && rows.length > 1 && (
                  <td className="p-1">
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeRow(row.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-40 bg-muted/90 backdrop-blur-md">
            <tr className="h-12 border-t-2 border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <td colSpan={3} className={`${isAllMonths ? 'sticky left-0 z-50' : ''} bg-muted px-4 py-2 text-right border-r border-border font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                Grand Total
              </td>
              {displayMonths.map(m => {
                const filteredRows = rows.filter(r => selectedUnit === 'All' || r.unit === selectedUnit);
                const totalTarget = filteredRows.reduce((sum, r) => sum + (r.targets[m] || 0), 0);
                const totalActual = filteredRows.reduce((sum, r) => sum + (r.actuals[m] || 0), 0);
                const totalDiff = totalActual - totalTarget;

                return (
                  <td key={m} className="px-1 py-1 border-r border-border last:border-r-0 bg-muted/40">
                        <div className="flex flex-col gap-1 justify-center h-full">
                          <div className="space-y-1.5 py-1">
                            <div className="flex items-center justify-between text-[10px] font-black px-2 text-muted-foreground bg-background/50 rounded-sm py-0.5 border border-border/10">
                              <span>T-TOTAL</span>
                              <span className="text-foreground tracking-tighter">₹{totalTarget.toLocaleString()}</span>
                            </div>
                            {view === 'actuals' && (
                              <div className="flex items-center justify-between px-2 h-8">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-muted-foreground leading-none">A-TOTAL</span>
                                  <span className="text-sm font-black text-foreground tracking-tighter">₹{totalActual.toLocaleString()}</span>
                                </div>
                                <div className={`text-right text-[10px] font-black leading-none flex flex-col items-end gap-1 ${totalDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {totalActual > 0 ? (
                                    <>
                                      <span className="text-[14px] leading-none">{totalDiff >= 0 ? '▲' : '▼'}</span>
                                      <span className="tracking-tighter font-black">₹{Math.abs(totalDiff).toLocaleString()}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                  </td>
                );
              })}
              {view === 'planning' && rows.length > 1 && <td className="bg-muted/40"></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {view === 'planning' && (
        <div className="flex justify-center mt-4">
           <Button variant="outline" onClick={addRow} className="w-full max-w-sm border-dashed border-2 hover:border-primary hover:bg-primary/5 font-black text-[10px] uppercase tracking-widest h-12 rounded-xl">
             <Plus size={16} className="mr-2" />
             Add Another Row
           </Button>
        </div>
      )}
    </div>
  );
}
