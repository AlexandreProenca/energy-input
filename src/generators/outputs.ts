import type { EpJsonFragment } from '@/core/epjson/types';
import { mergeFragments } from '@/core/epjson/document';
import type { TemplateLibrary } from '@/templates';
import type { WizardAnswers } from './answers';

/** Step 9 — reports. The summary tables are always included. */
export function generateOutputs(o: WizardAnswers['outputs'], lib: TemplateLibrary): EpJsonFragment {
  const base: EpJsonFragment = {
    'Output:VariableDictionary': { 'Output:VariableDictionary 1': { key_field: 'IDF', sort_option: 'Name' } },
    'Output:Table:SummaryReports': { 'Output:Table:SummaryReports 1': { reports: [{ report_name: 'AllSummary' }] } },
    'OutputControl:Table:Style': { 'OutputControl:Table:Style 1': { column_separator: 'HTML', unit_conversion: 'JtoKWH' } },
  };
  const chosen = lib.outputs.filter((p) => o.selected.includes(p.id)).map((p) => structuredClone(p.objects));
  return mergeFragments(base, ...chosen);
}
