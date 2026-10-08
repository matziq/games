import type { InputState } from './input/InputState';

declare global {
  interface Window {
    __aztecInput: InputState;
    __aztecGameEnd?: (gems: number, escaped: boolean) => void;
    __aztecSetRestartVisible?: (visible: boolean, label?: string) => void;
    GHScores?: {
      save: (game: string, key: string) => Promise<void>;
      load: (game: string, key: string, limit: number) => Promise<void>;
    };
  }
}

export {};
