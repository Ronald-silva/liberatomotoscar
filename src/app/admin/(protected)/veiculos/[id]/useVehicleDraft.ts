'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveVehicle } from '../actions';
import type { FormState } from '../actions';
import { isStaleMessage, toFormMessage } from '../feedback';

/**
 * Dono único da versão, das pendências e da fila de escrita do rascunho.
 *
 * A tela grava sozinha e não tem botão de salvar. Como toda escrita exige a versão esperada e
 * incrementa a do veículo, as cópias de `version` espalhadas por `VehicleForms`, `PhotoUpload`,
 * `PhotoGallery` e `StatusActions` ficariam velhas na primeira gravação automática e a foto
 * seguinte seria recusada com "anúncio alterado". Revalidar a rota de detalhe a cada pausa seria
 * pior: reassinaria toda URL de foto e baixaria a galeria inteira enquanto a pessoa digita.
 *
 * Por isso a versão vive aqui, vinda do que a própria action devolve, e **toda** escrita passa
 * por `enqueue`: uma por vez, cada uma recebendo a versão que valia no instante em que começou.
 * Assim uma gravação no meio de uma fila de seis fotos não invalida o encadeamento.
 */

const DEBOUNCE_MS = 800;

// Os mesmos nomes que `saveVehicle` lê do FormData.
const FIELD_NAMES = ['brand', 'model', 'versionName', 'year', 'mileageKm', 'color', 'description', 'price'] as const;

export type DraftFieldName = (typeof FIELD_NAMES)[number];
export type DraftFields = Record<DraftFieldName, string>;

/** O mínimo que a fila precisa saber de uma escrita: a versão nova, quando houve uma. */
export type WriteResult = { message: string | null; version?: number; missing?: readonly string[] };

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type VehicleDraft = {
  fields: DraftFields;
  set: (name: DraftFieldName, value: string) => void;
  flush: () => void;
  retry: () => void;
  saveState: SaveState;
  message: string | null;
  isStale: boolean;
  missing: readonly string[];
  version: number;
  enqueue: <T extends WriteResult>(job: (version: number) => Promise<T>) => Promise<T>;
  photoAdded: () => void;
  photoRemoved: () => void;
  saveBeforeAction: () => Promise<boolean>;
};

type Request = 'debounced' | 'immediate';

const EMPTY: FormState = { message: null };

const differs = (a: DraftFields, b: DraftFields) => FIELD_NAMES.some((name) => a[name] !== b[name]);

