import { describe, expect, it } from 'vitest';
import { bandFromDocument } from '../setpoints';
import { defaultAnswers } from '@/generators/answers';
import { generateDocument } from '@/generators/compose';
import { templates } from '@/templates';
import type { EpJsonDocument } from '@/core/epjson/types';

const agenda = (...valores: number[]) => ({
  schedule_type_limits_name: 'Temperature',
  data: [
    { field: 'Through: 12/31' },
    { field: 'For: AllDays' },
    ...valores.flatMap((v) => [{ field: 'Until: 24:00' }, { field: v }]),
  ],
});

const doc = (aquecimento: unknown, resfriamento: unknown): EpJsonDocument => ({
  'ThermostatSetpoint:DualSetpoint': {
    T: {
      heating_setpoint_temperature_schedule_name: 'Aq',
      cooling_setpoint_temperature_schedule_name: 'Re',
    },
  },
  'Schedule:Compact': { Aq: aquecimento, Re: resfriamento },
} as unknown as EpJsonDocument);

describe('faixa lida do documento', () => {
  it('lê o par de setpoints constante', () => {
    expect(bandFromDocument(doc(agenda(18), agenda(26)))).toEqual({ min: 18, max: 26 });
  });

  /**
   * Com recuo noturno, cada agenda tem o valor ocupado e o de recuo. A faixa usa o
   * aquecimento mais alto e o resfriamento mais baixo — o par vigente quando há gente no
   * prédio. Usar os de recuo declararia confortável a madrugada em que ninguém está.
   */
  it('usa o par do período ocupado quando há recuo noturno', () => {
    expect(bandFromDocument(doc(agenda(16, 20, 16), agenda(28, 24, 28))))
      .toEqual({ min: 20, max: 24 });
  });

  it('funciona com o documento que o próprio assistente gera', () => {
    // Prova contra o gerador real, e não só contra um objeto montado no teste.
    const { document } = generateDocument(defaultAnswers(), templates);
    expect(bandFromDocument(document)).toEqual({ min: 18, max: 26 });
  });

  it('acompanha os setpoints escolhidos no assistente', () => {
    const answers = defaultAnswers();
    answers.hvac = { ...answers.hvac, heatingSetpoint: 20, coolingSetpoint: 24 };
    const { document } = generateDocument(answers, templates);
    expect(bandFromDocument(document)).toEqual({ min: 20, max: 24 });
  });
});

describe('quando não há faixa que se possa afirmar', () => {
  it('devolve indefinido sem termostato', () => {
    expect(bandFromDocument({} as EpJsonDocument)).toBeUndefined();
    expect(bandFromDocument({ 'ThermostatSetpoint:DualSetpoint': {} } as unknown as EpJsonDocument)).toBeUndefined();
  });

  it('devolve indefinido quando a agenda não existe ou não tem número', () => {
    expect(bandFromDocument(doc(undefined, agenda(26)))).toBeUndefined();
    expect(bandFromDocument(doc(agenda(), agenda(26)))).toBeUndefined();
    expect(bandFromDocument(doc({ data: 'não é lista' }, agenda(26)))).toBeUndefined();
  });

  /**
   * Faixa invertida não é faixa. Acontece se as agendas forem trocadas no Modo Especialista,
   * e classificar contra ela poria **todas** as horas fora — um resultado que parece medição
   * e é defeito de leitura.
   */
  it('devolve indefinido com a faixa invertida', () => {
    expect(bandFromDocument(doc(agenda(26), agenda(18)))).toBeUndefined();
    expect(bandFromDocument(doc(agenda(22), agenda(22)))).toBeUndefined();
  });
});
