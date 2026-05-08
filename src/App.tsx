/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ExternalLink, Pill, Calendar as CalendarIcon, AlertCircle, Search, RefreshCw, History, Settings, LayoutDashboard, Clock, FileDown, Download, CheckCircle2, Circle } from 'lucide-react';
import { format, addDays, parseISO, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Medication, MedicationWithCalc, LogEntry, AppTab } from './types';

const STORAGE_KEY = 'medcontrol_medications';
const LOGS_KEY = 'medcontrol_logs';
const APP_VERSION = '1.4.0';

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('inventario');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isReplenishDialogOpen, setIsReplenishDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [newMed, setNewMed] = useState<Partial<Medication>>({
    name: '',
    dose: '',
    dosePerHour: 8,
    price: 0,
    laboratory: '',
    pharmacy: '',
    acquisitionDate: new Date().toISOString(),
    remainingQuantity: 0,
    isPRN: false,
  });

  const [replenishMed, setReplenishMed] = useState<Partial<Medication>>({});

  // Load from localStorage
  useEffect(() => {
    const savedMeds = localStorage.getItem(STORAGE_KEY);
    const savedLogs = localStorage.getItem(LOGS_KEY);
    if (savedMeds) {
      try {
        setMedications(JSON.parse(savedMeds));
      } catch (e) {
        console.error('Error loading medications', e);
      }
    }
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs));
      } catch (e) {
        console.error('Error loading logs', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(medications));
  }, [medications]);

  useEffect(() => {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [logs]);

  const addLog = (action: LogEntry['action'], medicationName: string, details: string) => {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      medicationName,
      details,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  const processedMedications = useMemo(() => {
    const now = new Date();
    return medications.map(med => {
      let estimatedQuantity = med.remainingQuantity;
      
      if (!med.isPRN && med.dosePerHour > 0) {
        const hoursPassed = differenceInHours(now, parseISO(med.acquisitionDate));
        const dosesTaken = Math.floor(hoursPassed / med.dosePerHour);
        estimatedQuantity = Math.max(0, med.remainingQuantity - dosesTaken);
      }

      const dosesPerDay = med.isPRN ? 0 : 24 / med.dosePerHour;
      const daysRemaining = med.isPRN ? Infinity : estimatedQuantity / dosesPerDay;
      const replenishmentDate = med.isPRN 
        ? new Date(8640000000000000).toISOString() // Far future for PRN
        : addDays(now, daysRemaining).toISOString();
      
      return {
        ...med,
        dosesPerDay,
        daysRemaining,
        replenishmentDate,
        estimatedQuantity,
      } as MedicationWithCalc;
    }).filter(med => 
      med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.laboratory.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [medications, searchTerm]);

  const handleAddMedication = () => {
    if (!newMed.name || !newMed.dose || (!newMed.isPRN && !newMed.dosePerHour) || newMed.remainingQuantity === undefined) {
      toast.error('Por favor completa los campos obligatorios');
      return;
    }

    const med: Medication = {
      id: crypto.randomUUID(),
      name: newMed.name!,
      dose: newMed.dose!,
      dosePerHour: newMed.isPRN ? 0 : Number(newMed.dosePerHour),
      price: Number(newMed.price) || 0,
      laboratory: newMed.laboratory || 'N/A',
      pharmacy: newMed.pharmacy || 'N/A',
      acquisitionDate: newMed.acquisitionDate || new Date().toISOString(),
      remainingQuantity: Number(newMed.remainingQuantity),
      isPRN: !!newMed.isPRN,
    };

    setMedications([...medications, med]);
    addLog('added', med.name, `Añadido con ${med.remainingQuantity} unidades.`);
    setIsAddDialogOpen(false);
    setNewMed({
      name: '',
      dose: '',
      dosePerHour: 8,
      price: 0,
      laboratory: '',
      pharmacy: '',
      acquisitionDate: new Date().toISOString(),
      remainingQuantity: 0,
      isPRN: false,
    });
    toast.success('Medicamento añadido correctamente');
  };

  const togglePRN = (id: string) => {
    setMedications(medications.map(m => {
      if (m.id === id) {
        const newStatus = !m.isPRN;
        addLog('replenished', m.name, `Control cambiado a ${newStatus ? 'A Demanda' : 'Frecuencia Fija'}.`);
        return { ...m, isPRN: newStatus, dosePerHour: newStatus ? 0 : (m.dosePerHour || 8) };
      }
      return m;
    }));
    toast.info('Modo de control actualizado');
  };

  const handleTakeDose = (id: string) => {
    setMedications(medications.map(m => {
      if (m.id === id) {
        const newQuantity = Math.max(0, m.remainingQuantity - 1);
        addLog('replenished', m.name, `Se descontó 1 dosis manualmente. Restan ${newQuantity} unidades.`);
        return { 
          ...m, 
          remainingQuantity: newQuantity,
          // If we manually take a dose, we don't necessarily update acquisitionDate 
          // because the automatic calculation would shift.
          // Actually, for PRN it's fine. For Fixed Frequency, it resets the "timer" for auto-deduction.
          acquisitionDate: new Date().toISOString() 
        };
      }
      return m;
    }));
    toast.success('Dosis registrada');
  };

  const handleSyncStock = (id: string, estimated: number) => {
    setMedications(medications.map(m => {
      if (m.id === id) {
        addLog('replenished', m.name, `Stock sincronizado. Se estableció en ${estimated} unidades.`);
        return { 
          ...m, 
          remainingQuantity: estimated,
          acquisitionDate: new Date().toISOString() 
        };
      }
      return m;
    }));
    toast.success('Inventario sincronizado');
  };

  const handleDeleteMedication = (id: string) => {
    const med = medications.find(m => m.id === id);
    if (med) {
      setMedications(medications.filter(m => m.id !== id));
      addLog('deleted', med.name, 'Medicamento eliminado del inventario.');
      toast.info('Medicamento eliminado');
    }
  };

  const handleReplenish = () => {
    if (!replenishMed.id || replenishMed.remainingQuantity === undefined) return;

    setMedications(medications.map(m => {
      if (m.id === replenishMed.id) {
        return {
          ...m,
          remainingQuantity: Number(replenishMed.remainingQuantity),
          price: Number(replenishMed.price) || m.price,
          acquisitionDate: new Date().toISOString(),
        };
      }
      return m;
    }));

    addLog('replenished', replenishMed.name || 'Desconocido', `Repuesto a ${replenishMed.remainingQuantity} unidades.`);
    setIsReplenishDialogOpen(false);
    toast.success('Estado reiniciado correctamente');
  };

  const openKairos = () => {
    window.open('https://arg.kairosweb.com', '_blank', 'noopener,noreferrer');
  };

  const exportToExcel = () => {
    const headers = ['Nombre', 'Dosis', 'Frecuencia (Horas)', 'Restante', 'Precio', 'Laboratorio', 'Farmacia', 'Adquisición', 'Modo'];
    const rows = medications.map(m => [
      m.name,
      m.dose,
      m.isPRN ? 'A Demanda' : `${m.dosePerHour}h`,
      m.remainingQuantity,
      m.price,
      m.laboratory,
      m.pharmacy,
      format(parseISO(m.acquisitionDate), "yyyy-MM-dd"),
      m.isPRN ? 'Ocasional' : 'Fijo'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `MedControl_Export_${format(new Date(), "yyyyMMdd")}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Datos exportados a CSV (Excel)');
  };

  const exportToText = () => {
    let content = `MEDCONTROL+ - REPORTE DE INVENTARIO\n`;
    content += `Fecha: ${format(new Date(), "PPP", { locale: es })}\n`;
    content += `------------------------------------------\n\n`;

    medications.forEach((m, i) => {
      content += `${i + 1}. ${m.name}\n`;
      content += `   Dosis: ${m.dose}\n`;
      content += `   Frecuencia: ${m.isPRN ? 'A Demanda' : `Cada ${m.dosePerHour} horas`}\n`;
      content += `   Restante: ${m.remainingQuantity} unidades\n`;
      content += `   Laboratorio: ${m.laboratory}\n`;
      content += `   Precio: $${m.price}\n`;
      content += `   Última Adq: ${format(parseISO(m.acquisitionDate), "dd/MM/yyyy")}\n`;
      content += `------------------------------------------\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `MedControl_Reporte_${format(new Date(), "yyyyMMdd")}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Reporte generado en texto');
  };

  const medicationsByAgotarse = medications.filter(m => {
    const now = new Date();
    let estimatedQuantity = m.remainingQuantity;
    if (!m.isPRN && m.dosePerHour > 0) {
      const hoursPassed = differenceInHours(now, parseISO(m.acquisitionDate));
      const dosesTaken = Math.floor(hoursPassed / m.dosePerHour);
      estimatedQuantity = Math.max(0, m.remainingQuantity - dosesTaken);
    }

    if (m.isPRN) return estimatedQuantity < 5; 
    const dosesPerDay = 24 / m.dosePerHour;
    const daysRemaining = estimatedQuantity / dosesPerDay;
    return daysRemaining < 3;
  }).length;

  const nextReplenishment = useMemo(() => {
    const scheduledMeds = processedMedications.filter(m => !m.isPRN);
    if (scheduledMeds.length === 0) return null;
    return [...scheduledMeds].sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  }, [processedMedications]);

  const totalMonthlyExpense = medications.reduce((acc, med) => acc + (med.price || 0), 0);

  return (
    <div className="flex h-screen bg-bg text-text-main font-sans overflow-hidden">
      {/* Sidebar */}
      <nav className="w-64 bg-white border-r border-border p-8 flex flex-col gap-8 shrink-0">
        <div className="flex items-center gap-2 text-[22px] font-bold text-primary tracking-tighter mb-5">
          <Pill className="w-6 h-6" />
          MedControl<span className="font-light">+</span>
        </div>
        <div className="flex flex-col gap-1">
          <button 
            onClick={() => setActiveTab('inventario')}
            className={cn("nav-item flex items-center gap-3", activeTab === 'inventario' && "active")}
          >
            <LayoutDashboard className="w-4 h-4" />
            Inventario
          </button>
          <button 
            onClick={() => setActiveTab('cronograma')}
            className={cn("nav-item flex items-center gap-3", activeTab === 'cronograma' && "active")}
          >
            <Clock className="w-4 h-4" />
            Cronograma
          </button>
          <button 
            onClick={() => setActiveTab('historial')}
            className={cn("nav-item flex items-center gap-3", activeTab === 'historial' && "active")}
          >
            <History className="w-4 h-4" />
            Historial
          </button>
          <button 
            onClick={() => setActiveTab('configuracion')}
            className={cn("nav-item flex items-center gap-3", activeTab === 'configuracion' && "active")}
          >
            <Settings className="w-4 h-4" />
            Configuración
          </button>
        </div>
        
        <div className="mt-auto space-y-4">
          <Button 
            variant="outline" 
            onClick={openKairos}
            className="w-full border-primary text-primary hover:bg-primary/5 font-semibold"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Consultar Kairos
          </Button>
          <div className="text-[10px] text-text-sec text-center uppercase tracking-widest font-bold opacity-50">
            Version {APP_VERSION}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-10 flex flex-col gap-6 overflow-y-auto">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold capitalize">
              {activeTab === 'inventario' ? 'Mi Inventario' : 
               activeTab === 'cronograma' ? 'Cronograma de Reposición' : 
               activeTab === 'historial' ? 'Historial de Actividad' : 
               'Configuración'}
            </h1>
            <p className="text-text-sec text-sm">
              {activeTab === 'inventario' && `Control actual de ${medications.length} medicamentos`}
              {activeTab === 'cronograma' && 'Ordenado por urgencia de reposición'}
              {activeTab === 'historial' && 'Registro de las últimas acciones realizadas'}
              {activeTab === 'configuracion' && 'Ajustes y detalles del sistema'}
            </p>
          </div>
          
          {activeTab === 'inventario' && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger render={<Button className="bg-primary hover:bg-primary/90 text-white font-semibold px-5" />}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Medicamento
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Nuevo Medicamento</DialogTitle>
                  <DialogDescription>
                    Ingresa los detalles del medicamento para realizar el seguimiento.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Tipo de Control</Label>
                    <div className="col-span-3 flex items-center gap-4">
                      <Button
                        type="button"
                        variant={newMed.isPRN ? "outline" : "default"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setNewMed({...newMed, isPRN: false})}
                      >
                        Frecuencia Fija
                      </Button>
                      <Button
                        type="button"
                        variant={newMed.isPRN ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setNewMed({...newMed, isPRN: true, dosePerHour: 0})}
                      >
                        A Demanda
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Nombre</Label>
                    <Input 
                      id="name" 
                      className="col-span-3" 
                      value={newMed.name} 
                      onChange={e => setNewMed({...newMed, name: e.target.value})}
                      placeholder="Ej: Ibuprofeno"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="dose" className="text-right">Dosis</Label>
                    <Input 
                      id="dose" 
                      className="col-span-3" 
                      value={newMed.dose} 
                      onChange={e => setNewMed({...newMed, dose: e.target.value})}
                      placeholder="Ej: 1 comprimido 600mg"
                    />
                  </div>
                  {!newMed.isPRN && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="dosePerHour" className="text-right">Frecuencia</Label>
                      <div className="col-span-3 flex items-center gap-2">
                        <Input 
                          id="dosePerHour" 
                          type="number"
                          value={newMed.dosePerHour} 
                          onChange={e => setNewMed({...newMed, dosePerHour: Number(e.target.value)})}
                        />
                        <span className="text-xs text-text-sec whitespace-nowrap">horas</span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="remaining" className="text-right">Cantidad Restante</Label>
                    <Input 
                      id="remaining" 
                      type="number"
                      className="col-span-3" 
                      value={newMed.remainingQuantity} 
                      onChange={e => setNewMed({...newMed, remainingQuantity: Number(e.target.value)})}
                      placeholder="Unidades totales"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="price" className="text-right">Precio</Label>
                    <Input 
                      id="price" 
                      type="number"
                      className="col-span-3" 
                      value={newMed.price} 
                      onChange={e => setNewMed({...newMed, price: Number(e.target.value)})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="lab" className="text-right">Laboratorio</Label>
                    <Input 
                      id="lab" 
                      className="col-span-3" 
                      value={newMed.laboratory} 
                      onChange={e => setNewMed({...newMed, laboratory: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="pharmacy" className="text-right">Farmacia</Label>
                    <Input 
                      id="pharmacy" 
                      className="col-span-3" 
                      value={newMed.pharmacy} 
                      onChange={e => setNewMed({...newMed, pharmacy: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Fecha Adq.</Label>
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            variant={"outline"}
                            className={cn(
                              "col-span-3 justify-start text-left font-normal",
                              !newMed.acquisitionDate && "text-muted-foreground"
                            )}
                          />
                        }
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newMed.acquisitionDate ? format(parseISO(newMed.acquisitionDate), "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newMed.acquisitionDate ? parseISO(newMed.acquisitionDate) : undefined}
                          onSelect={(date) => setNewMed({...newMed, acquisitionDate: date?.toISOString()})}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={handleAddMedication} className="bg-primary hover:bg-primary/90">Guardar Medicamento</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'inventario' && (
            <motion.div 
              key="inventario"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Stats Row */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="stat-card">
                  <p className="text-[12px] text-text-sec uppercase tracking-wider font-bold">Por Agotarse</p>
                  <p className="text-[28px] font-bold mt-2 text-danger">{medicationsByAgotarse}</p>
                </div>
                <div className="stat-card">
                  <p className="text-[12px] text-text-sec uppercase tracking-wider font-bold">Próxima Reposición</p>
                  <p className="text-[20px] font-bold mt-2">
                    {nextReplenishment 
                      ? `${format(parseISO(nextReplenishment.replenishmentDate), "dd MMM", { locale: es })} (${nextReplenishment.name})`
                      : "N/A"}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="text-[12px] text-text-sec uppercase tracking-wider font-bold">Gasto Total Est.</p>
                  <p className="text-[28px] font-bold mt-2">${totalMonthlyExpense.toLocaleString('es-AR')}</p>
                </div>
              </section>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sec w-4 h-4" />
                <Input 
                  placeholder="Buscar por nombre o laboratorio..." 
                  className="pl-10 bg-white border-border focus-visible:ring-primary"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Meds Container */}
              <section className="bg-white rounded-xl border border-border flex flex-col overflow-hidden shadow-sm">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_140px] px-6 py-4 border-b-2 border-bg text-[11px] uppercase text-text-sec font-bold">
                  <span>Medicamento / Laboratorio</span>
                  <span>Dosis</span>
                  <span>Adquirido</span>
                  <span>Stock Actual</span>
                  <span>Precio</span>
                  <span>Estado</span>
                  <span className="text-right">Acciones</span>
                </div>

                <div className="flex flex-col">
                  <AnimatePresence mode="popLayout">
                    {processedMedications.length === 0 ? (
                      <div className="p-10 text-center text-text-sec text-sm">
                        No se encontraron medicamentos.
                      </div>
                    ) : (
                      processedMedications.map((med) => (
                        <motion.div
                          key={med.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_140px] px-6 py-4 border-b border-border items-center text-[13px] hover:bg-bg/30 transition-colors"
                        >
                          <div>
                            <span className="font-semibold text-text-main block">{med.name}</span>
                            <span className="text-[11px] text-text-sec block">{med.laboratory} - {med.pharmacy}</span>
                          </div>
                          <span>{med.dose} / {med.isPRN ? 'S.O.S' : `${med.dosePerHour}h`}</span>
                          <span>{format(parseISO(med.acquisitionDate), "dd/MM/yy")}</span>
                          <div className="flex flex-col">
                            <span className="font-bold text-primary">{Math.floor(med.estimatedQuantity)} uds.</span>
                            {med.estimatedQuantity !== med.remainingQuantity && (
                              <span className="text-[10px] text-text-sec line-through">Nominal: {med.remainingQuantity}</span>
                            )}
                          </div>
                          <span>${med.price.toLocaleString('es-AR')}</span>
                          <div>
                            <span className={cn(
                              "status-pill",
                              med.isPRN 
                                ? (med.estimatedQuantity < 5 ? "status-alert" : "status-ok")
                                : (med.daysRemaining < 3 ? "status-alert" : med.daysRemaining < 7 ? "status-warn" : "status-ok")
                            )}>
                              {med.isPRN 
                                ? (med.estimatedQuantity < 5 ? "Stock Mínimo" : "Uso Ocasional")
                                : (med.daysRemaining < 3 
                                    ? `Reponer en ${Math.ceil(med.daysRemaining)} días` 
                                    : med.daysRemaining < 7 ? "Bajo stock" : "Suficiente")}
                            </span>
                          </div>
                          <div className="text-right flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                              onClick={() => handleTakeDose(med.id)}
                              title="Registrar toma de 1 dosis"
                            >
                              <Pill className="w-3.5 h-3.5" />
                            </Button>
                            {med.estimatedQuantity !== med.remainingQuantity && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-green-600 hover:bg-green-50"
                                onClick={() => handleSyncStock(med.id, med.estimatedQuantity)}
                                title="Sincronizar stock real con estimado"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className={cn("h-8 w-8", med.isPRN ? "text-primary" : "text-text-sec")}
                              onClick={() => togglePRN(med.id)}
                              title={med.isPRN ? "Cambiar a Control con Horario" : "Cambiar a Control a Demanda"}
                            >
                              {med.isPRN ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                              onClick={() => {
                                setReplenishMed(med);
                                setIsReplenishDialogOpen(true);
                              }}
                              title="Reiniciar estado / Reponer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-text-sec hover:text-danger hover:bg-danger/10"
                              onClick={() => handleDeleteMedication(med.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>

                <div className="p-5 text-center text-text-sec text-[13px] border-t border-border">
                  Mostrando {processedMedications.length} de {medications.length} medicamentos.
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'cronograma' && (
            <motion.div 
              key="cronograma"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...processedMedications].sort((a, b) => a.daysRemaining - b.daysRemaining).map(med => (
                  <Card key={med.id} className={cn("border-none shadow-sm", med.daysRemaining < 3 ? "bg-red-50" : "bg-white")}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{med.name}</CardTitle>
                        <span className={cn(
                          "status-pill",
                          med.daysRemaining < 3 ? "status-alert" : med.daysRemaining < 7 ? "status-warn" : "status-ok"
                        )}>
                          {Math.ceil(med.daysRemaining)} días
                        </span>
                      </div>
                      <CardDescription>{med.laboratory}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-sec">Reposición:</span>
                          <span className="font-semibold">{format(parseISO(med.replenishmentDate), "PPP", { locale: es })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-sec">Restante:</span>
                          <span className="font-medium">{med.remainingQuantity} unidades</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'historial' && (
            <motion.div 
              key="historial"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-xl border border-border overflow-hidden shadow-sm"
            >
              <Table>
                <TableHeader className="bg-bg/50">
                  <TableRow>
                    <TableHead>Fecha y Hora</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Medicamento</TableHead>
                    <TableHead>Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-text-sec">
                        No hay actividad registrada aún.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-text-sec">
                          {format(parseISO(log.timestamp), "Pp", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            log.action === 'added' && "bg-blue-100 text-blue-700",
                            log.action === 'deleted' && "bg-red-100 text-red-700",
                            log.action === 'replenished' && "bg-green-100 text-green-700"
                          )}>
                            {log.action === 'added' ? 'Añadido' : log.action === 'deleted' ? 'Eliminado' : 'Repuesto'}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{log.medicationName}</TableCell>
                        <TableCell className="text-sm text-text-sec">{log.details}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </motion.div>
          )}

          {activeTab === 'configuracion' && (
            <motion.div 
              key="configuracion"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Exportar Datos</CardTitle>
                  <CardDescription>Descarga una copia de tu inventario actual.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4">
                  <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-white">
                    <FileDown className="w-4 h-4 mr-2" />
                    Exportar a Excel (CSV)
                  </Button>
                  <Button onClick={exportToText} variant="outline" className="border-text-main text-text-main">
                    <Download className="w-4 h-4 mr-2" />
                    Exportar a Texto
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Información del Sistema</CardTitle>
                  <CardDescription>Detalles técnicos de la aplicación.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-sec">Versión del Programa</span>
                    <span className="font-mono font-bold">{APP_VERSION}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-sec">Almacenamiento Local</span>
                    <span className="text-success font-semibold">Activo</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-sec">Total de Registros</span>
                    <span>{medications.length} medicamentos</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm border-red-100 bg-red-50/30">
                <CardHeader>
                  <CardTitle className="text-danger">Zona de Peligro</CardTitle>
                  <CardDescription>Acciones irreversibles sobre tus datos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm('¿Estás seguro de que deseas borrar todos los datos? Esta acción no se puede deshacer.')) {
                        setMedications([]);
                        setLogs([]);
                        localStorage.clear();
                        toast.error('Todos los datos han sido borrados');
                      }
                    }}
                  >
                    Borrar todos los datos
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Replenish Dialog */}
        <Dialog open={isReplenishDialogOpen} onOpenChange={setIsReplenishDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Reiniciar Estado / Reponer</DialogTitle>
              <DialogDescription>
                Verifica y actualiza los datos para el medicamento: <span className="font-bold text-primary">{replenishMed.name}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rep-quantity" className="text-right">Nueva Cantidad</Label>
                <Input 
                  id="rep-quantity" 
                  type="number"
                  className="col-span-3" 
                  value={replenishMed.remainingQuantity} 
                  onChange={e => setReplenishMed({...replenishMed, remainingQuantity: Number(e.target.value)})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rep-price" className="text-right">Precio Actual</Label>
                <Input 
                  id="rep-price" 
                  type="number"
                  className="col-span-3" 
                  value={replenishMed.price} 
                  onChange={e => setReplenishMed({...replenishMed, price: Number(e.target.value)})}
                />
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Al guardar, la fecha de adquisición se actualizará a hoy y se reiniciará el cálculo de reposición.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReplenishDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleReplenish} className="bg-primary hover:bg-primary/90">Confirmar y Reponer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
