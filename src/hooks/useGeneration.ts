import { useMemo } from 'react';
import { generateDocument } from '@/generators/compose';
import { templates } from '@/templates';
import { useWizardStore } from '@/store/wizardStore';
import { useSchemaStore } from '@/store/schemaStore';

/** Derived info about the wizard's current answers (zones, areas, chosen templates). */
export function useGeneration() {
  const answers = useWizardStore((s) => s.answers);
  const version = useSchemaStore((s) => s.version);
  return useMemo(() => generateDocument(answers, templates, version), [answers, version]);
}
