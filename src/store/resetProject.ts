import { defaultAnswers } from '@/generators/answers';
import { useExpertStore } from '@/features/expert/expertStore';
import { useGeometryUi } from '@/features/geometry/geometryStore';
import { useDocumentStore } from './documentStore';
import { useWizardStore } from './wizardStore';
import { useUiStore } from './uiStore';

/** Reset the editing session without changing the original uploaded document. */
export function resetProject() {
  const { origin } = useDocumentStore.getState();
  if (origin.kind === 'upload') {
    useDocumentStore.getState().reset(structuredClone(origin.doc), origin.fileName);
    useDocumentStore.setState((s) => ({ revision: s.revision + 1 }));
    useWizardStore.getState().hydrate({ answers: defaultAnswers(), owned: {}, linked: false });
  } else {
    useWizardStore.getState().startFresh(defaultAnswers());
  }
  useExpertStore.setState({ view: 'form', dirty: false, pendingNav: undefined, focusField: undefined, issuesOpen: false });
  useGeometryUi.setState((s) => ({ selection: undefined, hovered: undefined, levelZone: undefined,
    view: 'perspective', xray: false, showThickness: true, frameRequest: s.frameRequest + 1 }));
  useUiStore.setState({ mode: origin.kind === 'upload' ? 'expert' : 'basic',
    wizardStep: 'project', visitedSteps: ['project'], expertType: undefined, expertName: undefined });
}
