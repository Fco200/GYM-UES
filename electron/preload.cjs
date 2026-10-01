// Gym UES - Preload de Electron
// Expone una API segura via contextBridge. NUNCA expone Node directamente.
const { contextBridge, ipcRenderer } = require('electron');

// URL del backend local pasado desde el proceso principal (puerto configurable).
const argApi = process.argv.find((a) => a.startsWith('--gym-api-url='));
const API_URL = argApi ? argApi.slice('--gym-api-url='.length) : '';

const invoke = (method, apiPath, body = null, token = '') =>
  ipcRenderer.invoke('api:request', { method, path: apiPath, body, token });

contextBridge.exposeInMainWorld('gymAPI', {
  // Metadata del backend local: lo usa src/services/api.js para construir las
  // URLs de la API y de los archivos con el puerto correcto.
  apiUrl: API_URL,
  // Asistencia
  checarEntrada: (data) =>
    invoke('POST', '/api/attendance/check-in', data, data?.token || ''),
  checarSalida: (data) =>
    invoke('POST', '/api/attendance/check-out', data, data?.token || ''),

  // Configuracion (reglamento / horarios)
  cargarConfiguracion: (token = '') =>
    invoke('GET', '/api/settings', null, token),
  guardarConfiguracion: (data) =>
    invoke('PUT', '/api/settings', data, data?.token || ''),

  // Estudiantes / inventario
  getStudents: (token = '') => invoke('GET', '/api/students', null, token),
  createStudent: (data) =>
    invoke('POST', '/api/students', data, data?.token || ''),
  updateStudent: (code, data) =>
    invoke('PUT', `/api/students/${code}`, data, data?.token || ''),
  deleteStudent: (code, token = '') =>
    invoke('DELETE', `/api/students/${code}`, null, token),

  // Autenticacion
  login: (data) => invoke('POST', '/api/auth/login', data),
  logout: (token = '') => invoke('POST', '/api/auth/logout', null, token),
  verifySession: (token = '') => invoke('GET', '/api/auth/me', null, token),

  // Asistencia consultas
  getTodayAttendance: (token = '') =>
    invoke('GET', '/api/attendance/today', null, token),
  getAttendanceCount: (token = '') =>
    invoke('GET', '/api/attendance/count', null, token)
});