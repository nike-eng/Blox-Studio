import { useLayoutEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './landing-page.js';
import { ProjectsPage } from './projects-page.js';
import { StudioPage } from './studio-page.js';
import { trackViewportHeight } from './viewport-height.js';
import './base.module.css';

/**
 * VoxMesa: a browser-based 3D place editor that can export Roblox place files and publish them via Open Cloud.
 */
export function BloxStudioApp() {
  useLayoutEffect(() => trackViewportHeight(), []);
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/studio/:id" element={<StudioPage />} />
    </Routes>
  );
}
