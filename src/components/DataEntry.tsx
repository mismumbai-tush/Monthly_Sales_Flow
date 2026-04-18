import { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Loader2, Database, Building2, LayoutGrid } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { UNITS } from '@/src/constants';

interface DataEntryProps {
  profile: Profile | null;
}

interface CustomerEntry {
  id: string;
  customerName: string;
  targetAmount: number;
  actualAmount: number;
}

interface UnitGroup {
  id: string;
  unitName: string;
  customers: CustomerEntry[];
}

export default function DataEntry({ profile }: DataEntryProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([
    { 
      id: Math.random().toString(36).substring(2, 11), 
      unitName: '', 
      customers: [{ id: Math.random().toString(36).substring(2, 11), customerName: '', targetAmount: 0, actualAmount: 0 }] 
    }
  ]);
  const [loading, setLoading] = useState(false);

  // Sync selectedBranch when profile loads
  useEffect(() => {
    if (profile?.branch_ids && profile.branch_ids.length > 0 && !selectedBranch) {
      setSelectedBranch(profile.branch_ids[0]);
    } else if (profile && !profile.branch_ids?.length && !selectedBranch) {
      setSelectedBranch('default_branch');
    }
  }, [profile, selectedBranch]);

  const addUnitGroup = () => {
    setUnitGroups([...unitGroups, { 
      id: Math.random().toString(36).substring(2, 11), 
      unitName: '', 
      customers: [{ id: Math.random().toString(36).substring(2, 11), customerName: '', targetAmount: 0, actualAmount: 0 }] 
    }]);
  };

  const removeUnitGroup = (id: string) => {
    if (unitGroups.length === 1) return;
    setUnitGroups(unitGroups.filter(g => g.id !== id));
  };

  const addCustomer = (groupId: string) => {
    setUnitGroups(unitGroups.map(g => 
      g.id === groupId 
        ? { ...g, customers: [...g.customers, { id: Math.random().toString(36).substring(2, 11), customerName: '', targetAmount: 0, actualAmount: 0 }] }
        : g
    ));
  };

  const removeCustomer = (groupId: string, customerId: string) => {
    setUnitGroups(unitGroups.map(g => {
      if (g.id === groupId) {
        if (g.customers.length === 1) return g;
        return { ...g, customers: g.customers.filter(c => c.id !== customerId) };
      }
      return g;
    }));
  };

  const updateUnitName = (groupId: string, name: string) => {
    setUnitGroups(unitGroups.map(g => g.id === groupId ? { ...g, unitName: name } : g));
  };

  const updateCustomer = (groupId: string, customerId: string, field: keyof CustomerEntry, value: string | number) => {
    setUnitGroups(unitGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          customers: g.customers.map(c => c.id === customerId ? { ...c, [field]: value } : c)
        };
      }
      return g;
    }));
  };

  const handleSubmit = async () => {
    if (!profile) {
      toast.error('User profile not loaded. Please wait.');
      return;
    }
    
    // Flatten and validate
    const flattenedData: any[] = [];
    let isValid = true;

    unitGroups.forEach(g => {
      if (!g.unitName) isValid = false;
      g.customers.forEach(c => {
        if (!c.customerName) isValid = false;
        flattenedData.push({
          unitName: g.unitName,
          ...c
        });
      });
    });

    if (!isValid) {
      toast.error('Please fill in all Unit names and Customer names');
      return;
    }

    if (!selectedBranch && profile.role !== 'Admin') {
      toast.error('Please select a branch for this entry');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const month = now.toLocaleString('default', { month: 'long' });
      const year = now.getFullYear();

      const salesData = flattenedData.map(e => ({
        customer_name: e.customerName,
        unit_name: e.unitName,
        month,
        year,
        target_unit: 0,
        actual_unit: 0,
        target_amount: e.targetAmount,
        actual_amount: e.actualAmount,
        salesperson_id: profile.id,
        branch_id: selectedBranch || 'default_branch'
      }));

      console.log('Submitting sales data:', salesData);

      // 1. Save to Supabase
      const { error: dbError } = await supabase.from('sales_data').insert(salesData);
      if (dbError) {
        console.error('Supabase Insert Error:', dbError);
        throw new Error(`Database error: ${dbError.message}`);
      }

      toast.success('Data submitted successfully!');

      // Reset form on success
      setUnitGroups([{ 
        id: Math.random().toString(36).substring(2, 11), 
        unitName: '', 
        customers: [{ id: Math.random().toString(36).substring(2, 11), customerName: '', targetAmount: 0, actualAmount: 0 }] 
      }]);
      
    } catch (error: any) {
      console.error('Submission error:', error);
      toast.error(error.message || 'Failed to submit data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && unitGroups.length === 1 && !unitGroups[0].unitName) {
    return (
      <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-20">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-20">
      {profile?.role !== 'Sales Person' && profile?.branch_ids && profile.branch_ids.length > 1 && (
        <Card className="border-border shadow-md rounded-2xl bg-card overflow-hidden">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                <Building2 size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground mb-0.5">Active Branch</p>
                <h3 className="text-lg font-bold">Selecting Branch for Data Entry</h3>
              </div>
            </div>
            <div className="w-full md:w-64">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-12 bg-secondary/20 border-border rounded-xl font-bold">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {profile.branch_ids.map(b => (
                    <SelectItem key={b} value={b} className="font-bold">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">New Sales Entry</h2>
          <p className="text-xs md:text-sm text-muted-foreground font-medium italic">Entries for {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}</p>
        </div>
        <Button onClick={handleSubmit} disabled={loading} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-8 py-6 md:py-4 shadow-xl shadow-primary/20 font-bold">
          {loading ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
          Submit All Data
        </Button>
      </div>

      <div className="space-y-6">
        {unitGroups.map((group) => (
          <Card key={group.id} className="border-border shadow-sm rounded-2xl bg-card overflow-hidden border-l-4 border-l-primary">
            <CardHeader className="bg-secondary/20 border-b border-border py-4 px-4 md:px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:max-w-md">
                <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0">
                  <Database size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-foreground mb-1 block">Unit Category</Label>
                  <Select value={group.unitName} onValueChange={(v) => updateUnitName(group.id, v)}>
                    <SelectTrigger className="bg-card border-border shadow-none h-9 font-bold text-xs truncate">
                      <SelectValue placeholder="Select Unit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.filter(u => !unitGroups.some(g => g.unitName === u && g.id !== group.id)).map(u => (
                        <SelectItem key={u} value={u} className="font-medium">{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => removeUnitGroup(group.id)}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold text-[10px] uppercase tracking-tighter self-end md:self-auto"
              >
                <Trash2 size={14} className="mr-1.5" />
                Delete Unit
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 px-2 hidden md:grid">
                  <div className="col-span-5 text-[10px] font-black uppercase tracking-widest text-foreground">Customer Name</div>
                  <div className="col-span-3 text-[10px] font-black uppercase tracking-widest text-foreground">Plan / Target (Amt)</div>
                  <div className="col-span-3 text-[10px] font-black uppercase tracking-widest text-foreground">Actual (Amt)</div>
                  <div className="col-span-1"></div>
                </div>
                
                {group.customers.map((customer) => (
                  <div key={customer.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end p-4 bg-secondary/5 rounded-2xl border border-border/30 group transition-all hover:border-border/60 hover:bg-secondary/10">
                    <div className="md:col-span-5 space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-foreground ml-1">Customer Name</Label>
                      <Input 
                        placeholder="" 
                        value={customer.customerName}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'customerName', e.target.value)}
                        className="bg-card border-border shadow-none h-11 font-bold text-sm rounded-xl focus-visible:ring-primary/20"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-foreground ml-1">Plan / Target (Amt)</Label>
                      <Input 
                        type="number" 
                        placeholder=""
                        value={customer.targetAmount || ''}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'targetAmount', parseFloat(e.target.value) || 0)}
                        className="bg-card border-border shadow-none h-11 font-bold text-sm rounded-xl focus-visible:ring-primary/20"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-foreground ml-1">Actual (Amt)</Label>
                      <Input 
                        type="number" 
                        placeholder=""
                        value={customer.actualAmount || ''}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'actualAmount', parseFloat(e.target.value) || 0)}
                        className="bg-card border-border shadow-none h-11 font-bold text-sm rounded-xl focus-visible:ring-primary/20"
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end pb-0.5">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeCustomer(group.id, customer.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-10 w-10 rounded-xl"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => addCustomer(group.id)}
                  className="w-full border-dashed border-border hover:border-primary hover:bg-primary/5 rounded-xl py-4 text-muted-foreground hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest"
                >
                  <Plus size={14} className="mr-2" />
                  Add Another Customer to {group.unitName || 'this Unit'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button 
        variant="outline" 
        onClick={addUnitGroup} 
        className="w-full border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 rounded-2xl py-6 text-lg font-bold text-muted-foreground hover:text-primary transition-all"
      >
        <Plus size={24} className="mr-3" />
        Add New Unit Group
      </Button>
    </div>
  );
}
