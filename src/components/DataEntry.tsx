import { useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Loader2, Database, Building2 } from 'lucide-react';
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
  const [selectedBranch, setSelectedBranch] = useState<string>(profile?.branch_ids?.[0] || 'default_branch');
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([
    { 
      id: crypto.randomUUID(), 
      unitName: '', 
      customers: [{ id: crypto.randomUUID(), customerName: '', targetAmount: 0, actualAmount: 0 }] 
    }
  ]);
  const [loading, setLoading] = useState(false);

  const addUnitGroup = () => {
    setUnitGroups([...unitGroups, { 
      id: crypto.randomUUID(), 
      unitName: '', 
      customers: [{ id: crypto.randomUUID(), customerName: '', targetAmount: 0, actualAmount: 0 }] 
    }]);
  };

  const removeUnitGroup = (id: string) => {
    if (unitGroups.length === 1) return;
    setUnitGroups(unitGroups.filter(g => g.id !== id));
  };

  const addCustomer = (groupId: string) => {
    setUnitGroups(unitGroups.map(g => 
      g.id === groupId 
        ? { ...g, customers: [...g.customers, { id: crypto.randomUUID(), customerName: '', targetAmount: 0, actualAmount: 0 }] }
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
    if (!profile) return;
    
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
        branch_id: selectedBranch
      }));

      // 1. Save to Supabase
      const { error: dbError } = await supabase.from('sales_data').insert(salesData);
      if (dbError) throw dbError;

      // 2. Sync to Google Sheets
      const sheetData = salesData.map(s => [
        s.customer_name,
        s.unit_name,
        s.month,
        s.year,
        s.target_unit,
        s.actual_unit,
        s.target_amount,
        s.actual_amount,
        profile.full_name || profile.email
      ]);

      const response = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: sheetData })
      });

      if (!response.ok) {
        console.warn('Google Sheets sync failed');
        toast.warning('Data saved to database, but Google Sheets sync failed.');
      } else {
        toast.success('Data submitted successfully!');
      }

      // Reset form
      setUnitGroups([{ 
        id: crypto.randomUUID(), 
        unitName: '', 
        customers: [{ id: crypto.randomUUID(), customerName: '', targetAmount: 0, actualAmount: 0 }] 
      }]);
    } catch (error: any) {
      console.error('Submission error:', error);
      toast.error(error.message || 'Failed to submit data');
    } finally {
      setLoading(false);
    }
  };

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
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Active Branch</p>
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

      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">New Sales Entry</h2>
          <p className="text-muted-foreground font-medium">Group entries by Unit for {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}</p>
        </div>
        <Button onClick={handleSubmit} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-8 shadow-lg shadow-primary/20 font-bold">
          {loading ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
          Submit All Data
        </Button>
      </div>

      <div className="space-y-6">
        {unitGroups.map((group) => (
          <Card key={group.id} className="border-border shadow-sm rounded-2xl bg-card overflow-hidden border-l-4 border-l-primary">
            <CardHeader className="bg-secondary/20 border-b border-border py-4 px-6 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-4 flex-1 max-w-md">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <Database size={20} />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Select Unit</Label>
                  <Select value={group.unitName} onValueChange={(v) => updateUnitName(group.id, v)}>
                    <SelectTrigger className="bg-card border-border shadow-none h-10 font-bold">
                      <SelectValue placeholder="Choose a Unit..." />
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
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold"
              >
                <Trash2 size={16} className="mr-2" />
                Remove Unit
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 px-2 hidden md:grid">
                  <div className="col-span-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer Name</div>
                  <div className="col-span-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Plan / Target (Amt)</div>
                  <div className="col-span-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actual (Amt)</div>
                  <div className="col-span-1"></div>
                </div>
                
                {group.customers.map((customer) => (
                  <div key={customer.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-3 bg-secondary/5 rounded-xl border border-border/30 group transition-all hover:border-border/60">
                    <div className="md:col-span-5">
                      <Label className="md:hidden text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Customer Name</Label>
                      <Input 
                        placeholder="Enter customer name" 
                        value={customer.customerName}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'customerName', e.target.value)}
                        className="bg-card border-border shadow-none h-10 font-bold"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="md:hidden text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Plan / Target (Amt)</Label>
                      <Input 
                        type="number" 
                        value={customer.targetAmount || ''}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'targetAmount', parseFloat(e.target.value) || 0)}
                        className="bg-card border-border shadow-none h-10 font-bold"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="md:hidden text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Actual (Amt)</Label>
                      <Input 
                        type="number" 
                        value={customer.actualAmount || ''}
                        onChange={(e) => updateCustomer(group.id, customer.id, 'actualAmount', parseFloat(e.target.value) || 0)}
                        className="bg-card border-border shadow-none h-10 font-bold"
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeCustomer(group.id, customer.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-10 w-10 rounded-lg"
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
