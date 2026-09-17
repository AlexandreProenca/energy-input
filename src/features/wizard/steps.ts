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
import type { WizardStepId } from '@/generators/answers';

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
  { id: 'geometry', title: 'Geometria', short: 'Geometria', question: 'Qual o tamanho do edifício?', icon: Box },
  { id: 'envelope', title: 'Paredes e cobertura', short: 'Envoltória', question: 'Como são construídas as paredes, a cobertura e o piso?', icon: Layers },
  { id: 'windows', title: 'Janelas', short: 'Janelas', question: 'Quanto das fachadas é de vidro, e que tipo de vidro?', icon: AppWindow },
  { id: 'loads', title: 'Uso do edifício', short: 'Uso', question: 'Para que o edifício é usado?', icon: Users },
  { id: 'hvac', title: 'Climatização', short: 'Climatização', question: 'Qual temperatura o ambiente deve manter?', icon: Fan },
  { id: 'outputs', title: 'Resultados', short: 'Resultados', question: 'Quais resultados você quer receber da simulação?', icon: FileBarChart },
  { id: 'review', title: 'Revisão e download', short: 'Revisão', question: 'Tudo pronto! Confira o resumo e baixe seu arquivo.', icon: ClipboardCheck },
];
