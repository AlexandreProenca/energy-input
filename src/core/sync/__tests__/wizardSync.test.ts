import { describe, expect, it } from 'vitest';
import { planWizardSync } from '../wizardSync';

describe('planWizardSync', () => {
  const gen1 = { Zone: { A: { x_origin: 0 }, B: { x_origin: 1 } }, Building: { Casa: { north_axis: 0 } } };

  it('applies generation onto an empty document and tracks ownership', () => {
    const p = planWizardSync({}, gen1, {}, 'overwrite');
    expect(p.next).toEqual(gen1);
    expect(Object.keys(p.owned)).toHaveLength(3);
    expect(p.conflicts).toEqual([]);
  });

  it('replaces untouched objects, removes stale ones, keeps user objects', () => {
    const first = planWizardSync({}, gen1, {}, 'overwrite');
    const doc = { ...first.next, Material: { Meu: { thickness: 1 } } };
    const gen2 = { Zone: { A: { x_origin: 5 } }, Building: { Casa: { north_axis: 0 } } };
    const p = planWizardSync(doc, gen2, first.owned, 'overwrite');
    expect(p.next.Zone).toEqual({ A: { x_origin: 5 } });
    expect(p.next.Material).toEqual({ Meu: { thickness: 1 } });
    expect(p.conflicts).toEqual([]);
  });

  it('detects user edits and resolves keep/overwrite', () => {
    const first = planWizardSync({}, gen1, {}, 'overwrite');
    const edited = { ...first.next, Zone: { ...first.next.Zone, A: { x_origin: 0, multiplier: 2 } } };
    const gen2 = { Zone: { A: { x_origin: 3 }, B: { x_origin: 1 } }, Building: { Casa: { north_axis: 0 } } };

    const keep = planWizardSync(edited, gen2, first.owned, 'keep');
    expect(keep.conflicts).toEqual([{ type: 'Zone', name: 'A' }]);
    expect(keep.next.Zone.A).toEqual({ x_origin: 0, multiplier: 2 });
    // Still flagged as edited on the next run.
    expect(planWizardSync(keep.next, gen2, keep.owned, 'keep').conflicts).toHaveLength(1);

    const over = planWizardSync(edited, gen2, first.owned, 'overwrite');
    expect(over.next.Zone.A).toEqual({ x_origin: 3 });
    expect(planWizardSync(over.next, gen2, over.owned, 'keep').conflicts).toHaveLength(0);
  });

  it('does not ask about edited objects the wizard is not changing', () => {
    const first = planWizardSync({}, gen1, {}, 'overwrite');
    const edited = { ...first.next, Zone: { ...first.next.Zone, A: { x_origin: 0, multiplier: 2 } } };
    const gen2 = { ...gen1, Building: { Casa: { north_axis: 90 } } };
    const p = planWizardSync(edited, gen2, first.owned, 'overwrite');
    expect(p.conflicts).toEqual([]);
    expect(p.next.Zone.A).toEqual({ x_origin: 0, multiplier: 2 });
    expect(p.next.Building.Casa).toEqual({ north_axis: 90 });
  });

  it('keeps edited objects that are no longer generated', () => {
    const first = planWizardSync({}, gen1, {}, 'overwrite');
    const edited = { ...first.next, Zone: { ...first.next.Zone, B: { x_origin: 9 } } };
    const p = planWizardSync(edited, { Zone: { A: { x_origin: 0 } }, Building: gen1.Building }, first.owned, 'overwrite');
    expect(p.next.Zone.B).toEqual({ x_origin: 9 });
    expect(p.orphaned).toEqual([{ type: 'Zone', name: 'B' }]);
  });

  it('treats a user-created object with a generated name as a conflict', () => {
    const p = planWizardSync({ Zone: { A: { x_origin: 7 } } }, gen1, {}, 'keep');
    expect(p.conflicts).toEqual([{ type: 'Zone', name: 'A' }]);
    expect(p.next.Zone.A).toEqual({ x_origin: 7 });
  });
});
