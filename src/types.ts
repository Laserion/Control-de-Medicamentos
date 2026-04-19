export interface Medication {
  id: string;
  name: string;
  dose: string; // e.g. "1 comprimido"
  dosePerHour: number; // e.g. 8 (every 8 hours)
  price: number;
  laboratory: string;
  pharmacy: string;
  acquisitionDate: string; // ISO string
  remainingQuantity: number; // units (e.g. pills)
  isPRN?: boolean; // Pro re nata (as needed/a demanda)
}

export interface MedicationWithCalc extends Medication {
  dosesPerDay: number;
  daysRemaining: number;
  replenishmentDate: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  action: 'added' | 'deleted' | 'replenished';
  medicationName: string;
  details: string;
}

export type AppTab = 'inventario' | 'cronograma' | 'historial' | 'configuracion';
