import { useState, type ReactNode } from 'react';
import { CheckCircle2, Code2, Copy, Download, ExternalLink, Pencil, Play, Terminal, TriangleAlert, Wrench } from 'lucide-react';
import { byId, templates } from '@/templates';
import { WIZARD_STEPS, type WizardStepId } from '@/generators/answers';
import { locationDisplayName } from '@/generators/location';
import { useGeneration } from '@/hooks/useGeneration';
import { useValidation } from '@/hooks/useValidation';
import { useDocumentStore } from '@/store/documentStore';
import { useUiStore } from '@/store/uiStore';
import { useWizardStore } from '@/store/wizardStore';
import { countObjects } from '@/core/epjson/document';
import { exportCurrentDocument } from '@/lib/exportDocument';
import { safeFileName } from '@/lib/files';
import { Badge, Button, Callout, IconButton, fmt } from '@/ui/primitives';
import { useSimulationStore } from '@/features/simulation/simulationStore';
import { STEP_META } from '../steps';
import { JsonPreviewDialog } from '../JsonPreviewDialog';

const TERRAIN_LABEL = { Country: 'campo aberto', Suburbs: 'bairro residencial', City: 'cidade', Ocean: 'litoral', Urban: 'centro urbano denso' };
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function SummaryRow({ step, children }: { step: WizardStepId; children: ReactNode }) {
  const meta = STEP_META[WIZARD_STEPS.indexOf(step)];
  const Icon = meta.icon;
  const goTo = useUiStore((s) => s.goToStep);
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{meta.title}</p>
        <p className="text-sm leading-relaxed text-slate-700">{children}</p>
      </div>
      <IconButton label={`Editar ${meta.title}`} onClick={() => goTo(step)}>
        <Pencil size={15} />
      </IconButton>
    </li>
  );
}

