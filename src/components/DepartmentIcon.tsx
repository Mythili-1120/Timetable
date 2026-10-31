import React from 'react';
import {
  BrainCircuit,
  Zap,
  Monitor,
  Laptop,
  RadioTower,
  Cog,
  Building2,
  Car,
  HeartPulse,
  FlaskConical,
  Plane,
  GraduationCap,
  Briefcase,
  LucideIcon
} from 'lucide-react';

/**
 * Resolves an appropriate Lucide icon component based on normalized department name and code.
 * Follows exact institutional engineering & academic domains with professional fallback.
 */
export function getDepartmentIconComponent(name?: string, code?: string): LucideIcon {
  const normName = (name || '').toLowerCase().trim();
  const normCode = (code || '').toLowerCase().trim();
  const combined = `${normName} ${normCode}`;

  // 1. Artificial Intelligence & Data Science (AADS, AIDS, AI, Data Science, Machine Learning)
  if (
    normCode === 'aads' ||
    normCode === 'aids' ||
    normCode === 'ai' ||
    normCode === 'aaml' ||
    normCode === 'ds' ||
    combined.includes('artificial intelligence') ||
    combined.includes('data science') ||
    combined.includes('machine learning') ||
    combined.includes('aads') ||
    combined.includes('aids')
  ) {
    return BrainCircuit;
  }

  // 2. Electrical & Electronics Engineering (EEE, Electrical, Power)
  if (
    normCode === 'eee' ||
    normCode === 'ee' ||
    combined.includes('electrical and electronics') ||
    combined.includes('electrical & electronics') ||
    combined.includes('electrical engineering') ||
    combined.includes('electrical') ||
    combined.includes('power system')
  ) {
    return Zap;
  }

  // 3. Computer Science & Engineering (CSE, CS, Computing)
  if (
    normCode === 'cse' ||
    normCode === 'cs' ||
    combined.includes('computer science') ||
    combined.includes('computing') ||
    combined.includes('software engineering') ||
    combined.includes('software')
  ) {
    return Monitor;
  }

  // 4. Information Technology (IT)
  if (
    normCode === 'it' ||
    combined.includes('information technology') ||
    combined.includes('infotech')
  ) {
    return Laptop;
  }

  // 5. Electronics & Communication Engineering (ECE, Telecom)
  if (
    normCode === 'ece' ||
    normCode === 'ec' ||
    combined.includes('electronics and communication') ||
    combined.includes('electronics & communication') ||
    combined.includes('communication engineering') ||
    combined.includes('telecommunication')
  ) {
    return RadioTower;
  }

  // 6. Mechanical Engineering (MECH, Mechatronics)
  if (
    normCode === 'mech' ||
    normCode === 'me' ||
    combined.includes('mechanical engineering') ||
    combined.includes('mechanical') ||
    combined.includes('mechatronics')
  ) {
    return Cog;
  }

  // 7. Civil Engineering (CIVIL, CE)
  if (
    normCode === 'civil' ||
    normCode === 'ce' ||
    combined.includes('civil engineering') ||
    combined.includes('civil') ||
    combined.includes('construction') ||
    combined.includes('structural')
  ) {
    return Building2;
  }

  // 8. Automobile Engineering (AUTO)
  if (
    normCode === 'auto' ||
    normCode === 'ae' ||
    combined.includes('automobile engineering') ||
    combined.includes('automobile') ||
    combined.includes('automotive')
  ) {
    return Car;
  }

  // 9. Biomedical Engineering (BME, Bio, Medical)
  if (
    normCode === 'bme' ||
    normCode === 'bio' ||
    combined.includes('biomedical') ||
    combined.includes('bio-medical') ||
    combined.includes('medical electronics') ||
    combined.includes('biotechnology')
  ) {
    return HeartPulse;
  }

  // 10. Chemical Engineering (CHEM)
  if (
    normCode === 'chem' ||
    normCode === 'che' ||
    combined.includes('chemical engineering') ||
    combined.includes('chemical') ||
    combined.includes('petrochemical')
  ) {
    return FlaskConical;
  }

  // 11. Aeronautical / Aerospace Engineering (AERO)
  if (
    normCode === 'aero' ||
    combined.includes('aeronautical') ||
    combined.includes('aerospace') ||
    combined.includes('aviation')
  ) {
    return Plane;
  }

  // 12. Management Studies / Business (MBA)
  if (
    normCode === 'mba' ||
    combined.includes('management') ||
    combined.includes('business administration')
  ) {
    return Briefcase;
  }

  // Neutral, professional default Department icon
  return GraduationCap;
}

interface DepartmentIconProps {
  name?: string;
  code?: string;
  className?: string;
}

/**
 * Centralized, reusable Department Icon Component.
 * Automatically resolves and displays a relevant white icon for the given department.
 */
export default function DepartmentIcon({
  name,
  code,
  className = 'w-7 h-7 text-white stroke-[2]'
}: DepartmentIconProps) {
  const IconComponent = getDepartmentIconComponent(name, code);
  return <IconComponent className={className} />;
}
