import { MemoryRouter } from 'react-router-dom';
import { BloxStudioApp } from "./blox-studio-app.js";
    
export const BloxStudioAppBasic = () => {
  return (
    <MemoryRouter>
      <BloxStudioApp />
    </MemoryRouter>
  );
}