export function useVehicleDraft({ vehicleId, initialVersion, initialFields, initialMissing, initialPhotoCount }: {
  vehicleId: string; initialVersion: number; initialFields: DraftFields; initialMissing: readonly string[]; initialPhotoCount?: number;
}): VehicleDraft {
  const [fields, setFields] = useState<DraftFields>(initialFields);
  const [version, setVersion] = useState(initialVersion);
  const [missing, setMissing] = useState(initialMissing);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Os refs são para a escrita seguinte ler o valor certo sem esperar re-render: a fila roda fora
  // do ciclo do React e o que um closure capturou chegaria velho.
  const fieldsRef = useRef(initialFields);
  // Base do "mudou algo?": o último retrato que o servidor confirmou. Só sucesso a move, então um
  // erro deixa o que foi digitado pendente e `retry()` tem o que gravar.
  const savedRef = useRef(initialFields);
  const versionRef = useRef(initialVersion);
  const photoCountRef = useRef(initialPhotoCount ?? (initialMissing.includes('Pelo menos uma foto') ? 0 : 1));
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gravação de dados na fila ou em voo, e o pedido que chegou enquanto ela corria.
  const writing = useRef(false);
  const again = useRef<Request | null>(null);
  const requestRef = useRef<(kind: Request) => void>(() => {});
  // A tela pode sair do ar com uma escrita em voo (voltar ao estoque): nada de mexer em estado
  // de componente desmontado quando a resposta chegar.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true; // o Strict Mode monta, desmonta e remonta: o efeito reabre a porta
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const apply = useCallback((result: WriteResult) => {
    if (result.version !== undefined) {
      versionRef.current = result.version;
      setVersion(result.version);
    }
    // Lista vazia significa "não falta nada"; ausente significa "sem informação" (a escrita
    // falhou, ou não foi um salvamento) — e aí o que já estava na tela continua valendo.
    if (result.missing !== undefined) setMissing(result.missing);
  }, []);

  const enqueue = useCallback(<T extends WriteResult>(job: (version: number) => Promise<T>): Promise<T> => {
    // Promessa encadeada: a próxima escrita só começa depois de a anterior terminar e guardar a
    // versão nova, que é justamente o que `job` recebe.
    const applied = queue.current.then(() => job(versionRef.current)).then((result) => {
      apply(result);
      return result;
    });
    // A fila não pode ficar rejeitada, ou uma falha de rede travaria todas as escritas seguintes.
    queue.current = applied.catch(() => undefined);
    return applied;
  }, [apply]);

  const arm = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      requestRef.current('debounced');
    }, DEBOUNCE_MS);
  }, []);

  const write = useCallback(async () => {
    writing.current = true;
    setSaveState('saving');
    setMessage(null);
    let ok = false;
    try {
      const result = await enqueue(async (atVersion) => {
        // O retrato é tirado na hora da escrita, não na hora do pedido: o que foi digitado
        // enquanto a fila andava vai nesta mesma gravação, em vez de pedir outra viagem.
        const snapshot = { ...fieldsRef.current };
        const data = new FormData();
        data.set('id', vehicleId);
        data.set('version', String(atVersion));
        for (const name of FIELD_NAMES) data.set(name, snapshot[name]);
        const state = await saveVehicle(EMPTY, data);
        // Sem versão nova a gravação não entrou — é o mesmo sinal que o envio de fotos já usa.
        if (state.version !== undefined) savedRef.current = snapshot;
        return state;
      });
      ok = result.version !== undefined;
      if (mounted.current) {
        setMessage(ok ? null : result.message);
        setSaveState(ok ? 'saved' : 'error');
      }
    } catch (error) {
      // Escrita que nem chegou ao servidor (celular sem rede) rejeita em vez de devolver estado.
      if (mounted.current) {
        setMessage(toFormMessage(error));
        setSaveState('error');
      }
    } finally {
      writing.current = false;
    }
    const pending = again.current;
    again.current = null;
    // Repetir depois de uma falha viraria tempestade de tentativas: o valor digitado fica em
    // `fields`, com `retry()` à mão, e quem decide tentar de novo é a pessoa.
    if (!ok || pending === null || !mounted.current) return;
    if (!differs(fieldsRef.current, savedRef.current)) return;
    if (pending === 'immediate') void requestRef.current('immediate');
    else arm(); // pedido por pausa na digitação: espera a pausa de novo, para não gravar a cada tecla
  }, [arm, enqueue, vehicleId]);

  const request = useCallback((kind: Request) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    // Escrita que não muda nada ainda custaria versão e viagem; e `updateVehicle` recusa um
    // formulário vazio. Quem só passou pelos campos sem digitar não grava.
    if (!differs(fieldsRef.current, savedRef.current)) return;
    if (writing.current) {
      // Uma escrita em voo por vez. O pedido fica anotado e a gravação atual o atende no fim;
      // "sair do campo" não cede lugar para "pausa na digitação".
      if (again.current !== 'immediate') again.current = kind;
      return;
    }
    void write();
  }, [write]);

  useEffect(() => { requestRef.current = request; }, [request]);

  const set = useCallback((name: DraftFieldName, value: string) => {
    fieldsRef.current = { ...fieldsRef.current, [name]: value };
    setFields(fieldsRef.current);
    arm();
  }, [arm]);

  const flush = useCallback(() => { requestRef.current('immediate'); }, []);

  const photoAdded = useCallback(() => {
    photoCountRef.current += 1;
    setMissing((current) => current.filter((item) => item !== 'Pelo menos uma foto'));
  }, []);
  const photoRemoved = useCallback(() => {
    photoCountRef.current = Math.max(0, photoCountRef.current - 1);
    if (photoCountRef.current === 0) setMissing((current) => current.includes('Pelo menos uma foto') ? current : [...current, 'Pelo menos uma foto']);
  }, []);

  // Publicar/arquivar só pode começar depois de qualquer campo pendente. O job entra na mesma
  // fila das fotos e lê o retrato na hora de executar, inclusive se a digitação ocorreu durante
  // um upload. Sem isto, o botão poderia publicar a versão anterior do anúncio.
  const saveBeforeAction = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    try {
      const result = await enqueue(async (atVersion) => {
        if (!differs(fieldsRef.current, savedRef.current)) return { message: null, version: atVersion };
        const snapshot = { ...fieldsRef.current };
        setSaveState('saving');
        const data = new FormData();
        data.set('id', vehicleId);
        data.set('version', String(atVersion));
        for (const name of FIELD_NAMES) data.set(name, snapshot[name]);
        const state = await saveVehicle(EMPTY, data);
        if (state.version !== undefined) savedRef.current = snapshot;
        setSaveState(state.version === undefined ? 'error' : 'saved');
        setMessage(state.version === undefined ? state.message : null);
        return state;
      });
      return result.version !== undefined && !differs(fieldsRef.current, savedRef.current);
    } catch (error) {
      setSaveState('error');
      setMessage(toFormMessage(error));
      return false;
    }
  }, [enqueue, vehicleId]);

  return {
    fields, set, flush, retry: flush, saveState, message,
    isStale: message !== null && isStaleMessage(message),
    missing, version, enqueue, photoAdded, photoRemoved, saveBeforeAction,
  };
}
