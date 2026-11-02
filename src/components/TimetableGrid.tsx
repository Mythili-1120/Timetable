'use client';

import React, { useState, useRef } from 'react';
import { PeriodDefinition, TimetableSlot } from '../types';
import { GripVertical, ArrowRightLeft, Plus } from 'lucide-react';

export interface TimetablePeriod {
  id?: string;
  name?: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  isBreak?: boolean;
}

export interface TimetableGridProps {
  grid: (TimetableSlot | null)[][];
  teachingPeriods: (PeriodDefinition | TimetablePeriod)[];
  allPeriods?: (PeriodDefinition | TimetablePeriod)[];
  days: string[];
  isEditable?: boolean;
  selectedSlot?: { dayIdx: number; periodIdx: number } | null;
  onSlotClick?: (dayIdx: number, periodIdx: number) => void;
  onSlotDrop?: (
    source: { dayIdx: number; periodIdx: number },
    target: { dayIdx: number; periodIdx: number }
  ) => void;
  slotSubtitleType?: 'staff' | 'class'; // 'staff' displays staffName + memberId; 'class' displays classLabel + dept
  className?: string;
  showLegend?: boolean;
  totalAllocated?: number;
}

interface ColumnMeta {
  period: PeriodDefinition | TimetablePeriod;
  isBreak: boolean;
  teachingIndex?: number;
  displayName: string;
  displayTime: string;
}

/**
 * Canonical Timetable Grid Component
 * Shared visual rendering engine used across Timetable Viewer and Timetable Generator.
 * Supports drag-and-drop movement and swapping for editable drafts on desktop and touch devices.
 */
