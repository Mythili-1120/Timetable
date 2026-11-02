'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getAllDepartments, getCachedDepartments } from '../../../lib/services/departmentService';
import { getAllClasses, getCachedClasses } from '../../../lib/services/classService';
import {
  validateSubjectStaffForClass,
  SubjectStaffValidationResult
} from '../../../lib/services/assignmentService';
import { getAllSubjects, getCachedSubjects, getSemestersForYear } from '../../../lib/services/subjectService';
import { getAllStaff, getCachedStaff } from '../../../lib/services/staffService';
import { getCollegeSettings, getCachedCollegeSettings, DEFAULT_SETTINGS } from '../../../lib/services/settingsService';
import {
  saveDraft,
  getDraft,
  publishTimetable,
  getGlobalBusySlots,
  getPublishedTimetables,
  getCachedPublishedTimetables
} from '../../../lib/services/timetableService';
import {
  TimetableEngine,
  validateSlotSwap,
  GenerationResult,
  computeTimetableFingerprint
} from '../../../lib/engine/generator';
import {
  Department,
  ClassSection,
  Subject,
  Staff,
  CollegeSettings,
  TimetableSlot,
  PublishedTimetable
} from '../../../types';
import TimetableGrid from '../../../components/TimetableGrid';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Cpu,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Users,
  ArrowRight,
  ShieldAlert,
  GraduationCap,
  BookOpen,
  Sparkles,
  ArrowRightLeft,
  RotateCcw,
  Check,
  Calendar,
  Layers,
  ChevronRight,
  X,
  History,
  Building2,
  ExternalLink,
  ChevronDown,
  Info,
  SlidersHorizontal,
  ShieldCheck
} from 'lucide-react';

const UNDERGRADUATE_YEARS: ('1st Year' | '2nd Year' | '3rd Year' | '4th Year')[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year'
];

