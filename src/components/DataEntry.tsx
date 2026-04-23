import { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { UNITS } from '@/src/constants';

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
}

export default function DataEntry({ profile, view }: DataEntryProps) {
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  
  const years = Array.from({ length: 11 }, (_, i) => 2026 + i);

  const displayMonths = selectedMonth === 'All' ? MONTHS : [selectedMonth];
  const displayShortMonths = selectedMonth === 'All' ? SHORT_MONTHS : [SHORT_MONTHS[MONTHS.indexOf(selectedMonth)]];

  useEffect(() => {
    if (profile?.branch_ids && profile.branch_ids.length > 0) {
      setSelectedBranch(profile.branch_ids[0]);
    } else {
      setSelectedBranch('default_branch');
    }
  }, [profile]);

  useEffect(() => {
    if (view === 'planning') {
      fetchExistingData(); // Still check if planning exists for the selected year
    } else {
      fetchExistingData();
    }
  }, [view, selectedBranch, selectedYear]);

  const fetchExistingData = async () => {
    if (!profile || !selectedBranch) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales_data')
        .select('*')
        .eq('year', selectedYear)
        .eq('branch_id', selectedBranch);

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
              dbIds: {}
            };
          }
          grouped[key].targets[item.month] = item.target_amount;
          grouped[key].actuals[item.month] = item.actual_amount;
          if (grouped[key].dbIds) {
            grouped[key].dbIds![item.month] = item.id;
          }
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

      for (const row of rows) {
        if (!row.customerName || !row.unit) continue;

        MONTHS.forEach(month => {
          const entry = {
            customer_name: row.customerName,
            unit_name: row.unit,
            month,
            year: selectedYear,
            target_amount: row.targets[month],
            actual_amount: row.actuals[month],
            salesperson_id: profile.id,
            branch_id: selectedBranch,
            target_unit: 0,
            actual_unit: 0
          };

          if (view === 'actuals' && row.dbIds?.[month]) {
            updatePayload.push({
              id: row.dbIds[month],
              ...entry
            });
          } else {
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
      if (view === 'planning') {
        // Clear or refresh? User said "Save hoke New Tab Me Save ho" 
        // This implies they want to see it in actuals tab now.
      } else {
        fetchExistingData();
      }
    } catch (error: any) {
      toast.error('Save failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}} />
      <div className="flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-bold font-black uppercase tracking-tight">
              {view === 'planning' ? 'Target Planning' : 'Actual Sales Entry'}
            </h2>
            <p className="text-[10px] text-muted-foreground font-bold">Branch: {selectedBranch}</p>
          </div>
          <div className="flex items-center gap-2 bg-secondary/20 p-1.5 rounded-lg border border-border">
            <span className="text-[10px] font-black uppercase tracking-widest px-2">Year:</span>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-[100px] h-8 font-black text-xs border-none bg-background shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y.toString()} className="font-bold">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 bg-secondary/20 p-1.5 rounded-lg border border-border">
            <span className="text-[10px] font-black uppercase tracking-widest px-2">Month:</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[120px] h-8 font-black text-xs border-none bg-background shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" className="font-bold">All Months</SelectItem>
                {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3">
          {view === 'planning' && (
            <Button variant="outline" onClick={addRow} className="font-bold rounded-lg border-primary/20 hover:bg-primary/5 text-primary">
              <Plus size={16} className="mr-2" />
              Add Row
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="font-bold rounded-lg px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            {view === 'planning' ? 'Submit Plan' : 'Save Actuals'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border shadow-md bg-card">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-secondary/20 border-b border-border">
              <th className="p-2 text-left border-r border-border min-w-[40px] font-black uppercase text-[10px] tracking-widest text-foreground h-12">Sr.</th>
              <th className="p-2 text-left border-r border-border min-w-[220px] font-black uppercase text-[10px] tracking-widest text-foreground h-12">Customer Name</th>
              <th className="p-2 text-left border-r border-border min-w-[150px] font-black uppercase text-[10px] tracking-widest text-foreground h-12">Unit</th>
              <th colSpan={displayMonths.length} className="p-1 text-center border-b border-border bg-primary/5 font-black uppercase text-[10px] tracking-widest text-primary h-6">
                Target & Actual Data (AMT)
              </th>
            </tr>
            <tr className="bg-secondary/10 border-b border-border">
              <th className="border-r border-border h-6"></th>
              <th className="border-r border-border h-6"></th>
              <th className="border-r border-border h-6"></th>
              {displayShortMonths.map(m => (
                <th key={m} className="p-1 text-center text-[10px] font-black uppercase tracking-tighter border-r border-border last:border-r-0 min-w-[140px] h-6">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/5 transition-colors h-14">
                <td className="px-2 py-1 text-center border-r border-border font-bold text-[11px] text-muted-foreground">{idx + 1}</td>
                <td className="px-1 py-1 border-r border-border">
                  <Input 
                    value={row.customerName}
                    onChange={(e) => updateRow(row.id, 'customerName', e.target.value)}
                    placeholder="Customer"
                    disabled={view === 'actuals'}
                    className="border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 h-10 font-bold text-sm bg-transparent"
                  />
                </td>
                <td className="px-1 py-1 border-r border-border">
                  <Select 
                    value={row.unit} 
                    onValueChange={(v) => updateRow(row.id, 'unit', v)}
                    disabled={view === 'actuals'}
                  >
                    <SelectTrigger className="border-none shadow-none focus:ring-1 focus:ring-primary/30 h-10 font-bold text-xs bg-transparent">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                {displayMonths.map(m => {
                  const target = row.targets[m] || 0;
                  const actual = row.actuals[m] || 0;
                  const diff = actual - target;
                  
                  return (
                    <td key={m} className="px-1 py-1 border-r border-border last:border-r-0">
                      <div className="flex flex-col gap-1 justify-center h-full">
                        {view === 'planning' ? (
                          <Input 
                            type="number"
                            value={row.targets[m] || ''}
                            onChange={(e) => updateMonthlyValue(row.id, m, 'targets', parseFloat(e.target.value) || 0)}
                            className="h-10 border-border/40 text-center font-bold text-sm px-1 focus-visible:ring-primary/30"
                          />
                        ) : (
                          <div className="space-y-1 py-1">
                            <div className="flex items-center justify-between text-[10px] font-black px-2 text-muted-foreground bg-secondary/10 rounded-sm py-0.5">
                              <span>TARGET</span>
                              <span className="text-foreground">{target.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center px-1">
                              <Input 
                                type="number"
                                value={row.actuals[m] || ''}
                                onChange={(e) => updateMonthlyValue(row.id, m, 'actuals', parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="h-10 border-none shadow-none text-center font-black text-sm px-1 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/20 flex-1"
                              />
                              <div className={`min-w-[50px] text-right text-[10px] font-black leading-none flex flex-col items-end gap-0.5 pr-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {actual > 0 ? (
                                  <>
                                    <span className="text-[12px]">{diff >= 0 ? '▲' : '▼'}</span>
                                    <span>{Math.abs(diff).toLocaleString()}</span>
                                  </>
                                ) : <span className="text-muted-foreground/30">-</span>}
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
