import { useLayoutEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProjectsPage } from './projects-page.js';
import { StudioPage } from './studio-page.js';
import { trackViewportHeight } from './viewport-height.js';
import './base.module.css';

/**
 * Blox Studio: a browser-based Roblox place editor that publishes to Roblox via Open Cloud.
 */
export function BloxStudioApp() {
  useLayoutEffect(() => trackViewportHeight(), []);
  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/studio/:id" element={<StudioPage />} />
    </Routes>
  );
}