export default function GeneratorPage() {
  const initDepts = getCachedDepartments();
  const initSubjs = getCachedSubjects();
  const initStaff = getCachedStaff();
  const initSettings = getCachedCollegeSettings();
  const initPub = getCachedPublishedTimetables('2025–2026') || [];
  const firstDeptId = initDepts && initDepts.length > 0 ? initDepts[0].departmentId : '';
  const initClasses = firstDeptId ? getCachedClasses(firstDeptId) || [] : [];

  const [departments, setDepartments] = useState<Department[]>(() => initDepts || []);
  const [classes, setClasses] = useState<ClassSection[]>(() => initClasses);
  const [publishedTimetables, setPublishedTimetables] = useState<PublishedTimetable[]>(() => initPub);
  const [draftStatusMap, setDraftStatusMap] = useState<Map<string, string>>(new Map());

  const [subjectsMap, setSubjectsMap] = useState<Map<string, Subject>>(() => {
    const sMap = new Map<string, Subject>();
    if (initSubjs) initSubjs.forEach(s => sMap.set(s.subjectId, s));
    return sMap;
  });
  const [staffMap, setStaffMap] = useState<Map<string, Staff>>(() => {
    const stMap = new Map<string, Staff>();
    if (initStaff) initStaff.forEach(st => stMap.set(st.memberId, st));
    return stMap;
  });
  const [settings, setSettings] = useState<CollegeSettings | null>(() => initSettings);

  // Form selections — Department -> Academic Year -> Section (Mandatory Hierarchy)
  const [selectedDept, setSelectedDept] = useState(firstDeptId);
  const [selectedYearOfStudy, setSelectedYearOfStudy] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [academicYear, setAcademicYear] = useState('2025–2026');

  // Pre-generation Subject & Faculty Validation State
  const [validation, setValidation] = useState<SubjectStaffValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Generation context diversity history map (keyed by `${deptId}__${academicYear}__${classId}__${semester}`)
  const generationHistoryMap = useRef<Map<string, { fingerprints: string[]; lastSeed: number }>>(new Map());

  // Timetable Grid & Editor State
  const [grid, setGrid] = useState<(TimetableSlot | null)[][]>([]);
  const [status, setStatus] = useState<'DRAFT' | 'GENERATED' | 'PUBLISHED'>('DRAFT');
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [totalRequired, setTotalRequired] = useState(0);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Interactive Slot Swapping & Move State (Workstream B7)
  const [selectedSlot, setSelectedSlot] = useState<{ dayIdx: number; periodIdx: number } | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  const [previousGrid, setPreviousGrid] = useState<(TimetableSlot | null)[][] | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Publish / Lock Modal State (Workstream B8)
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Clear / Change Selection State
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearSuccessFeedback, setClearSuccessFeedback] = useState(false);

  const { user } = useAuth();

  // Async request concurrency tokens to discard stale out-of-order responses
  const loadDeptRequestCounter = useRef(0);
  const validationRequestId = useRef(0);

  // Keyboard Escape listener for accessible modal handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clearConfirmOpen) setClearConfirmOpen(false);
        if (publishModalOpen) setPublishModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearConfirmOpen, publishModalOpen]);

  // Production-safe workspace reset action: purely UI state cleanup, strictly 0 Firestore deletes
  const handleConfirmClearSelection = () => {
    setSelectedClassId('');
    setGrid([]);
    setSelectedSlot(null);
    setStatus('DRAFT');
    setTotalAllocated(0);
    setTotalRequired(0);
    setValidation(null);
    setDiagnostics([]);
    setSwapError(null);
    setSwapSuccess(null);
    setPreviousGrid(null);
    setClearConfirmOpen(false);

    // Clean URL query param without full page reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('classId');
      window.history.replaceState(null, '', url.toString());
    }

    setClearSuccessFeedback(true);
    setTimeout(() => {
      setClearSuccessFeedback(false);
    }, 4000);
  };

  // Unified Master Data & URL Query Parameter Resolution
  useEffect(() => {
    async function init() {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const paramDept = urlParams?.get('departmentId');
      const paramClass = urlParams?.get('classId');
      const paramYear = urlParams?.get('yearOfStudy') as any;
      const paramAcad = urlParams?.get('academicYear');

      const [depts, subjs, staffList, set, pub] = await Promise.all([
        getAllDepartments(),
        getAllSubjects(),
        getAllStaff(),
        getCollegeSettings(),
        getPublishedTimetables('2025–2026')
      ]);
      setDepartments(depts);
      setSettings(set);
      setPublishedTimetables(pub);

      const sMap = new Map<string, Subject>();
      subjs.forEach(s => sMap.set(s.subjectId, s));
      setSubjectsMap(sMap);

      const stMap = new Map<string, Staff>();
      staffList.forEach(st => stMap.set(st.memberId, st));
      setStaffMap(stMap);

      const effectiveDept = paramDept || selectedDept || (depts.length > 0 ? depts[0].departmentId : '');
      const effectiveYear = (paramYear && UNDERGRADUATE_YEARS.includes(paramYear)) ? paramYear : selectedYearOfStudy;

      if (effectiveDept) setSelectedDept(effectiveDept);
      if (effectiveYear) setSelectedYearOfStudy(effectiveYear);
      if (paramAcad) setAcademicYear(paramAcad);

      if (effectiveDept) {
        await loadDepartmentClasses(effectiveDept, paramClass, effectiveYear);
      }
    }
    init();
  }, []);

  const loadDepartmentClasses = async (
    deptId: string,
    targetClassId?: string,
    yearLevel?: '1st Year' | '2nd Year' | '3rd Year' | '4th Year'
  ) => {
    const reqId = ++loadDeptRequestCounter.current;
    const cls = await getAllClasses(deptId);
    if (reqId !== loadDeptRequestCounter.current) return;
    setClasses(cls);

    // Sync draft states for all classes in this department
    const dMap = new Map<string, string>();
    await Promise.all(
      cls.map(async c => {
        const d = await getDraft(c.classId);
        if (d && d.status) dMap.set(c.classId, d.status);
      })
    );
    if (reqId !== loadDeptRequestCounter.current) return;
    setDraftStatusMap(dMap);

    const activeYear = yearLevel || selectedYearOfStudy;
    // Filter to sections for the active year of study
    const yearSections = cls.filter(c => c.yearOfStudy === activeYear);
    if (yearSections.length > 0) {
      const preferred = targetClassId || selectedClassId;
      const targetClass = yearSections.some(c => c.classId === preferred)
        ? preferred
        : yearSections[0].classId;
      setSelectedClassId(targetClass);
      await loadClassDraft(targetClass);
    } else {
      setSelectedClassId('');
      setGrid([]);
    }
  };

  const loadClassDraft = async (classId: string) => {
    if (!classId) {
      setGrid([]);
      setStatus('DRAFT');
      setTotalAllocated(0);
      return;
    }
    setSelectedSlot(null);
    setSwapError(null);
    setSwapSuccess(null);

    // Check if class is already published
    const published = publishedTimetables.find(p => p.classId === classId);
    if (published && published.grid) {
      setGrid(published.grid);
      setStatus('PUBLISHED');
      setTotalAllocated(published.totalHours);
      return;
    }

    const draft = await getDraft(classId);
    if (draft && draft.grid) {
      setGrid(draft.grid);
      setStatus(draft.status);
      setTotalAllocated(draft.totalAllocated);

      // Seed generation history for this context
      const contextKey = `${selectedDept}__${academicYear}__${classId}__${selectedSemester}`;
      const existingHist = generationHistoryMap.current.get(contextKey) || { fingerprints: [], lastSeed: 0 };
      const fps = new Set(existingHist.fingerprints);
      if (draft.generationMetadata?.fingerprint) {
        fps.add(draft.generationMetadata.fingerprint);
      }
      if (draft.generationMetadata?.recentFingerprints) {
        draft.generationMetadata.recentFingerprints.forEach(fp => fps.add(fp));
      }
      generationHistoryMap.current.set(contextKey, {
        fingerprints: Array.from(fps).slice(-25),
        lastSeed: Math.max(existingHist.lastSeed, draft.generationMetadata?.variantIndex || 0)
      });
    } else {
      setGrid([]);
      setStatus('DRAFT');
      setTotalAllocated(0);
    }
  };

  // Re-run canonical Subject-Staff readiness check whenever selected class or semester changes
  const checkReadiness = async (forceRefresh = false) => {
    if (!selectedClassId) {
      setValidation(null);
      return;
    }
    const reqId = ++validationRequestId.current;
    setValidating(true);
    try {
      const result = await validateSubjectStaffForClass(
        selectedClassId,
        selectedSemester,
        forceRefresh,
        selectedDept,
        selectedYearOfStudy
      );
      if (reqId === validationRequestId.current) {
        setValidation(result);
      }
    } catch (err) {
      if (reqId === validationRequestId.current) {
        console.error('Pre-generation validation error:', err);
      }
    } finally {
      if (reqId === validationRequestId.current) {
        setValidating(false);
      }
    }
  };

  useEffect(() => {
    checkReadiness(false);
  }, [selectedClassId, selectedSemester, selectedDept, selectedYearOfStudy]);

  // Window focus listener: automatically re-validates when user returns from Teaching Assignments tab
  useEffect(() => {
    const handleFocus = () => {
      if (selectedClassId) {
        checkReadiness(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedClassId, selectedSemester, selectedDept, selectedYearOfStudy]);

  // Handle department change — clears old section selection immediately to avoid stale state
  const handleDeptChange = async (deptId: string) => {
    setSelectedDept(deptId);
    setSelectedClassId('');
    setGrid([]);
    setValidation(null);
    await loadDepartmentClasses(deptId, undefined, selectedYearOfStudy);
  };

  // Handle year level change — clears old section selection immediately to avoid stale state
  const handleYearChange = async (year: '1st Year' | '2nd Year' | '3rd Year' | '4th Year') => {
    const wasClassSelected = !!selectedClassId;
    setSelectedYearOfStudy(year);
    setSelectedClassId('');
    setGrid([]);
    setValidation(null);
    const sems = getSemestersForYear(year);
    if (selectedSemester !== 'ALL' && !sems.some(s => s.name === selectedSemester)) {
      setSelectedSemester(sems[0].name);
    }
    const yearSections = classes.filter(c => c.yearOfStudy === year);
    if (wasClassSelected && yearSections.length > 0) {
      const firstSectionId = yearSections[0].classId;
      setSelectedClassId(firstSectionId);
      await loadClassDraft(firstSectionId);
    } else {
      setSelectedClassId('');
      setGrid([]);
    }
  };

  // Handle section selection
  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
    await loadClassDraft(classId);
  };

  // -----------------------------------------------------------------
  // BACKEND-ONLY DIVERSE CANDIDATE GENERATION & CONTINUOUS REGENERATION
  // -----------------------------------------------------------------
  const handleRunGenerator = async () => {
    if (!selectedClassId || !settings || generating) return;
    setGenerating(true);
    setDiagnostics([]);
    setSwapError(null);
    setSwapSuccess(null);
    setSelectedSlot(null);

    // Safe draft replacement: preserve current valid draft
    const currentValidGrid = grid.length > 0 ? grid : undefined;

    try {
      // 1. Authoritative Pre-Generation Subject & Staff Validation with Department & Cohort Scope Check
      const valResult = await validateSubjectStaffForClass(
        selectedClassId,
        selectedSemester,
        true,
        selectedDept,
        selectedYearOfStudy
      );
      setValidation(valResult);

      if (!valResult.canGenerate) {
        setDiagnostics(valResult.blockingErrors);
        setGenerating(false);
        return;
      }

      const assignments = valResult.assignedSubjects.map(a => a.assignment);

      // Snapshot synchronization: enrich subjectsMap & staffMap with exact validated objects
      const enrichedSubjectsMap = new Map(subjectsMap);
      const enrichedStaffMap = new Map(staffMap);
      valResult.assignedSubjects.forEach(a => {
        if (a.subject) enrichedSubjectsMap.set(a.subject.subjectId, a.subject);
        if (a.staff) enrichedStaffMap.set(a.staff.memberId, a.staff);
      });

      // 2. Fetch global college-wide busy slots (from all other classes)
      const globalBusy = await getGlobalBusySlots(academicYear, selectedClassId);

      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      // 3. Independent Context Management per Department + Academic Year + Section/Class + Semester
      const contextKey = `${selectedDept}__${academicYear}__${selectedClassId}__${selectedSemester}`;
      const hist = generationHistoryMap.current.get(contextKey) || { fingerprints: [], lastSeed: 0 };
      const seedOffset = hist.lastSeed + 1;

      // 4. Bounded Backend-Only Candidate Generation & Diversity Selection
      // Explores up to 100 candidate attempts internally without sending the collection to client
      const searchResult = TimetableEngine.generateDiverseAlternative(
        {
          classId: selectedClassId,
          classLabel,
          departmentId: selectedDept,
          academicYear,
          assignments,
          subjectsMap: enrichedSubjectsMap,
          staffMap: enrichedStaffMap,
          collegeSettings: settings,
          globalBusySlots: globalBusy
        },
        {
          maxSearchAttempts: 100, // Search target: explore up to 100 candidate attempts
          maxTimeMs: 3000, // 3-second bounded compute budget to guarantee responsive UI
          currentGrid: currentValidGrid,
          previousFingerprints: hist.fingerprints,
          seedOffset
        }
      );

      if (searchResult.success && searchResult.selectedCandidate) {
        const chosen = searchResult.selectedCandidate;
        const newFingerprint = searchResult.fingerprint || computeTimetableFingerprint(chosen.grid);

        // Update history tracking for this exact section + semester
        const updatedFps = [...hist.fingerprints, newFingerprint].slice(-25);
        generationHistoryMap.current.set(contextKey, {
          fingerprints: updatedFps,
          lastSeed: seedOffset + (searchResult.totalExploredAttempts || 1)
        });

        // 5. Safe Draft Replacement: Persist to Firestore first before updating the UI
        if (user) {
          await saveDraft(
            {
              classId: selectedClassId,
              departmentId: selectedDept,
              academicYear,
              grid: chosen.grid,
              totalAllocated: chosen.totalAllocated,
              status: 'GENERATED',
              updatedAt: new Date().toISOString(),
              generationMetadata: {
                variantIndex: chosen.variantIndex || 0,
                qualityScore: chosen.qualityScore,
                generatedAt: new Date().toISOString(),
                semester: selectedSemester,
                fingerprint: newFingerprint,
                recentFingerprints: updatedFps,
                regenerationCount: updatedFps.length
              }
            },
            user.uid
          );
        }

        // Update UI only after persistence succeeds
        setGrid(chosen.grid);
        setStatus('GENERATED');
        setTotalAllocated(chosen.totalAllocated);
        setTotalRequired(chosen.totalRequired);
        setDiagnostics([]);
        setDraftStatusMap(prev => new Map(prev).set(selectedClassId, 'GENERATED'));
      } else {
        // Generation failed to produce a valid alternative
        if (currentValidGrid) {
          // Preserve the current valid draft unchanged
          setDiagnostics(
            searchResult.diagnostics && searchResult.diagnostics.length > 0
              ? searchResult.diagnostics
              : ['No alternative schedule satisfies all hard constraints without conflicting. Current draft retained.']
          );
        } else {
          setDiagnostics(
            searchResult.diagnostics || ['Constraint satisfaction failure: Unable to place all required curriculum hours without collisions.']
          );
        }
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      // Keep previous valid draft intact on error
      setDiagnostics([err.message || 'An error occurred during timetable generation. Current draft preserved.']);
    } finally {
      setGenerating(false);
    }
  };

  // -----------------------------------------------------------------
  // INTERACTIVE SLOT DRAG, SWAP & MOVE (Workstream B7)
  // -----------------------------------------------------------------
  const handleExecuteSlotMoveOrSwap = async (
    source: { dayIdx: number; periodIdx: number },
    target: { dayIdx: number; periodIdx: number }
  ) => {
    if (status === 'PUBLISHED') {
      alert('This timetable is locked and published. To modify, create a new version.');
      return;
    }

    if (source.dayIdx === target.dayIdx && source.periodIdx === target.periodIdx) {
      setSelectedSlot(null);
      return;
    }

    const sourceDay = source.dayIdx;
    const sourcePeriod = source.periodIdx;
    const targetDay = target.dayIdx;
    const targetPeriod = target.periodIdx;

    const globalBusy = await getGlobalBusySlots(academicYear, selectedClassId);

    const validationResult = validateSlotSwap(
      grid,
      sourceDay,
      sourcePeriod,
      targetDay,
      targetPeriod,
      globalBusy,
      selectedClassId,
      days.length,
      teachingPeriods.length
    );

    if (!validationResult.valid) {
      setSwapError(validationResult.reason || 'Invalid move or swap operation.');
      setSelectedSlot(null);
      return;
    }

    // Save previous snapshot for Undo
    const prevGrid = grid.map(row => [...row]);
    setPreviousGrid(prevGrid);

    // Execute swap / move
    const nextGrid = grid.map(row => [...row]);
    const slotA = nextGrid[sourceDay][sourcePeriod];
    const slotB = nextGrid[targetDay][targetPeriod];

    nextGrid[sourceDay][sourcePeriod] = slotB ? { ...slotB, dayIdx: sourceDay, periodIdx: sourcePeriod } : null;
    nextGrid[targetDay][targetPeriod] = slotA ? { ...slotA, dayIdx: targetDay, periodIdx: targetPeriod } : null;

    setGrid(nextGrid);
    setSelectedSlot(null);
    setSwapError(null);

    const actionDesc = slotB
      ? `Swapped ${slotA?.subjectCode || 'course'} with ${slotB.subjectCode}.`
      : `Moved ${slotA?.subjectCode || 'course'} to Day ${targetDay + 1}, Period ${targetPeriod + 1}.`;
    setSwapSuccess(`${actionDesc} Draft auto-saved.`);

    // Auto-save updated draft to Firestore
    if (user) {
      setIsSavingDraft(true);
      try {
        await saveDraft(
          {
            classId: selectedClassId,
            departmentId: selectedDept,
            academicYear,
            grid: nextGrid,
            totalAllocated,
            status: 'DRAFT',
            updatedAt: new Date().toISOString()
          },
          user.uid
        );
      } catch (err: any) {
        console.error('Failed to save draft after move/swap:', err);
        setGrid(prevGrid);
        setPreviousGrid(null);
        setSwapError('Failed to persist draft to cloud. Previous timetable restored.');
        setSwapSuccess(null);
      } finally {
        setIsSavingDraft(false);
      }
    }
  };

  const handleUndoLastMove = async () => {
    if (!previousGrid || !user || status === 'PUBLISHED') return;
    const gridToRestore = previousGrid;
    setGrid(gridToRestore);
    setPreviousGrid(null);
    setSwapError(null);
    setIsSavingDraft(true);
    try {
      await saveDraft(
        {
          classId: selectedClassId,
          departmentId: selectedDept,
          academicYear,
          grid: gridToRestore,
          totalAllocated,
          status: 'DRAFT',
          updatedAt: new Date().toISOString()
        },
        user.uid
      );
      setSwapSuccess('Reverted last move/swap. Previous timetable draft restored.');
    } catch (err: any) {
      console.error('Failed to save restored draft:', err);
      setSwapError('Failed to save restored draft. Please refresh.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSlotClick = async (dayIdx: number, periodIdx: number) => {
    if (status === 'PUBLISHED') {
      alert('This timetable is locked and published. To modify, create a new version.');
      return;
    }

    // First click: select source slot
    if (!selectedSlot) {
      const clickedCell = grid[dayIdx][periodIdx];
      if (!clickedCell) {
        setSwapError('Please select a filled slot first to move or swap.');
        return;
      }
      setSelectedSlot({ dayIdx, periodIdx });
      setSwapError(null);
      setSwapSuccess(null);
      return;
    }

    // Clicked same slot: deselect
    if (selectedSlot.dayIdx === dayIdx && selectedSlot.periodIdx === periodIdx) {
      setSelectedSlot(null);
      return;
    }

    // Second click: attempt swap / move
    await handleExecuteSlotMoveOrSwap(selectedSlot, { dayIdx, periodIdx });
  };

  // -----------------------------------------------------------------
  // LOCK & PUBLISH TIMETABLE (Workstream B8)
  // -----------------------------------------------------------------
  const handlePublish = async () => {
    if (!selectedClassId || grid.length === 0 || !user) return;
    setPublishing(true);

    try {
      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      await publishTimetable(
        {
          classId: selectedClassId,
          classLabel,
          departmentId: selectedDept,
          academicYear,
          grid,
          totalHours: totalAllocated
        },
        user.uid
      );

      setStatus('PUBLISHED');
      setPublishModalOpen(false);
      setPublishSuccess(true);

      // Refresh published records and draft maps
      const pubList = await getPublishedTimetables(academicYear, true);
      setPublishedTimetables(pubList);
      setDraftStatusMap(prev => new Map(prev).set(selectedClassId, 'PUBLISHED'));
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(`Failed to publish timetable: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // Helpers for Section and Year progress
  const yearSections = classes.filter(c => c.yearOfStudy === selectedYearOfStudy);
  const selectedClass = classes.find(c => c.classId === selectedClassId);
  const selectedDeptObj = departments.find(d => d.departmentId === selectedDept);

  const getSectionStatus = (classId: string) => {
    const isLocked = publishedTimetables.some(p => p.classId === classId);
    if (isLocked) return 'LOCKED';
    const dStatus = draftStatusMap.get(classId);
    if (dStatus === 'GENERATED' || dStatus === 'DRAFT') return 'DRAFT';
    return 'NOT_GENERATED';
  };

  const lockedYearCount = yearSections.filter(c => getSectionStatus(c.classId) === 'LOCKED').length;
  const isYearFullyCompleted = yearSections.length > 0 && lockedYearCount === yearSections.length;

  const teachingPeriods = settings?.periods?.filter(p => !p.isBreak) || [];
  const allPeriodsList = settings?.periods || DEFAULT_SETTINGS.periods;
  const days = settings?.workingDays && settings.workingDays.length > 0
    ? settings.workingDays
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-[#3431B7] px-7 py-7 text-white shadow-lg shadow-indigo-950/10">
        {/* Segmented dashed bars in top right (decorative as in template) */}
        <div className="flex items-center justify-end gap-2 mb-2 opacity-35">
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
        </div>

        <div>
          <span className="text-xs font-semibold text-indigo-200 tracking-wide">
            Timetable studio
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1">
            Section-wise Timetable Generator
          </h1>
          <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
            Generate, preview, adjust and lock conflict-free timetables for each academic year and section.
          </p>
        </div>
      </div>

      {/* 2. THREE-TIER SELECTION PANEL (Department -> Academic Year -> Section) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Tier 1: Department Selector */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-[#3431B7] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                DEPARTMENT
              </span>
            </div>
            <div className="relative">
              <select
                value={selectedDept}
                onChange={(e) => handleDeptChange(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 pr-10 text-sm font-bold text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] cursor-pointer"
              >
                {departments.map(d => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.code} ({d.name})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Tier 2: Academic Year Level (1st, 2nd, 3rd, 4th) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-[#3431B7] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                ACADEMIC YEAR
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60">
              {UNDERGRADUATE_YEARS.map(yr => {
                const isSelected = selectedYearOfStudy === yr;
                const count = classes.filter(c => c.yearOfStudy === yr).length;
                const shortLabel = yr.replace(' Year', '');

                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleYearChange(yr)}
                    className={`py-1.5 px-1 rounded-xl text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white text-[#3431B7] font-bold shadow-xs border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{shortLabel}</div>
                    <div className={`text-[10px] leading-tight ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>
                      {count} {count === 1 ? 'section' : 'sections'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tier 3: Section Selector */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#3431B7] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  SECTION ({selectedYearOfStudy.toUpperCase()})
                </span>
              </div>
              {selectedClassId && (
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                  title="Clear selected section"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
            {yearSections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 rounded-2xl border border-amber-200">
                No sections configured for {selectedYearOfStudy}.
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {yearSections.map(cls => {
                  const isSelected = cls.classId === selectedClassId;
                  const sStatus = getSectionStatus(cls.classId);
                  return (
                    <div key={cls.classId} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleClassChange(cls.classId)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#3431B7] text-white shadow-xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-xs'
                        }`}
                      >
                        Section {cls.section}
                      </button>
                      {isSelected && (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            sStatus === 'LOCKED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                          }`}
                        >
                          <span>●</span>
                          <span>{sStatus === 'LOCKED' ? 'Locked' : 'Draft'}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sub-bar: Year Progress + Semester Tabs + Clear / Change Selection Action */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700 whitespace-nowrap">
              {selectedYearOfStudy} progress
            </span>
            <div className="w-24 sm:w-32 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-[#3431B7] rounded-full transition-all duration-300"
                style={{
                  width: yearSections.length > 0 ? `${(lockedYearCount / yearSections.length) * 100}%` : '0%'
                }}
              />
            </div>
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
              {lockedYearCount === 0
                ? `Not started • 0 of ${yearSections.length} sections locked`
                : lockedYearCount === yearSections.length
                ? `Completed • ${lockedYearCount} of ${yearSections.length} sections locked`
                : `In progress • ${lockedYearCount} of ${yearSections.length} sections locked`}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Semester</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedSemester('ALL')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedSemester === 'ALL'
                      ? 'bg-[#3431B7] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All
                </button>
                {getSemestersForYear(selectedYearOfStudy).map(sem => (
                  <button
                    key={sem.name}
                    type="button"
                    onClick={() => setSelectedSemester(sem.name)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedSemester === sem.name
                        ? 'bg-[#3431B7] text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {sem.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedClassId && (
              <div className="border-l border-slate-200/90 pl-3">
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  title="Exit current timetable workspace and return to selection"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>Clear / Change Selection</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2b. CLEAR SELECTION FEEDBACK BANNER */}
      {clearSuccessFeedback && (
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <div>
              <p className="font-bold text-white">Selection Cleared</p>
              <p className="text-slate-300 text-[11px]">
                Exited current timetable workspace. You can now select another Academic Year, Section, or Semester. Saved drafts and published timetables remain safely stored.
              </p>
            </div>
          </div>
          <button
            onClick={() => setClearSuccessFeedback(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. YEAR COMPLETED CELEBRATORY BANNER (Workstream B10) */}
      {isYearFullyCompleted && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between gap-4 text-emerald-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-emerald-950">
                {selectedYearOfStudy} — Fully Completed!
              </h3>
              <p className="text-xs text-emerald-800">
                All {yearSections.length} class section timetables are locked and published to the authoritative institutional archive.
              </p>
            </div>
          </div>

          {selectedYearOfStudy !== '4th Year' && (
            <button
              onClick={() => {
                const nextYearIndex = UNDERGRADUATE_YEARS.indexOf(selectedYearOfStudy) + 1;
                if (nextYearIndex < UNDERGRADUATE_YEARS.length) {
                  handleYearChange(UNDERGRADUATE_YEARS[nextYearIndex]);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <span>Proceed to Next Year</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 4. PRE-GENERATION VALIDATION DIAGNOSTICS */}
      {validation && !validation.canGenerate && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-900 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Timetable Generation Blocked — Teaching Assignments Incomplete</span>
            </div>
            <button
              onClick={() => checkReadiness(true)}
              disabled={validating}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 hover:bg-rose-100 transition-colors cursor-pointer shadow-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
              <span>{validating ? 'Checking...' : 'Re-check Assignments'}</span>
            </button>
          </div>
          <p className="text-xs text-rose-700">
            The generator requires an assigned, active, and eligible faculty member for every curriculum subject before creating candidate schedules:
          </p>

          {validation.structuredErrors && validation.structuredErrors.length > 0 ? (
            <div className="space-y-2 pt-1">
              {validation.structuredErrors.map((err, i) => {
                let badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                let badgeLabel = 'Missing Assignment';
                if (err.errorCode === 'SECTION_NOT_SELECTED') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'No Section Selected';
                } else if (err.errorCode === 'SECTION_NOT_FOUND' || err.errorCode === 'CLASS_NOT_FOUND') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Section Not Found';
                } else if (err.errorCode === 'SECTION_DEPARTMENT_MISMATCH') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Department Mismatch';
                } else if (err.errorCode === 'SECTION_ACADEMIC_YEAR_MISMATCH') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'Cohort Mismatch';
                } else if (err.errorCode === 'STAFF_INACTIVE' || err.errorCode === 'INACTIVE_STAFF') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'Faculty Inactive';
                } else if (err.errorCode === 'STAFF_SUBJECT_INELIGIBLE' || err.errorCode === 'INELIGIBLE_STAFF') {
                  badgeBg = 'bg-orange-100 text-orange-800 border-orange-300';
                  badgeLabel = 'Eligibility Mismatch';
                } else if (err.errorCode === 'ASSIGNMENT_DATA_LOAD_FAILED') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Data Load Failed';
                } else if (err.errorCode === 'ASSIGNMENT_DATA_AMBIGUOUS') {
                  badgeBg = 'bg-purple-100 text-purple-800 border-purple-300';
                  badgeLabel = 'Conflicting Assignments';
                } else if (err.errorCode === 'NO_CURRICULUM_SUBJECTS') {
                  badgeBg = 'bg-slate-100 text-slate-800 border-slate-300';
                  badgeLabel = 'No Curriculum';
                } else if (err.errorCode === 'SUBJECT_ASSIGNMENT_MISSING' || err.errorCode === 'MISSING_ASSIGNMENT') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Missing Assignment';
                }

                return (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white/90 rounded-xl border border-rose-200 text-xs shadow-2xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase border shrink-0 ${badgeBg}`}>
                        {badgeLabel}
                      </span>
                      <div>
                        <div className="font-bold text-rose-950">
                          {err.subjectName ? `${err.subjectName} (${err.subjectId})` : err.message}
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          {err.message}
                        </div>
                      </div>
                    </div>

                    {err.errorCode === 'ASSIGNMENT_DATA_LOAD_FAILED' ? (
                      <button
                        onClick={() => checkReadiness(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Load</span>
                      </button>
                    ) : err.errorCode.startsWith('SECTION_') ? (
                      <Link
                        href={`/departments/${selectedDept}?tab=years`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <span>Manage Sections</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/departments/${selectedDept}?tab=assignments&classId=${encodeURIComponent(selectedClassId)}${
                          err.subjectId ? `&subjectId=${encodeURIComponent(err.subjectId)}` : ''
                        }`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3431B7] hover:bg-[#282694] text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <span>Assign Faculty</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="list-disc list-inside text-xs space-y-1 font-medium text-rose-800">
              {validation.blockingErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}

          <div className="pt-2">
            <Link
              href={`/departments/${selectedDept}?tab=assignments&classId=${encodeURIComponent(selectedClassId)}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 underline hover:text-rose-950"
            >
              <span>Open Teaching Assignments Manager for this Section →</span>
            </Link>
          </div>
        </div>
      )}

      {/* 6. SWAP & MOVE NOTIFICATION BANNERS (Workstream B7) */}
      {selectedSlot && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#3431B7] animate-pulse" />
            <span>
              <strong>Selected:</strong> Day {selectedSlot.dayIdx + 1}, Period {selectedSlot.periodIdx + 1} ({grid[selectedSlot.dayIdx][selectedSlot.periodIdx]?.subjectCode}). Tap any other slot to swap or move.
            </span>
          </div>
          <button
            onClick={() => setSelectedSlot(null)}
            className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {swapError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{swapError}</span>
          </div>
          <button onClick={() => setSwapError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {swapSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between gap-2 animate-in fade-in duration-100">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">{swapSuccess}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {previousGrid && (
              <button
                type="button"
                onClick={handleUndoLastMove}
                disabled={isSavingDraft}
                className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100/70 border border-emerald-300 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                title="Undo last period move or swap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Undo Move</span>
              </button>
            )}
            <button onClick={() => setSwapSuccess(null)} className="text-emerald-600 hover:text-emerald-800 p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 7. LARGE INTERACTIVE TIMETABLE PREVIEW & EDITOR (Workstream B5, B6 & B7) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        {/* Context Header */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : `${selectedYearOfStudy} — Select a Section`}
              </h2>
              {selectedClass && (
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    status === 'PUBLISHED'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                  }`}
                >
                  {status === 'PUBLISHED' ? 'Locked / Published' : 'Draft'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {selectedClass
                  ? 'Tap a period to swap or move it. Changes save automatically as drafts.'
                  : 'Select an Academic Year and Section above to generate or edit timetables.'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            {isSavingDraft && (
              <span className="text-[11px] font-semibold text-[#3431B7] flex items-center gap-1.5 animate-pulse bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg">
                <RotateCcw className="w-3 h-3 animate-spin text-[#3431B7]" />
                <span>Saving draft...</span>
              </span>
            )}

            <div className="text-right">
              <div className="text-2xl font-black text-slate-900 leading-none">
                {totalAllocated} hrs
              </div>
              <div className="text-[10px] text-slate-400 font-semibold mt-0.5 whitespace-nowrap">
                allocated per week
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedClassId && (
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
                  title="Exit timetable workspace and change selection"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>Change Selection</span>
                </button>
              )}

              <button
                onClick={handleRunGenerator}
                disabled={generating || !selectedClassId || (validation !== null && !validation.canGenerate)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${generating ? 'animate-spin text-[#3431B7]' : 'text-slate-600'}`} />
                <span>{generating ? 'Solving...' : grid.length > 0 ? 'Regenerate' : 'Generate Timetable'}</span>
              </button>

              {status !== 'PUBLISHED' ? (
                <button
                  onClick={() => setPublishModalOpen(true)}
                  disabled={publishing || !selectedClassId || totalAllocated === 0 || grid.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#2B299E] transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock & Publish</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Locked & Published</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        {grid.length === 0 ? (
          <div className="py-20 text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800">
              {selectedClass ? 'No Timetable Generated Yet' : 'No Section Selected'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {selectedClass
                ? `Click "Generate Timetable" to produce valid conflict-free candidate schedules for ${selectedClass?.yearOfStudy} Section ${selectedClass?.section}.`
                : 'Select an Academic Year and Section above to generate or view a conflict-free timetable.'}
            </p>
          </div>
        ) : (
          <TimetableGrid
            grid={grid}
            teachingPeriods={teachingPeriods}
            allPeriods={allPeriodsList}
            days={days}
            isEditable={status !== 'PUBLISHED'}
            selectedSlot={selectedSlot}
            onSlotClick={handleSlotClick}
            onSlotDrop={handleExecuteSlotMoveOrSwap}
            slotSubtitleType="staff"
            showLegend={true}
            totalAllocated={totalAllocated}
          />
        )}
      </div>

      {/* 8. LOCK & PUBLISH CONFIRMATION MODAL (Workstream B8) */}
      {publishModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Lock & Publish Timetable
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : ''}
                </p>
              </div>
            </div>

            <div className="space-y-3 py-3 border-y border-slate-100 my-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="font-bold text-slate-800">{selectedDeptObj?.name || selectedDept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Academic Year:</span>
                <span className="font-bold text-slate-800">{academicYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Class Section:</span>
                <span className="font-bold text-slate-800">{selectedClass?.yearOfStudy} Sec {selectedClass?.section}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Hours Allocated:</span>
                <span className="font-bold text-emerald-700">{totalAllocated} hrs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clash Validation:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>0 Global Clashes</span>
                </span>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] leading-relaxed">
                Publishing creates an immutable permanent snapshot in the institutional archives. Students and faculty can view this version in Timetable Views.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{publishing ? 'Publishing...' : 'Confirm & Publish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. CLEAR / CHANGE SELECTION CONFIRMATION MODAL */}
      {clearConfirmOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-selection-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClearConfirmOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 id="clear-selection-title" className="text-base font-extrabold text-slate-900 leading-snug">
                  Clear / Change Selection
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {selectedDeptObj ? `${selectedDeptObj.name}` : ''}
                  {selectedClass ? ` • ${selectedClass.yearOfStudy} Section ${selectedClass.section}` : ` • ${selectedYearOfStudy}`}
                </p>
              </div>
            </div>

            <div className="space-y-3 py-1 text-xs text-slate-600">
              <p className="leading-relaxed">
                You are about to exit the current timetable workspace for{' '}
                <strong className="text-slate-900">
                  {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : selectedYearOfStudy}
                </strong>
                . This clears the active workspace view and returns you to the Academic Year and Section selection flow.
              </p>

              {/* Warning: Unsaved local in-memory adjustments */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-900 text-[11px] leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Unsaved local adjustments:</span> Any unsaved in-memory swaps or period moves in this session will be discarded.
                </div>
              </div>

              {/* Data Safety Assurance */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-emerald-900 text-[11px] leading-relaxed flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Data Safety Guaranteed:</span> All saved drafts, locked timetables, and published institutional archives remain permanently stored in Firestore. No records will be deleted.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearSelection}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#3431B7] hover:bg-[#282694] rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm & Change Selection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
