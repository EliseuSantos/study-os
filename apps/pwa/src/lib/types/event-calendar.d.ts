// Quarantined shim: @event-calendar/core ships no TypeScript types.
declare module '@event-calendar/core' {
  import type { Component } from 'svelte';

  export interface EcEvent {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    extendedProps: Record<string, unknown>;
  }

  export interface EcEventContentArg {
    event: EcEvent;
    timeText: string;
  }

  export interface EcEventClickArg {
    event: EcEvent;
    jsEvent: MouseEvent;
  }

  export interface EcDateClickArg {
    date: Date;
    jsEvent: MouseEvent;
  }

  export const Calendar: Component<{
    plugins: unknown[];
    options: Record<string, unknown>;
  }>;
  export const TimeGrid: unknown;
  export const DayGrid: unknown;
  export const List: unknown;
  export const Interaction: unknown;
}

declare module '@event-calendar/core/index.css';
