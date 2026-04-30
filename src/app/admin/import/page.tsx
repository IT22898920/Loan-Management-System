'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { parseExcelFile, ExcelRow } from '@/lib/excel-parser';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

export default function ImportPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [imported, setImported] = useState(0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('parsing');
    setErrors([]);

    try {
      const parsed = await parseExcelFile(file);
      setRows(parsed);
      setStatus('preview');
      toast.success(`Parsed ${parsed.length} rows from Excel.`);
    } catch (err) {
      toast.error((err as Error).message);
      setStatus('idle');
    }
  }

  async function handleImport() {
    setStatus('importing');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated.'); return; }

    let successCount = 0;
    const importErrors: string[] = [];

    const { data: maxCenter } = await supabase
      .from('centers')
      .select('center_number')
      .order('center_number', { ascending: false })
      .limit(1)
      .single();
    let nextCenterNumber = (maxCenter?.center_number ?? 0) + 1;

    for (const row of rows) {
      try {
        let { data: center } = await supabase
          .from('centers')
          .select('id')
          .eq('name', row.center_name)
          .single();

        if (!center) {
          const { data: newCenter, error: cErr } = await supabase
            .from('centers')
            .insert({ name: row.center_name, center_number: nextCenterNumber++ })
            .select('id')
            .single();
          if (cErr) throw new Error(`Center creation failed: ${cErr.message}`);
          center = newCenter;
        }

        let { data: member } = await supabase
          .from('members')
          .select('id')
          .eq('member_number', row.member_number)
          .single();

        if (!member) {
          const { data: newMember, error: mErr } = await supabase
            .from('members')
            .insert({
              member_number: row.member_number,
              full_name: row.member_name,
              center_id: center!.id,
              created_by: user.id,
            })
            .select('id')
            .single();
          if (mErr) throw new Error(`Member creation failed for ${row.member_number}: ${mErr.message}`);
          member = newMember;
        }

        const weeklyMap: Record<number, number> = { 5000: 600, 10000: 1000, 20000: 2000 };

        const { data: existingLoan } = await supabase
          .from('loans')
          .select('id')
          .eq('member_id', member!.id)
          .eq('loan_plan', row.loan_type)
          .single();

        if (existingLoan) {
          // Update all key fields on existing loan (fixes wrong dates/weekly_payment from previous import)
          await supabase.from('loans').update({
            issued_date: row.issued_date,
            loan_balance: row.loan_balance,
            weekly_payment: weeklyMap[row.loan_type] ?? 0,
            status: row.loan_balance <= 0 ? 'completed' : 'active',
          }).eq('id', existingLoan.id);
        } else {
          await supabase.from('loans').insert({
            member_id: member!.id,
            loan_plan: row.loan_type,
            loan_balance: row.loan_balance,
            weekly_payment: weeklyMap[row.loan_type] ?? 0,
            issued_date: row.issued_date,
            status: row.loan_balance <= 0 ? 'completed' : 'active',
            is_first_loan: false,
            created_by: user.id,
          });
        }

        successCount++;
      } catch (err) {
        importErrors.push((err as Error).message);
      }
    }

    setImported(successCount);
    setErrors(importErrors);
    setStatus('done');

    if (importErrors.length === 0) {
      toast.success(`Successfully imported ${successCount} records!`);
    } else {
      toast.warning(`Imported ${successCount} records with ${importErrors.length} errors.`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Tools</p>
        <h1 className="text-2xl md:text-3xl font-bold">Excel Import</h1>
        <p className="text-blue-200 text-sm mt-1">Bulk import members and loans from your Excel sheet</p>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {/* Format guide */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Required Column Format</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your Excel file must have these columns in the header row</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Center Name', 'Loan Type', 'Member Number', 'Member Name', 'L Issued Date', 'L/B'].map((col) => (
              <span key={col} className="inline-flex items-center px-3 py-1 rounded-lg border border-gray-200 bg-gray-50 font-mono text-xs text-gray-700">
                {col}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Loan Type values: <strong>5000</strong>, <strong>10000</strong>, or <strong>20000</strong>. L/B = current loan balance.
          </p>
        </div>

        {/* Upload area */}
        {status === 'idle' && (
          <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 p-16 text-center hover:border-primary/40 transition-colors">
            <FileSpreadsheet className="h-14 w-14 text-gray-200 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700 mb-1">Upload Excel File</p>
            <p className="text-muted-foreground text-sm mb-6">.xlsx or .xls format supported</p>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors">
                <Upload className="h-4 w-4" /> Choose File
              </span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}

        {status === 'parsing' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-gray-600 font-medium">Parsing Excel file...</span>
          </div>
        )}

        {status === 'preview' && rows.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Preview — {rows.length} records</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Review before importing to the database</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setStatus('idle')}>Cancel</Button>
                <Button className="rounded-xl" onClick={handleImport}>
                  <Database className="h-4 w-4 mr-2" /> Import {rows.length} Records
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-gray-50/50 sticky top-0 border-b border-gray-100">
                  <tr>
                    {['Center', 'Loan Type', 'Member #', 'Member Name', 'Issued Date', 'L/B'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700">{row.center_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600">
                          {row.loan_type === 5000 ? '5K' : row.loan_type === 10000 ? '10K' : '20K'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-700">{row.member_number}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{row.member_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(row.issued_date)}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">Rs. {row.loan_balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-3">Showing first 100 of {rows.length} records</p>
              )}
            </div>
          </div>
        )}

        {status === 'importing' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-gray-600 font-medium">Importing records into database...</span>
          </div>
        )}

        {status === 'done' && (
          <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${errors.length === 0 ? 'border-green-200' : 'border-yellow-200'}`}>
            <div className={`px-5 py-4 ${errors.length === 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${errors.length === 0 ? 'bg-green-100' : 'bg-yellow-100'}`}>
                  <CheckCircle2 className={`h-5 w-5 ${errors.length === 0 ? 'text-green-600' : 'text-yellow-600'}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Import Complete</p>
                  <p className="text-sm text-muted-foreground">{imported} records imported successfully</p>
                </div>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="px-5 py-4 border-t border-yellow-100 space-y-2">
                <p className="font-medium text-red-700 flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4" /> {errors.length} error{errors.length !== 1 ? 's' : ''}
                </p>
                <div className="bg-red-50 rounded-xl p-3 max-h-32 overflow-y-auto text-xs space-y-1">
                  {errors.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                </div>
              </div>
            )}

            <div className="px-5 py-4 border-t border-gray-100">
              <Button className="rounded-xl" onClick={() => { setStatus('idle'); setRows([]); setErrors([]); }}>
                Import Another File
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