export default function TimetableGrid({
  grid,
  teachingPeriods,
  allPeriods,
  days,
  isEditable = false,
  selectedSlot = null,
  onSlotClick,
  onSlotDrop,
  slotSubtitleType = 'staff',
  className = '',
  showLegend = false,
  totalAllocated
}: TimetableGridProps) {
  const isClickable = Boolean(isEditable && onSlotClick);
  const isDraggable = Boolean(isEditable && onSlotDrop);

  const [draggingSlot, setDraggingSlot] = useState<{ dayIdx: number; periodIdx: number } | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ dayIdx: number; periodIdx: number } | null>(null);

  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    source: { dayIdx: number; periodIdx: number };
    isDragging: boolean;
  } | null>(null);

  // -------------------------------------------------------------
  // DESKTOP HTML5 DRAG & DROP HANDLERS
  // -------------------------------------------------------------
  const handleDragStart = (e: React.DragEvent, dIdx: number, pIdx: number) => {
    if (!isDraggable) return;
    setDraggingSlot({ dayIdx: dIdx, periodIdx: pIdx });
    e.dataTransfer.setData('application/json', JSON.stringify({ dayIdx: dIdx, periodIdx: pIdx }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingSlot(null);
    setDragOverSlot(null);
  };

  const handleDragOver = (e: React.DragEvent, dIdx: number, pIdx: number) => {
    if (!isDraggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot?.dayIdx !== dIdx || dragOverSlot?.periodIdx !== pIdx) {
      setDragOverSlot({ dayIdx: dIdx, periodIdx: pIdx });
    }
  };

  const handleDragLeave = (e: React.DragEvent, dIdx: number, pIdx: number) => {
    if (!isDraggable) return;
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      if (dragOverSlot?.dayIdx === dIdx && dragOverSlot?.periodIdx === pIdx) {
        setDragOverSlot(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, dIdx: number, pIdx: number) => {
    if (!isDraggable || !onSlotDrop) return;
    e.preventDefault();
    let source = draggingSlot;
    if (!source) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) source = JSON.parse(raw);
      } catch {
        // fallback
      }
    }

    setDraggingSlot(null);
    setDragOverSlot(null);

    if (source && (source.dayIdx !== dIdx || source.periodIdx !== pIdx)) {
      onSlotDrop(source, { dayIdx: dIdx, periodIdx: pIdx });
    }
  };

  // -------------------------------------------------------------
  // MOBILE & TABLET TOUCH DRAG HANDLERS
  // -------------------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent, dIdx: number, pIdx: number) => {
    if (!isDraggable) return;
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      source: { dayIdx: dIdx, periodIdx: pIdx },
      isDragging: false
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggable || !touchStateRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStateRef.current.startX);
    const dy = Math.abs(touch.clientY - touchStateRef.current.startY);

    // Enter active drag if moved past 8px threshold
    if (!touchStateRef.current.isDragging && (dx > 8 || dy > 8)) {
      touchStateRef.current.isDragging = true;
      setDraggingSlot(touchStateRef.current.source);
    }

    if (touchStateRef.current.isDragging) {
      // Prevent browser scrolling while actively dragging period
      if (e.cancelable) {
        e.preventDefault();
      }

      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = elem?.closest('[data-day-idx][data-period-idx]');
      if (cell) {
        const tDay = parseInt(cell.getAttribute('data-day-idx') || '-1', 10);
        const tPeriod = parseInt(cell.getAttribute('data-period-idx') || '-1', 10);
        if (tDay >= 0 && tPeriod >= 0) {
          if (dragOverSlot?.dayIdx !== tDay || dragOverSlot?.periodIdx !== tPeriod) {
            setDragOverSlot({ dayIdx: tDay, periodIdx: tPeriod });
          }
          return;
        }
      }
      setDragOverSlot(null);
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggable || !onSlotDrop || !touchStateRef.current) return;
    const { isDragging, source } = touchStateRef.current;
    const target = dragOverSlot;

    touchStateRef.current = null;
    setDraggingSlot(null);
    setDragOverSlot(null);

    if (isDragging && target && (source.dayIdx !== target.dayIdx || source.periodIdx !== target.periodIdx)) {
      onSlotDrop(source, target);
    }
  };

  // Build column metadata to seamlessly support Break / Lunch columns
  const columns: ColumnMeta[] = [];
  if (allPeriods && allPeriods.length > 0) {
    let teachingCounter = 0;
    for (const p of allPeriods) {
      if (p.isBreak) {
        const isLunch =
          (p as any).isLunch ||
          p.id === 'LUNCH' ||
          (p.name && p.name.toLowerCase().includes('lunch'));
        columns.push({
          period: p,
          isBreak: true,
          displayName: isLunch ? 'Lunch' : 'Break',
          displayTime: isLunch ? '50 min' : '20 min'
        });
      } else {
        const teachingIdx = teachingCounter++;
        const timeStr =
          p.time ||
          (p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : '');
        columns.push({
          period: p,
          isBreak: false,
          teachingIndex: teachingIdx,
          displayName: p.name || `P${teachingIdx + 1}`,
          displayTime: timeStr ? timeStr.replace(/\s+/g, '') : ''
        });
      }
    }
  } else {
    teachingPeriods.forEach((p, idx) => {
      const timeStr =
        p.time ||
        (p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : '');
      columns.push({
        period: p,
        isBreak: false,
        teachingIndex: idx,
        displayName: p.name || `P${idx + 1}`,
        displayTime: timeStr ? timeStr.replace(/\s+/g, '') : ''
      });
    });
  }

  return (
    <div className={`overflow-x-auto select-none ${className}`}>
      <table className="w-full text-center text-xs border-collapse min-w-[760px]">
        <thead>
          <tr className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/90">
            <th className="py-3 px-4 border-r border-slate-200/90 w-24 text-left font-extrabold text-slate-700 text-xs uppercase tracking-wider">
              Day
            </th>
            {columns.map((col, idx) => (
              <th
                key={col.period.id || idx}
                className={`py-2.5 px-2 border-r border-slate-200/90 last:border-r-0 ${
                  col.isBreak
                    ? 'bg-slate-50/70 w-16 min-w-[65px] max-w-[80px]'
                    : 'min-w-[105px]'
                }`}
              >
                <div
                  className={`font-extrabold text-xs ${
                    col.isBreak ? 'text-slate-600' : 'text-slate-800'
                  }`}
                >
                  {col.displayName}
                </div>
                {col.displayTime && (
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    {col.displayTime}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((day, dIdx) => (
            <tr key={day} className="hover:bg-slate-50/40 transition-colors">
              <td className="py-3.5 px-4 font-bold text-slate-800 bg-white border-r border-slate-200/90 text-left whitespace-nowrap">
                {day}
              </td>
              {columns.map((col, cIdx) => {
                if (col.isBreak) {
                  return (
                    <td
                      key={col.period.id || cIdx}
                      className="py-2 px-1 border-r border-slate-200/90 bg-slate-50/50 h-20"
                    />
                  );
                }

                const pIdx = col.teachingIndex!;
                const slot = grid?.[dIdx]?.[pIdx];
                const isSelected =
                  selectedSlot?.dayIdx === dIdx &&
                  selectedSlot?.periodIdx === pIdx;

                const isCurrentDragging = Boolean(
                  draggingSlot &&
                  draggingSlot.dayIdx === dIdx &&
                  draggingSlot.periodIdx === pIdx
                );

                const isDropTarget = Boolean(
                  dragOverSlot &&
                  dragOverSlot.dayIdx === dIdx &&
                  dragOverSlot.periodIdx === pIdx &&
                  (draggingSlot?.dayIdx !== dIdx || draggingSlot?.periodIdx !== pIdx)
                );

                return (
                  <td
                    key={col.period.id || cIdx}
                    data-day-idx={dIdx}
                    data-period-idx={pIdx}
                    onClick={() => isClickable && onSlotClick && onSlotClick(dIdx, pIdx)}
                    onDragOver={(e) => handleDragOver(e, dIdx, pIdx)}
                    onDragLeave={(e) => handleDragLeave(e, dIdx, pIdx)}
                    onDrop={(e) => handleDrop(e, dIdx, pIdx)}
                    className={`relative py-2 px-1.5 border-r border-slate-200/90 last:border-r-0 h-20 transition-all ${
                      isClickable ? 'cursor-pointer' : ''
                    } ${
                      isDropTarget
                        ? slot
                          ? 'bg-indigo-100/90 ring-2 ring-[#3431B7] ring-inset'
                          : 'bg-emerald-100/90 ring-2 ring-emerald-600 ring-inset'
                        : isSelected
                        ? 'bg-indigo-100/90 ring-2 ring-[#3431B7] ring-inset'
                        : isClickable
                        ? 'bg-white hover:bg-slate-50/60'
                        : 'bg-white'
                    }`}
                  >
                    {/* Visual Drop Overlay Badge */}
                    {isDropTarget && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none p-1">
                        {slot ? (
                          <span className="px-2 py-1 rounded text-[10px] font-extrabold bg-[#3431B7] text-white shadow-sm flex items-center gap-1 animate-in zoom-in-95 duration-100">
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Swap</span>
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-[10px] font-extrabold bg-emerald-600 text-white shadow-sm flex items-center gap-1 animate-pulse">
                            <Plus className="w-3 h-3" />
                            <span>Move Here</span>
                          </span>
                        )}
                      </div>
                    )}

                    {slot ? (
                      <div
                        draggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, dIdx, pIdx)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, dIdx, pIdx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        title={isDraggable ? 'Drag to move or swap, or click to select' : slot.subjectName}
                        className={`group relative flex flex-col items-center justify-center p-2 rounded-lg bg-white border border-slate-200/80 border-l-4 ${
                          slot.type === 'Lab' ? 'border-l-amber-500' : 'border-l-[#3431B7]'
                        } transition-all shadow-2xs ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-xs' : ''
                        } ${
                          isCurrentDragging
                            ? 'opacity-35 scale-95 border-dashed border-indigo-400 bg-slate-100'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1 max-w-full">
                          {isDraggable && (
                            <GripVertical className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-600 shrink-0 transition-colors" />
                          )}
                          <span
                            className="font-extrabold text-slate-900 text-xs truncate max-w-28 tracking-tight"
                            title={slot.subjectName}
                          >
                            {slot.subjectCode}
                          </span>
                          {slot.type === 'Lab' && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 shrink-0">
                              Lab
                            </span>
                          )}
                        </div>

                        {slotSubtitleType === 'class' ? (
                          <>
                            <span
                              className="text-[11px] text-slate-600 font-medium truncate max-w-28 mt-0.5"
                              title={slot.classLabel}
                            >
                              {slot.classLabel}
                            </span>
                            <span className="text-[9px] text-[#3431B7] font-mono mt-0.5">
                              {slot.departmentId.replace('dept-', '').toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="text-[11px] text-slate-600 font-medium truncate max-w-28 mt-0.5"
                              title={slot.staffName}
                            >
                              {slot.staffName}
                            </span>
                            {slot.memberId && (
                              <span className="font-mono text-[9px] text-[#3431B7] font-semibold bg-indigo-50/80 px-1 py-0.5 rounded border border-indigo-100/70 inline-block mt-0.5">
                                {slot.memberId}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-300 font-light text-base hover:text-slate-400 transition-colors">
                        +
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend & Summary Bottom Bar */}
      {showLegend && (
        <div className="p-3.5 bg-white border-t border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-white border border-slate-200 border-l-4 border-l-[#3431B7] inline-block shadow-2xs" />
              <span className="font-medium text-slate-600 text-[11px]">Period placed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold text-sm">+</span>
              <span className="font-medium text-slate-600 text-[11px]">Empty slot (tap to add)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-slate-100 border border-slate-200 inline-block" />
              <span className="font-medium text-slate-600 text-[11px]">Break / Lunch</span>
            </div>
          </div>

          <div className="font-bold text-slate-700 text-xs">
            {totalAllocated !== undefined ? `${totalAllocated} periods placed this week` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
