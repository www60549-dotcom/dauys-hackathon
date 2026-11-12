import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const formatDate = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', timeZone: 'Asia/Qyzylorda',
}).format(timestamp);
export const formatNumber = (value: number, decimals = 0) => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: decimals,
}).format(value);
export const DAY = 86_400_000;
