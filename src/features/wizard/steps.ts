import {
  Building2,
  CalendarRange,
  ClipboardCheck,
  FileBarChart,
  Fan,
  AppWindow,
  Layers,
  MapPin,
  Users,
  Box,
  type LucideIcon,
} from 'lucide-react';
import { PAGE_STEPS, WIZARD_PAGES, type WizardPageId, type WizardStepId } from '@/generators/answers';

export interface StepMeta {
  id: WizardStepId;
  title: string;
  short: string;
  question: string;
  icon: LucideIcon;
}

export const STEP_META: StepMeta[] = [
  { id: 'project', title: 'Projeto', short: 'Projeto', question: 'Vamos começar: como se chama o edifício e onde ele está implantado?', icon: Building2 },
  { id: 'location', title: 'Localização e clima', short: 'Clima', question: 'Em qual cidade fica o edifício?', icon: MapPin },
  { id: 'runPeriod', title: 'Período da simulação', short: 'Período', question: 'Qual período do ano você quer simular?', icon: CalendarRange },
  { id: 'geometry', title: 'Geometria', short: 'Geometria', question: 'Como é a planta dos ambientes?', icon: Box },
  { id: 'envelope', title: 'Materiais', short: 'Materiais', question: 'Quais materiais compõem a casa ou o apartamento?', icon: Layers },
  { id: 'windows', title: 'Janelas', short: 'Janelas', question: 'Quanto das fachadas é de vidro, e que tipo de vidro?', icon: AppWindow },
  { id: 'loads', title: 'Uso do edifício', short: 'Uso', question: 'Para que o edifício é usado?', icon: Users },
  { id: 'hvac', title: 'Climatização', short: 'Climatização', question: 'Qual temperatura o ambiente deve manter?', icon: Fan },
  { id: 'outputs', title: 'Resultados', short: 'Resultados', question: 'Quais resultados você quer receber da simulação?', icon: FileBarChart },
  { id: 'review', title: 'Revisão e download', short: 'Revisão', question: 'Tudo pronto! Confira o resumo e baixe seu arquivo.', icon: ClipboardCheck },
];

export interface PageMeta extends Omit<StepMeta, 'id'> {
  id: WizardPageId;
  /** Etapas de resposta mostradas na página, na ordem. */
  steps: readonly WizardStepId[];
}

/**
 * Títulos e perguntas das páginas. Página de uma etapa só reaproveita o texto da etapa; as
 * unidas têm pergunta própria, que cobre as duas.
 */
const UNIDAS: Partial<Record<WizardPageId, Pick<StepMeta, 'title' | 'short' | 'question'>>> = {
  project: { title: 'Projeto e clima', short: 'Projeto', question: 'Como se chama o edifício, e em qual cidade ele fica?' },
  envelope: { title: 'Materiais e janelas', short: 'Envoltória', question: 'Do que são feitas as paredes, e quanto das fachadas é de vidro?' },
  loads: { title: 'Uso e climatização', short: 'Uso', question: 'Para que o edifício é usado, e qual temperatura ele deve manter?' },
};

export const PAGE_META: PageMeta[] = WIZARD_PAGES.map((id) => {
  const etapa = STEP_META.find((m) => m.id === id)!;
  return { ...etapa, ...UNIDAS[id], id, steps: PAGE_STEPS[id] };
});