export function ReviewStep() {
  const a = useWizardStore((s) => s.answers);
  const { info } = useGeneration();
  const doc = useDocumentStore((s) => s.doc);
  const validation = useValidation();
  const setMode = useUiStore((s) => s.setMode);
  const toast = useUiStore((s) => s.toast);
  const [jsonOpen, setJsonOpen] = useState(false);

  const preset = info.preset;
  const glazing = byId(templates.glazing, a.windows.glazingId);
  const outputs = templates.outputs.filter((o) => a.outputs.selected.includes(o.id)).map((o) => o.label.toLowerCase());
  const fileName = safeFileName(a.project.buildingName);
  const epw = info.location.kind === 'city' ? info.location.epwFileName : info.location.epwFileName ?? 'clima.epw';
  const command = a.runPeriod.mode === 'designDays' ? `energyplus -d resultados ${fileName}` : `energyplus -w ${epw} -d resultados ${fileName}`;
  const wwrText =
    a.windows.mode === 'uniform'
      ? `${a.windows.wwr}% em todas as fachadas`
      : `N ${a.windows.perFacade.north}% · L ${a.windows.perFacade.east}% · S ${a.windows.perFacade.south}% · O ${a.windows.perFacade.west}%`;

  return (
    <div className="space-y-6">
      {validation.errors === 0 ? (
        <Callout tone="success" icon={<CheckCircle2 size={18} />} title="Arquivo válido">
          {countObjects(doc)} objetos conferidos com o schema oficial do EnergyPlus {doc.Version ? Object.values(doc.Version)[0]?.version_identifier as string : ''}
          {validation.warnings > 0 ? ` · ${validation.warnings} aviso(s) de referência — veja no modo especialista.` : ', sem referências quebradas.'}
        </Callout>
      ) : (
        <Callout tone="error" icon={<TriangleAlert size={18} />} title={`${validation.errors} erro(s) de validação`}>
          Provavelmente vêm de edições feitas no modo especialista.
          <Button size="sm" className="ml-2" onClick={() => setMode('expert')}>
            Ver erros
          </Button>
        </Callout>
      )}

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
        <SummaryRow step="project">
          <strong>{a.project.buildingName || 'Edifício'}</strong>, em entorno de {TERRAIN_LABEL[a.project.terrain]}, girado {fmt(a.project.northAxis)}° em relação ao norte.
        </SummaryRow>
        <SummaryRow step="location">
          {locationDisplayName(info.location)} (lat. {fmt(info.location.latitude, 2)}°, alt. {fmt(info.location.elevation, 0)} m) · zona bioclimática {a.location.zb} · dias de projeto
          de {fmt(info.location.designDays.heating.data.maximum_dry_bulb_temperature as number)} °C e {fmt(info.location.designDays.cooling.data.maximum_dry_bulb_temperature as number)} °C.
        </SummaryRow>
        <SummaryRow step="runPeriod">
          {a.runPeriod.mode === 'year'
            ? 'Ano completo (1º de janeiro a 31 de dezembro).'
            : a.runPeriod.mode === 'range'
              ? `De ${a.runPeriod.beginDay}/${MONTHS[a.runPeriod.beginMonth - 1]} a ${a.runPeriod.endDay}/${MONTHS[a.runPeriod.endMonth - 1]}.`
              : 'Apenas os dias de projeto (sem arquivo climático).'}
        </SummaryRow>
        <SummaryRow step="geometry">
          {a.geometry.mode === 'plan' ? `Planta com ${a.geometry.rooms?.length ?? 0} ambiente(s) por pavimento` : `Caixa de ${fmt(a.geometry.width)} × ${fmt(a.geometry.depth)} m`} com {a.geometry.floors} pavimento(s) de {fmt(a.geometry.floorHeight)} m ({fmt(info.totalFloorArea, 0)} m² no total), piso
          térreo {a.geometry.groundFloor === 'slab' ? 'apoiado no solo' : a.geometry.groundFloor === 'adjacent' ? 'sobre outro pavimento (adiabático)' : 'elevado'} e {a.geometry.topFloor === 'adjacent' ? 'teto sob outro pavimento (adiabático)' : 'cobertura plana'}.
        </SummaryRow>
        <SummaryRow step="envelope">
          Construção <strong>{preset.label.toLowerCase()}</strong>: {preset.assemblies.wall.label.toLowerCase()}; {preset.assemblies.roof.label.toLowerCase()}. Fachadas de cor{' '}
          {byId(templates.surfaceColors, a.envelope.wallColorId).label.toLowerCase()}.
        </SummaryRow>
        <SummaryRow step="windows">
          {a.windows.automatic ? `${glazing.label} · ${wwrText} (${fmt(info.totalWindowArea)} m² de vidro).` : 'Sem aberturas automáticas. Portas e janelas são definidas pelo usuário no editor 3D.'}
        </SummaryRow>
        <SummaryRow step="loads">
          Uso <strong>{info.use.label.toLowerCase()}</strong>: {fmt(1 / info.use.peoplePerArea, 0)} m²/pessoa, iluminação {fmt(info.use.lightingPowerDensity)} W/m², equipamentos{' '}
          {fmt(info.use.equipmentPowerDensity)} W/m².
        </SummaryRow>
        <SummaryRow step="hvac">
          Sistema ideal: aquece abaixo de {fmt(a.hvac.heatingSetpoint)} °C e resfria acima de {fmt(a.hvac.coolingSetpoint)} °C
          {a.hvac.setbackEnabled ? ', com controle afrouxado fora do horário de uso.' : ', o tempo todo.'}
        </SummaryRow>
        <SummaryRow step="outputs">Relatório resumido{outputs.length ? ` + ${outputs.join(', ')}` : ''}.</SummaryRow>
      </ul>

      <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={() => useSimulationStore.getState().setOpen(true)}>Simular modelo na API</Button>
      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="primary" size="lg" icon={<Download size={18} />} onClick={() => exportCurrentDocument(fileName)}>
          Baixar .epJSON
        </Button>
        <Button size="lg" icon={<Code2 size={18} />} onClick={() => setJsonOpen(true)}>
          Ver epJSON
        </Button>
        <Button size="lg" icon={<Wrench size={18} />} onClick={() => setMode('expert')}>
          Abrir no modo especialista
        </Button>
      </div>

      <div className="rounded-2xl bg-slate-900 p-5 text-slate-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Terminal size={16} /> Como rodar localmente (opcional)
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Instale o{' '}
            <a className="font-medium text-brand-300 underline" href="https://energyplus.net/downloads" target="_blank" rel="noreferrer">
              EnergyPlus 26.1 <ExternalLink size={12} className="inline" />
            </a>
            .
          </li>
          {a.runPeriod.mode !== 'designDays' && (
            <li>
              Baixe o arquivo climático <strong className="text-white">{epw}</strong>
              {info.location.kind === 'city' && (
                <>
                  {' '}
                  (
                  <a className="text-brand-300 underline" href={info.location.downloadUrl} target="_blank" rel="noreferrer">
                    link
                  </a>
                  , descompacte o .zip)
                </>
              )}{' '}
              e coloque na mesma pasta do modelo.
            </li>
          )}
          <li>No terminal, dentro dessa pasta, rode:</li>
        </ol>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2 font-mono text-xs">
          <code className="flex-1 overflow-x-auto whitespace-nowrap">{command}</code>
          <button
            type="button"
            aria-label="Copiar comando"
            className="text-slate-400 hover:text-white"
            onClick={() => void navigator.clipboard.writeText(command).then(() => toast('Comando copiado.'))}
          >
            <Copy size={14} />
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Os resultados ficam em <code>resultados/eplustbl.htm</code>. <Badge tone="slate">Execução local no seu computador.</Badge>
        </p>
      </div>
      <JsonPreviewDialog open={jsonOpen} onClose={() => setJsonOpen(false)} />
    </div>
  );
}
