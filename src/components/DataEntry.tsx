import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Loader2, Trash2, ClipboardList, X } from 'lucide-react';
import { toast } from 'sonner';
import { UNITS, BRANCHES } from '@/src/constants';
import { Label } from '@/components/ui/label';

// Helper for generating UUIDs if crypto.randomUUID is not available
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY_VALUES = MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});

interface DataEntryProps {
  profile: Profile | null;
  view: 'planning' | 'actuals';
  initialSalespersonId?: string | null;
  onDataChange?: () => void;
  refreshKey?: number;
}

interface SalesRow {
  id: string;
  customerName: string;
  unit: string;
  targets: Record<string, number>;
  actuals: Record<string, number>;
  dbIds?: Record<string, string>;
  salespersonIds?: Record<string, string>;
  branchId?: string;
  salespersonId?: string;
  salespersonName?: string;
}

type SalesDataRow = SalesRow;

export default function DataEntry({ profile, view, initialSalespersonId, onDataChange, refreshKey }: DataEntryProps) {
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedUnit, setSelectedUnit] = useState<string>('All');
  const [salespeople, setSalespeople] = useState<Profile[]>([]);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>('All');

  useEffect(() => {
    async function fetchSalespeople() {
      if (!selectedBranch || (profile?.role !== 'Admin' && profile?.role !== 'Branch Head')) {
        setSalespeople([]);
        return;
      }
      try {
        console.log(`FETCHING EMPLOYEES for Branch: ${selectedBranch}`);
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .in('role', ['Sales Person', 'Branch Head']);

        if (error) throw error;

        // Filter manually to ensure accuracy with array fields
        let branchEmployees = (data || []).filter(p => {
          if (selectedBranch === 'All') return true;
          return p.branch_ids && Array.isArray(p.branch_ids) && p.branch_ids.includes(selectedBranch);
        });

        // Sort by name
        branchEmployees.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        
        // Ensure the currently selected salesperson is in the list
        let updatedList = [...branchEmployees];
        
        const targetId = initialSalespersonId || selectedSalesperson;
        if (targetId && targetId !== 'All' && !updatedList.find(p => p.id === targetId)) {
          const { data: sp } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', targetId)
            .maybeSingle();
          if (sp) {
            updatedList = [sp, ...updatedList];
          }
        }
        
        setSalespeople(updatedList);
        
        // If current selection is not 'All' and not in the new branch list (and not the initial salesperson), 
        // reset to 'All'
        if (selectedSalesperson !== 'All' && !updatedList.find(p => p.id === selectedSalesperson)) {
          if (selectedSalesperson !== initialSalespersonId) {
             setSelectedSalesperson('All');
          }
        }
      } catch (error) {
        console.error('Error fetching salespeople:', error);
      }
    }
    fetchSalespeople();
  }, [selectedBranch, profile, initialSalespersonId]);

  // Handle drill down logic
  useEffect(() => {
    async function resolveInitialEmployee() {
      if (!initialSalespersonId || !profile) return;
      
      try {
        // Fetch them specifically to get their branch_ids
        const { data: sp } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', initialSalespersonId)
          .single();

        if (sp && sp.branch_ids && sp.branch_ids.length > 0) {
          // If the salesperson is in a branch the user has access to
          const firstValidBranch = sp.branch_ids.find(b => availableBranches.includes(b));
          if (firstValidBranch) {
            setSelectedBranch(firstValidBranch);
            setSelectedSalesperson(initialSalespersonId);
          }
        }
      } catch (error) {
        console.error('Error resolving initial salesperson:', error);
      }
    }
    
    resolveInitialEmployee();
  }, [initialSalespersonId, availableBranches, profile]);
  
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
    if (!profile) return;
    
    let branches: string[] = [];
    if (profile.role === 'Admin') {
      branches = ['All', ...BRANCHES];
    } else {
      branches = profile.branch_ids || [];
      if (branches.length > 1) {
        // Only show 'All' for Branch Heads if they have multiple branches
        branches = ['All', ...branches];
      }
    }
    
    setAvailableBranches(branches);
    
    if (branches.length > 0) {
      setSelectedBranch(prev => branches.includes(prev) ? prev : branches[0]);
    } else {
      setSelectedBranch('default_branch');
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchExistingData();
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [view, selectedBranch, selectedYear, selectedSalesperson, refreshKey]);

  const fetchExistingData = async () => {
    if (!profile || !selectedBranch || selectedBranch === 'default_branch') return;
    
    // Safety check to prevent recursive loops
    const currentParams = `${view}-${selectedBranch}-${selectedYear}-${selectedSalesperson}-${refreshKey}`;
    if (fetchingRef.current === currentParams) return;
    fetchingRef.current = currentParams;

    setLoading(true);
    console.log(`FETCHING DATA: View=${view}, Branch=${selectedBranch}, Year=${selectedYear}, Salesperson=${selectedSalesperson}`);
    
    try {
      // Step 1: Fetch the "Master List" of active customers/units for this context
      // We look at the selected year AND the previous year to give them continuity
      let masterQuery = supabase
        .from('sales_data')
        .select('customer_name, unit_name, branch_id, salesperson_id')
        .or(`year.eq.${selectedYear},year.eq.${selectedYear - 1}`);

      if (selectedBranch !== 'All') {
        masterQuery = masterQuery.eq('branch_id', selectedBranch);
      }

      if (profile.role === 'Sales Person') {
        masterQuery = masterQuery.eq('salesperson_id', profile.id);
      } else if (selectedSalesperson && selectedSalesperson !== 'All') {
        masterQuery = masterQuery.eq('salesperson_id', selectedSalesperson);
      }

      const { data: masterData } = await masterQuery;

      // Filter out any entries with empty customer name to prevent blank rows
      const validMasterData = (masterData || []).filter(item => item.customer_name && item.customer_name.trim() !== '');

      // Unique combinations of customer and unit
      const masterRows = new Map<string, { customer: string; unit: string }>();
      validMasterData.forEach(item => {
        const key = `${item.customer_name}-${item.unit_name}`;
        if (!masterRows.has(key)) {
          masterRows.set(key, { customer: item.customer_name, unit: item.unit_name });
        }
      });

      // Step 2: Fetch actual data for the SELECTED year
      let dataQuery = supabase
        .from('sales_data')
        .select('*')
        .eq('year', selectedYear);

      if (selectedBranch !== 'All') {
        dataQuery = dataQuery.eq('branch_id', selectedBranch);
      }

      if (profile.role === 'Sales Person') {
        dataQuery = dataQuery.eq('salesperson_id', profile.id);
      } else if (selectedSalesperson && selectedSalesperson !== 'All') {
        dataQuery = dataQuery.eq('salesperson_id', selectedSalesperson);
      }

      const { data: yearData, error } = await dataQuery;
      if (error) throw error;

      // Group actual year data
      const yearGrouped: Record<string, any> = {};
      (yearData || []).forEach(item => {
        // Create a unique key that includes salesperson if viewing all salespeople
        let key = `${item.customer_name}-${item.unit_name}`;
        if (selectedBranch === 'All') {
          key = `${item.branch_id}-${key}`;
        }
        if (selectedSalesperson === 'All') {
          key = `${item.salesperson_id}-${key}`;
        }
          
        if (!yearGrouped[key]) {
          yearGrouped[key] = {
            targets: { ...EMPTY_VALUES },
            actuals: { ...EMPTY_VALUES },
            dbIds: {},
            salespersonIds: {},
            branch_id: item.branch_id,
            salesperson_id: item.salesperson_id
          };
        }
        yearGrouped[key].targets[item.month] = (yearGrouped[key].targets[item.month] || 0) + item.target_amount;
        yearGrouped[key].actuals[item.month] = (yearGrouped[key].actuals[item.month] || 0) + item.actual_amount;
        yearGrouped[key].dbIds[item.month] = item.id;
        yearGrouped[key].salespersonIds[item.month] = item.salesperson_id;
      });

      // Group master data similarly
      const masterKeys = new Set<string>();
      (masterData || []).forEach(item => {
        let key = `${item.customer_name}-${item.unit_name}`;
        if (selectedBranch === 'All') {
          key = `${item.branch_id}-${key}`;
        }
        if (selectedSalesperson === 'All' && item.salesperson_id) {
          key = `${item.salesperson_id}-${key}`;
        }
        masterKeys.add(key);
      });

      // Step 3: Combine Master list with Year Data
      const finalRowMap: Record<string, SalesDataRow> = {};
      
      const addToMap = (item: any) => {
        let key = `${item.customer_name}-${item.unit_name}`;
        if (selectedBranch === 'All') {
          key = `${item.branch_id}-${key}`;
        }
        if (selectedSalesperson === 'All') {
          key = `${item.salesperson_id}-${key}`;
        }

        if (!finalRowMap[key]) {
          const yearInfo = yearGrouped[key] || {
            targets: { ...EMPTY_VALUES },
            actuals: { ...EMPTY_VALUES },
            dbIds: {},
            salespersonIds: {},
            branch_id: item.branch_id,
            salesperson_id: item.salesperson_id
          };

          const sp = salespeople.find(s => s.id === yearInfo.salesperson_id);

          finalRowMap[key] = {
            id: (yearInfo.dbIds && Object.values(yearInfo.dbIds)[0]) as string || key,
            customerName: item.customer_name,
            unit: item.unit_name,
            targets: yearInfo.targets,
            actuals: yearInfo.actuals,
            dbIds: yearInfo.dbIds,
            salespersonIds: yearInfo.salespersonIds,
            branchId: yearInfo.branch_id,
            salespersonId: yearInfo.salesperson_id,
            salespersonName: sp?.full_name
          };
        }
      };

      // Process year data first to ensure we have the latest salesperson/branch context
      const validYearData = (yearData || []).filter(item => item.customer_name && item.customer_name.trim() !== '');
      validYearData.forEach(item => addToMap(item));
      
      // Process master data for anything missing
      validMasterData.forEach(item => addToMap(item));

      let finalRows = Object.values(finalRowMap);

      if (finalRows.length === 0 && view === 'planning') {
        // If still no rows, provide some empty ones
        finalRows = Array.from({ length: 5 }).map(() => ({
          id: Math.random().toString(36).substring(2, 11),
          customerName: '',
          unit: '',
          targets: { ...EMPTY_VALUES },
          actuals: { ...EMPTY_VALUES },
          salespersonIds: {}
        }));
      }

      // Sort alphabetically by customer name
      setRows(finalRows.sort((a, b) => a.customerName.localeCompare(b.customerName)));
    } catch (error: any) {
      toast.error('Failed to fetch data: ' + error.message);
    } finally {
      setLoading(false);
      fetchingRef.current = null;
    }
  };

  const addRow = () => {
    setRows([...rows, {
      id: Math.random().toString(36).substring(2, 11),
      customerName: '',
      unit: '',
      targets: { ...EMPTY_VALUES },
      actuals: { ...EMPTY_VALUES },
      salespersonIds: {}
    }]);
  };

  const handleDeleteRow = async (row: SalesRow) => {
    if (!profile) return;
    
    // If it's a completely new row with no customer name, just remove locally
    if (!row.customerName) {
      setRows(rows.filter(r => r.id !== row.id));
      return;
    }

    if (!confirm(`Are you sure you want to delete ALL records for "${row.customerName}" (${row.unit})? This will remove this client from Planning, Actuals, and the Dashboard for the current year.`)) {
      return;
    }

    setLoading(true);
    try {
      console.log(`DELETE START: Removing records for ${row.customerName} - ${row.unit}`);
      
      // Perform a targeted delete based on customer name, unit, year and branch
      let deleteQuery = supabase
        .from('sales_data')
        .delete()
        .eq('customer_name', row.customerName)
        .eq('unit_name', row.unit)
        .eq('year', selectedYear);

      if (selectedBranch !== 'All') {
        deleteQuery = deleteQuery.eq('branch_id', selectedBranch);
      } else if ((row as any).branchId) {
        // If All Branches are shown, pinpoint the specific branch for this row
        deleteQuery = deleteQuery.eq('branch_id', (row as any).branchId);
      }

      const { error } = await deleteQuery;

      if (error) throw error;

      toast.success(`Deleted ${row.customerName} successfully`);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (error: any) {
      console.error('Delete Failed:', error);
      toast.error('Delete failed: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
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
    if (!profile) {
      toast.error('Session lost. Please login again.');
      return;
    }
    
    if (!selectedBranch || selectedBranch === 'default_branch' || selectedBranch === 'All') {
      toast.error('Please select a specific branch before saving.');
      return;
    }

    // Verify if we're trying to save new rows in 'All' mode
    const hasNewRows = rows.some(r => !r.dbIds || Object.keys(r.dbIds).length === 0);
    if (hasNewRows && (profile.role === 'Admin' || profile.role === 'Branch Head') && selectedSalesperson === 'All') {
      toast.error('Cannot save new rows when "All Employees" is selected. Please select a specific employee to assign these records.');
      return;
    }

    setLoading(true);
    const combinedPayload: any[] = [];
    
    // Timeout safeguard - increased to 60s
    const timeoutId = setTimeout(() => {
      setLoading(false);
      toast.error('Save request timed out. Please try again.');
    }, 60000);

    try {
      // Determine which months to process (all months or just the selected one)
      const monthsToProcess = selectedMonth === 'All' ? MONTHS : [selectedMonth];
      
      const targetSalespersonId = (profile.role === 'Admin' || profile.role === 'Branch Head') && selectedSalesperson !== 'All' 
        ? selectedSalesperson 
        : profile.id;

      console.log(`SAVE START: Branch=${selectedBranch}, Year=${selectedYear}, User=${profile.full_name}`);

      for (const row of rows) {
        if (!row.customerName || !row.unit) continue;

        monthsToProcess.forEach(month => {
          const entry: any = {
            customer_name: row.customer_name || row.customerName,
            unit_name: row.unit_name || row.unit,
            month,
            year: selectedYear,
            target_amount: row.targets[month] || 0,
            actual_amount: row.actuals[month] || 0,
            salesperson_id: row.salespersonIds?.[month] || targetSalespersonId || (row as any).salesperson_id,
            branch_id: selectedBranch !== 'All' ? selectedBranch : (row as any).branch_id || (row as any).branchId,
            target_unit: (row as any).target_unit || 0,
            actual_unit: (row as any).actual_unit || 0
          };

          // If it exists in DB, include ID to update, otherwise generate a new one
          const existingId = row.dbIds?.[month];
          if (existingId && typeof existingId === 'string' && existingId.length > 0) {
            entry.id = existingId;
          } else {
            // ALWAYS generate an ID for records if we don't have one
            // This prevents "null value in column 'id'" errors if DB has no default
            entry.id = generateUUID();
          }

          // Only push if it's an update OR if it has some non-zero values
          if (entry.id || entry.target_amount > 0 || entry.actual_amount > 0) {
            combinedPayload.push(entry);
          }
        });
      }

      if (combinedPayload.length > 0) {
        console.log(`SUBMIT: Sending ${combinedPayload.length} records to Supabase`);
        const { error } = await supabase.from('sales_data').upsert(combinedPayload, { onConflict: 'id' });
        if (error) {
          console.error('Supabase Upsert Error Detailed:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            firstRecord: combinedPayload[0]
          });
          throw error;
        }
        toast.success(view === 'planning' ? 'Target Planning submitted!' : 'Actual Entry saved!');
        
        // Notify parent of data change
        if (onDataChange) onDataChange();
        
        // Refresh data in background
        fetchExistingData();
      } else {
        toast.info('No changes detected to save.');
      }
    } catch (error: any) {
      console.error('Submit Error Details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        payloadSize: combinedPayload.length
      });
      
      let errorMsg = error.message;
      if (error.code === '42501') {
        errorMsg = 'Permission Denied (RLS). You may not have access to modify these records.';
      } else if (error.code === '23505') {
        errorMsg = 'Conflict detected: A record with this information already exists.';
      }
      
      toast.error('Save failed: ' + errorMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!profile || !bulkMonth || !bulkCustomer) {
      toast.error('Please select Month and enter Customer Name');
      return;
    }
    setLoading(true);
    
    const timeoutId = setTimeout(() => {
      setLoading(false);
      toast.error('Bulk save timed out.');
    }, 45000);

    try {
      const payload: any[] = [];
      
      const targetSalespersonId = (profile.role === 'Admin' || profile.role === 'Branch Head') && selectedSalesperson !== 'All' 
        ? selectedSalesperson 
        : profile.id;
      
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
            salesperson_id: targetSalespersonId,
            branch_id: selectedBranch,
            target_unit: 0,
            actual_unit: 0,
            id: generateUUID()
          });
        }
      }

      if (payload.length > 0) {
        console.log('BULK SUBMIT: Fetching existing records for conflict check...');
        // Find existing records first to see if we should update or insert
        const { data: existingRecords, error: fetchError } = await supabase
          .from('sales_data')
          .select('id, customer_name, unit_name, month, year, branch_id')
          .eq('customer_name', bulkCustomer)
          .eq('month', bulkMonth)
          .eq('year', selectedYear)
          .eq('branch_id', selectedBranch);

        if (fetchError) {
          console.error('BULK SUBMIT: Fetch Error:', fetchError);
          throw fetchError;
        }

        const finalPayload = payload.map(p => {
          const match = existingRecords?.find(er => er.unit_name === p.unit_name);
          if (match && match.id) {
            return { ...p, id: match.id };
          }
          // If no match, provide a new ID to ensure no null constraint issues
          return { ...p, id: generateUUID() };
        });

        console.log('BULK SUBMIT: Upserting records...', finalPayload.length);
        const { error } = await supabase.from('sales_data').upsert(finalPayload, { onConflict: 'id' });
        console.log('BULK SUBMIT: Upsert result:', { error });
        if (error) throw error;
      }

      toast.success('Multi-unit targets saved successfully!');
      setIsBulkOpen(false);
      setBulkMonth('');
      setBulkCustomer('');
      setBulkTargets({});
      if (onDataChange) onDataChange();
      await fetchExistingData();
    } catch (error: any) {
      console.error('Bulk Save Error Details:', error);
      let errorMsg = error.message;
      if (error.code === '42501') {
        errorMsg = 'Permission Denied (RLS). You cannot perform bulk entry.';
      }
      toast.error('Bulk save failed: ' + errorMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full mx-auto pb-10">
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
      `}} />
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-end gap-6 bg-card/50 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-border/50">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 ml-1">Branch Context</Label>
            <div className="flex items-center gap-2">
              <Select value={selectedBranch || ''} onValueChange={setSelectedBranch} disabled={loading}>
                <SelectTrigger className="w-full md:min-w-[180px] h-11 font-black text-xs border-none bg-secondary/50 shadow-none rounded-xl hover:bg-secondary/80 focus:ring-2 focus:ring-primary/20 transition-all uppercase italic tracking-tighter">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map(b => (
                    <SelectItem key={b} value={b} className="font-bold text-[10px] uppercase">
                      {b === 'All' ? '🏢 All Branches' : b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={fetchExistingData} 
                disabled={loading}
                className="h-11 w-11 rounded-xl hover:bg-primary/10 text-primary bg-primary/5 shrink-0"
                title="Refresh Data"
              >
                <Loader2 size={16} className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>
          
          {(profile?.role === 'Admin' || profile?.role === 'Branch Head') && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between ml-1">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70">Personnel</Label>
                {selectedSalesperson !== 'All' && (
                  <span className="text-[8px] font-bold text-accent uppercase animate-pulse">Filtering Active</span>
                )}
              </div>
              <Select value={selectedSalesperson} onValueChange={setSelectedSalesperson} disabled={loading}>
                <SelectTrigger className="w-full md:min-w-[200px] h-11 font-black text-xs border-none bg-primary/5 shadow-none rounded-xl text-primary hover:bg-primary/10 focus:ring-2 focus:ring-primary/20 transition-all uppercase italic tracking-tighter">
                  <SelectValue placeholder="All Employees">
                    {selectedSalesperson === 'All' ? '👥 ALL EMPLOYEES' : (salespeople.find(p => p.id === selectedSalesperson)?.full_name || '👥 ALL EMPLOYEES')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All" className="font-black text-xs uppercase italic tracking-tighter text-primary">👥 ALL EMPLOYEES</SelectItem>
                  {salespeople.map(p => (
                    <SelectItem key={p.id} value={p.id} className="font-bold text-[10px] uppercase tracking-tighter">{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="flex flex-col gap-2.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 ml-1">Period</Label>
            <div className="flex items-center gap-2">
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))} disabled={loading}>
                <SelectTrigger className="w-full md:min-w-[100px] h-11 font-black text-xs border-none bg-secondary/50 shadow-none rounded-xl hover:bg-secondary/80 focus:ring-2 focus:ring-primary/20 transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()} className="font-bold text-[10px]">📅 {y}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={loading}>
                <SelectTrigger className="w-full md:min-w-[130px] h-11 font-black text-xs border-none bg-secondary/50 shadow-none rounded-xl hover:bg-secondary/80 focus:ring-2 focus:ring-primary/20 transition-all uppercase italic tracking-tighter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All" className="font-black text-xs uppercase italic tracking-tighter">🗓️ ALL MONTHS</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold text-[10px] uppercase tracking-tighter">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col gap-2.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 ml-1">Business Unit</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit} disabled={loading}>
              <SelectTrigger className="w-full md:min-w-[140px] h-11 font-black text-xs border-none bg-secondary/50 shadow-none rounded-xl hover:bg-secondary/80 focus:ring-2 focus:ring-primary/20 transition-all uppercase italic tracking-tighter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" className="font-black text-xs uppercase italic tracking-tighter">📦 ALL UNITS</SelectItem>
                {UNITS.map(u => <SelectItem key={u} value={u} className="font-bold text-[10px] uppercase tracking-tighter">{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {view === 'planning' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsBulkOpen(true)} 
                disabled={loading || selectedSalesperson === 'All' || selectedBranch === 'All'}
                className="h-11 px-6 rounded-xl border-dashed border-primary/30 text-primary font-black text-[10px] uppercase tracking-widest hover:bg-primary/5 hover:border-primary transition-all disabled:opacity-20"
              >
                <ClipboardList size={14} className="mr-2" />
                Bulk Entry
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addRow} 
                disabled={loading || selectedSalesperson === 'All' || selectedBranch === 'All'}
                className="h-11 px-6 rounded-xl border-dashed border-primary/30 text-primary font-black text-[10px] uppercase tracking-widest hover:bg-primary/5 hover:border-primary transition-all disabled:opacity-20"
              >
                <Plus size={14} className="mr-2" />
                Add Row
              </Button>
            </>
          )}
          <Button 
            onClick={handleSubmit} 
            disabled={loading || selectedBranch === 'All'} 
            className="h-11 px-8 rounded-xl bg-primary shadow-lg shadow-primary/20 font-black text-[10px] uppercase tracking-[0.2em] hover:shadow-primary/40 active:scale-95 transition-all text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            {view === 'planning' ? 'Save Planning' : 'Update Actuals'}
          </Button>
        </div>
      </div>

      {/* Bulk Modal Implementation */}
      {isBulkOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-border shadow-2xl flex flex-col scale-in-center">
            <div className="p-8 border-b border-border flex justify-between items-center bg-secondary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight leading-none text-foreground">Bulk Target Entry</h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 opacity-70">Add targets for multiple units at once</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsBulkOpen(false)} className="rounded-full hover:bg-destructive/10 hover:text-destructive w-10 h-10 transition-colors">
                <X size={20} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-card/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Select Month</Label>
                  <Select value={bulkMonth} onValueChange={setBulkMonth} disabled={loading}>
                    <SelectTrigger className="h-12 bg-secondary/30 border-none shadow-none focus:ring-2 focus:ring-primary/20 rounded-2xl font-black text-xs ring-offset-0 disabled:opacity-50 uppercase italic tracking-tighter">
                      <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold uppercase text-[10px]">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Customer Name</Label>
                  <Input 
                    placeholder="ENTER CUSTOMER NAME..." 
                    value={bulkCustomer}
                    onChange={(e) => setBulkCustomer(e.target.value)}
                    disabled={loading}
                    className="h-12 bg-secondary/30 border-none shadow-none focus:ring-2 focus:ring-primary/20 rounded-2xl font-black text-xs px-4 placeholder:text-muted-foreground/30 ring-offset-0 disabled:opacity-50"
                  />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                   <div className="h-[1px] flex-1 bg-border" />
                   <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-primary whitespace-nowrap">Target Amounts for Units</Label>
                   <div className="h-[1px] flex-1 bg-border" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {UNITS.map(unit => (
                    <div key={unit} className="flex items-center justify-between gap-4 bg-secondary/20 p-4 rounded-2xl border border-border/50 group hover:border-primary/50 transition-all hover:bg-secondary/40">
                      <span className="text-xs font-black uppercase tracking-tighter text-muted-foreground group-hover:text-primary transition-colors">{unit}</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground/50">₹</span>
                        <Input 
                          type="number"
                          placeholder="0"
                          value={bulkTargets[unit] || ''}
                          onChange={(e) => setBulkTargets({...bulkTargets, [unit]: e.target.value})}
                          disabled={loading}
                          className="w-32 h-10 text-right font-black text-sm bg-background border-none shadow-sm rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20 pr-4 pl-7 disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-8 border-t border-border flex flex-col sm:flex-row justify-end gap-3 bg-secondary/10">
              <Button variant="ghost" onClick={() => setIsBulkOpen(false)} className="font-bold text-xs uppercase tracking-widest h-12 px-10 rounded-2xl hover:bg-secondary/80 transition-colors">Cancel</Button>
              <Button onClick={handleBulkSubmit} disabled={loading} className="font-black text-xs uppercase tracking-widest h-12 px-12 rounded-2xl bg-primary shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-[0.98] disabled:opacity-50">
                {loading ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Save size={18} className="mr-2" />}
                Confirm & Create Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto w-full rounded-2xl border border-border/50 shadow-2xl bg-card relative custom-scrollbar max-h-[70vh]">
        <table className="w-full border-separate border-spacing-0 table-auto min-w-max lg:min-w-full">
          <thead className="sticky top-0 z-40">
            <tr className="bg-secondary/95 backdrop-blur-md">
              <th className={`${isAllMonths ? 'sticky lg:sticky left-0 z-50' : ''} bg-secondary/95 p-3 text-left border-r border-b border-border/50 min-w-[40px] md:min-w-[50px] font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Sr.</th>
              <th className={`${isAllMonths ? 'sticky lg:sticky left-[40px] md:left-[50px] z-50' : ''} bg-secondary/95 p-3 text-left border-r border-b border-border/50 min-w-[180px] md:min-w-[260px] font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Customer Name</th>
              <th className={`${isAllMonths ? 'hidden lg:table-cell lg:sticky lg:left-[310px] z-50' : ''} bg-secondary/95 p-3 text-left border-r border-b border-border/50 min-w-[130px] md:min-w-[160px] font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Unit</th>
              {displayShortMonths.map(m => (
                <th key={m} className={`p-3 text-center text-[11px] font-black uppercase tracking-tighter border-r border-b border-border/50 last:border-r-0 ${isAllMonths ? 'min-w-[170px]' : 'min-w-[220px]'} bg-primary/5 text-primary`}>
                  {m}
                </th>
              ))}
              <th className="bg-secondary/95 border-b border-border/50 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(r => selectedUnit === 'All' || r.unit === selectedUnit)
              .map((row, idx) => (
              <tr key={row.id} className="hover:bg-primary/5 transition-all h-14 group">
                <td className={`${isAllMonths ? 'sticky lg:sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} bg-card group-hover:bg-accent/5 px-3 py-2 text-center border-r border-b border-border/30 font-black text-[12px] text-muted-foreground transition-all`}>{idx + 1}</td>
                <td className={`${isAllMonths ? 'sticky lg:sticky left-[40px] md:left-[50px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} bg-card group-hover:bg-accent/10 px-3 py-2 border-r border-b border-border/30 transition-all`}>
                  <div className="flex flex-col gap-1.5">
                    <Input 
                      value={row.customerName}
                      onChange={(e) => updateRow(row.id, 'customerName', e.target.value)}
                      placeholder="CUSTOMER NAME..."
                      disabled={view === 'actuals' || loading}
                      className="border-none shadow-none focus-visible:ring-0 h-9 font-black text-[13px] bg-transparent disabled:opacity-50 px-1 uppercase tracking-tight placeholder:text-muted-foreground/20"
                    />
                    <div className="flex flex-wrap gap-1.5 px-1">
                      <span className="text-[9px] font-black uppercase text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 lg:hidden">
                        {row.unit || 'NO UNIT'}
                      </span>
                      {selectedBranch === 'All' && row.branchId && (
                        <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          🏢 {row.branchId}
                        </span>
                      )}
                      {(selectedSalesperson === 'All' || selectedBranch === 'All') && row.salespersonName && (
                        <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                          👤 {row.salespersonName}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className={`${isAllMonths ? 'hidden lg:table-cell lg:sticky lg:left-[310px] z-20' : ''} bg-card group-hover:bg-accent/10 px-3 py-2 border-r border-b border-border/30 transition-all`}>
                  <div className="flex flex-col gap-2">
                    <Select 
                      value={row.unit} 
                      onValueChange={(v) => updateRow(row.id, 'unit', v)}
                      disabled={view === 'actuals' || loading || selectedBranch === 'All'}
                    >
                      <SelectTrigger className="border-none shadow-none focus:ring-0 h-8 font-black text-[11px] bg-secondary/80 rounded-xl disabled:opacity-50 px-3 uppercase italic tracking-tighter hover:bg-secondary transition-colors">
                        <SelectValue placeholder="UNIT" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u} className="text-[11px] font-black uppercase">{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedBranch === 'All' && (row as any).branchId && (
                      <div className="flex items-center gap-1.5 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent/80 truncate">
                          {(row as any).branchId}
                        </span>
                      </div>
                    )}
                  </div>
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
                            disabled={loading}
                            className="h-10 border-border/40 text-center font-black text-sm px-1 focus-visible:ring-primary/30 disabled:opacity-50"
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
                                  disabled={loading}
                                  className="h-10 border-none shadow-none text-center font-black text-sm px-1 bg-transparent focus-visible:ring-0 flex-1 placeholder:text-muted-foreground/30 placeholder:font-normal disabled:opacity-50"
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
                <td className="p-1 px-2 border-b border-border text-center">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDeleteRow(row)}
                    disabled={loading || (selectedBranch === 'All' && profile?.role !== 'Admin' && profile?.role !== 'Branch Head')}
                    title="Delete row"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-40 bg-muted/90 backdrop-blur-md">
            <tr className="h-12 border-t-2 border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <td colSpan={2} className={`${isAllMonths ? 'sticky lg:sticky left-0 z-50 min-w-[220px]' : ''} lg:hidden bg-muted px-4 py-3 text-right border-r border-border/50 font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                Total
              </td>
              <td colSpan={3} className={`${isAllMonths ? 'sticky lg:sticky left-0 z-50 lg:min-w-[470px]' : ''} hidden lg:table-cell bg-muted px-4 py-3 text-right border-r border-border/50 font-black uppercase text-[10px] tracking-widest text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                Grand Total / Summary
              </td>
              {displayMonths.map(m => {
                const filteredRows = rows.filter(r => selectedUnit === 'All' || r.unit === selectedUnit);
                const totalTarget = filteredRows.reduce((sum, r) => sum + (r.targets[m] || 0), 0);
                const totalActual = filteredRows.reduce((sum, r) => sum + (r.actuals[m] || 0), 0);
                const totalDiff = totalActual - totalTarget;

                return (
                  <td key={m} className={`px-2 py-2 border-r border-border/50 last:border-r-0 ${totalDiff >= 0 ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
                        <div className="flex flex-col gap-2 justify-center h-full">
                          <div className="space-y-2 py-1">
                            <div className="flex items-center justify-between text-[10px] font-black px-2 text-muted-foreground bg-background/80 rounded-lg py-1 border border-border/20 shadow-sm">
                              <span>T-TOTAL</span>
                              <span className="text-foreground tracking-tighter">₹{totalTarget.toLocaleString()}</span>
                            </div>
                            {view === 'actuals' && (
                              <div className="flex items-center justify-between px-2 h-10 bg-background/40 rounded-lg border border-border/10">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black text-muted-foreground leading-none">A-TOTAL</span>
                                  <span className="text-[13px] font-black text-foreground tracking-tighter">₹{totalActual.toLocaleString()}</span>
                                </div>
                                <div className={`text-right text-[10px] font-black leading-none flex flex-col items-end gap-1 ${totalDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {totalActual > 0 ? (
                                    <>
                                      <span className="text-[12px] leading-none">{totalDiff >= 0 ? '▲' : '▼'}</span>
                                      <span className="tracking-tighter font-black">₹{Math.abs(totalDiff).toLocaleString()}</span>
                                    </>
                                  ) : <span className="opacity-20 italic">0.00</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                  </td>
                );
              })}
              <td className="bg-muted/40"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {view === 'planning' && (
        <div className="flex justify-center mt-4">
           <Button 
             variant="outline" 
             onClick={addRow} 
             disabled={loading || selectedBranch === 'All' || selectedSalesperson === 'All'}
             className="w-full max-w-sm border-dashed border-2 hover:border-primary hover:bg-primary/5 font-black text-[10px] uppercase tracking-widest h-12 rounded-xl disabled:opacity-30"
           >
             <Plus size={16} className="mr-2" />
             Add Another Row
           </Button>
        </div>
      )}
    </div>
  );
}
