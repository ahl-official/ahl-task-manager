export type TimestampLike = {
  toDate(): Date;
  toMillis(): number;
};

export function timestamp(value?: string | Date | null): TimestampLike | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

export function nowTimestamp(): TimestampLike {
  return timestamp(new Date())!;
}

export function fromDate(date: Date): TimestampLike {
  return timestamp(date)!;
}

export function iso(value: TimestampLike | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toDate().toISOString();
}
