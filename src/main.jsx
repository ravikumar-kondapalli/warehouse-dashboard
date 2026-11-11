import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import WarehouseDashboard from './WarehouseDashboard.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WarehouseDashboard />
  </StrictMode>
);
